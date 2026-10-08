import { TOUCH } from './device.ts'

/** How far the stick's knob goes from where your thumb landed (px). */
const STICK_R = 56
/** Pushed this far (0..1) or more, you run. */
const STICK_RUN = 0.85
/** A touch that stays put this long (ms) is a hold (who's that piggy?), not a tap. */
const HOLD_MS = 380
/** A touch moving this far (px) is a drag, not a tap. */
const TAP_SLOP = 14

/**
 * Keyboard and mouse, and touch. No pointer lock: the mouse aims at the ground and clicks buttons in the
 * health-check card like any web page. A click does what E does (or throws, if there's nothing to do), the wheel
 * zooms. The camera never turns.
 *
 * On a touch screen: a thumb down on the left of the screen is a stick (it appears where you touch; push it all the
 * way to run), a tap anywhere else throws there, holding on a piggy says who it is, and two fingers pinch to zoom.
 * The on-screen buttons (touch.ts) `press` keys.
 */
export class Input {
  private readonly keys = new Set<string>()
  /** Mouse position in normalised device coords (−1..1), for picking the ground. */
  readonly mouse = { x: 0, y: 0, over: false }
  /** The on-screen stick: right and forward, −1..1 (touch). */
  readonly stick = { x: 0, y: 0 }
  /** Accumulated zoom steps since last read. */
  private zoom = 0
  /** Left click. */
  onClick: () => void = () => {}
  /** A tap on the farm (touch): `mouse` is where. */
  onTap: () => void = () => {}
  onKey: (code: string) => void = () => {}

  private stickId: number | null = null
  private readonly stickAt = { x: 0, y: 0 }
  private readonly stickEl: HTMLElement | null = null
  private readonly knobEl: HTMLElement | null = null
  /** Fingers on the farm that aren't the stick. */
  private readonly fingers = new Map<number, { x: number; y: number; t: number; tap: boolean }>()
  private pinch: number | null = null
  private holdTimer = 0

  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return
      // A clicked health-check button keeps focus: don't let Space or Enter press it again.
      if (e.target instanceof HTMLButtonElement) e.target.blur()
      if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      if (!e.repeat) this.onKey(e.code)
      this.keys.add(e.code)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => {
      this.keys.clear()
      this.stickUp()
    })

    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return this.touchDown(e)
      if (e.button === 0) this.onClick()
    })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this.touchMove(e)
      this.point(e.clientX, e.clientY)
      this.mouse.over = true
    })
    canvas.addEventListener('pointerup', (e) => e.pointerType === 'touch' && this.touchUp(e, true))
    canvas.addEventListener('pointercancel', (e) => e.pointerType === 'touch' && this.touchUp(e, false))
    canvas.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && (this.mouse.over = false))
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoom += Math.sign(e.deltaY)
      },
      { passive: false },
    )

    if (TOUCH) {
      this.stickEl = document.createElement('div')
      this.stickEl.id = 'stick'
      this.knobEl = document.createElement('i')
      this.stickEl.append(this.knobEl)
      document.body.append(this.stickEl)
      // iOS Safari zooms the page on a pinch whatever touch-action says.
      document.addEventListener('gesturestart', (e) => e.preventDefault())
    }
  }

  /** An on-screen button: as if that key went down. */
  press(code: string) {
    this.onKey(code)
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c))
  }

  /** Movement as (right, forward), each −1..1, from WASD, the arrow keys or the stick. */
  move() {
    const x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0)
    const y = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0)
    if (x || y) return { x, y }
    return Math.hypot(this.stick.x, this.stick.y) > 0.15 ? { x: this.stick.x, y: this.stick.y } : { x: 0, y: 0 }
  }

  /** Shift, or the stick pushed right out. */
  running() {
    return this.down('ShiftLeft', 'ShiftRight') || Math.hypot(this.stick.x, this.stick.y) >= STICK_RUN
  }

  takeZoom() {
    const z = this.zoom
    this.zoom = 0
    return z
  }

  private point(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect()
    this.mouse.x = ((clientX - r.left) / r.width) * 2 - 1
    this.mouse.y = -((clientY - r.top) / r.height) * 2 + 1
  }

  // ---------------------------------------------------------------- touch

  private touchDown(e: PointerEvent) {
    e.preventDefault()
    this.canvas.setPointerCapture(e.pointerId)
    // The left part of the screen (below the top bar) is for walking.
    if (this.stickId === null && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.25) {
      this.stickId = e.pointerId
      // The stick lives in the bottom left corner: a thumb on it pushes it from there, a thumb anywhere else in the
      // walking part of the screen brings it over (and it goes back home when you let go).
      const home = this.stickHome()
      const onIt = Math.hypot(e.clientX - home.x, e.clientY - home.y) < STICK_R * 1.6
      this.stickAt.x = onIt ? home.x : e.clientX
      this.stickAt.y = onIt ? home.y : e.clientY
      this.stickEl?.classList.add('on')
      this.stickMove(e.clientX, e.clientY)
      return
    }
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), tap: this.fingers.size === 0 })
    clearTimeout(this.holdTimer)
    if (this.fingers.size === 2) {
      // Two fingers: a pinch, not a tap.
      for (const f of this.fingers.values()) f.tap = false
      this.mouse.over = false
      const [a, b] = [...this.fingers.values()]
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      return
    }
    // Held still: show who's under your finger (the hover label) until you let go.
    this.holdTimer = window.setTimeout(() => {
      const f = this.fingers.get(e.pointerId)
      if (!f?.tap) return
      f.tap = false
      this.point(f.x, f.y)
      this.mouse.over = true
    }, HOLD_MS)
  }

  private touchMove(e: PointerEvent) {
    if (e.pointerId === this.stickId) return this.stickMove(e.clientX, e.clientY)
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    if (f.tap && Math.hypot(e.clientX - f.x, e.clientY - f.y) > TAP_SLOP) f.tap = false
    f.x = e.clientX
    f.y = e.clientY
    if (this.pinch !== null && this.fingers.size >= 2) {
      const [a, b] = [...this.fingers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      // Fingers apart zooms in (like a map), 40 px a step.
      this.zoom += (this.pinch - d) / 40
      this.pinch = d
    } else if (this.mouse.over) {
      this.point(f.x, f.y)
    }
  }

  private touchUp(e: PointerEvent, lifted: boolean) {
    if (e.pointerId === this.stickId) return this.stickUp()
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    this.fingers.delete(e.pointerId)
    clearTimeout(this.holdTimer)
    if (this.fingers.size < 2) this.pinch = null
    if (this.fingers.size === 0) this.mouse.over = false
    if (lifted && f.tap && performance.now() - f.t < HOLD_MS) {
      this.point(f.x, f.y)
      this.onTap()
    }
  }

  private stickMove(x: number, y: number) {
    let dx = x - this.stickAt.x
    let dy = y - this.stickAt.y
    const d = Math.hypot(dx, dy)
    // Past the edge, the stick comes along with your thumb.
    if (d > STICK_R) {
      this.stickAt.x = x - (dx / d) * STICK_R
      this.stickAt.y = y - (dy / d) * STICK_R
      dx = (dx / d) * STICK_R
      dy = (dy / d) * STICK_R
    }
    this.stick.x = dx / STICK_R
    this.stick.y = -dy / STICK_R
    if (this.stickEl && this.knobEl) {
      const home = this.stickHome()
      this.stickEl.style.transform = `translate(${this.stickAt.x - home.x}px, ${this.stickAt.y - home.y}px)`
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`
    }
  }

  /** The middle of the stick at rest (the CSS puts it in the bottom left, clear of any notch). */
  private stickHome() {
    if (!this.stickEl) return { x: 0, y: 0 }
    const r = this.stickEl.getBoundingClientRect()
    const m = new DOMMatrixReadOnly(getComputedStyle(this.stickEl).transform === 'none' ? undefined : getComputedStyle(this.stickEl).transform)
    return { x: r.left - m.m41, y: r.top - m.m42 }
  }

  private stickUp() {
    this.stickId = null
    this.stick.x = this.stick.y = 0
    if (this.stickEl && this.knobEl) {
      this.stickEl.classList.remove('on')
      this.stickEl.style.transform = ''
      this.knobEl.style.transform = ''
    }
  }
}

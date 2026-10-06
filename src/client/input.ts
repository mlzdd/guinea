/**
 * Keyboard and mouse. No pointer lock: the mouse aims at the ground and clicks buttons in the
 * health-check card like any web page. Right-drag turns the camera, the wheel zooms.
 */
export class Input {
  private readonly keys = new Set<string>()
  /** Mouse position in normalised device coords (−1..1), for picking the ground. */
  readonly mouse = { x: 0, y: 0, over: false }
  /** Accumulated camera turn (radians) and zoom steps since last read. */
  private turn = 0
  private zoom = 0
  private dragging = false
  private lastX = 0
  onClick: () => void = () => {}
  onKey: (code: string) => void = () => {}

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return
      // A clicked health-check button keeps focus: don't let Space or Enter press it again.
      if (e.target instanceof HTMLButtonElement) e.target.blur()
      if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      if (!e.repeat) this.onKey(e.code)
      this.keys.add(e.code)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())

    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.onClick()
      if (e.button === 2) {
        this.dragging = true
        this.lastX = e.clientX
        canvas.setPointerCapture(e.pointerId)
      }
    })
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1
      this.mouse.over = true
      if (this.dragging) {
        this.turn -= (e.clientX - this.lastX) * 0.006
        this.lastX = e.clientX
      }
    })
    canvas.addEventListener('pointerleave', () => (this.mouse.over = false))
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.dragging = false
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoom += Math.sign(e.deltaY)
      },
      { passive: false },
    )
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c))
  }

  /** Movement as (right, forward), each −1..1, from WASD or the arrow keys. */
  move() {
    const x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0)
    const y = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0)
    return { x, y }
  }

  takeTurn() {
    const t = this.turn + (this.down('KeyQ') ? 0.03 : 0) - (this.down('KeyR') ? 0.03 : 0)
    this.turn = 0
    return t
  }

  takeZoom() {
    const z = this.zoom
    this.zoom = 0
    return z
  }
}

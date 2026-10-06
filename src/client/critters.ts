import * as THREE from 'three'
import { mat } from './veg.ts'
import { makeSack } from './world.ts'

const box = new THREE.BoxGeometry(1, 1, 1)
const sphere = new THREE.SphereGeometry(1, 14, 10)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12)
const cone = new THREE.ConeGeometry(1, 1, 8)

function part(geo: THREE.BufferGeometry, color: number, s: [number, number, number], p: [number, number, number], shadow = true) {
  const m = new THREE.Mesh(geo, mat(color))
  m.scale.set(...s)
  m.position.set(...p)
  m.castShadow = shadow
  return m
}

/** A limb that swings from its top. */
function limb(color: number, w: number, len: number, at: [number, number, number], end?: THREE.Mesh) {
  const pivot = new THREE.Group()
  pivot.position.set(...at)
  pivot.add(part(box, color, [w, len, w], [0, -len / 2, 0]))
  if (end) pivot.add(end)
  return pivot
}

/** Text on a sprite, e.g. a farmer's name. */
export function textSprite(text: string, color = '#ffffff', height = 0.32): THREE.Sprite {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = "48px 'Lilita One', system-ui, sans-serif"
  g.font = font
  c.width = Math.ceil(g.measureText(text).width) + 24
  c.height = 64
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 8
  g.strokeStyle = 'rgba(28,26,36,0.85)'
  g.strokeText(text, c.width / 2, 34)
  g.fillStyle = color
  g.fillText(text, c.width / 2, 34)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set((height * c.width) / c.height, height, 1)
  s.renderOrder = 10
  return s
}

const SKIN = 0xf1c7a0
const STRAW = 0xe8c66a
const WELLIES = 0x2f5a2c
const SHIRT = 0xf6efe0

/** A farmer in a straw hat, overalls in their colour and green wellies. Faces −Z. */
export class FarmerModel {
  readonly root = new THREE.Group()
  private readonly legs: THREE.Group[] = []
  private readonly arms: THREE.Group[] = []
  private readonly basket = new THREE.Group()
  private readonly basketFill: THREE.Mesh
  private readonly sack = makeSack()
  private throwT = 1
  private walkPhase = 0

  constructor(color: number, name: string | null) {
    const r = this.root
    for (const side of [-1, 1]) {
      const leg = limb(color, 0.2, 0.8, [side * 0.13, 0.82, 0])
      leg.add(part(box, WELLIES, [0.22, 0.4, 0.26], [0, -0.62, -0.02]))
      r.add(leg)
      this.legs.push(leg)
    }
    // Overalls with a bib over a cream shirt
    r.add(part(box, SHIRT, [0.5, 0.6, 0.3], [0, 1.15, 0]))
    r.add(part(box, color, [0.52, 0.38, 0.32], [0, 0.97, 0]))
    r.add(part(box, color, [0.36, 0.3, 0.05], [0, 1.25, -0.16]))
    for (const side of [-1, 1]) r.add(part(box, color, [0.06, 0.32, 0.31], [side * 0.15, 1.3, 0]))
    for (const side of [-1, 1]) {
      const hand = part(sphere, SKIN, [0.07, 0.07, 0.07], [0, -0.62, 0])
      const arm = limb(SHIRT, 0.13, 0.58, [side * 0.33, 1.42, 0], hand)
      r.add(arm)
      this.arms.push(arm)
    }
    // Head and straw hat
    r.add(part(sphere, SKIN, [0.19, 0.21, 0.19], [0, 1.66, 0]))
    r.add(part(sphere, 0x1c1a24, [0.025, 0.03, 0.02], [-0.07, 1.69, -0.17], false))
    r.add(part(sphere, 0x1c1a24, [0.025, 0.03, 0.02], [0.07, 1.69, -0.17], false))
    r.add(part(sphere, 0xe89a8a, [0.04, 0.03, 0.03], [0, 1.62, -0.19], false))
    r.add(part(cyl, STRAW, [0.42, 0.03, 0.42], [0, 1.83, 0]))
    r.add(part(cyl, STRAW, [0.21, 0.18, 0.21], [0, 1.93, 0]))
    r.add(part(cyl, color, [0.215, 0.05, 0.215], [0, 1.88, 0]))

    // Wicker basket on the left arm, with a heap of veg when it's got some in.
    this.basket.add(part(cyl, 0xb07a3f, [0.18, 0.18, 0.18], [0, 0, 0]))
    this.basketFill = part(sphere, 0xf07b1d, [0.16, 0.06, 0.16], [0, 0.09, 0], false)
    this.basket.add(this.basketFill)
    this.basket.position.set(-0.45, 0.85, -0.05)
    r.add(this.basket)
    // A sack of pellets hugged to the chest.
    this.sack.position.set(0, 0.85, -0.32)
    this.sack.rotation.x = 0.15
    r.add(this.sack)

    if (name) {
      const tag = textSprite(name)
      tag.position.y = 2.35
      r.add(tag)
    }
  }

  throw() {
    this.throwT = 0
  }

  /** `speed` in m/s; `holding` = a pig or a sack in its arms; `fill` = how full the basket is (0..1) and the top veg's colour. */
  pose(dt: number, speed: number, holding: boolean, fill: number, fillColor: number, sack = false) {
    this.sack.visible = sack
    this.walkPhase += dt * Math.min(speed, 9) * 2.2
    const swing = speed > 0.3 ? Math.sin(this.walkPhase) * Math.min(0.7, speed * 0.12) : 0
    this.legs[0].rotation.x = swing
    this.legs[1].rotation.x = -swing
    this.root.position.y = speed > 0.3 ? Math.abs(Math.cos(this.walkPhase)) * 0.05 : 0
    const [left, right] = this.arms
    if (holding) {
      // Both arms out in front, cradling a pig.
      left.rotation.set(1.25, 0, -0.35)
      right.rotation.set(1.25, 0, 0.35)
    } else {
      left.rotation.set(0.35, 0, 0.1)
      this.throwT = Math.min(1, this.throwT + dt * 3)
      if (this.throwT < 1) {
        // Wind up over the shoulder, then fling forward.
        const t = this.throwT
        right.rotation.set(t < 0.35 ? -(t / 0.35) * 2.6 : -2.6 + ((t - 0.35) / 0.65) * 3.5, 0, -0.1)
      } else {
        right.rotation.set(-swing, 0, -0.1)
      }
    }
    this.basket.visible = !holding
    this.basketFill.visible = fill > 0
    this.basketFill.scale.y = 0.03 + fill * 0.09
    ;(this.basketFill.material as THREE.MeshLambertMaterial) = mat(fillColor)
  }
}

/** A sneaky red fox. Faces −Z. */
export class FoxModel {
  readonly root = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly legs: THREE.Group[] = []
  private readonly tail: THREE.Group
  private phase = Math.random() * 10

  constructor() {
    const ORANGE = 0xd9692b
    const DARK = 0x3b2418
    const b = this.body
    this.root.add(b)
    b.add(part(sphere, ORANGE, [0.22, 0.2, 0.45], [0, 0.5, 0]))
    b.add(part(sphere, 0xf6efe0, [0.15, 0.13, 0.25], [0, 0.42, -0.2]))
    const head = new THREE.Group()
    head.position.set(0, 0.68, -0.45)
    head.add(part(sphere, ORANGE, [0.16, 0.14, 0.16], [0, 0, 0]))
    const snout = part(cone, ORANGE, [0.08, 0.22, 0.08], [0, -0.03, -0.2])
    snout.rotation.x = -Math.PI / 2
    head.add(snout)
    head.add(part(sphere, 0x1c1a24, [0.03, 0.03, 0.03], [0, -0.03, -0.31]))
    head.add(part(sphere, 0xf6efe0, [0.1, 0.06, 0.1], [0, -0.07, -0.1]))
    for (const side of [-1, 1]) {
      const ear = part(cone, DARK, [0.06, 0.14, 0.04], [side * 0.09, 0.15, 0.02])
      ear.rotation.z = -side * 0.25
      head.add(ear)
      head.add(part(sphere, 0x1c1a24, [0.025, 0.03, 0.025], [side * 0.07, 0.04, -0.13]))
    }
    b.add(head)
    for (const [x, z] of [
      [-0.12, -0.3],
      [0.12, -0.3],
      [-0.12, 0.3],
      [0.12, 0.3],
    ]) {
      const leg = limb(DARK, 0.07, 0.42, [x, 0.42, z])
      b.add(leg)
      this.legs.push(leg)
    }
    this.tail = new THREE.Group()
    this.tail.position.set(0, 0.55, 0.42)
    const brush = part(sphere, ORANGE, [0.12, 0.12, 0.32], [0, 0, 0.28])
    this.tail.add(brush, part(sphere, 0xf6efe0, [0.08, 0.08, 0.1], [0, 0, 0.58]))
    this.tail.rotation.x = 0.4
    b.add(this.tail)
  }

  /** Sneaking is low and slinky; running is a full gallop. */
  pose(dt: number, speed: number, sneaking: boolean) {
    this.phase += dt * (4 + speed * 3)
    const s = Math.sin(this.phase) * Math.min(0.8, speed * 0.25)
    this.legs.forEach((l, i) => (l.rotation.x = i % 3 === 0 ? s : -s))
    this.body.position.y = sneaking ? -0.12 : Math.abs(Math.sin(this.phase)) * 0.04
    this.tail.rotation.y = Math.sin(this.phase * 0.5) * 0.3
    this.tail.rotation.x = sneaking ? 0.1 : 0.4
  }
}

/** A hawk with flapping wings, and its shadow on the ground (which is what you'll notice first). */
export class HawkModel {
  readonly root = new THREE.Group()
  readonly shadow: THREE.Mesh
  private readonly wings: THREE.Group[] = []
  private phase = 0

  constructor() {
    const BROWN = 0x7a5232
    const r = this.root
    r.add(part(sphere, BROWN, [0.2, 0.18, 0.45], [0, 0, 0]))
    r.add(part(sphere, 0xe8dcc4, [0.15, 0.12, 0.3], [0, -0.06, -0.05]))
    r.add(part(sphere, BROWN, [0.13, 0.13, 0.14], [0, 0.08, -0.42]))
    const beak = part(cone, 0xf2c230, [0.05, 0.12, 0.05], [0, 0.05, -0.58])
    beak.rotation.x = -Math.PI / 2 - 0.4
    r.add(beak)
    for (const side of [-1, 1]) r.add(part(sphere, 0x1c1a24, [0.025, 0.025, 0.025], [side * 0.08, 0.12, -0.5]))
    const tail = part(box, BROWN, [0.3, 0.03, 0.3], [0, 0, 0.5])
    r.add(tail)
    for (const side of [-1, 1]) {
      const wing = new THREE.Group()
      wing.position.set(side * 0.15, 0.05, -0.05)
      wing.add(part(box, BROWN, [1.1, 0.04, 0.42], [side * 0.55, 0, 0]))
      wing.add(part(box, 0x4a3020, [0.4, 0.045, 0.3], [side * 1.0, 0, 0.05]))
      r.add(wing)
      this.wings.push(wing)
    }
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32)
    grad.addColorStop(0, 'rgba(0,0,0,0.5)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
  }

  pose(dt: number, swooping: boolean, height: number) {
    this.phase += dt * (swooping ? 4 : 7)
    const flap = swooping ? 0.5 : Math.sin(this.phase) * 0.45
    this.wings[0].rotation.z = -flap
    this.wings[1].rotation.z = flap
    this.root.rotation.x = swooping ? 0.5 : 0
    const s = 1.6 + height * 0.25
    this.shadow.scale.set(s * 1.6, s, 1)
  }
}

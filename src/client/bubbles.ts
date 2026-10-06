import * as THREE from 'three'

/** How a bubble looks: fill colour and text colour. */
export type BubbleStyle = 'wheek' | 'monch' | 'eek' | 'zzz' | 'love' | 'shoo' | 'plain'
const STYLES: Record<BubbleStyle, { fill: string; ink: string }> = {
  wheek: { fill: '#ffe14a', ink: '#1c1a24' },
  monch: { fill: '#ffffff', ink: '#2f7a2a' },
  eek: { fill: '#ff6b5e', ink: '#ffffff' },
  zzz: { fill: '#b9c8ff', ink: '#24305a' },
  love: { fill: '#ffb3d9', ink: '#8a1c50' },
  shoo: { fill: '#f28a30', ink: '#ffffff' },
  plain: { fill: '#fff6e0', ink: '#1c1a24' },
}

const LIFE = 1.5
const MAX = 60
const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

/** A comic speech bubble with a little tail, drawn once per text+style and reused. */
function bubbleTexture(text: string, style: BubbleStyle) {
  const key = `${style}:${text}`
  let hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = "44px 'Lilita One', system-ui, sans-serif"
  g.font = font
  const w = Math.ceil(g.measureText(text).width) + 44
  const h = 72
  c.width = w + 8
  c.height = h + 22
  const { fill, ink } = STYLES[style]
  g.lineWidth = 5
  g.strokeStyle = '#1c1a24'
  g.fillStyle = fill
  const r = 26
  g.beginPath()
  g.moveTo(4 + r, 4)
  g.arcTo(4 + w, 4, 4 + w, 4 + h, r)
  g.arcTo(4 + w, 4 + h, 4, 4 + h, r)
  // tail
  g.lineTo(c.width / 2 + 12, 4 + h)
  g.lineTo(c.width / 2 - 2, h + 20)
  g.lineTo(c.width / 2 - 8, 4 + h)
  g.arcTo(4, 4 + h, 4, 4, r)
  g.arcTo(4, 4, 4 + w, 4, r)
  g.closePath()
  g.fill()
  g.stroke()
  g.font = font
  g.fillStyle = ink
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, 4 + h / 2 + 3)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  hit = { tex, aspect: c.width / c.height }
  cache.set(key, hit)
  return hit
}

interface Bubble {
  sprite: THREE.Sprite
  follow: THREE.Object3D
  lift: number
  age: number
  size: number
}

/** Pops comic bubbles over things ("WHEEEK!", "monch monch"), since the office PCs have no sound. */
export class Bubbles {
  private readonly list: Bubble[] = []
  private readonly onThing = new Map<THREE.Object3D, Bubble>()

  private readonly scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** One bubble per thing at a time: a new one replaces the old. `size` is the height in metres. */
  say(follow: THREE.Object3D, text: string, style: BubbleStyle, lift = 0.9, size = 0.5) {
    const old = this.onThing.get(follow)
    if (old) this.remove(old)
    if (this.list.length >= MAX) this.remove(this.list[0])
    const { tex, aspect } = bubbleTexture(text, style)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
    sprite.renderOrder = 20
    sprite.userData.aspect = aspect
    const b: Bubble = { sprite, follow, lift, age: 0, size }
    this.scene.add(sprite)
    this.list.push(b)
    this.onThing.set(follow, b)
  }

  private remove(b: Bubble) {
    b.sprite.removeFromParent()
    b.sprite.material.dispose()
    this.list.splice(this.list.indexOf(b), 1)
    if (this.onThing.get(b.follow) === b) this.onThing.delete(b.follow)
  }

  update(dt: number) {
    const p = new THREE.Vector3()
    for (const b of [...this.list]) {
      b.age += dt
      if (b.age > LIFE || !b.follow.parent) {
        this.remove(b)
        continue
      }
      // Pop in with a little overshoot, drift up, fade out.
      const t = b.age
      const pop = t < 0.15 ? (t / 0.15) * 1.15 : t < 0.25 ? 1.15 - ((t - 0.15) / 0.1) * 0.15 : 1
      b.follow.getWorldPosition(p)
      b.sprite.position.set(p.x, p.y + b.lift + t * 0.35, p.z)
      const h = b.size * pop
      b.sprite.scale.set(h * (b.sprite.userData.aspect as number), h, 1)
      b.sprite.material.opacity = t > LIFE - 0.35 ? (LIFE - t) / 0.35 : 1
    }
  }
}

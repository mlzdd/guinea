import * as THREE from 'three'
import {
  BARN_IN,
  BARN_OUTER,
  BARN_WALLS,
  BEDS,
  BED_D,
  BED_W,
  BOUNDS,
  BOWLS,
  DOOR_HALF,
  GARDEN_FENCE,
  HAY_BALES,
  HIDEYS,
  HIDEY_D,
  HIDEY_W,
  PIG_HOUSES,
  COMPOST,
  FEED_BIN,
  HOPPERS,
  SCARECROW,
  TREES,
  type Rect,
} from '../core/map.ts'
import type { BedSnap } from '../core/protocol.ts'
import { BOWL_MAX, NIGHT_START, type UpgradeId, type Veg } from '../core/rules.ts'
import { makeVeg, mat } from './veg.ts'

const WALL_H = 2.6

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}

const speckle = (g: CanvasRenderingContext2D, s: number, n: number, colors: string[], w = 2, h = w) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length]
    g.fillRect(Math.random() * s, Math.random() * s, w, h)
  }
}

const grassTex = canvasTexture(
  256,
  (g, s) => {
    g.fillStyle = '#6fb04a'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 2600, ['#64a443', '#7cbd55', '#5d9a3e', '#86c55e'], 2, 5)
    speckle(g, s, 30, ['#f6f1e7', '#ffe14a'], 3) // daisies and buttercups
  },
  40,
)

const strawTex = canvasTexture(
  256,
  (g, s) => {
    g.fillStyle = '#d9b860'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = ['#c9a64c', '#e8cb78', '#b8953e', '#f0d890'][i % 4]
      g.lineWidth = 1.5
      const x = Math.random() * s
      const y = Math.random() * s
      const a = Math.random() * Math.PI
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14)
      g.stroke()
    }
  },
  6,
)

const dirtTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#a5824f'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 700, ['#967545', '#b8935c', '#8a6a3c'], 2)
  },
  1,
)

const soilTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#5a3d25'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 600, ['#4c321e', '#6b4a2d', '#3f2a19'], 3)
    // Furrows
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let x = 8; x < s; x += 32) g.fillRect(x, 0, 6, s)
  },
  1,
)

/** Red barn planks, white trim at the top. */
const barnTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#b8402f'
    g.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = '#9c3426'
      g.fillRect(x, 0, 2, s)
      g.fillStyle = '#c95141'
      g.fillRect(x + 4, 0, 1, s)
    }
    speckle(g, s, 120, ['#a83a2a', '#c4493a'], 2)
  },
  1,
)

const plankTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#b5833f'
    g.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 21) {
      g.fillStyle = '#8f6430'
      g.fillRect(0, y, s, 2)
    }
    speckle(g, s, 200, ['#a5763a', '#c49352'], 2)
  },
  1,
)

const roofTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#6b6f78'
    g.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 12) {
      g.fillStyle = '#7d828c'
      g.fillRect(x, 0, 5, s)
      g.fillStyle = '#585c64'
      g.fillRect(x + 7, 0, 2, s)
    }
  },
  1,
)

const pelletTex = canvasTexture(
  64,
  (g, s) => {
    g.fillStyle = '#8a6a3c'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 300, ['#6f5430', '#a5824f', '#7d6a2a'], 3, 2)
  },
  2,
)

/** Chicken wire: a diamond grid with see-through gaps. */
const wireTex = canvasTexture(
  32,
  (g, s) => {
    g.clearRect(0, 0, s, s)
    g.strokeStyle = '#b8bec6'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, s / 2)
    g.lineTo(s / 2, 0)
    g.lineTo(s, s / 2)
    g.lineTo(s / 2, s)
    g.closePath()
    g.stroke()
  },
  1,
)

const sackTex = canvasTexture(
  64,
  (g, s) => {
    g.fillStyle = '#d9c49a'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 200, ['#cbb487', '#e4d2ad'], 1)
    g.fillStyle = '#3cc45a'
    g.font = 'bold 22px sans-serif'
    g.textAlign = 'center'
    g.fillText('PELLETS', s / 2, s / 2 + 8)
  },
  1,
)

/** A sack of pellets (on the feed bin, or in a farmer's arms). */
export function makeSack(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.5, 0.6, 0.3)
  geo.translate(0, 0.3, 0) // sits on its bottom
  return shadowed(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: sackTex })))
}

const hayTex = canvasTexture(
  64,
  (g, s) => {
    g.fillStyle = '#e0bf5c'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 300, ['#c9a64c', '#f0d070', '#b8953e'], 1, 4)
    g.fillStyle = '#8a6a2c'
    g.fillRect(0, s * 0.3, s, 2)
    g.fillRect(0, s * 0.7, s, 2)
  },
  1,
)

function shadowed<T extends THREE.Mesh>(m: T, cast = true, receive = true): T {
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

function boxMesh(b: Rect, y0: number, h: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0), material)
  m.position.set((b.x0 + b.x1) / 2, y0 + h / 2, (b.z0 + b.z1) / 2)
  return shadowed(m)
}

function texturedBox(w: number, h: number, d: number, tex: THREE.Texture, tile = 2) {
  const t = tex.clone()
  t.needsUpdate = true
  t.repeat.set(Math.max(1, Math.round(Math.max(w, d) / tile)), Math.max(1, Math.round(h / tile)))
  return new THREE.MeshLambertMaterial({ map: t })
}

interface Lerp {
  sky: THREE.Color
  sun: THREE.Color
  sunI: number
  hemiI: number
  lamps: number
}
/** Key moments of the day: time (0 = dawn) → lighting. */
const KEYS: [number, Lerp][] = [
  [0, { sky: new THREE.Color(0xf6b38a), sun: new THREE.Color(0xffc79a), sunI: 1.2, hemiI: 1.4, lamps: 0.6 }],
  [0.08, { sky: new THREE.Color(0x9fd3ff), sun: new THREE.Color(0xfff4e0), sunI: 2.4, hemiI: 1.8, lamps: 0 }],
  [0.62, { sky: new THREE.Color(0x9fd3ff), sun: new THREE.Color(0xfff4e0), sunI: 2.4, hemiI: 1.8, lamps: 0 }],
  [NIGHT_START - 0.02, { sky: new THREE.Color(0xf0946a), sun: new THREE.Color(0xff9a6a), sunI: 1.4, hemiI: 1.3, lamps: 0.5 }],
  [NIGHT_START + 0.04, { sky: new THREE.Color(0x24305a), sun: new THREE.Color(0x9ab0ff), sunI: 0.7, hemiI: 0.9, lamps: 1 }],
  [0.96, { sky: new THREE.Color(0x24305a), sun: new THREE.Color(0x9ab0ff), sunI: 0.7, hemiI: 0.9, lamps: 1 }],
  [1, { sky: new THREE.Color(0xf6b38a), sun: new THREE.Color(0xffc79a), sunI: 1.2, hemiI: 1.4, lamps: 0.6 }],
]

interface BedView {
  plants: THREE.Group[]
  ripe: THREE.Group[]
}

/** The farm: everything that doesn't walk about. */
export class World {
  readonly scene = new THREE.Scene()
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly lamps: THREE.PointLight[] = []
  private readonly lampBulbs: THREE.MeshBasicMaterial
  /** Hidden when you go inside so you can see in. */
  private readonly roof = new THREE.Group()
  private readonly walls: THREE.Mesh[] = []
  private readonly beds: BedView[] = []
  private readonly bowlFood: { kind: Veg | null; piles: THREE.Group[] }[] = []
  private cutaway = false
  private readonly hoppers: { root: THREE.Group; body: THREE.Group; fill: THREE.Mesh; tray: THREE.Mesh }[] = []
  /** Things that appear when an upgrade is bought. */
  private readonly extras: Partial<Record<UpgradeId, THREE.Object3D>> = {}

  constructor() {
    const s = this.scene
    s.background = new THREE.Color(0x9fd3ff)
    s.fog = new THREE.Fog(0x9fd3ff, 60, 130)

    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x6a8a3a, 1.8)
    s.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -40
    sc.right = 40
    sc.top = 40
    sc.bottom = -40
    sc.near = 1
    sc.far = 120
    this.sun.shadow.bias = -0.0008
    s.add(this.sun, this.sun.target)

    // Ground: lawn everywhere, a dirt path from the barn door to the gate.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: grassTex }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    s.add(ground)
    const path = new THREE.Mesh(new THREE.PlaneGeometry(3, BOUNDS.z1 + 10), new THREE.MeshLambertMaterial({ map: dirtTex }))
    ;(path.material.map as THREE.Texture).repeat.set(1, 12)
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.01, (BOUNDS.z1 - 10) / 2 + 2)
    path.receiveShadow = true
    s.add(path)

    this.buildFence()
    this.buildBarn()
    this.buildGarden()
    this.buildOrchard()
    for (const h of HIDEYS) s.add(this.hidey(h.x, h.z))
    const hay = new THREE.MeshLambertMaterial({ map: hayTex })
    for (const b of HAY_BALES) {
      // Stacked two high
      for (let y = 0; y < 2; y++) s.add(boxMesh({ x0: b.x0 + y * 0.1, x1: b.x1 - y * 0.1, z0: b.z0 + y * 0.1, z1: b.z1 - y * 0.1 }, y * 0.7, 0.7, hay))
    }
    this.buildSurroundings()
    this.buildPellets()
    this.buildExtras()

    this.lampBulbs = new THREE.MeshBasicMaterial({ color: 0xffe6a0 })
    for (const x of [-6, 6]) {
      const lamp = new THREE.PointLight(0xffc66b, 0, 18, 1.5)
      lamp.position.set(x, WALL_H - 0.4, -17.5)
      s.add(lamp)
      this.lamps.push(lamp)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), this.lampBulbs)
      bulb.position.copy(lamp.position)
      this.roof.add(bulb)
    }
    // A lantern by the door so you can find it at night.
    const lantern = new THREE.PointLight(0xffc66b, 0, 14, 1.5)
    lantern.position.set(DOOR_HALF + 0.6, 2.4, -9.6)
    s.add(lantern)
    this.lamps.push(lantern)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), this.lampBulbs)
    bulb.position.copy(lantern.position)
    s.add(bulb)
  }

  private buildFence() {
    const posts: THREE.Vector3[] = []
    const rails: { a: THREE.Vector3; b: THREE.Vector3 }[] = []
    const { x0, x1, z0, z1 } = { x0: BOUNDS.x0 - 0.2, x1: BOUNDS.x1 + 0.2, z0: BOUNDS.z0 - 0.2, z1: BOUNDS.z1 + 0.2 }
    const side = (ax: number, az: number, bx: number, bz: number, gap?: [number, number]) => {
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.ceil(len / 2.5)
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const x = ax + (bx - ax) * t
        const z = az + (bz - az) * t
        if (gap && x > gap[0] && x < gap[1]) continue
        posts.push(new THREE.Vector3(x, 0, z))
      }
      if (gap) {
        rails.push({ a: new THREE.Vector3(ax, 0, az), b: new THREE.Vector3(gap[0], 0, bz) })
        rails.push({ a: new THREE.Vector3(gap[1], 0, az), b: new THREE.Vector3(bx, 0, bz) })
      } else rails.push({ a: new THREE.Vector3(ax, 0, az), b: new THREE.Vector3(bx, 0, bz) })
    }
    side(x0, z1, x1, z1, [-1.6, 1.6]) // south, with the gate
    side(x0, z0, x0, z1)
    side(x1, z0, x1, z1)
    side(x0, z0, BARN_OUTER.x0, z0)
    side(BARN_OUTER.x1, z0, x1, z0)
    const wood = mat(0x8a5a2b)
    const postGeo = new THREE.BoxGeometry(0.18, 1.2, 0.18)
    const inst = new THREE.InstancedMesh(postGeo, wood, posts.length)
    const m4 = new THREE.Matrix4()
    posts.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, 0.6, p.z)))
    inst.castShadow = true
    this.scene.add(inst)
    for (const { a, b } of rails) {
      for (const y of [0.45, 0.95]) {
        const len = a.distanceTo(b)
        const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.06), wood))
        rail.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2)
        rail.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
        this.scene.add(rail)
      }
    }
    // Gate posts with a sign
    for (const x of [-1.6, 1.6]) {
      const p = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), wood))
      p.position.set(x, 1.2, z1)
      this.scene.add(p)
    }
    const sign = this.sign('Guinea Orchard', 3.6, 0.7)
    sign.position.set(0, 2.5, z1)
    this.scene.add(sign)
  }

  private sign(text: string, w: number, h: number) {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = Math.round((512 * h) / w)
    const g = c.getContext('2d')!
    g.fillStyle = '#8a5a2b'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#5a3a1c'
    g.lineWidth = 10
    g.strokeRect(5, 5, c.width - 10, c.height - 10)
    g.fillStyle = '#fff6e0'
    g.font = `${Math.round(c.height * 0.55)}px 'Lilita One', system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, c.width / 2, c.height / 2 + 4)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const front = new THREE.MeshLambertMaterial({ map: tex })
    const edge = mat(0x5a3a1c)
    return shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [edge, edge, edge, edge, front, front]))
  }

  private buildBarn() {
    const s = this.scene
    // Straw floor inside
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(BARN_IN.x1 - BARN_IN.x0, BARN_IN.z1 - BARN_IN.z0), new THREE.MeshLambertMaterial({ map: strawTex }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.02, (BARN_IN.z0 + BARN_IN.z1) / 2)
    floor.receiveShadow = true
    s.add(floor)

    for (const w of BARN_WALLS) {
      const m = boxMesh(w, 0, WALL_H, texturedBox(w.x1 - w.x0, WALL_H, w.z1 - w.z0, barnTex))
      s.add(m)
      this.walls.push(m)
    }
    // Door frame and sign
    const trim = mat(0xf6efe0)
    for (const x of [-DOOR_HALF, DOOR_HALF]) {
      const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.25, WALL_H, 0.5), trim))
      post.position.set(x, WALL_H / 2, -10.2)
      this.roof.add(post)
    }
    const lintel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF * 2 + 0.25, 0.25, 0.5), trim))
    lintel.position.set(0, WALL_H - 0.1, -10.2)
    this.roof.add(lintel)
    const sign = this.sign('Piggy Palace', 3.4, 0.6)
    sign.position.set(0, WALL_H + 0.5, -9.9)
    this.roof.add(sign)

    // Gable roof running east–west, with an overhang.
    const o = BARN_OUTER
    const w = o.x1 - o.x0 + 1
    const d = (o.z1 - o.z0) / 2 + 0.6
    const rise = 2.6
    const slope = Math.hypot(d, rise)
    const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide })
    ;(roofMat.map as THREE.Texture).repeat.set(w / 2, 1)
    const cz = (o.z0 + o.z1) / 2
    for (const side of [-1, 1]) {
      const panel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, slope), roofMat))
      panel.position.set(0, WALL_H + rise / 2, cz + (side * d) / 2)
      panel.rotation.x = side * Math.atan2(rise, d)
      this.roof.add(panel)
    }
    // Gable ends
    const gable = new THREE.Shape()
    gable.moveTo(-d + 0.6, 0)
    gable.lineTo(d - 0.6, 0)
    gable.lineTo(0, rise - 0.1)
    gable.closePath()
    const gableGeo = new THREE.ShapeGeometry(gable)
    const gableMat = new THREE.MeshLambertMaterial({ map: barnTex, side: THREE.DoubleSide })
    for (const x of [o.x0, o.x1]) {
      const g = shadowed(new THREE.Mesh(gableGeo, gableMat))
      g.rotation.y = Math.PI / 2
      g.position.set(x, WALL_H, cz)
      this.roof.add(g)
    }
    s.add(this.roof)

    // Inside: hay racks along the back wall, water bottles, little pig houses, food bowls.
    const hay = new THREE.MeshLambertMaterial({ map: hayTex })
    for (const x of [-8, 0, 8]) {
      const rack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 0.5), mat(0x8a5a2b)))
      rack.position.set(x, 0.5, BARN_IN.z0 + 0.3)
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 0.4), hay))
      top.position.set(x, 0.95, BARN_IN.z0 + 0.3)
      s.add(rack, top)
    }
    const bottleMat = new THREE.MeshLambertMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.7 })
    for (const x of [-4, 4]) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10), bottleMat)
      bottle.position.set(x, 0.75, BARN_IN.z0 + 0.15)
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat(0xc0c0c0))
      spout.position.set(x, 0.35, BARN_IN.z0 + 0.2)
      s.add(bottle, spout)
    }
    for (const h of PIG_HOUSES) {
      const house = this.pigHouse()
      house.position.set(h.x, 0, h.z)
      house.rotation.y = h.x < 0 ? Math.PI / 2 : -Math.PI / 2
      s.add(house)
    }
    const bowlGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0, 0), new THREE.Vector2(0.45, 0), new THREE.Vector2(0.55, 0.18), new THREE.Vector2(0.5, 0.2), new THREE.Vector2(0.4, 0.06), new THREE.Vector2(0, 0.06)],
      20,
    )
    BOWLS.forEach((b, i) => {
      const bowl = shadowed(new THREE.Mesh(bowlGeo, mat([0x4f8fd8, 0xe8453c, 0xf2c230, 0x3cc45a][i])))
      bowl.position.set(b.x, 0.02, b.z)
      s.add(bowl)
      this.bowlFood.push({ kind: null, piles: [] })
    })
  }

  private pigHouse() {
    const g = new THREE.Group()
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.08), wood))
    back.position.set(0, 0.35, 0.5)
    g.add(back)
    for (const x of [-0.7, 0.7]) {
      const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1), wood))
      side.position.set(x, 0.35, 0)
      g.add(side)
    }
    const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), mat(0x3c7ee8)))
    roof.position.set(0, 0.74, 0)
    g.add(roof)
    return g
  }

  /** A wooden A-frame hut, open to the south, for pigs to dive into. */
  private hidey(x: number, z: number) {
    const g = new THREE.Group()
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const h = 1.1
    const half = HIDEY_W / 2
    const slope = Math.hypot(half, h)
    for (const side of [-1, 1]) {
      const panel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(slope, 0.08, HIDEY_D), wood))
      panel.position.set((side * half) / 2, h / 2, 0)
      panel.rotation.z = -side * Math.atan2(h, half)
      g.add(panel)
    }
    const backShape = new THREE.Shape()
    backShape.moveTo(-half, 0)
    backShape.lineTo(half, 0)
    backShape.lineTo(0, h)
    backShape.closePath()
    const back = shadowed(new THREE.Mesh(new THREE.ShapeGeometry(backShape), wood))
    back.position.z = -HIDEY_D / 2
    g.add(back)
    const straw = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), new THREE.MeshLambertMaterial({ map: strawTex }))
    straw.rotation.x = -Math.PI / 2
    straw.position.y = 0.02
    g.add(straw)
    g.position.set(x, 0, z)
    return g
  }

  private buildGarden() {
    const s = this.scene
    const picket = mat(0xf6efe0)
    for (const f of GARDEN_FENCE) s.add(boxMesh(f, 0, 0.75, picket))
    const frame = new THREE.MeshLambertMaterial({ map: plankTex })
    const soil = new THREE.MeshLambertMaterial({ map: soilTex })
    const leafy = mat(0x4caf3a)
    const leafGeo = new THREE.SphereGeometry(1, 7, 5)
    for (const bed of BEDS) {
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.3, BED_D), [frame, frame, soil, frame, frame, frame]))
      box.position.set(bed.x, 0.15, bed.z)
      s.add(box)
      const view: BedView = { plants: [], ripe: [] }
      for (let i = 0; i < 8; i++) {
        const px = bed.x + (i % 2 ? 0.55 : -0.55)
        const pz = bed.z - BED_D / 2 + 0.6 + Math.floor(i / 2) * ((BED_D - 1.2) / 3)
        const plant = new THREE.Group()
        plant.position.set(px, 0.3, pz)
        const leaves = shadowed(new THREE.Mesh(leafGeo, leafy))
        leaves.scale.set(0.28, 0.2, 0.28)
        leaves.position.y = 0.12
        plant.add(leaves)
        const veg = makeVeg(bed.kind)
        veg.position.y = bed.kind === 'carrot' ? 0 : 0.18
        if (bed.kind === 'carrot') veg.rotation.z = Math.PI / 2.4 // poking up out of the soil
        if (bed.kind === 'apple' || bed.kind === 'pepper' || bed.kind === 'cucumber') veg.position.x = 0.12
        const ripe = new THREE.Group()
        ripe.add(veg)
        plant.add(ripe)
        s.add(plant)
        view.plants.push(plant)
        view.ripe.push(ripe)
      }
      this.beds.push(view)
    }
  }

  private buildOrchard() {
    const s = this.scene
    const trunkMat = mat(0x7a5232)
    const leaves = [mat(0x4c9a3a), mat(0x5aae44), mat(0x3f8a32)]
    const appleMat = mat(0xd8322b)
    const ball = new THREE.IcosahedronGeometry(1, 1)
    const appleGeo = new THREE.SphereGeometry(0.1, 8, 6)
    for (const t of TREES) s.add(this.tree(t.x, t.z, trunkMat, leaves, ball, appleGeo, appleMat, true))
  }

  private tree(
    x: number,
    z: number,
    trunkMat: THREE.Material,
    leaves: THREE.Material[],
    ball: THREE.BufferGeometry,
    appleGeo: THREE.BufferGeometry | null,
    appleMat: THREE.Material | null,
    cast: boolean,
  ) {
    const g = new THREE.Group()
    const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), trunkMat), cast)
    trunk.position.y = 1.1
    g.add(trunk)
    const blobs: [number, number, number, number][] = [
      [0, 2.9, 0, 1.5],
      [0.9, 2.5, 0.3, 1.0],
      [-0.8, 2.6, -0.2, 1.1],
      [0.1, 3.4, -0.6, 0.9],
    ]
    blobs.forEach(([bx, by, bz, r], i) => {
      const m = shadowed(new THREE.Mesh(ball, leaves[i % leaves.length]), cast)
      m.position.set(bx, by, bz)
      m.scale.setScalar(r)
      g.add(m)
    })
    if (appleGeo && appleMat) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + x
        const apple = new THREE.Mesh(appleGeo, appleMat)
        apple.position.set(Math.cos(a) * 1.35, 2.4 + ((i * 37) % 10) / 12, Math.sin(a) * 1.35)
        g.add(apple)
      }
    }
    g.position.set(x, 0, z)
    g.rotation.y = x * 1.7 + z
    return g
  }

  /** Trees and bushes beyond the fence, so the farm isn't floating in a green void. */
  private buildSurroundings() {
    const trunkMat = mat(0x6a4630)
    const leaves = [mat(0x3f7f34), mat(0x4a8f3c), mat(0x356d2c)]
    const ball = new THREE.IcosahedronGeometry(1, 1)
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2
      const x = Math.cos(a) * (42 + rnd() * 20)
      const z = Math.sin(a) * (34 + rnd() * 20)
      const t = this.tree(x, z, trunkMat, leaves, ball, null, null, false)
      t.scale.setScalar(1.2 + rnd() * 0.8)
      this.scene.add(t)
    }
    const bushMat = mat(0x3f8a32)
    for (let i = 0; i < 50; i++) {
      const side = i % 4
      const along = rnd()
      const x = side < 2 ? BOUNDS.x0 + along * (BOUNDS.x1 - BOUNDS.x0) : side === 2 ? BOUNDS.x0 - 1.5 : BOUNDS.x1 + 1.5
      const z = side === 0 ? BOUNDS.z1 + 1.5 : side === 1 ? BOUNDS.z0 - 1.5 : BOUNDS.z0 + along * (BOUNDS.z1 - BOUNDS.z0)
      if (side === 1 && x > BARN_OUTER.x0 - 1 && x < BARN_OUTER.x1 + 1) continue
      if (side === 0 && Math.abs(x) < 3) continue
      const b = new THREE.Mesh(ball, bushMat)
      b.position.set(x, 0.3, z)
      b.scale.set(0.8 + rnd() * 0.6, 0.6 + rnd() * 0.4, 0.8 + rnd() * 0.6)
      this.scene.add(b)
    }
  }

  // ---------------------------------------------------------------- things that change

  setBeds(beds: BedSnap[]) {
    beds.forEach((b, i) => {
      const view = this.beds[i]
      const grow = b.stage === 'ripe' ? 1 : b.stage === 'growing' ? 0.15 + b.grow * 0.75 : 0
      for (const p of view.plants) {
        p.visible = grow > 0
        p.scale.setScalar(Math.max(0.01, grow))
      }
      for (const r of view.ripe) r.visible = b.stage === 'ripe'
    })
  }

  private buildPellets() {
    const s = this.scene
    const glass = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, depthWrite: false })
    const pellets = new THREE.MeshLambertMaterial({ map: pelletTex })
    const metal = mat(0x9aa3ad)
    const red = mat(0xe8453c)
    for (const h of HOPPERS) {
      const root = new THREE.Group()
      root.position.set(h.x, 0, h.z)
      // A round tray on the floor, pellets in it, and a see-through tank above showing how full it is.
      const trayGeo = new THREE.LatheGeometry(
        [new THREE.Vector2(0, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0.68, 0.16), new THREE.Vector2(0.62, 0.17), new THREE.Vector2(0.55, 0.05), new THREE.Vector2(0, 0.05)],
        24,
      )
      root.add(shadowed(new THREE.Mesh(trayGeo, metal)))
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20), pellets)
      tray.position.y = 0.08
      root.add(tray)
      const body = new THREE.Group()
      body.position.y = 0.35
      for (const a of [0, 2.1, 4.2]) {
        const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), metal))
        leg.position.set(Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3)
        body.add(leg)
      }
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 16), pellets)
      body.add(fill)
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 16, 1, true), glass)
      tank.position.y = 0.55
      tank.renderOrder = 2
      body.add(tank)
      const lid = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 16), red))
      lid.position.y = 1.25
      body.add(lid)
      root.add(body)
      s.add(root)
      this.hoppers.push({ root, body, fill, tray })
    }

    // The feed bin by the door, with sacks of pellets.
    const bin = new THREE.Group()
    bin.position.set(FEED_BIN.x, 0, FEED_BIN.z)
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const chest = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.7), wood))
    chest.position.y = 0.3
    bin.add(chest)
    for (const [x, z, r] of [
      [-0.35, 0, 0.1],
      [0.1, 0.05, -0.15],
      [0.5, -0.05, 0.2],
    ]) {
      const sack = makeSack()
      sack.position.set(x, 0.6, z)
      sack.rotation.y = r
      bin.add(sack)
    }
    s.add(bin)
  }

  private buildExtras() {
    const s = this.scene
    // Second hopper: built already, just hidden until bought.
    this.extras.hopper2 = this.hoppers[1].root

    // Scarecrow on the lawn: keeps the hawks away.
    const crow = new THREE.Group()
    crow.position.set(SCARECROW.x, 0, SCARECROW.z)
    const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), mat(0x7a5232)))
    pole.position.y = 1.2
    const arms = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), mat(0x7a5232)))
    arms.position.y = 1.75
    const shirt = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.3), mat(0x3c7ee8)))
    shirt.position.y = 1.55
    const sleeves = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.22), mat(0xe8453c)))
    sleeves.position.y = 1.75
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(0xe8d4a0)))
    head.position.y = 2.25
    const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), mat(0xe8c66a)))
    brim.position.y = 2.42
    const crown = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 14), mat(0xe8c66a)))
    crown.position.y = 2.52
    crow.add(pole, arms, shirt, sleeves, head, brim, crown)
    s.add(crow)
    this.extras.scarecrow = crow

    // Sprinklers in every bed.
    const sprinklers = new THREE.Group()
    const spray = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false })
    for (const b of BEDS) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), mat(0x9aa3ad))
      post.position.set(b.x, 0.6, b.z)
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x3c7ee8))
      top.position.set(b.x, 0.95, b.z)
      const mist = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.6, 16, 1, true), spray)
      mist.position.set(b.x, 0.75, b.z)
      mist.rotation.x = Math.PI
      sprinklers.add(post, top, mist)
    }
    s.add(sprinklers)
    this.extras.sprinkler = sprinklers

    // A glowing heater against the back wall of the barn.
    const heater = new THREE.Group()
    heater.position.set(-4, 0, BARN_IN.z0 + 0.35)
    const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4), mat(0x8a8f96)))
    box.position.y = 0.4
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ color: 0xff7a2a }))
    grille.position.set(0, 0.42, 0.21)
    heater.add(box, grille)
    s.add(heater)
    this.extras.heater = heater

    // Compost heap by the garden.
    const compost = new THREE.Group()
    compost.position.set(COMPOST.x, 0, COMPOST.z)
    const heap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: soilTex })))
    heap.scale.set(1.1, 0.7, 1.1)
    compost.add(heap)
    for (const [x, z, w, d] of [
      [0, -1.2, 2.6, 0.1],
      [-1.25, 0, 0.1, 2.4],
      [1.25, 0, 0.1, 2.4],
    ]) {
      const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), new THREE.MeshLambertMaterial({ map: plankTex })))
      side.position.set(x, 0.3, z)
      compost.add(side)
    }
    s.add(compost)
    this.extras.compost = compost

    // Wire mesh along the bottom of the fence.
    const wire = new THREE.Group()
    const mesh = new THREE.MeshLambertMaterial({ map: wireTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    const { x0, x1, z0, z1 } = BOUNDS
    const run = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az)
      const m = mesh.clone()
      m.map = wireTex.clone()
      m.map.needsUpdate = true
      m.map.repeat.set(len / 1, 1)
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), m)
      p.position.set((ax + bx) / 2, 0.35, (az + bz) / 2)
      p.rotation.y = -Math.atan2(bz - az, bx - ax)
      wire.add(p)
    }
    run(x0 - 0.1, z1 + 0.1, -1.6, z1 + 0.1)
    run(1.6, z1 + 0.1, x1 + 0.1, z1 + 0.1)
    run(x0 - 0.1, z0 - 0.1, x0 - 0.1, z1 + 0.1)
    run(x1 + 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1)
    run(x0 - 0.1, z0 - 0.1, BARN_OUTER.x0, z0 - 0.1)
    run(BARN_OUTER.x1, z0 - 0.1, x1 + 0.1, z0 - 0.1)
    s.add(wire)
    this.extras.fence = wire

    this.setUpgrades([])
  }

  setUpgrades(owned: UpgradeId[]) {
    for (const [id, obj] of Object.entries(this.extras)) obj.visible = owned.includes(id as UpgradeId)
    // Bigger hoppers are taller.
    for (const h of this.hoppers) h.body.scale.y = owned.includes('bighopper') ? 1.4 : 1
  }

  setHoppers(bites: number[], max: number) {
    bites.forEach((n, i) => {
      const h = this.hoppers[i]
      const level = Math.max(0, Math.min(1, n / max))
      h.fill.visible = level > 0
      h.fill.scale.y = Math.max(0.01, level * 1.05)
      h.fill.position.y = (level * 1.05) / 2
      h.tray.visible = n > 0
    })
  }

  setBowls(bowls: { bites: number; kind: Veg }[]) {
    bowls.forEach(({ bites: n, kind }, i) => {
      const view = this.bowlFood[i]
      if (kind !== view.kind) {
        for (const p of view.piles) p.removeFromParent()
        view.piles = []
        view.kind = kind
        for (let j = 0; j < 7; j++) {
          const v = makeVeg(kind)
          const a = j * 2.4
          const r = j === 0 ? 0 : 0.25
          v.position.set(BOWLS[i].x + Math.cos(a) * r, 0.08 + (j === 0 ? 0.06 : 0), BOWLS[i].z + Math.sin(a) * r)
          v.rotation.y = a
          v.scale.setScalar(0.8)
          this.scene.add(v)
          view.piles.push(v)
        }
      }
      const shown = Math.ceil((n / BOWL_MAX) * view.piles.length)
      view.piles.forEach((p, j) => (p.visible = j < shown))
    })
  }

  /** Walls down and roof off while you're inside, so you can see the pigs. */
  setCutaway(on: boolean) {
    if (on === this.cutaway) return
    this.cutaway = on
    this.roof.visible = !on
    for (const w of this.walls) {
      w.scale.y = on ? 0.25 : 1
      w.position.y = (WALL_H * w.scale.y) / 2
    }
  }

  /** Sun, sky and lamps for the time of day (0 = dawn). `focus` keeps the shadow box on the action. */
  setTime(t: number, focus: THREE.Vector3) {
    let i = 0
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++
    const [ta, a] = KEYS[i]
    const [tb, b] = KEYS[i + 1]
    const k = Math.max(0, Math.min(1, (t - ta) / Math.max(1e-6, tb - ta)))
    const sky = a.sky.clone().lerp(b.sky, k)
    ;(this.scene.background as THREE.Color).copy(sky)
    ;(this.scene.fog as THREE.Fog).color.copy(sky)
    this.sun.color.copy(a.sun).lerp(b.sun, k)
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * k
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * k
    const lamps = a.lamps + (b.lamps - a.lamps) * k
    for (const l of this.lamps) l.intensity = lamps * 25
    this.lampBulbs.color.setScalar(0.5 + lamps * 0.5).multiply(new THREE.Color(0xffe6a0))
    // The sun swings across the sky in the day; the moon takes over at night (same light, bluer).
    const night = t >= NIGHT_START
    const arc = night ? (t - NIGHT_START) / (1 - NIGHT_START) : t / NIGHT_START
    const ang = 0.25 + arc * (Math.PI - 0.5)
    this.sun.position.set(focus.x + Math.cos(ang) * 40, 30 + Math.sin(ang) * 25, focus.z + 18)
    this.sun.target.position.copy(focus)
  }
}

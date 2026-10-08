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
  FENCE_EDGES,
  GARDENS,
  HAY_STACKS,
  HAY_PATCHES,
  HAY_PATCH,
  HAY_RACKS,
  rackBuilt,
  HIDEYS,
  TUNNELS,
  TUNNEL_R,
  type Tunnel,
  HIDEY_D,
  HIDEY_H,
  HIDEY_W,
  PIG_HOUSES,
  COMPOST,
  FEED_BIN,
  HAY_BALE,
  HOPPERS,
  POND,
  SALAD_SPOT,
  SALAD_TABLE,
  SCARECROW,
  SQUARES,
  TREES,
  canBuy,
  center,
  squareAt,
  type Rect,
} from '../core/map.ts'
import type { BedSnap } from '../core/protocol.ts'
import { BALE_ARMFULS, BOWL_MAX, hayRackMax, hayStackMax, LAND_UPGRADES, UPGRADES, landLevel, LAND, NIGHT_START, level, SALAD_BITES, SALAD_MAX, START_LAND, VEGGIES, type SquareId, type UpgradeId, type Veg } from '../core/rules.ts'
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

export const grassTex = canvasTexture(
  256,
  (g, s) => {
    g.fillStyle = '#6fb04a'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 2600, ['#64a443', '#7cbd55', '#5d9a3e', '#86c55e'], 2, 5)
    speckle(g, s, 30, ['#f6f1e7', '#ffe14a'], 3) // daisies and buttercups
  },
  40,
)

export const strawTex = canvasTexture(
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

/** Standing hay seen from the side: close-packed vertical stalks in a few golds. */
const strawSidesTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#d9b85a'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 500; i++) {
      g.fillStyle = ['#c9a44a', '#e8cb72', '#b8933c', '#f0d888', '#a8853a'][i % 5]
      const x = Math.random() * s
      g.fillRect(x, Math.random() * s * 0.3, 1 + Math.random() * 1.5, s)
    }
    // A bit darker down at the roots.
    const fade = g.createLinearGradient(0, 0, 0, s)
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(1, 'rgba(60,40,10,0.35)')
    g.fillStyle = fade
    g.fillRect(0, 0, s, s)
  },
  1,
)
strawSidesTex.repeat.set(3, 1)

/** Standing hay from above: a thick tangle of stalk ends. */
const strawTopTex = canvasTexture(
  128,
  (g, s) => {
    g.fillStyle = '#d4b255'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 1800, ['#c49f45', '#e6c96e', '#b08a36', '#f2dc90'], 2, 2)
  },
  2,
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
export const barnTex = canvasTexture(
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

export const plankTex = canvasTexture(
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

/** An armful of hay: a scruffy bundle. */
export function makeHay(): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.MeshLambertMaterial({ map: hayTex })
  for (const [x, y, z, s] of [
    [0, 0, 0, 0.32],
    [0.15, 0.08, 0.05, 0.22],
    [-0.14, 0.06, -0.04, 0.24],
  ]) {
    const tuft = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), m))
    tuft.position.set(x, y, z)
    tuft.scale.set(s * 1.3, s * 0.8, s)
    g.add(tuft)
  }
  return g
}

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
  /** How dark it is, 0..1: pulls the fog in and shades the screen edges. */
  dark: number
}
/** Key moments of the day: time (0 = dawn) → lighting. */
const RAIN_SKY = new THREE.Color(0x7d8794)
const key = (sky: number, sun: number, sunI: number, hemiI: number, lamps: number, dark: number): Lerp => ({
  sky: new THREE.Color(sky),
  sun: new THREE.Color(sun),
  sunI,
  hemiI,
  lamps,
  dark,
})
const DAWN = key(0xf6b38a, 0xffc79a, 1.2, 1.4, 0.6, 0.25)
const DAY = key(0x9fd3ff, 0xfff4e0, 2.4, 1.8, 0, 0)
const NIGHT = key(0x0e1430, 0x8aa0ff, 0.3, 0.42, 1, 1)
/** The evening comes on gradually: golden late afternoon, sunset, a purple dusk, then properly dark; a blue pre-dawn. */
const KEYS: [number, Lerp][] = [
  [0, DAWN],
  [0.08, DAY],
  [0.55, DAY],
  [0.66, key(0xf3d6a0, 0xffd28a, 2.0, 1.6, 0, 0.05)],
  [NIGHT_START - 0.03, key(0xf0946a, 0xff9a6a, 1.3, 1.2, 0.4, 0.2)],
  [NIGHT_START + 0.02, key(0x5a4a80, 0xc0a0ff, 0.7, 0.75, 0.8, 0.55)],
  [NIGHT_START + 0.06, NIGHT],
  [0.95, NIGHT],
  [0.985, key(0x3a4278, 0xb0b8ff, 0.6, 0.7, 0.9, 0.6)],
  [1, DAWN],
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
  private readonly landFeatures = {} as Record<SquareId, THREE.Group[]>
  private readonly extras: Partial<Record<UpgradeId, THREE.Object3D>> = {}
  /** Each square's things (shown once it's bought), and its long grass and for-sale sign (until then). */
  private readonly content = {} as Record<SquareId, THREE.Group>
  private readonly wild = {} as Record<SquareId, THREE.Group>
  private readonly saleSigns = {} as Partial<Record<SquareId, THREE.Mesh>>
  private land: SquareId[] = []
  private owned: UpgradeId[] = []
  /** Sprinklers, one group per square, so they only show on land the farm has. */
  private readonly sprinklers = {} as Record<SquareId, THREE.Group>
  /** The farm fence (and the wire along it, an upgrade): rebuilt when the farm grows. */
  private readonly fence = new THREE.Group()
  private readonly wire = new THREE.Group()
  private readonly ducks: THREE.Group[] = []
  /** The salad being made on the station's platter, and the one served on the barn floor. */
  private readonly saladMaking = new THREE.Group()
  private readonly saladServed = new THREE.Group()
  private saladKey = ''
  private saladFloor: THREE.Group | null = null
  /** Hay in each rack (and the bit on the floor in front that pigs eat), and the sacks on the feed bin. */
  private readonly racks: { root: THREE.Group; hay: THREE.Mesh; floor: THREE.Mesh; deep: THREE.Group }[] = []
  private readonly binSacks: THREE.Mesh[] = []
  /** The bale on the hay table, shrinking as armfuls come off it. */
  private bale!: THREE.Mesh
  /** The hay meadow's patches: tall hay that's cut down to stubble and grows back. */
  private readonly hayPatches: THREE.Object3D[] = []
  /** The haystacks in the stack yard, grown to how much hay is in each. */
  private readonly stacks: THREE.Mesh[] = []
  private clock = 0
  /** How dark it is right now (0 = broad daylight, 1 = the middle of the night). */
  darkness = 0
  /** The two leaves of the low gate in the barn doorway, hinged at each side. */
  private readonly gate: THREE.Group[] = []
  private gateShut = false
  private gateAngle = 0
  /** Rain: 0 = dry, 1 = pouring (eases in and out). */
  private rainOn = false
  private rainK = 0
  private readonly rain: THREE.LineSegments
  private readonly puddles: THREE.Mesh[] = []

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

    // Ground: lawn everywhere, a dirt path out of the barn door into the yard.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: grassTex }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    s.add(ground)
    const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 9), new THREE.MeshLambertMaterial({ map: dirtTex }))
    ;(path.material.map as THREE.Texture).repeat.set(1, 4)
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.01, -5)
    path.receiveShadow = true
    s.add(path)

    for (const sq of SQUARES) {
      this.content[sq.id] = new THREE.Group()
      this.wild[sq.id] = this.buildWild(sq)
      this.sprinklers[sq.id] = new THREE.Group()
      s.add(this.content[sq.id], this.wild[sq.id], this.sprinklers[sq.id])
    }
    s.add(this.fence, this.wire)
    this.buildBarn()
    this.buildGate()
    this.buildGarden()
    this.buildOrchard()
    for (const h of HIDEYS) this.into(h).add(this.hidey(h.x, h.z))
    for (const t of TUNNELS) this.content[t.square].add(this.tunnel(t))
    this.buildMeadow()
    this.buildStackYard()
    this.buildPond()
    this.buildFlowers()
    this.buildSurroundings()
    this.buildPellets()
    this.buildSaladStation()
    this.buildLandImprovements()
    this.buildExtras()
    this.rain = this.buildRain()

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

  /** The group for whatever square a point is in (shown only while the farm owns it). */
  private into(p: { x: number; z: number }): THREE.Group {
    return this.content[squareAt(p)?.id ?? 'yard']
  }

  /** The farm fence round the land the farm owns (not along the barn's back wall), and the wire along it. */
  private buildFence() {
    for (const g of [this.fence, this.wire]) {
      for (const c of [...g.children]) {
        g.remove(c)
        if (c instanceof THREE.Mesh) c.geometry.dispose()
      }
    }
    const wood = mat(0x8a5a2b)
    const postGeo = new THREE.BoxGeometry(0.18, 1.2, 0.18)
    const posts: THREE.Vector3[] = []
    const wireMat = new THREE.MeshLambertMaterial({ map: wireTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    for (const e of FENCE_EDGES) {
      if (e.barn) continue
      const len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z)
      const n = Math.ceil(len / 2.5)
      for (let i = 0; i <= n; i++) posts.push(new THREE.Vector3(e.a.x + ((e.b.x - e.a.x) * i) / n, 0.6, e.a.z + ((e.b.z - e.a.z) * i) / n))
      const angle = -Math.atan2(e.b.z - e.a.z, e.b.x - e.a.x)
      for (const y of [0.45, 0.95]) {
        const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.06), wood))
        rail.position.set((e.a.x + e.b.x) / 2, y, (e.a.z + e.b.z) / 2)
        rail.rotation.y = angle
        this.fence.add(rail)
      }
      const m = wireMat.clone()
      m.map = wireTex.clone()
      m.map.needsUpdate = true
      m.map.repeat.set(len, 1)
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), m)
      w.position.set((e.a.x + e.b.x) / 2 + e.out.x * 0.1, 0.35, (e.a.z + e.b.z) / 2 + e.out.z * 0.1)
      w.rotation.y = angle
      this.wire.add(w)
    }
    const inst = new THREE.InstancedMesh(postGeo, wood, posts.length)
    const m4 = new THREE.Matrix4()
    posts.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)))
    inst.castShadow = true
    this.fence.add(inst)
  }

  /** Land the farm hasn't bought: long grass and wild bits. Its sign goes up in setLand. */
  private buildWild(sq: (typeof SQUARES)[number]) {
    const g = new THREE.Group()
    const w = sq.x1 - sq.x0
    const d = sq.z1 - sq.z0
    const rough = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: grassTex, color: 0xc8c890 }))
    rough.rotation.x = -Math.PI / 2
    rough.position.set((sq.x0 + sq.x1) / 2, 0.012, (sq.z0 + sq.z1) / 2)
    rough.receiveShadow = true
    g.add(rough)
    let seed = sq.col * 7 + sq.row * 13 + 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const n = 90
    const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.25, 0.9, 5), mat(0x7a9a3e), n)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      const s = 0.6 + rnd() * 0.8
      m4.compose(
        new THREE.Vector3(sq.x0 + 0.5 + rnd() * (w - 1), 0.4 * s, sq.z0 + 0.5 + rnd() * (d - 1)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4)),
        new THREE.Vector3(s, s, s),
      )
      tufts.setMatrixAt(i, m4)
    }
    g.add(tufts)
    return g
  }

  /** The hay meadow: a field of patches of thick standing hay (on the same lawn as everywhere else). */
  private buildMeadow() {
    const stubble = new THREE.MeshLambertMaterial({ map: hayTex, color: 0xd8c27a })
    // Each patch is packed tufts of hay (streaky straw down the sides, a speckled top), a little taller or shorter
    // than their neighbours, with thin stalks poking up out of them so the top is ragged, not flat.
    const sides = new THREE.MeshLambertMaterial({ map: strawSidesTex })
    const top = new THREE.MeshLambertMaterial({ map: strawTopTex })
    const tuft = new THREE.BoxGeometry(1, 1, 1)
    tuft.translate(0, 0.5, 0)
    const TUFTS = 5
    const cell = HAY_PATCH / TUFTS
    const stalk = new THREE.CylinderGeometry(0.012, 0.02, 1, 3)
    stalk.translate(0, 0.5, 0)
    const golds = [mat(0xe2c162), mat(0xd6b452), mat(0xeccf7a)]
    let seed = 5
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (const h of HAY_PATCHES) {
      const c = center(h)
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(HAY_PATCH, HAY_PATCH), stubble)
      ground.rotation.x = -Math.PI / 2
      ground.position.set(c.x, 0.02, c.z)
      ground.receiveShadow = true
      this.content.meadow.add(ground)
      // The standing hay, scaled down to stubble when it's been cut.
      const tall = new THREE.Group()
      tall.position.set(c.x, 0, c.z)
      const mass = new THREE.InstancedMesh(tuft, [sides, sides, top, stubble, sides, sides], TUFTS * TUFTS)
      for (let i = 0; i < TUFTS * TUFTS; i++) {
        const x = -HAY_PATCH / 2 + cell * ((i % TUFTS) + 0.5)
        const z = -HAY_PATCH / 2 + cell * (Math.floor(i / TUFTS) + 0.5)
        e.set((rnd() - 0.5) * 0.06, rnd() * 0.4, (rnd() - 0.5) * 0.06)
        m4.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e), new THREE.Vector3(cell * 1.08, 0.68 + rnd() * 0.27, cell * 1.08))
        mass.setMatrixAt(i, m4)
      }
      mass.castShadow = true
      mass.receiveShadow = true
      tall.add(mass)
      for (const gold of golds) {
        const n = 150
        const inst = new THREE.InstancedMesh(stalk, gold, n)
        for (let i = 0; i < n; i++) {
          e.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3)
          m4.compose(
            new THREE.Vector3((rnd() - 0.5) * HAY_PATCH, 0, (rnd() - 0.5) * HAY_PATCH),
            q.setFromEuler(e),
            new THREE.Vector3(1, 0.75 + rnd() * 0.45, 1),
          )
          inst.setMatrixAt(i, m4)
        }
        tall.add(inst)
      }
      this.content.meadow.add(tall)
      this.hayPatches.push(tall)
    }
  }

  /** The stack yard: a straw base for each haystack, and a sign. The stacks themselves grow with the hay put on them. */
  private buildStackYard() {
    const straw = new THREE.MeshLambertMaterial({ map: strawTex })
    const hay = new THREE.MeshLambertMaterial({ map: strawTopTex })
    const dome = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    for (const p of HAY_STACKS) {
      const base = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), straw)
      base.rotation.x = -Math.PI / 2
      base.position.set(p.x, 0.025, p.z)
      base.receiveShadow = true
      this.content.meadow.add(base)
      const stack = shadowed(new THREE.Mesh(dome, hay))
      stack.position.set(p.x, 0, p.z)
      stack.visible = false
      this.content.meadow.add(stack)
      this.stacks.push(stack)
    }
    const top = HAY_STACKS[0]
    const sign = this.sign('Hay stacks', 2.2, 0.5)
    sign.position.set(top.x, 1.5, top.z - 1.8)
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), mat(0x7a5232)))
    post.position.y = -0.75
    sign.add(post)
    this.content.meadow.add(sign)
  }

  /** Armfuls in each haystack. */
  setStacks(armfuls: number[]) {
    armfuls.forEach((n, i) => {
      const s = this.stacks[i]
      if (!s) return
      const k = n / hayStackMax(this.owned)
      s.visible = n > 0
      s.scale.set(0.6 + 0.6 * k, 0.4 + 1.3 * k, 0.6 + 0.6 * k)
    })
  }

  /** How grown each patch of hay is (0 = just cut, 1 = ready). */
  setHayField(grown: number[]) {
    grown.forEach((g, i) => {
      const p = this.hayPatches[i]
      if (p) p.scale.y = 0.08 + 0.92 * g
    })
  }

  /** The pond: water, stones round the edge, and a couple of ducks paddling about. */
  private buildPond() {
    const c = center(POND)
    const rx = (POND.x1 - POND.x0) / 2
    const rz = (POND.z1 - POND.z0) / 2
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshLambertMaterial({ color: 0x4f9fd8 }))
    water.rotation.x = -Math.PI / 2
    water.scale.set(rx + 0.3, rz + 0.3, 1)
    water.position.set(c.x, 0.03, c.z)
    this.content.pond.add(water)
    const stone = mat(0x9a9a92)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const b = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.1, 0), stone))
      b.position.set(c.x + Math.cos(a) * (rx + 0.5), 0.12, c.z + Math.sin(a) * (rz + 0.5))
      b.scale.y = 0.6
      this.content.pond.add(b)
    }
    for (let i = 0; i < 2; i++) {
      const duck = new THREE.Group()
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(i ? 0xf6f1e7 : 0x8a6a3c))
      body.scale.set(1, 0.7, 1.4)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(i ? 0xf6f1e7 : 0x2f7a2a))
      head.position.set(0, 0.25, -0.3)
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), mat(0xf28a30))
      beak.rotation.x = -Math.PI / 2
      beak.position.set(0, 0.23, -0.47)
      duck.add(body, head, beak)
      duck.position.set(c.x, 0.12, c.z)
      this.content.pond.add(duck)
      this.ducks.push(duck)
    }
  }

  /** Wild flowers: daisies, buttercups and clover all over their square. */
  private buildFlowers() {
    const sq = SQUARES.find((x) => x.id === 'flowers')!
    let seed = 99
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const head = new THREE.CircleGeometry(0.13, 8)
    head.rotateX(-Math.PI / 2)
    const m4 = new THREE.Matrix4()
    for (const color of [0xffe14a, 0xf6f1e7, 0xff9ad6, 0xb98af0]) {
      const n = 110
      const inst = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color }), n)
      for (let i = 0; i < n; i++) {
        const s = 0.7 + rnd() * 0.8
        m4.compose(
          new THREE.Vector3(sq.x0 + 0.5 + rnd() * (sq.x1 - sq.x0 - 1), 0.05 + rnd() * 0.12, sq.z0 + 0.5 + rnd() * (sq.z1 - sq.z0 - 1)),
          new THREE.Quaternion(),
          new THREE.Vector3(s, 1, s),
        )
        inst.setMatrixAt(i, m4)
      }
      this.content.flowers.add(inst)
    }
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

    // Hay racks against the walls (inside, and outside the front), water bottles, little pig houses, food bowls.
    const hay = new THREE.MeshLambertMaterial({ map: hayTex })
    const slats = mat(0x8a5a2b)
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const FACING = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }
    for (const r of HAY_RACKS) {
      // Built facing +Z (its front, where the pigs eat), then turned to face the way it should.
      const root = new THREE.Group()
      root.position.set(r.x, 0, r.z)
      root.rotation.y = FACING[r.face]
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(r.len, 0.9, 0.08), slats))
      back.position.set(0, 0.6, -0.2)
      root.add(back)
      const bars = Math.round(r.len * 2) + 1
      for (let i = 0; i < bars; i++) {
        const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), slats))
        bar.position.set(-(r.len - 0.2) / 2 + (i * (r.len - 0.2)) / (bars - 1), 0.65, 0.15)
        bar.rotation.x = -0.25
        root.add(bar)
      }
      const inRack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(r.len - 0.2, 0.6, 0.3), hay))
      inRack.position.set(0, 0.6, 0)
      const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(r.len - 0.4, 0.12, 0.5), hay))
      floor.position.set(0, 0.06, 0.5)
      // Deep racks (the barn improvement): a top rail and side boards.
      const deep = new THREE.Group()
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(r.len * 0.65, 0.09, 0.08), wood))
      rail.position.y = 1.05
      deep.add(rail)
      for (const dx of [-1, 1]) {
        const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), wood))
        side.position.set((dx * r.len * 0.6) / 2, 0.85, 0)
        deep.add(side)
      }
      root.add(inRack, floor, deep)
      s.add(root)
      this.racks.push({ root, hay: inRack, floor, deep })
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
  /** A crinkly fabric play tunnel: a stripy open tube half sunk in the grass, with a hoop at each end. */
  private tunnel(t: Tunnel) {
    const g = new THREE.Group()
    const len = Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z)
    const R = TUNNEL_R + 0.08
    const colours = [0xe8453c, 0x3c7ee8, 0xf2c230, 0x3cc45a, 0xb05ce0]
    const colour = colours[TUNNELS.indexOf(t) % colours.length]
    const stripes = canvasTexture(
      64,
      (c, s) => {
        c.fillStyle = `#${colour.toString(16).padStart(6, '0')}`
        c.fillRect(0, 0, s, s)
        c.fillStyle = 'rgba(255,255,255,0.35)'
        for (let y = 0; y < s; y += 16) c.fillRect(0, y, s, 5)
      },
      Math.max(1, Math.round(len * 2)),
    )
    stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping
    stripes.repeat.set(1, Math.round(len * 2))
    const tube = shadowed(
      new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 20, 1, true), new THREE.MeshLambertMaterial({ map: stripes, side: THREE.DoubleSide })),
    )
    tube.rotation.x = Math.PI / 2 // lying down, along z…
    g.add(tube)
    for (const end of [-1, 1]) {
      const hoop = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 24), mat(0xffffff)))
      hoop.position.z = (end * len) / 2
      g.add(hoop)
    }
    g.position.set((t.a.x + t.b.x) / 2, R - 0.06, (t.a.z + t.b.z) / 2)
    // …then turned to run along x if that's the way it goes.
    if (t.a.z === t.b.z) g.rotation.y = Math.PI / 2
    return g
  }

  private hidey(x: number, z: number) {
    const g = new THREE.Group()
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const h = HIDEY_H
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
    const picket = mat(0xf6efe0)
    for (const g of GARDENS) for (const f of g.fence) this.content[g.square].add(boxMesh(f, 0, 0.75, picket))
    const frame = new THREE.MeshLambertMaterial({ map: plankTex })
    const soil = new THREE.MeshLambertMaterial({ map: soilTex })
    const leafy = mat(0x4caf3a)
    const leafGeo = new THREE.SphereGeometry(1, 7, 5)
    for (const bed of BEDS) {
      const group = this.content[bed.square]
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.3, BED_D), [frame, frame, soil, frame, frame, frame]))
      box.position.set(bed.x, 0.15, bed.z)
      group.add(box)
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
        group.add(plant)
        view.plants.push(plant)
        view.ripe.push(ripe)
      }
      this.beds.push(view)
    }

  }

  private buildOrchard() {
    const trunkMat = mat(0x7a5232)
    const leaves = [mat(0x4c9a3a), mat(0x5aae44), mat(0x3f8a32)]
    const appleMat = mat(0xd8322b)
    const ball = new THREE.IcosahedronGeometry(1, 1)
    const appleGeo = new THREE.SphereGeometry(0.1, 8, 6)
    for (const t of TREES) this.content.orchard.add(this.tree(t.x, t.z, trunkMat, leaves, ball, appleGeo, appleMat, true))
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

  /** A low wooden gate across the barn door: two leaves that swing inwards. Open by day. */
  private buildGate() {
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * DOOR_HALF, 0, -10.2)
      const leaf = new THREE.Group()
      for (const y of [0.25, 0.65]) {
        const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF - 0.05, 0.14, 0.08), wood))
        rail.position.set((-side * (DOOR_HALF - 0.05)) / 2, y, 0)
        leaf.add(rail)
      }
      for (const x of [0.15, DOOR_HALF / 2, DOOR_HALF - 0.2]) {
        const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), wood))
        post.position.set(-side * x, 0.42, 0)
        leaf.add(post)
      }
      pivot.add(leaf)
      this.scene.add(pivot)
      this.gate.push(pivot)
    }
  }

  /** Rain streaks that fall around the camera, and puddles on the lawn. */
  private buildRain() {
    const n = 1400
    const pos = new Float32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60
      const y = Math.random() * 22
      const z = (Math.random() - 0.5) * 60
      pos.set([x, y, z, x + 0.04, y + 0.55, z], i * 6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0, depthWrite: false }))
    rain.frustumCulled = false
    rain.visible = false
    this.scene.add(rain)
    const puddleMat = new THREE.MeshBasicMaterial({ color: 0x6f8fb0, transparent: true, opacity: 0, depthWrite: false })
    const spots = [
      [-4, 4, 1.6], [3, 14, 1.2], [-10, 9, 1.0], [8, 6, 1.4], [2, -4, 1.1], [-6, 20, 1.3], [14, 20, 1.0], [20, -9, 1.2], [-3, -7.5, 0.9],
    ]
    for (const [x, z, r] of spots) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat)
      p.rotation.x = -Math.PI / 2
      p.scale.set(1, 0.7, 1)
      p.position.set(x, 0.025, z)
      p.visible = false
      this.scene.add(p)
      this.puddles.push(p)
    }
    return rain
  }

  /** A prep table by the door with a big platter on it, and a platter for the barn floor once it's served. */
  private buildSaladStation() {
    const wood = new THREE.MeshLambertMaterial({ map: plankTex })
    const table = new THREE.Group()
    table.position.set(SALAD_TABLE.x, 0, SALAD_TABLE.z)
    const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.9), wood))
    top.position.y = 0.75
    table.add(top)
    for (const [x, z] of [
      [-0.8, -0.35],
      [0.8, -0.35],
      [-0.8, 0.35],
      [0.8, 0.35],
    ])
      table.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), wood)).translateX(x).translateY(0.375).translateZ(z))
    const plate = (r: number) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.06, 24), mat(0xf6f1e7)))
    const p1 = plate(0.55)
    p1.position.y = 0.83
    table.add(p1)
    this.saladMaking.position.y = 0.86
    table.add(this.saladMaking)
    const sign = this.sign('🥗 Salad station', 1.8, 0.4)
    sign.position.set(0, 1.35, 0.1)
    table.add(sign)
    this.scene.add(table)

    const floor = new THREE.Group()
    floor.position.set(SALAD_SPOT.x, 0, SALAD_SPOT.z)
    floor.add(plate(1.1).translateY(0.04))
    this.saladServed.position.y = 0.08
    floor.add(this.saladServed)
    this.scene.add(floor)
    this.saladFloor = floor
  }

  /** Fills the platters: veg being made up on the station, and what's left of tonight's on the floor. */
  setSalad(veg: number[], bites: number) {
    const key = `${veg.join()}|${bites}`
    if (key === this.saladKey) return
    this.saladKey = key
    const pile = (g: THREE.Group, kinds: Veg[], n: number, radius: number, scale: number) => {
      for (const c of [...g.children]) g.remove(c)
      for (let i = 0; i < n; i++) {
        const v = makeVeg(kinds[i % kinds.length])
        const a = i * 2.4
        const r = radius * Math.sqrt((i + 0.5) / n)
        v.position.set(Math.cos(a) * r, Math.floor(i / 7) * 0.05, Math.sin(a) * r)
        v.rotation.y = a
        v.scale.setScalar(scale)
        g.add(v)
      }
    }
    const making = VEGGIES.filter((_, i) => veg[i] > 0)
    const total = veg.reduce((a, b) => a + b, 0)
    pile(this.saladMaking, making, Math.min(14, total), 0.42, 0.55)
    pile(this.saladServed, [...VEGGIES], Math.ceil((Math.min(1, bites / (SALAD_MAX * SALAD_BITES)) * 26)), 0.9, 0.8)
    if (this.saladFloor) this.saladFloor.visible = bites > 0
  }

  // ---------------------------------------------------------------- things that change

  setDoor(shut: boolean) {
    this.gateShut = shut
  }

  setRain(on: boolean) {
    this.rainOn = on
  }

  /** Per-frame animation: the gate swinging and the rain falling. */
  update(dt: number, focus: THREE.Vector3) {
    this.clock += dt
    const c = center(POND)
    this.ducks.forEach((d, i) => {
      const a = this.clock * (0.25 + i * 0.1) + i * 2.5
      d.position.set(c.x + Math.cos(a) * (2.6 - i), 0.12 + Math.sin(this.clock * 3 + i) * 0.02, c.z + Math.sin(a) * (1.4 - i * 0.4))
      d.rotation.y = -a + Math.PI
    })
    // Open means swung right in against the inside of the wall.
    const target = this.gateShut ? 0 : Math.PI / 2
    this.gateAngle += (target - this.gateAngle) * Math.min(1, dt * 6)
    this.gate.forEach((g, i) => (g.rotation.y = (i === 0 ? 1 : -1) * this.gateAngle))

    this.rainK += ((this.rainOn ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.6)
    const wet = this.rainK > 0.01
    this.rain.visible = wet
    for (const p of this.puddles) {
      p.visible = wet
      ;(p.material as THREE.MeshBasicMaterial).opacity = 0.45 * this.rainK
    }
    if (!wet) return
    ;(this.rain.material as THREE.LineBasicMaterial).opacity = 0.55 * this.rainK
    this.rain.position.set(focus.x, 0, focus.z)
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute
    const a = pos.array as Float32Array
    const fall = 20 * dt
    for (let i = 0; i < a.length; i += 6) {
      a[i + 1] -= fall
      a[i + 4] -= fall
      if (a[i + 1] < 0) {
        a[i + 1] += 22
        a[i + 4] += 22
      }
    }
    pos.needsUpdate = true
  }

  setBeds(beds: BedSnap[]) {
    beds.forEach((b, i) => {
      const view = this.beds[i]
      const grow = b.stage === 'ripe' ? 1 : b.stage === 'growing' ? 0.15 + b.grow * 0.75 : 0
      for (const p of view.plants) {
        p.visible = grow > 0
        p.scale.setScalar(Math.max(0.01, grow))
      }
      // A ripe bed a sneaky pig's been munching has gaps in it.
      const left = Math.ceil(view.ripe.length * (b.left ?? 1))
      view.ripe.forEach((r, k) => (r.visible = b.stage === 'ripe' && k < left))
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
    // Today's ration: one sack per hopper.
    for (const [x, z, r] of [
      [-0.3, 0, 0.1],
      [0.35, 0.05, -0.15],
    ]) {
      const sack = makeSack()
      sack.position.set(x, 0.6, z)
      sack.rotation.y = r
      bin.add(sack)
      this.binSacks.push(sack)
    }
    s.add(bin)

    // The hay table next to it, with today's bale (tied with twine) and a few wisps.
    const table = new THREE.Group()
    table.position.set(HAY_BALE.x, 0, HAY_BALE.z)
    const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), wood))
    top.position.y = 0.55
    table.add(top)
    for (const [x, z] of [
      [-0.65, -0.3],
      [0.65, -0.3],
      [-0.65, 0.3],
      [0.65, 0.3],
    ]) {
      const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), wood))
      leg.position.set(x, 0.275, z)
      table.add(leg)
    }
    const baleGeo = new THREE.BoxGeometry(1.2, 0.5, 0.6)
    baleGeo.translate(0.6, 0.25, 0) // shrinks from the right as it's used
    this.bale = shadowed(new THREE.Mesh(baleGeo, new THREE.MeshLambertMaterial({ map: hayTex })))
    this.bale.position.set(-0.6, 0.59, 0)
    table.add(this.bale)
    const wisps = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshLambertMaterial({ map: strawTex }))
    wisps.rotation.x = -Math.PI / 2
    wisps.position.y = 0.02
    table.add(wisps)
    s.add(table)
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

    // Sprinklers in every bed (shown per square, on land the farm has).
    const spray = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false })
    for (const b of BEDS) {
      const group = this.sprinklers[b.square]
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), mat(0x9aa3ad))
      post.position.set(b.x, 0.6, b.z)
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x3c7ee8))
      top.position.set(b.x, 0.95, b.z)
      const mist = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.6, 16, 1, true), spray)
      mist.position.set(b.x, 0.75, b.z)
      mist.rotation.x = Math.PI
      group.add(post, top, mist)
    }

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

    this.extras.fence = this.wire

    this.setUpgrades([])
  }

  /** Small decorations illustrate each cumulative land benefit; none obstructs a path. */
  private buildLandImprovements() {
    const wood = 0x98683e
    const straw = 0xd6bd68
    for (const sq of SQUARES) {
      this.landFeatures[sq.id] = [1, 2, 3].map((tier) => {
        const g = new THREE.Group()
        const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
          const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)))
          m.position.set(x, y, z)
          g.add(m)
          return m
        }
        const disc = (x: number, y: number, z: number, radius: number, height: number, color: number) => {
          const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), mat(color)))
          m.position.set(x, y, z)
          g.add(m)
        }
        const planter = (x: number, z: number, color: number) => {
          box(x, 0.12, z, 1.4, 0.24, 0.65, wood)
          box(x, 0.25, z, 1.2, 0.06, 0.5, 0x544030)
          for (const dx of [-0.4, 0, 0.4]) {
            box(x + dx, 0.4, z, 0.05, 0.3, 0.05, 0x448b40)
            disc(x + dx, 0.55, z, 0.17, 0.06, color)
          }
        }
        const flag = (x: number, z: number) => {
          box(x, 1.3, z, 0.07, 2.6, 0.07, wood)
          box(x + 0.3, 2.35, z, 0.6, 0.35, 0.04, 0xeac84c)
        }
        if (sq.id === 'barn') {
          // Tier 1 (deep racks) and 2 (more racks) are drawn with the racks themselves.
          if (tier === 2) for (const x of [2.8, 3.5]) box(x, 0.4, -11.1, 0.6, 0.8, 0.5, straw)
          if (tier === 3) for (const h of PIG_HOUSES) box(h.x, 0.06, h.z + 0.45, 1.8, 0.12, 1.2, 0xe6bb8d)
        } else if (sq.id === 'yard') {
          if (tier === 1) for (let n = 0; n < 22; n++) {
            const x = -10 + (n % 6) * 1.6, z = -5 + Math.floor(n / 6) * 1.6
            for (const dx of [-0.08, 0.08]) disc(x + dx, 0.035, z, 0.13, 0.035, 0x3c873e)
          }
          if (tier === 2) for (const x of [-5, -2]) {
            box(x - 0.7, 0.45, 2, 0.12, 0.9, 0.2, 0xe88d63)
            box(x + 0.7, 0.45, 2, 0.12, 0.9, 0.2, 0xe88d63)
            box(x, 0.9, 2, 1.5, 0.15, 0.3, 0xf1c758)
          }
          if (tier === 3) {
            box(-2.8, 1.1, -7, 0.12, 2.2, 0.12, wood)
            box(-2.4, 2.15, -7, 0.85, 0.12, 0.12, wood)
            disc(-2.1, 1.8, -7, 0.24, 0.35, 0xe8bd49)
          }
        } else if (sq.id === 'garden' || sq.id === 'patch2') {
          const beds = BEDS.filter((b) => b.square === sq.id)
          if ((sq.id === 'garden' && tier === 1) || (sq.id === 'patch2' && tier === 2)) for (const b of beds) {
            for (const dx of [-1.3, 1.3]) box(b.x + dx, 0.14, b.z, 0.1, 0.28, BED_D, wood)
          }
          if (sq.id === 'garden' && tier === 2) for (const z of [-4, 4]) disc(-27.8, 0.5, z, 0.45, 1, 0x548eac)
          if (sq.id === 'patch2' && tier === 1) for (const b of beds) {
            for (const z of [b.z - 1.8, b.z + 1.8]) {
              const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 4, 16, Math.PI), mat(0x8fbdb8))
              hoop.position.set(b.x, 0.12, z)
              g.add(hoop)
            }
          }
          if (tier === 3) {
            const x = sq.id === 'garden' ? -22 : 22, z = sq.id === 'garden' ? -5.5 : -23.5
            box(x, 0.6, z, 1.5, 0.12, 0.65, wood)
            for (const dx of [-0.6, 0.6]) box(x + dx, 0.3, z, 0.1, 0.6, 0.5, wood)
            for (const dx of [-0.4, 0, 0.4]) box(x + dx, 0.77, z, 0.25, 0.22, 0.3, straw)
          }
        } else if (sq.id === 'meadow') {
          if (tier === 1) {
            box(-31, 0.7, -9.6, 0.09, 1.4, 0.09, wood)
            box(-30.6, 1.35, -9.6, 0.8, 0.08, 0.12, 0xb5c3c6)
          }
          if (tier === 2) for (const p of HAY_STACKS) {
            box(p.x, 0.08, p.z, 2.6, 0.16, 2.7, wood)
            for (const dx of [-1.2, 1.2]) box(p.x + dx, 0.45, p.z, 0.1, 0.9, 2.7, wood)
          }
          if (tier === 3) for (const x of [-24, -21, -18]) planter(x, -9.4, straw)
        } else if (sq.id === 'orchard') {
          for (const t of TREES) {
            if (tier === 1) for (const dz of [-0.45, 0.45]) box(t.x + 1.15, 0.12, t.z + dz, 1, 0.2, 0.07, wood)
            if (tier === 2) {
              box(t.x + 1.15, 0.85, t.z, 1.3, 0.05, 1.2, 0x86ab64)
              for (const dx of [0.6, 1.7]) box(t.x + dx, 0.4, t.z, 0.04, 0.8, 0.04, wood)
            }
          }
          if (tier === 3) {
            box(14, 0.45, 3, 0.12, 0.9, 1.2, wood)
            for (const dz of [-0.35, 0.35]) box(14, 0.9, 3 + dz, 0.6, 0.06, 0.1, 0xb5c3c6)
          }
        } else if (sq.id === 'huts') {
          for (const h of HIDEYS.filter((h) => h.square === 'huts')) {
            if (tier === 1) box(h.x, 0.045, h.z + 0.4, 1.6, 0.09, 1.6, straw)
            if (tier === 2) {
              box(h.x, 0.6, h.z - 0.8, 2, 1.2, 0.08, 0x789266)
              box(h.x - 1, 0.6, h.z, 0.08, 1.2, 1.6, 0x789266)
            }
            if (tier === 3) flag(h.x + 1.2, h.z - 0.5)
          }
        } else if (sq.id === 'flowers') {
          if (tier <= 2) for (const x of [16, 19, 22]) planter(x, tier === 1 ? 11 : 13, tier === 1 ? 0x81b66c : 0xf3d454)
          if (tier === 3) {
            box(28, 0.6, 12, 0.1, 1.2, 0.1, wood)
            box(28, 1.25, 12, 1, 0.8, 0.5, straw)
            for (const dx of [-0.3, 0, 0.3]) for (const y of [1.1, 1.4]) box(28 + dx, y, 12.26, 0.15, 0.12, 0.02, 0x5b4430)
          }
        } else if (sq.id === 'pond') {
          if (tier === 1) for (let n = 0; n < 12; n++) {
            const x = -26 + n * 0.7
            box(x, 0.4, 19.8, 0.05, 0.8, 0.05, 0x68964a)
            box(x, 0.82, 19.8, 0.1, 0.22, 0.1, 0x80623c)
          }
          if (tier === 2) for (const [x, z] of [[-24, 16], [-20, 18], [-25, 18]]) {
            disc(x, 0.045, z, 0.45, 0.025, 0x488e52)
            disc(x, 0.09, z, 0.17, 0.07, 0xf4b1cc)
          }
          if (tier === 3) for (const x of [-25, -22, -19]) planter(x, 21.3, 0xb299cc)
        }
        // Small labels at the square edge identify the purchased additions.
        const name = UPGRADES[LAND_UPGRADES[sq.id]].levels[tier - 1].name!
        const sign = this.sign(name, 2.6, 0.38)
        sign.position.set(sq.x0 + 2 + (tier - 1) * 3, 0.5, sq.id === 'barn' ? -24.8 : sq.z1 - 0.7)
        g.add(sign)
        g.visible = false
        this.content[sq.id].add(g)
        return g
      })
    }
  }

  /** The farm grew: show the squares it owns, put for-sale signs on the ones it could buy next, move the fence. */
  setLand(land: SquareId[]) {
    if (land.length === this.land.length && land.every((id) => this.land.includes(id))) return
    this.land = [...land]
    for (const sq of SQUARES) {
      const mine = land.includes(sq.id)
      this.content[sq.id].visible = mine
      this.wild[sq.id].visible = !mine
      const old = this.saleSigns[sq.id]
      if (old) {
        old.removeFromParent()
        delete this.saleSigns[sq.id]
      }
      if (mine || START_LAND.includes(sq.id)) continue
      const info = LAND[sq.id]
      const sign = this.sign(canBuy(sq.id, land) ? `${info.icon} ${info.name}: ${info.cost}🪙 · shop (B)` : `🔒 ${info.icon} ${info.name}`, 5, 0.7)
      sign.position.set((sq.x0 + sq.x1) / 2, 1.6, (sq.z0 + sq.z1) / 2)
      const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), mat(0x7a5232)))
      post.position.y = -0.85
      sign.add(post)
      this.wild[sq.id].add(sign)
      this.saleSigns[sq.id] = sign
    }
    this.buildFence()
    this.setUpgrades(this.owned)
  }

  setUpgrades(owned: UpgradeId[]) {
    this.owned = [...owned]
    for (const sq of SQUARES) this.landFeatures[sq.id].forEach((g, i) => {
      g.visible = this.land.includes(sq.id) && landLevel(owned, sq.id) > i
    })
    for (const [id, obj] of Object.entries(this.extras)) obj.visible = owned.includes(id as UpgradeId)
    for (const sq of SQUARES) this.sprinklers[sq.id].visible = owned.includes('sprinkler') && this.land.includes(sq.id)
    // Bigger hoppers are taller.
    for (const h of this.hoppers) h.body.scale.y = 1 + 0.25 * level(owned, 'bighopper')
    // More hay racks go up with the barn improvements, and the deep ones get a rail.
    this.racks.forEach((r, i) => {
      r.root.visible = rackBuilt(i, owned)
      r.deep.visible = landLevel(owned, 'barn') >= 1
    })
  }

  setRacks(bites: number[]) {
    bites.forEach((n, i) => {
      const k = Math.max(0, Math.min(1, n / hayRackMax(this.owned)))
      const r = this.racks[i]
      r.hay.visible = k > 0
      r.hay.scale.y = Math.max(0.05, k)
      r.hay.position.y = 0.3 + 0.3 * k
      r.floor.visible = n > 0
    })
  }

  /** Armfuls left on today's bale. */
  setBale(n: number) {
    this.bale.visible = n > 0
    this.bale.scale.x = Math.max(0.15, n / BALE_ARMFULS)
  }

  setSacks(n: number) {
    this.binSacks.forEach((s, i) => (s.visible = i < n))
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
    // Rain greys the sky and dims the sun.
    const sky = a.sky.clone().lerp(b.sky, k).lerp(RAIN_SKY, this.rainK * 0.6)
    ;(this.scene.background as THREE.Color).copy(sky)
    ;(this.scene.fog as THREE.Fog).color.copy(sky)
    this.sun.color.copy(a.sun).lerp(b.sun, k)
    this.sun.intensity = (a.sunI + (b.sunI - a.sunI) * k) * (1 - 0.55 * this.rainK)
    this.hemi.intensity = (a.hemiI + (b.hemiI - a.hemiI) * k) * (1 - 0.2 * this.rainK)
    this.darkness = a.dark + (b.dark - a.dark) * k
    const fog = this.scene.fog as THREE.Fog
    fog.near = 60 - 32 * this.darkness
    fog.far = 130 - 55 * this.darkness
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

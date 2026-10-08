import * as THREE from 'three'
import { COLORS, type PigLook } from '../core/pigs.ts'
import type { PigState } from '../core/protocol.ts'
import { coatFor, type CoatPart } from './fur.ts'
import { drapedHair, rosetteSpots, rosettes, scruffyHair, whiskers } from './hair.ts'
import { foldedOval, headShape, loaf, shapedSphere, surface, type Ellipsoid } from './shape.ts'
import { mat } from './veg.ts'
import { FAST } from './device.ts'

/** Fast graphics (phones): far fewer of the fine scruffy hairs, a few fewer long ones. */
const hair = (n: number) => (FAST ? Math.round(n * (n > 500 ? 0.35 : 0.7)) : n)

const sphere = new THREE.SphereGeometry(1, 14, 10)
const blob = new THREE.CircleGeometry(1, 16)
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
/** The body (in the body group) and head (in the head group). */
const BODY: Ellipsoid = { c: [0, 0.2, 0.04], r: [0.23, 0.215, 0.29], warp: loaf }
/** The head sits this much higher than the poses say (big head, level with the top of the body: no neck). */
const HEAD_LIFT = 0.04
/** And this far forward of the body's middle. */
const HEAD_Z = -0.23
/**
 * The head's always tipped nose-down (radians, between these for each pig): the muzzle points down and forward, so from
 * the front the face is a teardrop, wide at the crown (ears, eyes) narrowing to the nose at the bottom.
 */
const HEAD_TILT: [number, number] = [0.28, 0.52]
/** How pronounced the ridge of the nose and how far the cheeks pull in (see headShape), between these for each pig. */
const RIDGE: [number, number] = [0.45, 0.8]
const CHEEKS: [number, number] = [0.3, 0.46]
/** Fills in where the head meets the body (in the body group), so it's one fluffy shape, no neck. */
const NECK: Ellipsoid = { c: [0, 0.23, -0.16], r: [0.175, 0.165, 0.13] }
const bodyGeo = shapedSphere(loaf)
const neckGeo = shapedSphere((d) => d.clone(), 24, 16)
/** Feet: front pair under the chin, back pair under the hips. */
const FEET: [number, number][] = [
  [-0.07, -0.17],
  [0.07, -0.17],
  [-0.09, 0.13],
  [0.09, 0.13],
]
const EYE_Y = 0.036
const PINK = 0xf3b3b0
const DARK_EYE = 0x161012
const RUBY_EYE = 0x6e0d1a
/** A guinea pig's nose: dark brown on a dark face, a dusky rose-brown on a light one. */
const NOSE_DARK = 0x3a2a27
const NOSE_LIGHT = 0xb47c77
/** The nose shape: a rounded triangle, wider at the top, facing −Z (out of the face). */
const noseGeo = (() => {
  const w = 0.016
  const h = 0.011
  const s = new THREE.Shape()
  s.moveTo(0, h)
  s.quadraticCurveTo(w, h, w * 0.85, h * 0.2)
  s.quadraticCurveTo(w * 0.45, -h * 0.75, 0, -h)
  s.quadraticCurveTo(-w * 0.45, -h * 0.75, -w * 0.85, h * 0.2)
  s.quadraticCurveTo(-w, h, 0, h)
  const g = new THREE.ShapeGeometry(s, 10)
  g.rotateY(Math.PI)
  // Rounded over the tip of the muzzle: the edges curve back, the middle's the front-most point.
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + (pos.getX(i) ** 2 + pos.getY(i) ** 2) * 22)
  g.computeVertexNormals()
  return g
})()
/** Where the face goes on the head, as directions from its middle. */
const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize()

/**
 * A head shape and where its face goes: the eyes, the whisker roots either side of the snout, the nose, any point on
 * the front of the face, and the bits hair keeps off. Shared by every pig with the same ridge and cheeks.
 */
interface Face {
  head: Ellipsoid
  geo: THREE.BufferGeometry
  eye: (side: number) => THREE.Vector3
  snout: (side: number) => THREE.Vector3
  nose: THREE.Vector3
  /** The point on the front of the face at (x, y) in the head group. */
  on: (x: number, y: number) => THREE.Vector3
  /** Turns something facing −Z to lie flat on the front of the face at (x, y). */
  turn: (x: number, y: number) => THREE.Quaternion
  bare: { at: THREE.Vector3; r: number }[]
}
const faces = new Map<string, Face>()
function faceFor(ridge: number, cheeks: number): Face {
  const key = `${ridge}|${cheeks}`
  const cached = faces.get(key)
  if (cached) return cached
  const head: Ellipsoid = { c: [0, 0, -0.04], r: [0.16, 0.16, 0.17], warp: headShape(ridge, cheeks) }
  const eye = (side: number) => surface(head, dir(side * 0.68, 0.52, -0.46), 0.92)
  const nose = surface(head, dir(0, 0, -1), 1.0)
  const on = (x: number, y: number) => {
    const d = new THREE.Vector3(0, 0, -1)
    for (let i = 0; i < 12; i++) {
      const p = surface(head, d)
      d.x += ((x - p.x) / head.r[0]) * 0.8
      d.y += ((y - p.y) / head.r[1]) * 0.8
      d.z = -1
    }
    return surface(head, d.normalize())
  }
  const face: Face = {
    head,
    geo: shapedSphere(head.warp!, 28, 18),
    eye,
    snout: (side) => surface(head, dir(side * 0.32, -0.16, -0.92), 0.97),
    nose,
    on,
    turn: (x, y) => {
      const e = 0.004
      const p = on(x, y)
      const n = new THREE.Vector3().crossVectors(on(x, y + e).sub(p), on(x + e, y).sub(p)).normalize()
      if (n.z > 0) n.negate()
      return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), n)
    },
    bare: [
      { at: eye(-1), r: 0.055 },
      { at: eye(1), r: 0.055 },
      { at: nose.clone().setY(nose.y - 0.015), r: 0.05 },
    ],
  }
  faces.set(key, face)
  return face
}
/** Ears, by how far they fold (shared between pigs). */
const earGeos = new Map<number, THREE.BufferGeometry>()
const earGeo = (fold: number) => {
  const key = Math.round(fold * 10) / 10
  let g = earGeos.get(key)
  if (!g) earGeos.set(key, (g = foldedOval(0.11, 0.13, key, 0.35)))
  return g
}
/** One side of an ear: the coat outside (FrontSide), pink inside (BackSide). */
const sideMats = new Map<string, THREE.MeshLambertMaterial>()
const sideMat = (color: number | string, side: THREE.Side) => {
  const key = `${new THREE.Color(color).getHex()}|${side}`
  let m = sideMats.get(key)
  if (!m) sideMats.set(key, (m = new THREE.MeshLambertMaterial({ color, side })))
  return m
}
const eyeMats = new Map<number, THREE.MeshPhongMaterial>()
const eyeMat = (color: number) => {
  let m = eyeMats.get(color)
  if (!m) eyeMats.set(color, (m = new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0x777777 })))
  return m
}

/** A seeded random from the pig's id, so each pig's patches are always in the same place. */
function prng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function part(geo: THREE.BufferGeometry, color: string | number | THREE.Material, s: [number, number, number], p: [number, number, number] | THREE.Vector3) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : mat(color))
  m.scale.set(...s)
  if (p instanceof THREE.Vector3) m.position.copy(p)
  else m.position.set(...p)
  return m
}

/** The coat's colour at a spot, as a hex colour (for things like whisker pads and ears). */
function coatAt(coat: CoatPart, d: THREE.Vector3, k = 1) {
  const [r, g, b] = coat.paint(d.x, d.y, d.z)
  return new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace).getHex()
}

/** A body or head in the pig's painted coat, wrapped in fuzzy fur shells. */
function furry(coat: CoatPart, geo: THREE.BufferGeometry, s: [number, number, number], p: [number, number, number]) {
  const m = part(geo, coat.skin, s, p)
  for (const shell of coat.shells) {
    const fur = new THREE.Mesh(geo, shell.mat)
    fur.scale.setScalar(shell.scale)
    m.add(fur)
  }
  return m
}

/**
 * One guinea pig: a loaf of a body with a flat bottom and wide hips, a big blunt head blended into it with no neck,
 * a broad flattish muzzle, big petal ears flopping out, glossy eyes on the sides of its head, and tiny feet.
 * Built facing −Z (yaw 0). About 0.65 m nose to tail, which is huge, but they need to be seen.
 */
export class PigModel {
  readonly root = new THREE.Group()
  /** Everything but the shadow: this hops, squashes and tilts. */
  readonly body = new THREE.Group()
  readonly head = new THREE.Group()
  /** Nose, whisker pads, lip and whiskers: they wiggle. */
  private readonly muzzle = new THREE.Group()
  private readonly eyes: THREE.Mesh[] = []
  private readonly ears: THREE.Group[] = []
  private readonly feet: THREE.Mesh[] = []
  readonly shadow: THREE.Mesh
  private rosette: THREE.Group | null = null
  /** A rounder tummy while she's expecting. */
  private readonly belly: THREE.Mesh
  private readonly baseScale: THREE.Vector3
  /** Sleeps flopped out flat (or else tucked up in a loaf). */
  private readonly flopper: boolean
  /** How far this one holds its head nose-down, and how floppy its ears are (0..1). */
  private readonly tilt: number
  private readonly droop: number

  constructor(look: PigLook) {
    const patch = look.coat[1]
    const rand = prng(look.id + 1)
    // Every piggy's face is its own (but always the same for that piggy): how it holds its head, how pronounced the
    // ridge of its nose, how full its cheeks, how floppy its ears.
    const own = prng(look.id * 31 + 7)
    const between = ([a, b]: [number, number], step: number) => Math.round((a + own() * (b - a)) / step) * step
    const face = faceFor(between(RIDGE, 0.05), between(CHEEKS, 0.04))
    const HEAD = face.head
    this.tilt = between(HEAD_TILT, 0.01)
    this.droop = own()
    const coat = coatFor(look)
    this.flopper = look.id % 2 === 1

    this.shadow = new THREE.Mesh(blob, blobMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.scale.set(0.3, 0.42, 1)
    this.shadow.position.y = 0.012
    this.root.add(this.shadow, this.body)

    const b = this.body
    b.add(furry(coat.body, bodyGeo, BODY.r, BODY.c))
    b.add(furry(coat.body, neckGeo, NECK.r, NECK.c))
    this.head.position.set(0, 0.21 + HEAD_LIFT, HEAD_Z)
    b.add(this.head)
    const h = this.head
    // The markings are painted into the coat (fur.ts).
    h.add(furry(coat.head, face.geo, HEAD.r, HEAD.c))

    // Breeds
    if (look.breed === 'abyssinian') {
      // Rosettes (whorls of curly hair) over a scruffy coat of short straight hair going every which way.
      const spots = rosetteSpots(rand)
      b.add(rosettes(coat.body, BODY, rand, spots))
      b.add(scruffyHair(coat.body, BODY, rand, { count: hair(6500), len: 0.08, radius: 0.0026, avoid: spots }))
      h.add(scruffyHair(coat.head, HEAD, rand, { count: hair(1000), len: 0.045, radius: 0.0021, bare: face.bare, flat: true }))
    } else if (look.breed === 'peruvian') {
      // Long flowing hair draped down to the ground, and parted on the head.
      b.add(drapedHair(coat.body, BODY, 0.02, rand, { count: hair(320), zFrom: -0.8, zTo: 1.2, radius: 0.008, rear: hair(120) }))
      h.add(drapedHair(coat.head, HEAD, -0.09, rand, { count: hair(80), zFrom: -0.25, zTo: 0.9, radius: 0.007 }))
    } else if (look.breed === 'crested') {
      // One rosette in the middle of the forehead: white on a self-coloured pig (an American crested).
      const white = { paint: () => [0.97, 0.95, 0.9] as [number, number, number] }
      h.add(rosettes(look.pattern === 'self' ? white : coat.head, HEAD, rand, [dir(0, 0.8, -0.6)], 0.5))
    } else if (look.breed === 'skinny') {
      // Bare and wrinkly (fur.ts), with just a fuzzy nose.
      h.add(scruffyHair(coat.head, HEAD, rand, { count: hair(220), len: 0.02, radius: 0.0016, flat: true, bare: face.bare, from: -0.6, where: (d) => d.z < -0.6 }))
    }
    this.baseScale = look.breed === 'teddy' ? new THREE.Vector3(1.08, 1.05, 1) : new THREE.Vector3(1, 1, 1)

    // Muzzle: a nose pad with two nostrils, a groove down to a split upper lip, and whiskers. All flush with the face.
    const m = this.muzzle
    h.add(m)
    const light = new THREE.Color(look.coat[0]).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6
    const paths: THREE.Vector3[][] = []
    for (const side of [-1, 1]) {
      // Whiskers fan out from the sides of the snout, curving back a little.
      for (let k = 0; k < 4; k++) {
        const root = face.snout(side).add(new THREE.Vector3(0, 0.006 - k * 0.005, 0))
        const spread = (k - 1.5) * 0.035
        paths.push([
          root,
          root.clone().add(new THREE.Vector3(side * 0.06, spread * 0.5 + 0.004, -0.004)),
          root.clone().add(new THREE.Vector3(side * (0.12 + rand() * 0.03), spread + 0.002, 0.02 + rand() * 0.02)),
        ])
      }
    }
    m.add(whiskers(paths, light ? 0x4a3c34 : 0xe8e2da))
    /** On the face at (x, y) from the nose tip, standing `out` metres proud of it. */
    const NOSE = face.nose
    const at = (x: number, y: number, out: number) => face.on(NOSE.x + x, NOSE.y + y).add(new THREE.Vector3(0, 0, -out))
    // The nose: a soft rounded triangle, wider at the top, lying on the face. Dark brown on a dark face, dusky
    // rose-brown on a light one (himalayans: their dark points).
    const faceLight = new THREE.Color(coatAt(coat.head, dir(0, 0, -1))).getHSL({ h: 0, s: 0, l: 0 }).l > 0.55
    const noseColor = look.pattern === 'himalayan' ? patch : faceLight ? NOSE_LIGHT : NOSE_DARK
    // Whisker pads: the two puffy cheeks of the muzzle either side of the split lip, in the coat's own colour (a touch
    // lighter), with the nose sat on top of them.
    for (const side of [-1, 1]) {
      const puff = coatAt(coat.head, dir(side * 0.3, -0.2, -0.95))
      m.add(part(sphere, puff, [0.017, 0.014, 0.0035], at(side * 0.015, -0.018, -0.0005)))
    }
    const nose = new THREE.Mesh(noseGeo, mat(noseColor))
    nose.position.copy(at(0, 0.002, 0.0025))
    nose.quaternion.copy(face.turn(NOSE.x, NOSE.y + 0.003))
    m.add(nose)
    for (const side of [-1, 1]) {
      // Nostrils: little commas at the top corners, angled down and out, darker still.
      const nostril = part(sphere, new THREE.Color(noseColor).multiplyScalar(0.4).getHex(), [0.0032, 0.0055, 0.002], at(side * 0.0085, 0.006, 0.0024))
      nostril.rotation.z = side * 0.6
      m.add(nostril)
    }
    // The mouth: a line down from the nose in the crease between the whisker pads, splitting into a little "w" of a
    // lip along their bottom edges, one smooth stroke each side. Set into the face, following it back under the nose.
    // In a darker shade of the face's own colour: soft on a light pig, there but subtle on a dark one.
    const mouth = mat(new THREE.Color(coatAt(coat.head, dir(0, -0.3, -1))).multiplyScalar(faceLight ? 0.62 : 0.45).getHex())
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3(
        [
          [0, -0.008, 0.0004],
          [0, -0.024, 0.0004],
          [side * 0.007, -0.03, 0.0008],
          [side * 0.016, -0.031, 0.0008],
          [side * 0.025, -0.025, 0.0004],
        ].map(([x, y, out]) => at(x, y, out)),
      )
      m.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0011, 5), mouth))
    }

    // Eyes: round and glossy, set into the sides of the head. Pink-eyed whites and himalayans have ruby eyes.
    const ruby = look.pattern === 'himalayan' || (look.pattern === 'self' && look.coat[0] === COLORS.white)
    for (const side of [-1, 1]) {
      const eye = part(sphere, eyeMat(ruby ? RUBY_EYE : DARK_EYE), [0.026, EYE_Y, 0.034], face.eye(side))
      eye.add(part(sphere, 0xffffff, [0.25, 0.22, 0.22], [side * 0.6, 0.4, -0.45]))
      h.add(eye)
      this.eyes.push(eye)
    }

    // Ears: oval petals rising from the top of the head at the back, leaning out, the top folding
    // over; coat-coloured outside and pink inside (facing forwards). Turned in pose().
    for (const side of [-1, 1]) {
      const d = dir(side * 0.8, 0.48, 0.3)
      const ear = new THREE.Group()
      ear.position.copy(surface(HEAD, d, 0.92))
      const color = look.pattern === 'himalayan' ? patch : coatAt(coat.head, d, look.breed === 'skinny' ? 0.95 : 0.8)
      const inner = look.pattern === 'himalayan' ? patch : PINK
      // Floppier ears fold right over.
      const geo = earGeo(1.4 + this.droop * 1.2)
      ear.add(new THREE.Mesh(geo, sideMat(color, THREE.FrontSide)), new THREE.Mesh(geo, sideMat(inner, THREE.BackSide)))
      h.add(ear)
      this.ears.push(ear)
    }

    // Feet: tiny and pink, mostly hidden under the loaf.
    const footColor = look.pattern === 'himalayan' ? patch : PINK
    for (const [x, z] of FEET) {
      const f = part(sphere, footColor, [0.035, 0.022, 0.045], [x, 0.022, z])
      b.add(f)
      this.feet.push(f)
    }
    b.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false
    })
    this.belly = furry(coat.body, bodyGeo, [0.25, 0.15, 0.27], [0, 0.13, 0.04])
    this.belly.visible = false
    b.add(this.belly)
    this.setRosettes(look.rosettes ?? 0)
  }

  setPregnant(on: boolean) {
    this.belly.visible = on
  }

  /** A prize rosette pinned on the side for pig show winners: blue, then red, then gold for 3+. */
  setRosettes(n: number) {
    if (this.rosette) this.body.remove(this.rosette)
    this.rosette = null
    if (!n) return
    const color = n >= 3 ? 0xf2c230 : n === 2 ? 0xe8453c : 0x3c7ee8
    const g = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), mat(color))
    const middle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), mat(0xfff6e0))
    middle.position.z = 0.002
    g.add(ring, middle)
    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.09), mat(color))
      tail.position.set(side * 0.025, -0.09, -0.001)
      tail.rotation.z = side * 0.25
      g.add(tail)
    }
    g.position.set(0.28, 0.22, 0.02)
    g.rotation.y = Math.PI / 2
    this.body.add(g)
    this.rosette = g
  }

  /**
   * Poses the pig for its state. `moving` is how fast it is going (m/s), `t` the time in seconds,
   * `phase` a per-pig offset so they don't all bob in step. `droopy`: poorly, so a heavy head and a plod.
   * `strut`: a boar showing off to a sow (the rumblestrut: a slow sway of the hips).
   */
  pose(state: PigState, moving: number, t: number, phase: number, droopy = false, strut = false) {
    const b = this.body
    const h = this.head
    let y = 0
    let tilt = 0
    let roll = 0
    let headY = 0.21
    let headTilt = 0
    let squash = 1
    let stretch = 1
    let eyesOpen = 1
    let twist = 0
    let feetIn = false
    /** Nose wiggles per second (0 = still) and ears perked (0) or flopped (1). */
    let sniff = 20
    let earFlop = 1
    const tt = t + phase
    const feet = this.feet
    FEET.forEach(([x, z], i) => feet[i].position.set(x, 0.022, z))

    if (moving > 0.2) {
      // Little hops: up off the ground (nose up), a moment in the air, then down (nose down, a squash) and
      // a patter of feet before the next one. Faster and higher at a run; a poorly pig plods.
      const fast = moving > 2
      const step = tt * (fast ? 20 : 12) * (droopy ? 0.7 : 1)
      const lift = Math.sin(step)
      const air = Math.max(0, lift)
      y = air * (fast ? 0.05 : 0.035) * (droopy ? 0.4 : 1)
      tilt = (fast ? 0.04 : 0.01) - Math.cos(step) * air * 0.12
      squash = 1 + 0.05 * air - 0.07 * Math.max(0, -lift)
      feet.forEach((f, i) => (f.position.y = air > 0 ? 0.03 : 0.022 + Math.max(0, Math.sin(step * 2 + (i % 2 ? Math.PI : 0))) * 0.018))
      sniff = fast ? 0 : 26
    }

    // Raiding the veg patch: just a pig on the move while it squeezes in or out; once there, munching like any meal.
    const as = state === 'raid' && moving <= 0.2 ? 'eat' : state
    switch (as) {
      case 'eat':
        // Head down, munching away.
        headTilt = 0.35 + Math.abs(Math.sin(tt * 14)) * 0.12
        headY = 0.17
        squash = 1 + Math.sin(tt * 14) * 0.015
        sniff = 0
        break
      case 'graze':
        headTilt = 0.4 + Math.sin(tt * 3) * 0.1
        headY = 0.16
        break
      case 'sleep':
        eyesOpen = 0.12
        sniff = 0
        earFlop = 1.3
        if (this.flopper) {
          // Flopped right out: flat, long, back legs stretched out behind.
          squash = 0.76 + Math.sin(tt * 1.6) * 0.015
          stretch = 1.1
          headY = 0.13
          headTilt = 0.12
          feet[2].position.set(-0.1, 0.02, 0.38)
          feet[3].position.set(0.1, 0.02, 0.38)
        } else {
          // Tucked up in a loaf.
          squash = 0.84 + Math.sin(tt * 1.6) * 0.02
          headY = 0.16
          feetIn = true
        }
        break
      case 'popcorn': {
        // Happy little leaps with a twist in the air.
        const hop = Math.abs(Math.sin(tt * 7))
        y = hop * 0.35
        twist = Math.sin(tt * 7) * 0.5
        roll = Math.sin(tt * 14) * 0.2
        break
      }
      case 'zoom':
        // Racing about with little twisty hops.
        y += Math.abs(Math.sin(tt * 9)) * 0.12
        twist = Math.sin(tt * 9) * 0.3
        break
      case 'mope':
        // Slumped, head down, eyes half shut, slow sighing breaths.
        headTilt = 0.3
        headY = 0.16
        squash = 0.9 + Math.sin(tt * 1.2) * 0.02
        eyesOpen = 0.45
        sniff = 0
        earFlop = 1.3
        feetIn = true
        break
      case 'beg':
        tilt = -0.35
        headTilt = -0.2
        y = 0.04
        sniff = 34
        earFlop = 0.6
        break
      case 'seek':
        sniff = 34
        break
      case 'scratch':
        roll = Math.sin(tt * 30) * 0.12
        break
      case 'sneeze':
        headTilt = Math.sin(tt * 25) > 0.6 ? 0.4 : -0.1
        break
      case 'held':
      case 'carried':
        // Little legs paddling.
        feet.forEach((f, i) => (f.position.y = 0.022 + Math.sin(tt * 18 + i) * 0.03))
        roll = Math.sin(tt * (state === 'carried' ? 20 : 3)) * (state === 'carried' ? 0.25 : 0.05)
        break
      case 'peek':
        // Hiding for fun: snug in a loaf, peeking this way and that, nose going.
        if (moving > 0.2) break
        squash = 0.94
        feetIn = true
        eyesOpen = 1.1
        sniff = 30
        twist = Math.sin(tt * 1.3) * 0.35
        break
      case 'hide':
        // Frozen stock still: eyes wide, ears up, not even a twitch of the nose.
        squash = 0.95
        eyesOpen = 1.15
        sniff = 0
        earFlop = 0.3
        feetIn = true
        break
      case 'idle':
        headTilt = Math.sin(tt * 0.7) * 0.05
        // A blink now and then.
        eyesOpen = tt % 4 < 0.12 ? 0.15 : 1
        // Now and then settles into a loaf, feet tucked in.
        if (Math.sin(tt * 0.07) > 0.2) {
          squash = 0.93
          feetIn = true
          sniff = 12
        }
        break
    }
    if (strut && (state === 'idle' || state === 'wander' || state === 'graze')) {
      // Rumblestrut: a slow, swaggering sway of the hips.
      roll = Math.sin(tt * 4.5) * 0.13
      twist = Math.sin(tt * 4.5 + 1) * 0.06
      squash = 1
      feetIn = false
    }
    if (droopy && state !== 'sleep' && state !== 'mope') {
      headTilt = Math.max(headTilt, 0.18)
      headY = Math.min(headY, 0.19)
      eyesOpen = Math.min(eyesOpen, 0.7)
      earFlop = Math.max(earFlop, 1.3)
    }
    const s = this.baseScale
    b.position.y = y - (feetIn ? 0.01 : 0)
    b.rotation.set(tilt, twist, roll)
    b.scale.set(s.x, s.y * squash, s.z * stretch)
    h.position.y = headY + HEAD_LIFT
    h.rotation.x = headTilt + this.tilt
    for (const f of feet) f.visible = !feetIn
    for (const e of this.eyes) e.scale.y = EYE_Y * eyesOpen
    // The nose wiggles in little bursts.
    const burst = sniff && Math.sin(tt * 1.3) > -0.3 ? 1 : 0
    this.muzzle.position.y = Math.sin(tt * sniff) * 0.003 * burst
    this.muzzle.position.z = Math.sin(tt * sniff * 0.5) * 0.0015 * burst
    // Ears: a quick flick every few seconds.
    this.ears.forEach((ear, i) => {
      const side = i ? 1 : -1
      const flick = (tt + i * 1.7) % 4.3 < 0.16 ? Math.sin((((tt + i * 1.7) % 4.3) / 0.16) * Math.PI) * 0.6 : 0
      // Leaning out to the side (more when flopped, less when perked), turned to face forward and out.
      ear.rotation.set(-0.3 - (earFlop - 1) * 0.3 - this.droop * 0.15 + flick, -side * 0.5, -side * (1.0 + this.droop * 0.4 + (earFlop - 1) * 0.5))
    })
    this.shadow.visible = state !== 'held' && state !== 'carried'
    this.shadow.scale.set(0.3 - y * 0.3, (0.42 - y * 0.4) * stretch, 1)
  }
}

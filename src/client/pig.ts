import * as THREE from 'three'
import type { PigLook } from '../core/pigs.ts'
import type { PigState } from '../core/protocol.ts'
import { coatFor, type CoatPart } from './fur.ts'
import { drapedHair, rosetteSpots, rosettes, scruffyHair, type Ellipsoid } from './hair.ts'
import { mat } from './veg.ts'

const sphere = new THREE.SphereGeometry(1, 14, 10)
/** Smoother, for the furry body and head (their coat is painted on). */
const round = new THREE.SphereGeometry(1, 28, 18)
const blob = new THREE.CircleGeometry(1, 16)
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
/** The body (in the body group) and head (in the head group) spheres. */
const BODY: Ellipsoid = { c: [0, 0.2, 0.02], r: [0.22, 0.18, 0.33] }
const HEAD: Ellipsoid = { c: [0, 0, -0.04], r: [0.15, 0.135, 0.16] }
/** Bits of the face (in the head group) that hair keeps off: eyes, then nose and mouth. */
const FACE = [
  { at: new THREE.Vector3(-0.095, 0.035, -0.12), r: 0.045 },
  { at: new THREE.Vector3(0.095, 0.035, -0.12), r: 0.045 },
  { at: new THREE.Vector3(0, -0.03, -0.18), r: 0.07 },
]
const PINK = 0xf3b3b0
const DARK_EYE = 0x161012

/** A seeded random from the pig's id, so each pig's patches are always in the same place. */
function prng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function part(geo: THREE.BufferGeometry, color: string | number | THREE.Material, s: [number, number, number], p: [number, number, number]) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : mat(color))
  m.scale.set(...s)
  m.position.set(...p)
  return m
}

/** A sphere in the pig's painted coat, wrapped in fuzzy fur shells. */
function furry(coat: CoatPart, s: [number, number, number], p: [number, number, number]) {
  const m = part(round, coat.skin, s, p)
  for (const shell of coat.shells) {
    const fur = new THREE.Mesh(round, shell.mat)
    fur.scale.setScalar(shell.scale)
    m.add(fur)
  }
  return m
}

/**
 * One guinea pig: a fat bean of a body, a head with no neck, little ears, beady eyes and tiny feet.
 * Built facing −Z (yaw 0). About 0.65 m nose to tail, which is huge, but they need to be seen.
 */
export class PigModel {
  readonly root = new THREE.Group()
  /** Everything but the shadow: this hops, squashes and tilts. */
  readonly body = new THREE.Group()
  readonly head = new THREE.Group()
  private readonly eyes: THREE.Mesh[] = []
  private readonly feet: THREE.Mesh[] = []
  readonly shadow: THREE.Mesh
  private rosette: THREE.Group | null = null
  /** A rounder tummy while she's expecting. */
  private readonly belly: THREE.Mesh

  constructor(look: PigLook) {
    const patch = look.coat[1]
    const rand = prng(look.id + 1)
    const coat = coatFor(look)

    this.shadow = new THREE.Mesh(blob, blobMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.scale.set(0.3, 0.42, 1)
    this.shadow.position.y = 0.012
    this.root.add(this.shadow, this.body)

    const b = this.body
    b.add(furry(coat.body, BODY.r, BODY.c))
    this.head.position.set(0, 0.23, -0.27)
    b.add(this.head)
    const h = this.head
    // The markings are painted into the coat (fur.ts).
    h.add(furry(coat.head, HEAD.r, HEAD.c))

    // Breeds
    if (look.breed === 'abyssinian') {
      // Rosettes (whorls of curly hair) over a scruffy coat of short straight hair going every which way.
      const spots = rosetteSpots(rand)
      b.add(rosettes(coat.body, BODY, rand, spots))
      b.add(scruffyHair(coat.body, BODY, rand, { count: 6500, len: 0.08, radius: 0.0026, avoid: spots }))
      h.add(scruffyHair(coat.head, HEAD, rand, { count: 1000, len: 0.045, radius: 0.0021, bare: FACE, flat: true }))
    } else if (look.breed === 'peruvian') {
      // Long flowing hair draped down to the ground, and parted on the head.
      b.add(drapedHair(coat.body, BODY, 0.02, rand, { count: 320, zFrom: -0.8, zTo: 1.2, radius: 0.008, rear: 120 }))
      h.add(drapedHair(coat.head, HEAD, -0.09, rand, { count: 80, zFrom: -0.25, zTo: 0.9, radius: 0.007 }))
    } else if (look.breed === 'teddy') {
      b.scale.set(1.08, 1.05, 1)
    }

    // Face
    const nose = look.pattern === 'himalayan' ? patch : PINK
    h.add(part(sphere, nose, [0.04, 0.03, 0.03], [0, -0.02, -0.19]))
    for (const side of [-1, 1]) {
      const eye = part(sphere, DARK_EYE, [0.028, 0.032, 0.028], [side * 0.095, 0.035, -0.12])
      eye.add(part(sphere, 0xffffff, [0.3, 0.3, 0.3], [side * 0.3, 0.4, -0.6]))
      h.add(eye)
      this.eyes.push(eye)
      const earColor = look.pattern === 'himalayan' ? patch : new THREE.Color(look.coat[look.pattern === 'dutch' ? 1 : 0]).multiplyScalar(0.75).getHex()
      const ear = part(sphere, earColor, [0.055, 0.045, 0.02], [side * 0.11, 0.1, 0.0])
      ear.rotation.set(0.3, side * 0.6, side * 0.5)
      h.add(ear)
    }

    // Feet
    const footColor = look.pattern === 'himalayan' ? patch : PINK
    for (const [x, z] of [
      [-0.1, -0.17],
      [0.1, -0.17],
      [-0.12, 0.18],
      [0.12, 0.18],
    ]) {
      const f = part(sphere, footColor, [0.04, 0.03, 0.05], [x, 0.03, z])
      b.add(f)
      this.feet.push(f)
    }
    b.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false
    })
    this.belly = furry(coat.body, [0.25, 0.16, 0.27], [0, 0.15, 0.04])
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
    g.position.set(0.225, 0.24, 0.02)
    g.rotation.y = Math.PI / 2
    this.body.add(g)
    this.rosette = g
  }

  /**
   * Poses the pig for its state. `moving` is how fast it is going (m/s), `t` the time in seconds,
   * `phase` a per-pig offset so they don't all bob in step. `droopy`: poorly, so a heavy head and a plod.
   */
  pose(state: PigState, moving: number, t: number, phase: number, droopy = false) {
    const b = this.body
    const h = this.head
    let y = 0
    let tilt = 0
    let roll = 0
    let headY = 0.23
    let headTilt = 0
    let squash = 1
    let eyesOpen = 1
    let twist = 0
    const tt = t + phase

    if (moving > 0.2) {
      const fast = moving > 2
      y = Math.abs(Math.sin(tt * (fast ? 22 : 12))) * (fast ? 0.06 : 0.025) * (droopy ? 0.4 : 1)
      tilt = fast ? 0.08 : 0
      this.feet.forEach((f, i) => (f.position.y = 0.03 + Math.max(0, Math.sin(tt * (fast ? 22 : 12) + (i % 2 ? Math.PI : 0))) * 0.04))
    } else {
      this.feet.forEach((f) => (f.position.y = 0.03))
    }

    switch (state) {
      case 'eat':
        // Head down, munching away.
        headTilt = 0.35 + Math.abs(Math.sin(tt * 14)) * 0.12
        headY = 0.19
        squash = 1 + Math.sin(tt * 14) * 0.015
        break
      case 'graze':
        headTilt = 0.4 + Math.sin(tt * 3) * 0.1
        headY = 0.18
        break
      case 'sleep':
        squash = 0.82 + Math.sin(tt * 1.6) * 0.02
        eyesOpen = 0.12
        headY = 0.19
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
        headY = 0.18
        squash = 0.9 + Math.sin(tt * 1.2) * 0.02
        eyesOpen = 0.45
        break
      case 'beg':
        tilt = -0.35
        headTilt = -0.2
        y = 0.04
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
        this.feet.forEach((f, i) => (f.position.y = 0.03 + Math.sin(tt * 18 + i) * 0.03))
        roll = Math.sin(tt * (state === 'carried' ? 20 : 3)) * (state === 'carried' ? 0.25 : 0.05)
        break
      case 'idle':
      case 'hide':
        headTilt = Math.sin(tt * 0.7) * 0.05
        // A blink now and then.
        eyesOpen = (tt % 4) < 0.12 ? 0.15 : 1
        break
    }
    if (droopy && state !== 'sleep' && state !== 'mope') {
      headTilt = Math.max(headTilt, 0.18)
      headY = Math.min(headY, 0.21)
      eyesOpen = Math.min(eyesOpen, 0.7)
    }
    b.position.y = y
    b.rotation.set(tilt, twist, roll)
    b.scale.y = squash * (b.scale.x > 1 ? 1.05 : 1)
    h.position.y = headY
    h.rotation.x = headTilt
    for (const e of this.eyes) e.scale.y = 0.032 * eyesOpen
    this.shadow.visible = state !== 'held' && state !== 'carried'
    this.shadow.scale.set(0.3 - y * 0.3, 0.42 - y * 0.4, 1)
  }
}

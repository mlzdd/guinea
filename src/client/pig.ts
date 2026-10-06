import * as THREE from 'three'
import type { PigLook } from '../core/pigs.ts'
import type { PigState } from '../core/protocol.ts'
import { mat } from './veg.ts'

const sphere = new THREE.SphereGeometry(1, 14, 10)
const fluffy = new THREE.IcosahedronGeometry(1, 1)
const cone = new THREE.ConeGeometry(1, 1, 6)
const blob = new THREE.CircleGeometry(1, 16)
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
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

function part(geo: THREE.BufferGeometry, color: string | number, s: [number, number, number], p: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat(color))
  m.scale.set(...s)
  m.position.set(...p)
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

  constructor(look: PigLook) {
    const [base, patch, patch2] = look.coat
    const rand = prng(look.id + 1)
    const fluff = look.breed === 'teddy' || look.breed === 'abyssinian'
    const bodyGeo = fluff ? fluffy : sphere

    this.shadow = new THREE.Mesh(blob, blobMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.scale.set(0.3, 0.42, 1)
    this.shadow.position.y = 0.012
    this.root.add(this.shadow, this.body)

    const b = this.body
    b.add(part(bodyGeo, base, [0.22, 0.18, 0.33], [0, 0.2, 0.02]))
    this.head.position.set(0, 0.23, -0.27)
    b.add(this.head)
    const h = this.head
    h.add(part(bodyGeo, base, [0.15, 0.135, 0.16], [0, 0, -0.04]))

    // Coat markings
    if (look.pattern === 'dutch') {
      b.add(part(bodyGeo, patch, [0.225, 0.185, 0.2], [0, 0.2, 0.15]))
      for (const side of [-1, 1]) h.add(part(sphere, patch, [0.08, 0.11, 0.11], [side * 0.08, 0.02, -0.03]))
    } else if (look.pattern === 'patches') {
      for (let i = 0; i < 3; i++) {
        const a = rand() * Math.PI * 2
        const z = -0.15 + rand() * 0.35
        const color = i % 2 ? patch2 : patch
        const p = part(sphere, color, [0.12, 0.11, 0.13], [Math.cos(a) * 0.12, 0.24 + Math.sin(a) * 0.06, z])
        b.add(p)
      }
      if (rand() < 0.6) h.add(part(sphere, patch, [0.09, 0.1, 0.1], [(rand() < 0.5 ? -1 : 1) * 0.07, 0.03, -0.04]))
    }

    // Breeds
    if (look.breed === 'abyssinian') {
      // Rosettes: little tufts sticking out all over.
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2
        const z = -0.2 + rand() * 0.42
        const tuft = part(cone, i % 3 === 0 && look.pattern !== 'self' ? patch : base, [0.05, 0.1, 0.05], [Math.cos(a) * 0.19, 0.2 + Math.abs(Math.sin(a)) * 0.15, z])
        tuft.lookAt(new THREE.Vector3(Math.cos(a) * 2, 0.2 + Math.abs(Math.sin(a)) * 2, z))
        tuft.rotateX(Math.PI / 2)
        b.add(tuft)
      }
    } else if (look.breed === 'peruvian') {
      // Long flowing hair: a skirt down to the ground and a fringe over the face.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const lock = part(sphere, i % 3 === 1 ? patch : base, [0.07, 0.15, 0.07], [Math.cos(a) * 0.21, 0.12, 0.04 + Math.sin(a) * 0.3])
        lock.rotation.z = Math.cos(a) * 0.3
        b.add(lock)
      }
      h.add(part(sphere, base, [0.13, 0.07, 0.12], [0, 0.1, -0.06]))
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
  }

  /**
   * Poses the pig for its state. `moving` is how fast it is going (m/s), `t` the time in seconds,
   * `phase` a per-pig offset so they don't all bob in step.
   */
  pose(state: PigState, moving: number, t: number, phase: number) {
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
      y = Math.abs(Math.sin(tt * (fast ? 22 : 12))) * (fast ? 0.06 : 0.025)
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

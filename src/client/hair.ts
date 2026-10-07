import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CoatPart } from './fur.ts'
import { surface, type Ellipsoid } from './shape.ts'

/** Hair only needs the coat's colours. */
type Coat = Pick<CoatPart, 'paint'>

/**
 * Long hair as very thin tapered strands, merged into one mesh per part: a peruvian's hair draped
 * over the body to the ground (and parted on the head), an abyssinian's swirly rosettes.
 * Each strand takes the coat's colour where it grows, a little lighter at the tip.
 */

const hairMat = new THREE.MeshLambertMaterial({ vertexColors: true })
const SEGS = 10
const SIDES = 3

const v = new THREE.Vector3()

/** One strand along the points, tapering to a fine tip. */
function strand(points: THREE.Vector3[], radius: number, root: THREE.Color, tip: THREE.Color, segs = SEGS) {
  const curve = new THREE.CatmullRomCurve3(points)
  const g = new THREE.TubeGeometry(curve, segs, radius, SIDES, false)
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const mid = curve.getPointAt(t)
    c.lerpColors(root, tip, t)
    for (let j = 0; j <= SIDES; j++) {
      const k = i * (SIDES + 1) + j
      v.fromBufferAttribute(pos, k).sub(mid).multiplyScalar(1 - 0.8 * t).add(mid)
      pos.setXYZ(k, v.x, v.y, v.z)
      c.toArray(colors, k * 3)
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

function colors(coat: Coat, d: THREE.Vector3, rand: () => number, spread = 0.16, tipLight = 0.12): [THREE.Color, THREE.Color] {
  const [r, g, b] = coat.paint(d.x, d.y, d.z)
  const k = 1 - spread * 0.75 + rand() * spread
  const root = new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace)
  const tip = root.clone().lerp(new THREE.Color(1, 1, 1), tipLight)
  return [root, tip]
}

function mesh(strands: THREE.BufferGeometry[]) {
  const m = new THREE.Mesh(mergeGeometries(strands), hairMat)
  for (const s of strands) s.dispose()
  return m
}

/**
 * Hair that grows from a parting along the top and drapes down over the curve of the body, ending at
 * `endY` (the ground, for the body), flaring out a little and trailing off the back. `rear` more
 * strands fan out from the back end of the parting, all the way round over the bum.
 */
export function drapedHair(
  coat: Coat,
  e: Ellipsoid,
  endY: number,
  rand: () => number,
  opts: { count: number; zFrom: number; zTo: number; radius: number; rear?: number },
) {
  const strands: THREE.BufferGeometry[] = []
  const drape = (root: THREE.Vector3, to: THREE.Vector3) => {
    const points = [surface(e, root, 0.97)]
    // Follow the curve of the body round to just below its widest point, clear of the fur shells (fur.ts).
    const q = new THREE.Quaternion().setFromUnitVectors(root, to)
    const steps = 4
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const d = root.clone().applyQuaternion(new THREE.Quaternion().slerp(q, t))
      points.push(surface(e, d, 1.2 + 0.05 * t))
    }
    // Then fall to the end, flaring out and trailing off the back.
    const last = points[points.length - 1]
    const out = new THREE.Vector3(last.x - e.c[0], 0, last.z - e.c[2]).normalize()
    const fall = Math.max(0.02, last.y - endY)
    const trail = Math.max(0, root.z)
    points.push(new THREE.Vector3(last.x + out.x * 0.03, last.y - fall * 0.55, last.z + out.z * 0.03 + trail * 0.03))
    points.push(new THREE.Vector3(last.x + out.x * (0.05 + rand() * 0.03), endY + rand() * 0.02, last.z + out.z * (0.05 + rand() * 0.03) + trail * 0.06))
    strands.push(strand(points, opts.radius * (0.8 + rand() * 0.4), ...colors(coat, root, rand)))
  }
  for (let i = 0; i < opts.count; i++) {
    // Evenly along the length, alternating sides of a parting down the middle of the back.
    const zz = opts.zFrom + ((i + rand()) / opts.count) * (opts.zTo - opts.zFrom)
    const side = i % 2 ? -1 : 1
    const a = side * (0.03 + rand() * 0.1)
    const below = side * 1.85
    drape(new THREE.Vector3(Math.sin(a), Math.cos(a), zz).normalize(), new THREE.Vector3(Math.sin(below), Math.cos(below), zz).normalize())
  }
  const rear = opts.rear ?? 0
  for (let i = 0; i < rear; i++) {
    // From the back of the parting, fanned round from one side over the bum to the other.
    const f = (((i + rand()) / rear) * 2 - 1) * (Math.PI / 2)
    const zz = opts.zTo * (0.8 + rand() * 0.3)
    const root = new THREE.Vector3((rand() - 0.5) * 0.15, 1, zz).normalize()
    drape(root, new THREE.Vector3(Math.sin(f), -0.3, Math.cos(f)).normalize())
  }
  return mesh(strands)
}

/**
 * A scruffy coat of short straight hair all over the top and sides: mostly lying back towards the
 * tail, but each strand a bit off, and some sticking up. Not in `bare` spots (eyes, nose). `flat`: lying
 * close along the contours instead (for the face).
 */
export function scruffyHair(
  coat: Coat,
  e: Ellipsoid,
  rand: () => number,
  opts: {
    count: number
    len: number
    radius: number
    avoid?: THREE.Vector3[]
    bare?: { at: THREE.Vector3; r: number }[]
    flat?: boolean
    /** Only where this says (by direction on the unit sphere). */
    where?: (d: THREE.Vector3) => boolean
    /** How far down the sides it grows (−1 = all the way under). */
    from?: number
  },
) {
  const avoid = (opts.avoid ?? []).map((c) => surface(e, c))
  const strands: THREE.BufferGeometry[] = []
  const back = new THREE.Vector3(0, -0.25, 1)
  for (let i = 0; i < opts.count; i++) {
    const from = opts.from ?? -0.35
    const y = from + rand() * (1 - from)
    const around = rand() * Math.PI * 2
    const ring = Math.sqrt(1 - y * y)
    const d = new THREE.Vector3(ring * Math.cos(around), y, ring * Math.sin(around))
    if (opts.where && !opts.where(d)) continue
    const normal = new THREE.Vector3(d.x / e.r[0], d.y / e.r[1], d.z / e.r[2]).normalize()
    const dir = back.clone().addScaledVector(normal, -back.dot(normal))
    if (dir.lengthSq() < 1e-4) dir.set(0, -1, 0)
    dir.normalize().applyAxisAngle(normal, (rand() - 0.5) * (opts.flat ? 0.6 : 1.4))
    const len = opts.len * (0.6 + rand() * 0.8)
    // Leave the rosettes clear so their swirls show: nothing growing in one or lying over it.
    const at = surface(e, d)
    const tip = at.clone().addScaledVector(dir, len)
    if (avoid.some((c) => c.distanceTo(at) < ROSETTE_CLEAR || c.distanceTo(tip) < ROSETTE_CLEAR)) continue
    // Nor over the eyes and nose.
    if (opts.bare?.some((b) => b.at.distanceTo(at) < b.r || b.at.distanceTo(tip) < b.r)) continue
    const lift = 0.006 + rand() * rand() * 0.04
    const base = surface(e, d, 0.98)
    const points = [base]
    for (let s = 1; s <= 3; s++) {
      const t = s / 3
      const p = base.clone().addScaledVector(dir, len * t)
      if (opts.flat) {
        // Lie along the contours: pulled back onto the curve of the head, just above it.
        const on = new THREE.Vector3((p.x - e.c[0]) / e.r[0], (p.y - e.c[1]) / e.r[1], (p.z - e.c[2]) / e.r[2]).normalize()
        points.push(surface(e, on, 1.03 + 0.04 * t))
      } else {
        points.push(p.addScaledVector(normal, 0.01 + lift * t).add(new THREE.Vector3(0, -0.015 * t * t, 0)))
      }
    }
    strands.push(strand(points, opts.radius * (0.8 + rand() * 0.4), ...colors(coat, d, rand), 3))
  }
  return mesh(strands)
}

/** How far from a rosette's centre the scruffy hair stays away (m). */
const ROSETTE_CLEAR = 0.075

/** Where an abyssinian's rosettes go: an even 3×3 spread over the back and sides, nudged a little. */
export function rosetteSpots(rand: () => number) {
  const spots: THREE.Vector3[] = []
  for (const z of [-0.55, 0.05, 0.65])
    for (const a of [-1.1, 0, 1.1]) {
      const aa = a + (rand() - 0.5) * 0.25
      spots.push(new THREE.Vector3(Math.sin(aa), Math.cos(aa), z + (rand() - 0.5) * 0.2).normalize())
    }
  return spots
}

/** Abyssinian rosettes: whorls of short, curly strands that sweep out from a point and droop. `size` scales them (a crest). */
export function rosettes(coat: Coat, e: Ellipsoid, rand: () => number, spots: THREE.Vector3[], size = 1) {
  const strands: THREE.BufferGeometry[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (const centre of spots) {
    const base = surface(e, centre)
    const normal = new THREE.Vector3(centre.x / e.r[0], centre.y / e.r[1], centre.z / e.r[2]).normalize()
    const t1 = new THREE.Vector3().crossVectors(normal, up)
    if (t1.lengthSq() < 0.01) t1.set(1, 0, 0)
    t1.normalize()
    const t2 = new THREE.Vector3().crossVectors(normal, t1)
    const swirl = rand() < 0.5 ? -1 : 1
    const n = 150
    for (let k = 0; k < n; k++) {
      // Evenly round, all curling the same way, alternately short and long so the spiral shows.
      const angle = (k / n) * Math.PI * 2
      const len = (k % 2 ? 0.055 : 0.09) * size * (0.95 + rand() * 0.1)
      const points: THREE.Vector3[] = [base.clone().addScaledVector(normal, -0.01)]
      for (let s = 1; s <= 4; s++) {
        const t = s / 4
        // Sweeps round as it goes out, lifts off the coat, then droops.
        const turn = angle + swirl * t * 1.5
        const dir = t1.clone().multiplyScalar(Math.cos(turn)).addScaledVector(t2, Math.sin(turn))
        points.push(
          base
            .clone()
            .addScaledVector(dir, len * t)
            .addScaledVector(normal, (0.03 * Math.sin(t * Math.PI * 0.8) + 0.008) * size)
            .add(new THREE.Vector3(0, -0.035 * t * t * size, 0)),
        )
      }
      strands.push(strand(points, 0.0022 * (0.9 + rand() * 0.2), ...colors(coat, centre, rand, 0.06, 0.28), 6))
    }
  }
  return mesh(strands)
}

/** Whiskers: very fine, stiff strands, each from a root through a bend to its tip. */
export function whiskers(paths: THREE.Vector3[][], color: number) {
  const c = new THREE.Color(color)
  const tip = c.clone().lerp(new THREE.Color(1, 1, 1), 0.3)
  return mesh(paths.map((p) => strand(p, 0.0016, c, tip, 6)))
}

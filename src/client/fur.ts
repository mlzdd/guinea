import * as THREE from 'three'
import { COLORS, type PigLook } from '../core/pigs.ts'
import { FAST } from './device.ts'

/**
 * A pig's coat painted onto its body and head spheres: the markings (soft-edged patches, a dutch
 * rear and cheeks, a himalayan smudge) and a streaky fur grain, plus "shells" of fur: slightly bigger
 * copies of the sphere where only scattered texels are drawn, so the outline looks fuzzy.
 *
 * Painted per texel from the point on the sphere it lands on (SphereGeometry's UVs), so patterns are
 * placed in 3D: −Z is the front, +Y the top.
 */

/** Fur shells per part, as [scale, alphaTest]: the outer shell has fewer, sparser tips. */
const SHELLS: Record<'fuzz' | 'short' | 'long', [number, number][]> = FAST
  ? // Fast graphics (phones): fewer, thicker shells.
    { fuzz: [[1.012, 0.8]], short: [[1.06, 0.4], [1.12, 0.68]], long: [[1.1, 0.32], [1.22, 0.7]] }
  : {
  /** A skinny pig's peach fuzz. */
  fuzz: [[1.012, 0.8]],
  short: [
    [1.04, 0.3],
    [1.085, 0.5],
    [1.13, 0.7],
  ],
  long: [
    [1.07, 0.25],
    [1.14, 0.45],
    [1.21, 0.64],
    [1.28, 0.8],
  ],
}

export interface CoatPart {
  /** The solid sphere's material. */
  skin: THREE.MeshLambertMaterial
  /** One material per fur shell, with the scale it goes at. */
  shells: { scale: number; mat: THREE.MeshLambertMaterial }[]
  /** The coat's colour at a point on the unit sphere (for hair growing there). */
  paint: Paint
}

export interface Coat {
  body: CoatPart
  head: CoatPart
}

const cache = new Map<string, Coat>()

export function coatFor(look: PigLook): Coat {
  const fur = look.breed === 'skinny' ? 'fuzz' : look.breed === 'smooth' || look.breed === 'crested' ? 'short' : 'long'
  const key = `${look.id}|${look.pattern}|${look.coat.join()}|${look.breed}`
  let coat = cache.get(key)
  if (!coat) {
    const rand = prng(look.id * 7 + 3)
    coat = {
      body: makePart(finish(look, paintBody(look, rand), false), 256, 128, fur, false),
      head: makePart(finish(look, paintHead(look, rand), true), 128, 64, fur, true),
    }
    cache.set(key, coat)
  }
  return coat
}

/** What colour a point on the unit sphere is (sRGB 0..1). */
export type Paint = (x: number, y: number, z: number) => [number, number, number]

function makePart(paint: Paint, w: number, h: number, fur: keyof typeof SHELLS, face: boolean): CoatPart {
  const color = document.createElement('canvas')
  const tips = document.createElement('canvas')
  color.width = tips.width = w
  color.height = tips.height = h
  const cImg = color.getContext('2d')!.createImageData(w, h)
  const tImg = tips.getContext('2d')!.createImageData(w, h)
  for (let py = 0; py < h; py++) {
    // SphereGeometry: row 0 (uv.y = 1 after flipY) is the top.
    const theta = ((py + 0.5) / h) * Math.PI
    for (let px = 0; px < w; px++) {
      const phi = ((px + 0.5) / w) * Math.PI * 2
      const x = -Math.cos(phi) * Math.sin(theta)
      const y = Math.cos(theta)
      const z = Math.sin(phi) * Math.sin(theta)
      // Fur grain: streaks running nose to tail.
      const grain = noise(x * 26, y * 26, z * 5) * 0.6 + noise(x * 60, y * 60, z * 12) * 0.4
      const shade = 0.86 + grain * 0.24
      const [r, g, b] = paint(x, y, z)
      const i = (py * w + px) * 4
      cImg.data[i] = clamp255(r * shade * 255)
      cImg.data[i + 1] = clamp255(g * shade * 255)
      cImg.data[i + 2] = clamp255(b * shade * 255)
      cImg.data[i + 3] = 255
      // Where the fur tips are: random per texel, none over the face so the eyes and nose show.
      let tip = hash3(px, py, w) * 0.75 + grain * 0.25
      if (face && z < -0.3) tip = 0
      const t = clamp255(tip * 255)
      tImg.data[i] = tImg.data[i + 1] = tImg.data[i + 2] = t
      tImg.data[i + 3] = 255
    }
  }
  color.getContext('2d')!.putImageData(cImg, 0, 0)
  tips.getContext('2d')!.putImageData(tImg, 0, 0)
  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  const tipMap = new THREE.CanvasTexture(tips)
  const skin = new THREE.MeshLambertMaterial({ map, bumpMap: tipMap, bumpScale: 0.6 })
  const shells = SHELLS[fur].map(([scale, alphaTest], i, all) => ({
    scale,
    // Inner fur a touch darker than the tips, for a bit of depth.
    mat: new THREE.MeshLambertMaterial({ map, alphaMap: tipMap, alphaTest, color: new THREE.Color().setScalar(0.88 + (0.12 * (i + 1)) / all.length) }),
  }))
  return { skin, shells, paint }
}

const AGOUTI = rgb(COLORS.agouti)
const WHITE: [number, number, number] = [1, 1, 1]
const BLACK: [number, number, number] = [0.1, 0.08, 0.07]
const SKIN: [number, number, number] = [0.93, 0.7, 0.66]

/**
 * Hair-by-hair effects over the markings: agouti ticking (each hair banded dark and gold), roan
 * (white hairs mixed in, not on the head), brindle (dark hairs streaked through), and a skinny pig's
 * bare pink skin with wrinkles.
 */
function finish(look: PigLook, paint: Paint, head: boolean): Paint {
  return (x, y, z) => {
    let c = paint(x, y, z)
    const fine = noise(x * 90, y * 90, z * 90)
    const agouti = 1 - smooth(0.03, 0.12, Math.hypot(c[0] - AGOUTI[0], c[1] - AGOUTI[1], c[2] - AGOUTI[2]))
    if (agouti > 0) c = mix(c, mix(mix(c, BLACK, 0.45), [0.86, 0.68, 0.4], smooth(0.42, 0.58, fine)), agouti * 0.85)
    if (look.pattern === 'roan' && !head) c = mix(c, WHITE, smooth(0.5, 0.6, noise(x * 110 + 7, y * 110, z * 110)) * 0.8)
    if (look.pattern === 'brindle') c = mix(c, BLACK, smooth(0.52, 0.62, noise(x * 40 + 3, y * 40, z * 6)) * 0.85)
    if (look.breed === 'skinny') {
      c = mix(c, SKIN, 0.55)
      // Folds of skin across the shoulders and over the brow.
      const fold = Math.sin(z * (head ? 18 : 26) + noise(x * 3, y * 3, z * 3) * 4)
      c = mix(c, mix(c, BLACK, 0.3), smooth(0.7, 1, fold) * 0.45)
    }
    return c
  }
}

function paintBody(look: PigLook, rand: () => number): Paint {
  const [base, patch, patch2] = look.coat.map(rgb)
  const belly = lighten(base, 0.1)
  const marks: Mark[] = []
  if (look.pattern === 'dutch') {
    // The back half in colour, with a wavy line round the middle.
    return (x, y, z) => {
      const edge = 0.12 + (noise(x * 3 + 5, y * 3, z * 3) - 0.5) * 0.35
      const c = mix(base, patch, smooth(edge - 0.08, edge + 0.08, z))
      return mix(c, belly, smooth(-0.55, -0.85, y) * 0.5)
    }
  }
  if (look.pattern === 'patches') {
    const n = 3 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) {
      // Mostly on the back and sides.
      const a = rand() * Math.PI * 2
      const up = 0.1 + rand() * 0.8
      const zz = -0.75 + (i / (n - 1)) * 1.5 + (rand() - 0.5) * 0.3
      marks.push(mark([Math.cos(a) * (1 - up), up, zz], 0.55 + rand() * 0.3, i % 2 ? patch2 : patch, rand))
    }
  }
  return (x, y, z) => {
    let c = base
    for (const m of marks) c = mix(c, m.color, m.at(x, y, z))
    return mix(c, belly, smooth(-0.55, -0.85, y) * 0.5)
  }
}

function paintHead(look: PigLook, rand: () => number): Paint {
  const [base, patch, patch2] = look.coat.map(rgb)
  if (look.pattern === 'dutch') {
    // Coloured cheeks with a white blaze down the middle.
    return (x, y, z) => mix(base, patch, smooth(0.22, 0.38, Math.abs(x) + (noise(x * 4, y * 4, z * 4) - 0.5) * 0.15) * smooth(-0.75, -0.45, y))
  }
  if (look.pattern === 'himalayan') {
    // A dark smudge over the nose.
    return (_x, y, z) => mix(base, patch, smooth(-0.55, -0.8, z) * smooth(0.6, 0.2, y))
  }
  if (look.pattern === 'patches') {
    // Often split down the face, tortoiseshell style.
    const side = rand() < 0.5 ? -1 : 1
    const color = rand() < 0.5 ? patch : patch2
    const split = rand() < 0.6
    return (x, y, z) => {
      const wobble = (noise(x * 4 + 9, y * 4, z * 4) - 0.5) * 0.25
      return mix(base, color, split ? smooth(-0.05, 0.08, x * side + wobble) : smooth(0.35, 0.5, x * side + wobble) * smooth(-0.2, 0.1, y))
    }
  }
  return () => base
}

interface Mark {
  color: [number, number, number]
  /** 0..1: how much of the mark is at this point. */
  at: (x: number, y: number, z: number) => number
}

/** A blotch round a point on the sphere, with a wobbly soft edge. */
function mark(c: [number, number, number], size: number, color: [number, number, number], rand: () => number): Mark {
  const len = Math.hypot(...c)
  const [cx, cy, cz] = c.map((v) => v / len)
  const seed = rand() * 50
  return {
    color,
    at: (x, y, z) => {
      const d = Math.acos(Math.max(-1, Math.min(1, x * cx + y * cy + z * cz)))
      const r = size + (noise(x * 3 + seed, y * 3, z * 3) - 0.5) * 0.5
      return smooth(r + 0.08, r - 0.08, d)
    },
  }
}

// ---------------------------------------------------------------- little helpers

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const lighten = (c: [number, number, number], k: number): [number, number, number] => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k]
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** 0 below `a`, 1 above `b` (or the other way round if a > b), smooth between. */
function smooth(a: number, b: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function prng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** A random 0..1 for a grid point. */
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Smooth value noise, 0..1. */
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const at = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), u), lerp(at(0, 1, 0), at(1, 1, 0), u), v),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), u), lerp(at(0, 1, 1), at(1, 1, 1), u), v),
    w,
  )
}

import { FARMER_RADIUS, type Veg } from './rules.ts'

/** An axis-aligned rectangle on the ground. Every solid thing is one of these. */
export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}
export interface P {
  x: number
  z: number
}

const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 })
export const center = (b: Rect): P => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 })

/** The fenced farm. North is −Z. */
export const BOUNDS = r(-31.5, 31.5, -25.5, 25.5)

// The barn (the indoor bit) sits against the north fence with one wide door in its south wall.
export const BARN_OUTER = r(-12, 12, -25.5, -10)
const WALL = 0.4
export const BARN_IN = r(-12 + WALL, 12 - WALL, -25.5 + WALL, -10 - WALL)
export const DOOR_HALF = 2
export const BARN_WALLS: Rect[] = [
  r(-12, 12, -25.5, -25.1),
  r(-12, -11.6, -25.5, -10),
  r(11.6, 12, -25.5, -10),
  r(-12, -DOOR_HALF, -10.4, -10),
  r(DOOR_HALF, 12, -10.4, -10),
]
/** Pigs walk through these to get in and out. */
export const DOOR_OUT: P = { x: 0, z: -8.4 }
export const DOOR_IN: P = { x: 0, z: -12 }

// The veggie garden: fenced so pigs can't raid it, with a gate on the east side for farmers.
export const GARDEN = r(-29, -15, -6, 19)
const GATE = { z0: 5, z1: 8 }
export const GARDEN_FENCE: Rect[] = [
  r(-29, -15, -6.1, -5.9),
  r(-29, -15, 18.9, 19.1),
  r(-29.1, -28.9, -6, 19),
  r(-15.1, -14.9, -6, GATE.z0),
  r(-15.1, -14.9, GATE.z1, 19),
]
export const GARDEN_GATE: P = { x: -15, z: (GATE.z0 + GATE.z1) / 2 }

export interface BedDef extends P {
  id: number
  kind: Veg
}
export const BED_W = 2.6
export const BED_D = 4.6
export const BEDS: BedDef[] = (
  [
    [-25.5, -1, 'carrot'],
    [-18.5, -1, 'lettuce'],
    [-25.5, 6.5, 'cucumber'],
    [-18.5, 6.5, 'carrot'],
    [-25.5, 14, 'pepper'],
    [-18.5, 14, 'lettuce'],
  ] as const
).map(([x, z, kind], id) => ({ id, x, z, kind }))

/** The orchard: apple trees in rows on the east side. */
export const TREES: P[] = [16, 22, 28].flatMap((x) => [-5, 2, 9, 16].map((z) => ({ x, z })))
export const TRUNK = 0.35
const trunks = TREES.map((t) => r(t.x - TRUNK, t.x + TRUNK, t.z - TRUNK, t.z + TRUNK))

/** Wooden hidey huts on the lawn, open to the south. Pigs run into them to be safe; farmers walk round. */
export const HIDEYS: P[] = [
  { x: -8, z: 1 },
  { x: 6, z: -3 },
  { x: -1, z: 10 },
  { x: -9, z: 17 },
  { x: 9, z: 18 },
  { x: 24, z: 22 },
]
export const HIDEY_W = 1.8
export const HIDEY_D = 1.4
const huts = HIDEYS.map((h) => r(h.x - HIDEY_W / 2, h.x + HIDEY_W / 2, h.z - HIDEY_D / 2, h.z + HIDEY_D / 2))

/** Food bowls inside the barn. */
export const BOWLS: P[] = [
  { x: -7, z: -21 },
  { x: -2.5, z: -21.5 },
  { x: 2.5, z: -21.5 },
  { x: 7, z: -21 },
]
/** Little wooden houses inside the barn, where pigs like to sleep. Not solid. */
export const PIG_HOUSES: P[] = [
  { x: -9.3, z: -14 },
  { x: 9.3, z: -14 },
  { x: -9.3, z: -23.2 },
  { x: 9.3, z: -23.2 },
]

/** Stacked hay bales, just for looks and a bit of cover. */
export const HAY_BALES: Rect[] = [r(-14.6, -12.6, -24.5, -21), r(12.6, 14.6, -14, -11.5)]

export const FARMER_SPAWN: P = { x: 0, z: -5 }
/** Where carried-off pigs turn up again: the south gate. */
export const FARM_GATE: P = { x: 0, z: 24 }

export const FARMER_SOLIDS: Rect[] = [...BARN_WALLS, ...GARDEN_FENCE, ...trunks, ...huts, ...HAY_BALES]
export const PIG_SOLIDS: Rect[] = [...BARN_WALLS, GARDEN, ...trunks, ...HAY_BALES]
/** Foxes jump the outer fence but can't get into the barn or the garden. */
export const FOX_SOLIDS: Rect[] = [...PIG_SOLIDS, r(-DOOR_HALF, DOOR_HALF, -10.4, -10)]

export function inRect(p: P, b: Rect, pad = 0): boolean {
  return p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.z >= b.z0 - pad && p.z <= b.z1 + pad
}
export const isInside = (p: P) => inRect(p, BARN_IN)
export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z)

/**
 * The next point to walk at on the way to `to`. Inside and outside only connect through the door,
 * so crossing over means lining up in front of it, then walking straight through. `lane` (−1..1)
 * spreads a crowd across the width of the door.
 */
export function nextStep(from: P, to: P, lane = 0): P {
  const fin = isInside(from)
  if (fin === isInside(to)) return to
  const x = lane * (DOOR_HALF - 0.7)
  const lined = Math.abs(from.x) < DOOR_HALF - 0.35
  if (fin) return lined && from.z > DOOR_IN.z - 1 ? { x: from.x, z: DOOR_OUT.z } : { x, z: DOOR_IN.z }
  return lined && from.z < DOOR_OUT.z + 1.5 ? { x: from.x, z: DOOR_IN.z } : { x, z: DOOR_OUT.z }
}

/** Pushes a circle out of every rect it overlaps (in place). Sliding along walls falls out of this. */
export function pushOut(p: P, radius: number, solids: Rect[]): void {
  for (const b of solids) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1))
    const cz = Math.max(b.z0, Math.min(p.z, b.z1))
    const dx = p.x - cx
    const dz = p.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= radius * radius) continue
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2)
      p.x = cx + (dx / d) * radius
      p.z = cz + (dz / d) * radius
    } else {
      // Centre is inside the rect: leave by the nearest side.
      const out = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z]
      const i = out.indexOf(Math.min(...out))
      if (i === 0) p.x = b.x0 - radius
      else if (i === 1) p.x = b.x1 + radius
      else if (i === 2) p.z = b.z0 - radius
      else p.z = b.z1 + radius
    }
  }
}

export function clampTo(p: P, b: Rect, radius: number): void {
  p.x = Math.max(b.x0 + radius, Math.min(b.x1 - radius, p.x))
  p.z = Math.max(b.z0 + radius, Math.min(b.z1 - radius, p.z))
}

/** Where a farmer may stand: inside the fence and out of everything solid. */
export function settleFarmer(p: P): void {
  pushOut(p, FARMER_RADIUS, FARMER_SOLIDS)
  clampTo(p, BOUNDS, FARMER_RADIUS)
}

/** Where a pig (or a piece of food) may be. */
export function settlePig(p: P, radius: number): void {
  pushOut(p, radius, PIG_SOLIDS)
  clampTo(p, BOUNDS, radius)
}

/** True if a point is somewhere a pig can stand, with some room around it. */
export function pigCanStand(p: P, pad = 0.6): boolean {
  if (!inRect(p, BOUNDS, -pad)) return false
  return !PIG_SOLIDS.some((b) => inRect(p, b, pad))
}

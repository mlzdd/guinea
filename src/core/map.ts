import { FARMER_RADIUS, FARMER_ROAM, START_LAND, landLevel, type SquareId, type UpgradeId, type Veg } from './rules.ts'

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

/** All the land there is (bought or not). North is −Z. */
export const BOUNDS = r(-31.5, 31.5, -25.5, 25.5)

// ---------------------------------------------------------------- the grid

/** The land is a 3×3 grid of squares; the middle column is wider, for the barn. */
const COLS = [-31.5, -12.5, 12.5, 31.5]
const ROWS = [-25.5, -8.5, 8.5, 25.5]
const GRID: SquareId[][] = [
  ['meadow', 'barn', 'patch2'],
  ['garden', 'yard', 'orchard'],
  ['pond', 'huts', 'flowers'],
]
export interface Square extends Rect {
  id: SquareId
  col: number
  row: number
}
export const SQUARES: Square[] = GRID.flatMap((ids, row) =>
  ids.map((id, col) => ({ id, col, row, x0: COLS[col], x1: COLS[col + 1], z0: ROWS[row], z1: ROWS[row + 1] })),
)
export const square = (id: SquareId) => SQUARES.find((s) => s.id === id)!
export const squareAt = (p: P) => SQUARES.find((s) => inRect(p, s))
const touching = (a: Square, b: Square) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1
/** A square can be bought once the farm owns one next to it. */
export const canBuy = (id: SquareId, owned: readonly SquareId[]) =>
  !owned.includes(id) && SQUARES.some((s) => owned.includes(s.id) && touching(s, square(id)))

// ---------------------------------------------------------------- the barn (top middle)

// The barn (the indoor bit) sits against the north edge with one wide door in its south wall.
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
/** The low gate across the doorway: when it's shut pigs can't pass (farmers step over it). Foxes never get in past it. */
export const DOOR_GATE = r(-DOOR_HALF, DOOR_HALF, -10.4, -10)
export const DOOR_MID: P = { x: 0, z: -10.2 }

/** Food bowls inside the barn. */
export const BOWLS: P[] = [
  { x: -7, z: -21 },
  { x: -2.5, z: -21.5 },
  { x: 2.5, z: -21.5 },
  { x: 7, z: -21 },
]
/** Pellet hoppers inside the barn (the second one has to be bought). Round, so pigs eat all the way round. */
export const HOPPERS: P[] = [
  { x: -10, z: -18.6 },
  { x: 10, z: -18.6 },
]
/**
 * Hay racks against the barn walls (inside, and a couple outside the front): farmers fill them with hay; pigs eat from
 * the floor in front (`face`: the way the front looks). Some only go up with the barn improvements (`barn`: the tier).
 * New ones go on the end, as saves keep the racks by index.
 */
export interface HayRack extends P {
  face: 'n' | 's' | 'e' | 'w'
  /** Along the wall. */
  len: number
  barn: number
}
const FACE: Record<HayRack['face'], P> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } }
export const HAY_RACKS: HayRack[] = [
  // Along the back wall.
  { x: -8, z: -24.4, face: 's', len: 3, barn: 0 },
  { x: 0, z: -24.4, face: 's', len: 3, barn: 0 },
  { x: 8, z: -24.4, face: 's', len: 3, barn: 0 },
  // On the side walls, between the hoppers and the back houses.
  { x: -10.95, z: -21, face: 'e', len: 2.4, barn: 0 },
  { x: 10.95, z: -21, face: 'w', len: 2.4, barn: 0 },
  // Outside, against the front wall left of the door.
  { x: -7, z: -9.45, face: 's', len: 3, barn: 0 },
  // Barn improvements: one inside by the door and one outside on the right…
  { x: -8.8, z: -10.95, face: 'n', len: 3, barn: 1 },
  { x: 7, z: -9.45, face: 's', len: 3, barn: 1 },
  // …and two more on the side walls, between the hoppers and the front houses.
  { x: -10.95, z: -16.4, face: 'e', len: 2.4, barn: 2 },
  { x: 10.95, z: -16.4, face: 'w', len: 2.4, barn: 2 },
]
/** Where pigs eat a rack's hay: the floor in front of it. */
export const rackFront = (r: HayRack, d = 0.5): P => ({ x: r.x + FACE[r.face].x * d, z: r.z + FACE[r.face].z * d })
/** Is this rack up yet? */
export const rackBuilt = (i: number, u: readonly UpgradeId[]) => landLevel(u, 'barn') >= HAY_RACKS[i].barn
/** Where the sacks of pellets are kept, just inside the door. */
export const FEED_BIN: P = { x: 5, z: -11.4 }
/** The hay table next to it: today's bale of hay, for the racks. */
export const HAY_BALE: P = { x: 7.3, z: -11.4 }
/** The salad station, the other side of the door: farmers build the evening salad platter here… */
export const SALAD_TABLE: P = { x: -5, z: -11.4 }
/** …and serve it here, in the middle of the barn floor. */
export const SALAD_SPOT: P = { x: 0, z: -17 }
/** Little wooden houses inside the barn, where pigs like to sleep. Not solid. */
export const PIG_HOUSES: P[] = [
  { x: -9.3, z: -14 },
  { x: 9.3, z: -14 },
  { x: -9.3, z: -23.2 },
  { x: 9.3, z: -23.2 },
]

/**
 * Where pigs sleep: snug spots round the edges of the barn (in and round the little houses, the corners, along the
 * side walls and in front of the hay racks), never out in the middle.
 */
export const BED_SPOTS: P[] = [
  ...PIG_HOUSES.flatMap((h) => [
    { x: h.x, z: h.z },
    { x: h.x + (h.x < 0 ? 1 : -1), z: h.z + 0.6 },
    { x: h.x + (h.x < 0 ? 1 : -1), z: h.z - 0.6 },
  ]),
  ...[-1, 1].flatMap((side) => [
    { x: side * 10.7, z: -24.3 },
    { x: side * 10.7, z: -11.3 },
    { x: side * 10.4, z: -16.4 },
    { x: side * 10.4, z: -21 },
  ]),
  ...[-8, 0, 8].flatMap((x) => [
    { x: x - 1, z: -23.4 },
    { x, z: -23.3 },
    { x: x + 1, z: -23.4 },
  ]),
]

// ---------------------------------------------------------------- what's in each square

/** Veg gardens: fenced so pigs can't raid them, each with a gate for farmers. One little one in the yard to start. */
export interface Garden extends Rect {
  square: SquareId
  /** The fence, with its gate gap. */
  fence: Rect[]
  gate: P
}
const fenced = (square: SquareId, b: Rect, side: 'n' | 's' | 'e' | 'w', g0: number, g1: number): Garden => {
  const T = 0.1
  const sides: Record<'n' | 's' | 'e' | 'w', Rect> = {
    n: r(b.x0, b.x1, b.z0 - T, b.z0 + T),
    s: r(b.x0, b.x1, b.z1 - T, b.z1 + T),
    w: r(b.x0 - T, b.x0 + T, b.z0, b.z1),
    e: r(b.x1 - T, b.x1 + T, b.z0, b.z1),
  }
  const fence = (Object.keys(sides) as (keyof typeof sides)[]).flatMap((k) => {
    const s = sides[k]
    if (k !== side) return [s]
    // Split this side round the gate.
    return k === 'n' || k === 's' ? [r(s.x0, g0, s.z0, s.z1), r(g1, s.x1, s.z0, s.z1)] : [r(s.x0, s.x1, s.z0, g0), r(s.x0, s.x1, g1, s.z1)]
  })
  const mid = (g0 + g1) / 2
  const gate = side === 'n' ? { x: mid, z: b.z0 } : side === 's' ? { x: mid, z: b.z1 } : side === 'w' ? { x: b.x0, z: mid } : { x: b.x1, z: mid }
  return { ...b, square, fence, gate }
}
export const GARDENS: Garden[] = [
  fenced('yard', r(4, 11.5, 0.5, 7.5), 'w', 3, 5.5),
  fenced('garden', r(-29, -15, -6.5, 6.5), 'e', -1, 1),
  fenced('patch2', r(14, 30, -24.5, -15), 's', 20, 23),
]

export interface BedDef extends P {
  id: number
  kind: Veg
  square: SquareId
}
export const BED_W = 2.6
export const BED_D = 4.6
export const BEDS: BedDef[] = (
  [
    [6.2, 4, 'carrot', 'yard'],
    [9.4, 4, 'lettuce', 'yard'],
    [-25.5, -3.2, 'carrot', 'garden'],
    [-18.5, -3.2, 'lettuce', 'garden'],
    [-25.5, 3.2, 'cucumber', 'garden'],
    [-18.5, 3.2, 'pepper', 'garden'],
    [17.5, -20.5, 'cucumber', 'patch2'],
    [22, -20.5, 'pepper', 'patch2'],
    [26.5, -20.5, 'carrot', 'patch2'],
  ] as const
).map(([x, z, kind, square], id) => ({ id, x, z, kind, square }))

/** The orchard: apple trees in rows. */
export const TREES: P[] = [16, 22, 28].flatMap((x) => [-5, 0.5, 6].map((z) => ({ x, z })))
export const TRUNK = 0.35
const trunks = TREES.map((t) => r(t.x - TRUNK, t.x + TRUNK, t.z - TRUNK, t.z + TRUNK))

/** Wooden hidey huts, open to the south. Pigs run into them to be safe; farmers walk round (or climb on). */
export const HIDEYS: (P & { square: SquareId })[] = [
  { x: -8, z: 1, square: 'yard' },
  { x: 6, z: -3, square: 'yard' },
  { x: -14.5, z: -12.6, square: 'meadow' },
  { x: -1, z: 12, square: 'huts' },
  { x: -8, z: 19, square: 'huts' },
  { x: 7, z: 19, square: 'huts' },
  { x: 24, z: 21, square: 'flowers' },
]
export const HIDEY_W = 1.8
export const HIDEY_D = 1.4
/** Up to the ridge of the roof. */
export const HIDEY_H = 1.1
const hutRect = (h: P) => r(h.x - HIDEY_W / 2, h.x + HIDEY_W / 2, h.z - HIDEY_D / 2, h.z + HIDEY_D / 2)
/** To a pig a hut is its roof down both sides and the back wall: the only way in is the open front (south). */
const hutWalls = (h: P): Rect[] => {
  const b = hutRect(h)
  const T = 0.1
  return [r(b.x0, b.x1, b.z0, b.z0 + T), r(b.x0, b.x0 + T, b.z0, b.z1), r(b.x1 - T, b.x1, b.z0, b.z1)]
}

/** The stack yard down the right of the hay meadow (nearest the barn): drop armfuls of cut hay here to build up haystacks, take them to the racks later. */
export const HAY_STACKS: P[] = [
  { x: -14.5, z: -23.5 },
  { x: -14.5, z: -20 },
  { x: -14.5, z: -16.5 },
]
/** The haystack you're next to, if any. */
export const hayStackAt = (p: P) => HAY_STACKS.findIndex((s) => dist(p, s) < 1.8)
/** The hay meadow's field: a 4×4 grid of touching patches of tall hay. Cut an armful from one and it grows back. */
export const HAY_PATCH = 3.5
const FIELD = { x0: -30.5, z0: -24.5 }
export const HAY_PATCHES: Rect[] = [0, 1, 2, 3].flatMap((row) =>
  [0, 1, 2, 3].map((col) => {
    const x0 = FIELD.x0 + col * HAY_PATCH
    const z0 = FIELD.z0 + row * HAY_PATCH
    return r(x0, x0 + HAY_PATCH, z0, z0 + HAY_PATCH)
  }),
)
/** The whole field. It's tall enough to lose a pig in, so pigs graze round it rather than in it (farmers wade through). */
export const HAY_FIELD = r(FIELD.x0, FIELD.x0 + 4 * HAY_PATCH, FIELD.z0, FIELD.z0 + 4 * HAY_PATCH)
/** The patch you're standing on (or, at the edge of the field, right next to), if any. */
export const hayPatchAt = (p: P) => {
  const on = HAY_PATCHES.findIndex((h) => inRect(p, h))
  return on >= 0 ? on : HAY_PATCHES.findIndex((h) => inRect(p, h, 0.6))
}

/** The pond: water nobody walks on. Pigs resting nearby (POND_CALM) get happier. */
export const POND = r(-27, -17, 14, 20)
export const POND_CALM = 4

/** Upgrades that show up on the farm (in the yard, which every farm has). */
export const SCARECROW: P = { x: -4, z: 5 }
export const COMPOST: P = { x: -10, z: 6.2 }

export const FARMER_SPAWN: P = { x: 0, z: -5 }

// ---------------------------------------------------------------- the land the farm owns

/**
 * What's been bought. Set by the farm (`setLand`) and, in the browser, from snapshots. Fences, solids and where pigs
 * can be all follow from it, so the arrays below are refilled in place whenever it changes.
 */
let owned: SquareId[] = []
export const owns = (id: SquareId) => owned.includes(id)
export const ownedLand = (): readonly SquareId[] => owned

/** One straight run of the farm's outer fence, with the way out. */
export interface FenceEdge {
  a: P
  b: P
  /** Unit vector pointing off the farm. */
  out: P
  /** The barn's back wall: foxes don't come in this way. */
  barn: boolean
}
export const FENCE_EDGES: FenceEdge[] = []
/** Thin rects along the fence, for bumping into. */
export const FENCE: Rect[] = []
export const PIG_SOLIDS: Rect[] = []
/** Foxes go under the fence (slowly) but can't get into the gardens, or into the barn unless the door is open at night. */
export const FOX_SOLIDS: Rect[] = []
/** Something a farmer bumps into, and how tall it is: anything lower than your feet you can jump onto or over. */
export interface Block extends Rect {
  h: number
}
export const FARMER_BLOCKS: Block[] = []
/** Farmers can hop the fence and roam the unbought land, and a little way beyond. */
export const FARMER_BOUNDS = r(BOUNDS.x0 - FARMER_ROAM, BOUNDS.x1 + FARMER_ROAM, BOUNDS.z0 - FARMER_ROAM, BOUNDS.z1 + FARMER_ROAM)
/** Too tall to jump: barn walls, trees, the pond. */
const TALL = 99

/** The hut walls among PIG_SOLIDS (route-finding leaves them to `hutStep`). */
const HUT_SOLIDS = new Set<Rect>()
const hutSolids = () => HUT_SOLIDS

export function setLand(ids: readonly SquareId[]) {
  const next = SQUARES.map((s) => s.id).filter((id) => ids.includes(id))
  if (next.length === owned.length && next.every((id, i) => owned[i] === id)) return
  owned = next
  const mine = SQUARES.filter((s) => owns(s.id))

  FENCE_EDGES.length = 0
  for (const s of mine) {
    const nb = (dc: number, dr: number) => SQUARES.find((o) => o.col === s.col + dc && o.row === s.row + dr)
    const side = (dc: number, dr: number, a: P, b: P) => {
      const n = nb(dc, dr)
      if (n && owns(n.id)) return
      FENCE_EDGES.push({ a, b, out: { x: dc, z: dr }, barn: s.id === 'barn' && dr === -1 })
    }
    side(0, -1, { x: s.x0, z: s.z0 }, { x: s.x1, z: s.z0 })
    side(0, 1, { x: s.x0, z: s.z1 }, { x: s.x1, z: s.z1 })
    side(-1, 0, { x: s.x0, z: s.z0 }, { x: s.x0, z: s.z1 })
    side(1, 0, { x: s.x1, z: s.z0 }, { x: s.x1, z: s.z1 })
  }
  FENCE.length = 0
  for (const e of FENCE_EDGES) FENCE.push(r(Math.min(e.a.x, e.b.x) - 0.1, Math.max(e.a.x, e.b.x) + 0.1, Math.min(e.a.z, e.b.z) - 0.1, Math.max(e.a.z, e.b.z) + 0.1))

  const gardens = GARDENS.filter((g) => owns(g.square))
  const trees = owns('orchard') ? trunks : []
  const field = owns('meadow') ? [HAY_FIELD] : []
  const pond = owns('pond') ? [POND] : []
  const fill = <T>(arr: T[], items: T[]) => {
    arr.length = 0
    arr.push(...items)
  }
  const huts = hideys().flatMap(hutWalls)
  HUT_SOLIDS.clear()
  for (const w of huts) HUT_SOLIDS.add(w)
  fill(PIG_SOLIDS, [...BARN_WALLS, ...gardens, ...trees, ...field, ...pond, ...FENCE, ...huts])
  fill(FOX_SOLIDS, [...BARN_WALLS, ...gardens, ...trees, ...pond, DOOR_GATE])
  const tall = (h: number) => (b: Rect): Block => ({ ...b, h })
  fill(FARMER_BLOCKS, [
    ...BARN_WALLS.map(tall(TALL)),
    ...trees.map(tall(TALL)),
    ...pond.map(tall(TALL)),
    ...gardens.flatMap((g) => g.fence).map(tall(0.75)),
    ...FENCE.map(tall(1.2)),
    ...hideys().map(hutRect).map(tall(HIDEY_H)),
  ])
}

/** The hidey huts on land the farm owns. */
export const hideys = () => HIDEYS.filter((h) => owns(h.square))
/** The apple trees, if the farm has the orchard. */
export const trees = () => (owns('orchard') ? TREES : [])
export const gardens = () => GARDENS.filter((g) => owns(g.square))

/** On land the farm owns (inside the fence). */
export const onFarm = (p: P) => owned.some((id) => inRect(p, square(id)))
/** More than `pad` beyond the fence. */
export const offFarm = (p: P, pad: number) => !owned.some((id) => inRect(p, square(id), pad))

/** The nearest point on a fence edge (and which edge). */
export function nearestFence(p: P): { at: P; edge: FenceEdge; d: number } {
  let best = { at: p, edge: FENCE_EDGES[0], d: Infinity }
  for (const e of FENCE_EDGES) {
    const dx = e.b.x - e.a.x
    const dz = e.b.z - e.a.z
    const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.z - e.a.z) * dz) / (dx * dx + dz * dz)))
    const at = { x: e.a.x + dx * t, z: e.a.z + dz * t }
    const d = dist(p, at)
    if (d < best.d) best = { at, edge: e, d }
  }
  return best
}

export function inRect(p: P, b: Rect, pad = 0): boolean {
  return p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.z >= b.z0 - pad && p.z <= b.z1 + pad
}
export const isInside = (p: P) => inRect(p, BARN_IN)
export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z)

/** Does the straight line from a to b cross the rect? (Liang–Barsky.) */
export function crosses(a: P, b: P, rect: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dz = b.z - a.z
  for (const [p, q] of [
    [-dx, a.x - rect.x0],
    [dx, rect.x1 - a.x],
    [-dz, a.z - rect.z0],
    [dz, rect.z1 - a.z],
  ]) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
      if (t0 > t1) return false
    }
  }
  return true
}

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

/**
 * The next point on a pig's way to `to`, round the hidey huts: in and out only by the open front, and round the back
 * and sides of any hut in the way (a corner at a time). `to` itself when no hut is in the way.
 */
export function hutStep(from: P, to: P, radius: number): P {
  for (const h of hideys()) {
    const b = hutRect(h)
    const slack = radius - 0.05 // pigs pushed against a wall can still slide off along it
    const walls = hutWalls(h).map((w) => r(w.x0 - slack, w.x1 + slack, w.z0 - slack, w.z1 + slack))
    const blocked = (a: P, c: P) => walls.some((w) => crosses(a, c, w))
    const door = { x: h.x, z: b.z1 + radius + 0.4 }
    // In the hut, or standing in its mouth.
    const fromIn = inRect(from, { ...b, z1: b.z1 + radius + 0.1 }) && Math.abs(from.x - h.x) < HIDEY_W / 2
    if (fromIn && inRect(to, b)) continue
    // Inside, heading out the back or a side: out of the front first.
    if (fromIn) {
      if (blocked(from, to)) return door
      continue
    }
    // Heading in (not lined up with the front yet), or past: round the hut to the front, or past it.
    const goal = inRect(to, b) ? door : to
    if (!blocked(from, inRect(to, b) ? to : goal)) continue
    if (goal === door && !blocked(from, door) && dist(from, door) > 0.2) return door
    // The shortest way round by the corners (a little search over from, the four corners and the goal).
    const pad = radius + 0.45
    const nodes = [
      from,
      { x: b.x0 - pad, z: b.z0 - pad },
      { x: b.x1 + pad, z: b.z0 - pad },
      { x: b.x1 + pad, z: b.z1 + pad },
      { x: b.x0 - pad, z: b.z1 + pad },
      goal,
    ]
    const best = nodes.map(() => Infinity)
    const first = nodes.map(() => -1)
    best[0] = 0
    const done = new Set<number>()
    while (done.size < nodes.length) {
      let i = -1
      for (let k = 0; k < nodes.length; k++) if (!done.has(k) && (i < 0 || best[k] < best[i])) i = k
      if (best[i] === Infinity) break
      done.add(i)
      for (let j = 1; j < nodes.length; j++) {
        if (done.has(j) || blocked(nodes[i], nodes[j])) continue
        const d = best[i] + dist(nodes[i], nodes[j])
        if (d < best[j]) {
          best[j] = d
          first[j] = i === 0 ? j : first[i]
        }
      }
    }
    if (first[5] > 0) return nodes[first[5]]
  }
  return to
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

/** Where a farmer may stand, with their feet at height `y`: out of everything taller than that. */
export function settleFarmer(p: P, y = 0): void {
  pushOut(p, FARMER_RADIUS, y > 0 ? FARMER_BLOCKS.filter((b) => b.h > y + 0.05) : FARMER_BLOCKS)
  clampTo(p, FARMER_BOUNDS, FARMER_RADIUS)
}

/** How high the ground is here: the top of whatever (jumpable) thing you're standing on, or 0. */
export function groundAt(p: P): number {
  let h = 0
  for (const b of FARMER_BLOCKS) if (b.h < TALL && b.h > h && inRect(p, b)) h = b.h
  return h
}

/** Where a pig (or a piece of food) may be: on the farm's land, out of everything solid. */
export function settlePig(p: P, radius: number): void {
  if (!onFarm(p)) {
    // Off the land (a throw over the fence, say): back onto the nearest bit of it.
    let best: P | null = null
    for (const id of owned) {
      const q = { ...p }
      clampTo(q, square(id), radius + 0.2)
      if (!best || dist(p, q) < dist(p, best)) best = q
    }
    if (best) Object.assign(p, best)
  }
  pushOut(p, radius, PIG_SOLIDS)
  clampTo(p, BOUNDS, radius)
}

/** Like settlePig, but for a pig squeezing under a veg patch fence: the gardens don't stop it. */
export function settleRaider(p: P, radius: number): void {
  const gs = gardens()
  pushOut(p, radius, PIG_SOLIDS.filter((b) => !gs.includes(b as Garden)))
  clampTo(p, BOUNDS, radius)
}

/** Pig solids, for a raider (who squeezes under the garden fences) or not, plus anything `extra` (the shut barn door). */
const pigSolids = (raid: boolean, extra: Rect[]) => {
  const gs = gardens()
  return [...(raid ? PIG_SOLIDS.filter((b) => !gs.includes(b as Garden)) : PIG_SOLIDS), ...extra]
}

/** Is the straight line from a to b blocked for a pig (by anything bar the hidey huts, which `hutStep` sees to)? */
export function pigLineBlocked(a: P, b: P, radius: number, raid = false, extra: Rect[] = []): boolean {
  const slack = radius - 0.05 // pigs pushed against a wall can still slide off along it
  const huts = hutSolids()
  return pigSolids(raid, extra).some((s) => !huts.has(s) && crosses(a, b, { x0: s.x0 - slack, x1: s.x1 + slack, z0: s.z0 - slack, z1: s.z1 + slack }))
}

const CELL = 0.5
const COLS_N = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL)
const ROWS_N = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL)
const cellAt = (i: number): P => ({ x: BOUNDS.x0 + ((i % COLS_N) + 0.5) * CELL, z: BOUNDS.z0 + (Math.floor(i / COLS_N) + 0.5) * CELL })
const cellOf = (p: P) =>
  Math.max(0, Math.min(ROWS_N - 1, Math.floor((p.z - BOUNDS.z0) / CELL))) * COLS_N + Math.max(0, Math.min(COLS_N - 1, Math.floor((p.x - BOUNDS.x0) / CELL)))
/** The search's working arrays, shared by every search (see pigPath). */
const costs = new Float64Array(COLS_N * ROWS_N)
const prevs = new Int32Array(COLS_N * ROWS_N)
const seen = new Uint32Array(COLS_N * ROWS_N)
let search = 0
/** A search gives up after looking at this many cells (no way there, or a very long way round). */
const MAX_EXPAND = 6000
/** Which cells a pig can stand in, worked out once per layout (land, raider or not, door). */
const grids = new Map<string, Uint8Array>()
function freeGrid(radius: number, raid: boolean, extra: Rect[]): Uint8Array {
  const key = `${owned.join()}|${radius}|${raid}|${extra.map((b) => `${b.x0},${b.z0}`).join()}`
  let g = grids.get(key)
  if (g) return g
  if (grids.size > 16) grids.clear()
  const solids = pigSolids(raid, extra)
  g = new Uint8Array(COLS_N * ROWS_N)
  for (let i = 0; i < g.length; i++) {
    const c = cellAt(i)
    g[i] = onFarm(c) && inRect(c, BOUNDS, -radius) && !solids.some((b) => inRect(c, b, radius + 0.05)) ? 1 : 0
  }
  grids.set(key, g)
  return g
}

/**
 * A pig's way from a to b round everything in the way (barn walls, out through the door, garden fences, trees, the
 * pond, the hay field; a raider squeezes under the garden fences instead). A grid search on the owned land,
 * straightened out wherever there's a clear line. Waypoints after `from`, ending with `to` itself; null if there's no
 * way (`extra`: more in the way, like the shut barn door).
 */
export function pigPath(from: P, to: P, radius: number, raid = false, extra: Rect[] = []): P[] | null {
  const grid = freeGrid(radius, raid, extra)
  const start = cellOf(from)
  let goal = cellOf(to)
  // Aiming at somewhere it can't quite stand (up against a wall, in a hut): the nearest cell it can, then on in.
  if (!grid[goal]) {
    let best = -1
    const gx = goal % COLS_N
    const gz = Math.floor(goal / COLS_N)
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = gx + dx
        const z = gz + dz
        if (x < 0 || z < 0 || x >= COLS_N || z >= ROWS_N || !grid[z * COLS_N + x]) continue
        const j = z * COLS_N + x
        if (best < 0 || dist(cellAt(j), to) < dist(cellAt(best), to)) best = j
      }
    if (best < 0) return null
    goal = best
  }
  const free = (i: number) => i === start || grid[i] === 1
  // A* over the cells (8 ways), never cutting a blocked corner. The arrays are kept between searches: a cell's cost
  // only counts if it was set in this search (`seen`).
  search++
  const cost = (i: number) => (seen[i] === search ? costs[i] : Infinity)
  const gx = cellAt(goal)
  const h = (i: number) => {
    const c = cellAt(i)
    return Math.hypot(c.x - gx.x, c.z - gx.z) / CELL
  }
  const queue: [number, number][] = []
  const push = (f: number, i: number) => {
    // A little binary heap on f.
    queue.push([f, i])
    for (let k = queue.length - 1; k > 0; ) {
      const up = (k - 1) >> 1
      if (queue[up][0] <= queue[k][0]) break
      ;[queue[up], queue[k]] = [queue[k], queue[up]]
      k = up
    }
  }
  const pop = () => {
    const top = queue[0]
    const last = queue.pop()!
    if (queue.length) {
      queue[0] = last
      for (let k = 0; ; ) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < queue.length && queue[l][0] < queue[m][0]) m = l
        if (r < queue.length && queue[r][0] < queue[m][0]) m = r
        if (m === k) break
        ;[queue[m], queue[k]] = [queue[k], queue[m]]
        k = m
      }
    }
    return top
  }
  seen[start] = search
  costs[start] = 0
  prevs[start] = -1
  push(h(start), start)
  let found = false
  for (let n = 0; queue.length && n < MAX_EXPAND; n++) {
    const [, i] = pop()
    if (i === goal) {
      found = true
      break
    }
    const cx = i % COLS_N
    const cz = Math.floor(i / COLS_N)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const nx = cx + dx
        const nz = cz + dz
        if (nx < 0 || nz < 0 || nx >= COLS_N || nz >= ROWS_N) continue
        const j = nz * COLS_N + nx
        if (!free(j) || (dx && dz && (!free(cz * COLS_N + nx) || !free(nz * COLS_N + cx)))) continue
        const c = costs[i] + (dx && dz ? Math.SQRT2 : 1)
        if (c >= cost(j)) continue
        seen[j] = search
        costs[j] = c
        prevs[j] = i
        push(c + h(j), j)
      }
  }
  if (!found) return null
  const cells: P[] = []
  for (let i = goal; i !== -1 && i !== start; i = prevs[i]) cells.unshift(cellAt(i))
  // Straighten: from each point, jump to the furthest one in plain sight.
  const clear = (a: P, b: P) => !pigLineBlocked(a, b, radius, raid, extra)
  const path: P[] = []
  const points = [...cells, to]
  let here = from
  for (let k = 0; k < points.length; ) {
    let far = k
    for (let j = points.length - 1; j > k; j--)
      if (clear(here, points[j])) {
        far = j
        break
      }
    path.push(points[far])
    here = points[far]
    k = far + 1
  }
  return path
}

/** True if a point is somewhere a pig can stand, with some room around it. */
export function pigCanStand(p: P, pad = 0.6): boolean {
  if (!onFarm(p) || !inRect(p, BOUNDS, -pad)) return false
  return !PIG_SOLIDS.some((b) => inRect(p, b, pad))
}

// A farm starts with the barn and the yard.
setLand(START_LAND)

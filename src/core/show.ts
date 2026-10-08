/**
 * The pig show: every few days a car comes to the farm. Farmers carry a piggy to it (or just come along to watch) and
 * it takes them to the show: a big barn far off down the road (the fog hides it from the farm), full of other breeders
 * holding their piggies. Each entrant puts their piggy on the judging table, the judge scores it, they take it back
 * to their spot, and once everyone's back the results come out: placings, the stats, and the all-time leaderboard.
 * The rivals are the same few breeders every time, with the same piggies, getting better (or worse) as they go.
 */
import type { P, Rect } from './map.ts'

const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 })

// ---------------------------------------------------------------- timings (farm time)

/** On show days the car turns up at this time of day (mid-morning)… */
export const SHOW_AT = 0.2
/** …and waits this long for everyone who's coming (or less, once every farmer's in). */
export const SHOW_BOARD_MS = 45_000
/** The show itself: everyone who brought a piggy gets it judged and goes back to their spot (or the time runs out). */
export const SHOW_MS = 150_000
/** The judge takes this long over each piggy. */
export const JUDGE_MS = 5000
/** The results stay up this long, then the car takes everyone home. */
export const RESULTS_MS = 15_000
/** Prizes by place, rivals included: first, second, third, fourth (the winner gets a rosette too). */
export const SHOW_PRIZES = [100, 50, 20, 10]
/** Every other farm piggy that was judged gets this for taking part. */
export const SHOW_TAKING_PART = 5

// ---------------------------------------------------------------- the farm end

/** Where the show car parks on the farm: the yard, just south of the barn door. */
export const CAR_FARM: P = { x: -5, z: -4 }
/** Get in from this close. */
export const CAR_REACH = 2.6

// ---------------------------------------------------------------- the show barn

/** The show barn's walls (inside), well away from the farm. */
export const HALL = r(184, 216, -14, 14)
const W = 0.4
const DOOR = 2.5
/** Its walls (a wide door in the middle of the south wall), the judging table, and the rivals' stalls. */
export const HALL_WALLS: Rect[] = [
  r(HALL.x0 - W, HALL.x1 + W, HALL.z0 - W, HALL.z0),
  r(HALL.x0 - W, HALL.x0, HALL.z0, HALL.z1 + W),
  r(HALL.x1, HALL.x1 + W, HALL.z0, HALL.z1 + W),
  r(HALL.x0 - W, 200 - DOOR, HALL.z1, HALL.z1 + W),
  r(200 + DOOR, HALL.x1 + W, HALL.z1, HALL.z1 + W),
]
/** The judging table at the top of the hall; the judge stands behind it. */
export const TABLE: Rect = r(197, 203, -10.6, -9.4)
export const TABLE_H = 0.85
/** Where the piggy sits on the table, where the judge stands, and where you stand to put a piggy down. */
export const TABLE_SPOT: P = { x: 200, z: -10 }
export const JUDGE: P = { x: 200, z: -11.8 }
export const TABLE_REACH = 2.4
/** The car outside the door, and where you get out. */
export const CAR_HALL: P = { x: 200, z: 17.5 }
export const ARRIVE: P = { x: 200, z: 11 }
/** Everything a farmer at the show bumps into. */
export const HALL_BLOCKS: Rect[] = [...HALL_WALLS, TABLE]
/** Roaming room round the show barn (out of the door to the car). */
export const SHOW_AREA = r(HALL.x0 - 6, HALL.x1 + 6, HALL.z0 - 6, HALL.z1 + 6)

/** The farmers' spots (straw mats with their names), two rows across the hall: up to 12. */
export const SPOTS: P[] = [4, 8].flatMap((z) => [190, 194, 198, 202, 206, 210].map((x) => ({ x, z })))
export const SPOT_R = 1.2

// ---------------------------------------------------------------- the rivals

/** The other breeders, round the walls of the show barn with their piggies (same ones every show). */
export interface Rival {
  name: string
  pig: string
  /** Seed for their piggy's looks. */
  seed: number
  /** How well-kept their piggy is, 0..100 (moves a little after each show). */
  skill: number
  /** Where they stand. */
  x: number
  z: number
}
export const RIVALS: Rival[] = [
  { name: 'Mrs Pemberton', pig: 'Duchess', seed: 11, skill: 82, x: 187.5, z: -8 },
  { name: 'Old Bert', pig: 'Turnip', seed: 23, skill: 64, x: 187.5, z: -3 },
  { name: 'Priya', pig: 'Mango', seed: 37, skill: 74, x: 187.5, z: 2 },
  { name: 'The Hendersons', pig: 'Sir Fluffington', seed: 41, skill: 70, x: 187.5, z: 7 },
  { name: 'Dot', pig: 'Pickle', seed: 53, skill: 60, x: 212.5, z: -8 },
  { name: 'Lord Ashby', pig: 'Reginald', seed: 67, skill: 88, x: 212.5, z: -3 },
  { name: 'Kenji', pig: 'Mochi', seed: 79, skill: 77, x: 212.5, z: 2 },
  { name: 'Wendy', pig: 'Crumpet', seed: 97, skill: 67, x: 212.5, z: 7 },
]
/** A rival's stall: a little table in front of them. */
export const STALL_W = 1.6

// ---------------------------------------------------------------- judging

/** What the judge looks at, 0..20 each (100 in all). */
export const CATEGORIES = ['tummy', 'happy', 'health', 'handling', 'condition'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABEL: Record<Category, string> = {
  tummy: '🥕 Well fed',
  happy: '😊 Happy',
  health: '🩺 Health',
  handling: '🤗 Handling',
  condition: '✨ Condition',
}
export type Scores = Record<Category, number>
export const total = (s: Scores) => Math.round(CATEGORIES.reduce((a, c) => a + s[c], 0))

/** What the judge makes of a farm piggy. */
export function judge(p: {
  hunger: number
  happy: number
  /** How many health problems (hidden ones count: the judge looks properly). */
  issues: number
  /** Cuddled today, adopted, and not poorly. */
  cuddled: boolean
  adopted: boolean
  poorly: boolean
  /** A grown-up (pups are sweet but not ready), had hay lately (good teeth and coat), how many rosettes already. */
  adult: boolean
  hay: boolean
  rosettes: number
  /** A little bit of judge's whim, −1..1. */
  whim: number
}): Scores {
  const r1 = (v: number) => Math.round(Math.max(0, Math.min(20, v)) * 10) / 10
  return {
    tummy: r1((p.hunger / 100) * 20 + p.whim),
    happy: r1((p.happy / 100) * 20 - p.whim),
    health: r1(20 - p.issues * 6),
    handling: r1((p.cuddled ? 11 : 3) + (p.adopted ? 5 : 0) + (p.poorly ? 0 : 4)),
    condition: r1((p.adult ? 10 : 4) + (p.hay ? 6 : 1) + Math.min(3, p.rosettes) + 1 + p.whim),
  }
}

/** A rival's piggy on the day: about their skill, a few points either way, spread over the categories. */
export function rivalScores(skill: number, rand: () => number): Scores {
  const out = {} as Scores
  for (const c of CATEGORIES) out[c] = Math.round(Math.max(0, Math.min(20, (skill / 100) * 20 + (rand() - 0.5) * 5)) * 10) / 10
  return out
}

// ---------------------------------------------------------------- results

/** One entry in a show's results. */
export interface Placing {
  /** The exhibitor (a farmer's name, or a rival's). */
  who: string
  pig: string
  /** A farm piggy (its id), or a rival's (null). */
  pigId: number | null
  scores: Scores
  total: number
  farm: boolean
}
/** The all-time leaderboard, by exhibitor. */
export interface BoardRow {
  who: string
  farm: boolean
  shows: number
  wins: number
  podiums: number
  /** Their best piggy and score. */
  best: { pig: string; total: number }
}

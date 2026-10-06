import { BEDS, BOWLS } from './map.ts'
import type { PigLook } from './pigs.ts'
import { FARMER_COLORS, ISSUES, VEGGIES, type Issue, type Veg } from './rules.ts'

export type PigState =
  | 'idle'
  | 'wander'
  | 'graze'
  | 'seek'
  | 'eat'
  | 'beg'
  | 'flee'
  | 'hide'
  | 'home'
  | 'sleep'
  | 'popcorn'
  | 'scratch'
  | 'sneeze'
  | 'held'
  | 'carried'
  | 'lost'

export type PredKind = 'fox' | 'hawk'
export type PredState = 'sneak' | 'circle' | 'swoop' | 'carry' | 'flee'

export interface FarmerSnap {
  id: number
  name: string
  color: number
  x: number
  z: number
  yaw: number
  /** Count of each veg, in VEGGIES order. */
  basket: number[]
  holding: number | null
}

export interface PigSnap {
  id: number
  x: number
  z: number
  yaw: number
  s: PigState
  hunger: number
  happy: number
  /** ISSUE_BIT flags. */
  issues: number
}

export interface FoodSnap {
  id: number
  kind: Veg
  x: number
  z: number
  bites: number
}

export interface BedSnap {
  stage: 'empty' | 'growing' | 'ripe'
  /** 0..1 while growing. */
  grow: number
}

export interface PredSnap {
  id: number
  kind: PredKind
  x: number
  y: number
  z: number
  s: PredState
  /** The pig it is carrying. */
  pig: number | null
}

export type ClientMsg =
  | { t: 'join'; name: string; color: number }
  | { t: 'state'; x: number; z: number; yaw: number }
  | { t: 'throw'; veg: Veg; x: number; z: number }
  | { t: 'plant'; bed: number }
  | { t: 'harvest'; bed: number }
  | { t: 'fill'; bowl: number; veg: Veg }
  | { t: 'gather'; food: number }
  | { t: 'pickup'; pig: number }
  | { t: 'putdown' }
  | { t: 'cuddle' }
  | { t: 'treat'; issue: Issue }
  | { t: 'shoo' }

export type AlertKind = 'fox' | 'hawk' | 'lost' | 'home' | 'saved' | 'night' | 'day' | 'care' | 'farmer'

export type ServerMsg =
  /** Sent to a page that hasn't joined yet, and again when the farmer count changes. */
  | { t: 'info'; farmers: number }
  | { t: 'welcome'; id: number; pigs: PigLook[] }
  | { t: 'full' }
  | {
      t: 'snap'
      /** Time of day 0..1 (0 = dawn) and which day it is. */
      time: number
      day: number
      farmers: FarmerSnap[]
      pigs: PigSnap[]
      foods: FoodSnap[]
      beds: BedSnap[]
      /** Bites left in each bowl, and what's in it. */
      bowls: { bites: number; kind: Veg }[]
      preds: PredSnap[]
    }
  /** A veg was thrown: animate it from `from` to `to` over `ms`. */
  | { t: 'thrown'; by: number; kind: Veg; from: { x: number; z: number }; to: { x: number; z: number }; ms: number }
  | { t: 'shoo'; by: number; x: number; z: number }
  | { t: 'purr'; pig: number }
  | { t: 'alert'; kind: AlertKind; text: string }

const MAX_NAME = 16
/** Farmer positions further out than this are nonsense. */
const MAX_COORD = 60

export function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _\-!?.']/gu, '').trim().slice(0, MAX_NAME) : ''
  return s || 'Farmer'
}

const isNum = (v: unknown, limit = MAX_COORD): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit
const isIndex = (v: unknown, length: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length
const isVeg = (v: unknown): v is Veg => VEGGIES.includes(v as Veg)

/** Checks a message from a client. Returns null for anything malformed. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null) return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case 'join':
      return { t: 'join', name: cleanName(o.name), color: isIndex(o.color, FARMER_COLORS.length) ? o.color : 0 }
    case 'state':
      if (!isNum(o.x) || !isNum(o.z) || !isNum(o.yaw, 1e6)) return null
      return { t: 'state', x: o.x, z: o.z, yaw: o.yaw }
    case 'throw':
      if (!isVeg(o.veg) || !isNum(o.x) || !isNum(o.z)) return null
      return { t: 'throw', veg: o.veg, x: o.x, z: o.z }
    case 'plant':
    case 'harvest':
      return isIndex(o.bed, BEDS.length) ? { t: o.t, bed: o.bed } : null
    case 'fill':
      return isIndex(o.bowl, BOWLS.length) && isVeg(o.veg) ? { t: 'fill', bowl: o.bowl, veg: o.veg } : null
    case 'gather':
      return isIndex(o.food, 1e9) ? { t: 'gather', food: o.food } : null
    case 'pickup':
      return isIndex(o.pig, 1e6) ? { t: 'pickup', pig: o.pig } : null
    case 'treat':
      return ISSUES.includes(o.issue as Issue) ? { t: 'treat', issue: o.issue as Issue } : null
    case 'putdown':
    case 'cuddle':
    case 'shoo':
      return { t: o.t }
    default:
      return null
  }
}

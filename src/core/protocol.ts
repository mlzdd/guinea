import { BEDS, BOWLS, HAY_PATCHES, HAY_RACKS, HAY_STACKS, HOPPERS } from './map.ts'
import type { PigLook } from './pigs.ts'
import { EMOTES, FARMER_COLORS, ISSUES, SQUARE_IDS, UPGRADE_IDS, VEGGIES, type Issue, type SquareId, type Stat, type UpgradeId, type Veg } from './rules.ts'

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
  /** Zoomies: racing about when the zoomometer fills up. */
  | 'zoom'
  /** Poorly: sitting about in a corner, glum. */
  | 'mope'
  /** Being herded: scooting out of a farmer's way. */
  | 'scoot'
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
  /** Feet height: up on something, or mid-jump. */
  y: number
  z: number
  yaw: number
  /** Count of each veg, in VEGGIES order. */
  basket: number[]
  holding: number | null
  /** Carrying a sack of pellets (hands full). */
  sack: boolean
  /** Armfuls of hay in the basket (each takes HAY_SLOTS places). */
  hay: number
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
  /** Expecting: how well she's been looked after so far, 0..100. */
  care?: number
}

export interface FoodSnap {
  id: number
  kind: Veg | 'hay'
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

/** One of the day's jobs. */
export interface JobSnap {
  kind: Stat
  text: string
  n: number
  goal: number
}

/** A farmer's line in the farm diary: everything they've done, all time. */
export type DiaryRow = { name: string } & Record<Stat, number>

export type ClientMsg =
  | { t: 'join'; name: string; color: number }
  | { t: 'state'; x: number; y: number; z: number; yaw: number }
  /** Throw a veg (or an armful of hay) at a spot; thrown at your own feet, it's dropped. */
  | { t: 'throw'; veg: Veg | 'hay'; x: number; z: number }
  | { t: 'plant'; bed: number }
  | { t: 'harvest'; bed: number }
  | { t: 'fill'; bowl: number; veg: Veg }
  | { t: 'gather'; food: number }
  | { t: 'pickup'; pig: number }
  | { t: 'putdown' }
  | { t: 'cuddle' }
  | { t: 'treat'; issue: Issue }
  | { t: 'shoo' }
  /** At the feed bin: pick up a sack of pellets (or put it back). */
  | { t: 'sack' }
  | { t: 'pour'; hopper: number }
  /** On a patch of the hay meadow: cut an armful (or put it back). */
  | { t: 'hay'; patch: number }
  /** At a haystack in the stack yard: add your armful to it, or take one off. */
  | { t: 'stack'; stack: number }
  | { t: 'rack'; rack: number }
  | { t: 'buy'; upgrade: UpgradeId }
  /** Buy a square of land. */
  | { t: 'land'; square: SquareId }
  /** Rename the pig you're holding. */
  | { t: 'rename'; name: string }
  /** Adopt the pig you're holding (or let it go if it's already yours). */
  | { t: 'adopt' }
  | { t: 'emote'; e: number }
  /** At the salad station: put your veg in the platter, or serve it (at dusk). */
  | { t: 'salad' }
  | { t: 'serve' }
  /** Open or shut the barn door (when standing by it). */
  | { t: 'door' }
  /** Ask for the farm diary. */
  | { t: 'diary' }

export type AlertKind = 'fox' | 'hawk' | 'lost' | 'home' | 'saved' | 'night' | 'day' | 'care' | 'farmer' | 'shop' | 'fun' | 'job' | 'baby' | 'rain'

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
      /** Pellets left in each hopper (bites), and sacks left in the feed bin today. */
      hoppers: number[]
      sacks: number
      /** Hay in each rack (bites), and how grown each patch of the hay meadow is (0..1, 1 = ready to cut). */
      racks: number[]
      hayField: number[]
      /** Armfuls in each haystack in the stack yard. */
      stacks: number[]
      preds: PredSnap[]
      /** The farm's shared wallet, and what it has bought. */
      coins: number
      upgrades: UpgradeId[]
      /** Treat of the day. */
      craving: Veg
      jobs: JobSnap[]
      rain: boolean
      /** The barn door is shut. */
      door: boolean
      /** The zoomometer, 0..1: zoomies when it's full. */
      zoom: number
      /** The squares of land the farm owns. */
      land: SquareId[]
      /** The salad platter: veg in it (VEGGIES order), whether tonight's has been served, and bites left on the floor. */
      salad: { veg: number[]; served: boolean; bites: number }
    }
  /** End of a day: how it went and what it earned. */
  | { t: 'report'; day: number; lines: { label: string; coins: number }[]; total: number; stars: number; coins: number }
  /** A veg (or hay) was thrown: animate it from `from` to `to` over `ms`. */
  | { t: 'thrown'; by: number; kind: Veg | 'hay'; from: { x: number; z: number }; to: { x: number; z: number }; ms: number }
  | { t: 'shoo'; by: number; x: number; z: number }
  | { t: 'purr'; pig: number }
  | { t: 'alert'; kind: AlertKind; text: string }
  /** A pig was born, renamed, adopted, grew up or won a rosette. */
  | { t: 'pig'; look: PigLook }
  | { t: 'emote'; by: number; e: number }
  | { t: 'diary'; rows: DiaryRow[] }

const MAX_NAME = 16
/** Farmer positions further out than this are nonsense. */
const MAX_COORD = 60
const MAX_Y = 4

export function cleanName(name: unknown, fallback = 'Farmer'): string {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _\-!?.']/gu, '').trim().slice(0, MAX_NAME) : ''
  return s || fallback
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
      // Older clients don't send y; nobody gets higher than a jump off a hay stack.
      return { t: 'state', x: o.x, y: isNum(o.y, MAX_Y) ? Math.max(0, o.y) : 0, z: o.z, yaw: o.yaw }
    case 'throw':
      if ((!isVeg(o.veg) && o.veg !== 'hay') || !isNum(o.x) || !isNum(o.z)) return null
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
    case 'rack':
      return isIndex(o.rack, HAY_RACKS.length) ? { t: 'rack', rack: o.rack } : null
    case 'pour':
      return isIndex(o.hopper, HOPPERS.length) ? { t: 'pour', hopper: o.hopper } : null
    case 'buy':
      return UPGRADE_IDS.includes(o.upgrade as UpgradeId) ? { t: 'buy', upgrade: o.upgrade as UpgradeId } : null
    case 'land':
      return SQUARE_IDS.includes(o.square as SquareId) ? { t: 'land', square: o.square as SquareId } : null
    case 'rename':
      return typeof o.name === 'string' && cleanName(o.name, '') ? { t: 'rename', name: cleanName(o.name) } : null
    case 'emote':
      return isIndex(o.e, EMOTES.length) ? { t: 'emote', e: o.e } : null
    case 'hay':
      return isIndex(o.patch, HAY_PATCHES.length) ? { t: 'hay', patch: o.patch } : null
    case 'stack':
      return isIndex(o.stack, HAY_STACKS.length) ? { t: 'stack', stack: o.stack } : null
    case 'adopt':
    case 'salad':
    case 'serve':
    case 'door':
    case 'diary':
    case 'putdown':
    case 'cuddle':
    case 'shoo':
    case 'sack':
      return { t: o.t }
    default:
      return null
  }
}

import {
  BARN_IN,
  BARN_OUTER,
  BEDS,
  BED_D,
  BED_W,
  BOWLS,
  DOOR_GATE,
  DOOR_HALF,
  DOOR_MID,
  DOOR_OUT,
  FARMER_SPAWN,
  FEED_BIN,
  FENCE_EDGES,
  FOX_SOLIDS,
  HAY_PATCHES,
  HAY_RACKS,
  HOPPERS,
  PIG_HOUSES,
  PIG_SOLIDS,
  POND,
  SALAD_SPOT,
  SALAD_TABLE,
  POND_CALM,
  TREES,
  canBuy,
  clampTo,
  crosses,
  dist,
  inRect,
  isInside,
  nextStep,
  gardens,
  hideys,
  nearestFence,
  offFarm,
  onFarm,
  owns,
  pigCanStand,
  setLand,
  square,
  squareAt,
  trees,
  pushOut,
  settleFarmer,
  settlePig,
  type P,
} from './map.ts'
import { babyLook, makePigLooks, type PigLook } from './pigs.ts'
import type {
  AlertKind,
  DiaryRow,
  JobSnap,
  BedSnap,
  ClientMsg,
  FarmerSnap,
  PigSnap,
  PigState,
  PredKind,
  PredSnap,
  PredState,
  ServerMsg,
} from './protocol.ts'
import {
  APPLE_EVERY_MS,
  APPLES_PER_TREE,
  BEG_RADIUS,
  BITE_HUNGER,
  BITE_MS,
  BOWL_MAX,
  CARE_CUDDLE_S,
  CARE_OK,
  CRAVING_HAPPY,
  CUDDLE_COOLDOWN_MS,
  EMOTE_COOLDOWN_MS,
  EXCITE_RADIUS,
  FIRST_PREDATOR_MS,
  FLIGHT_BASE_MS,
  FLIGHT_PER_M_MS,
  FOOD_ROT_MS,
  FENCE_BAND,
  FOX_CARRY,
  FOX_UNDER_FENCE,
  FOX_UNDER_FENCE_CARRYING,
  FOX_EVERY_MS,
  FOX_GIVE_UP_MS,
  FOX_NOTICE,
  FOX_POUNCE,
  FOX_POUNCE_RANGE,
  FOX_RUN,
  FOX_SNEAK,
  FULL,
  GRAZE_PER_S,
  GROW_MS,
  HAWK_CARRY,
  HAWK_CIRCLE_MS,
  HAWK_EVERY_MS,
  HAWK_FEAR,
  HAWK_SHOO_EXTRA,
  HAWK_HEIGHT,
  HAWK_SWOOP,
  HAY_ARMFUL,
  HAY_RACK_MAX,
  HAY_REGROW_MS,
  HAY_TEETH,
  HUNGER_PER_S,
  HUNGRY,
  ISSUE_BIT,
  ISSUE_RATE,
  ISSUES,
  JOB_KINDS,
  JOB_PAY,
  JOBS,
  JOBS_PER_DAY,
  LAND,
  LITTER,
  LOST_MS,
  LUSH_GRAZE,
  FLOWER_HAPPY,
  POND_HAPPY,
  PREGNANCY_DAYS,
  PREGNANCY_PER_DAY,
  PREGNANT_HAPPY,
  PREGNANT_HUNGER,
  MAX_FARMERS,
  MAX_FOXES,
  MAX_GROUND_FOOD,
  NIGHT_START,
  PAY,
  PIG_COUNT,
  PIG_FLEE,
  PIG_RADIUS,
  PIG_SCURRY,
  PIG_WALK,
  PUP_DAYS,
  RAIN_CHANCE,
  RAIN_GROW,
  RAIN_MS,
  REACH,
  SALAD_BITES,
  SALAD_FROM,
  SALAD_KINDS,
  SALAD_MAX,
  SALAD_MIN,
  SACK_PELLETS,
  SEEK_RADIUS,
  SNACK_TRIP,
  SNACKY,
  SHOO_COOLDOWN_MS,
  SHOO_RADIUS,
  SHOW_PRIZE,
  SLEEP_SKIP_MS,
  START_COINS,
  STARS,
  START_LAND,
  SQUARE_IDS,
  STATS,
  THROW_RANGE,
  VEG_BITES,
  UPGRADES,
  UPGRADE_IDS,
  VEGGIES,
  ZOOMIES_HAPPY,
  ZOOMIES_MS,
  ZOOM_DRAIN,
  ZOOM_FILL_MS,
  ZOOM_HAPPY,
  basketMax,
  dayLength,
  farmDays,
  farmTime,
  daysToShow,
  growMs,
  harvestYield,
  herdMax,
  hopperMax,
  type Issue,
  type SquareId,
  type Stat,
  type UpgradeId,
  type Veg,
} from './rules.ts'
import { yawTowards } from './vec.ts'

export interface Pig extends PigLook {
  x: number
  z: number
  yaw: number
  state: PigState
  /** When a timed state (idle, graze, sleep…) ends. */
  until: number
  /** Where a moving state is heading. */
  tx: number
  tz: number
  /** The food being chased or eaten. */
  food: number | null
  nextBite: number
  /** 0 = starving, 100 = stuffed. */
  hunger: number
  happy: number
  issues: number
  heldBy: number | null
  carriedBy: number | null
  lostUntil: number
  /** 0..1: how much this pig likes being indoors. */
  homebody: number
  cuddleAt: number
  /** When it last ate hay (farm time): hay keeps teeth worn down. */
  hayAt: number
  /** While expecting: seconds she's been well looked after, out of seconds so far. */
  careGood: number
  careTotal: number
  /** For noticing a pig that is walking into a wall. */
  stuckAt: number
  stuckX: number
  stuckZ: number
}

/** Food on the ground, or a fixed source: bowls are ids 0..3, hoppers 4..5, and they never go away. */
export interface Food {
  id: number
  kind: Veg | 'pellets' | 'salad' | 'hay'
  x: number
  z: number
  bites: number
  landAt: number
  landed: boolean
  bowl: boolean
  tree: number | null
  /** The farmer who threw it or put it out (for the farm diary). */
  by: string | null
}

interface Bed {
  stage: BedSnap['stage']
  plantedAt: number
  readyAt: number
}

export interface Pred {
  id: number
  kind: PredKind
  x: number
  y: number
  z: number
  state: PredState
  /** The pig it's after or carrying. */
  pig: number | null
  since: number
  until: number
  cx: number
  cz: number
  ang: number
  tries: number
  exit: P
  retargetAt: number
  /** Has got into the barn (told everyone). */
  inBarn: boolean
}

interface Farmer {
  id: number
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  basket: number[]
  holding: number | null
  sack: boolean
  hay: boolean
  lastShoo: number
  lastEmote: number
}

export interface Outgoing {
  to: number | 'all'
  msg: ServerMsg
}

export interface FarmSave {
  /** 2: the farm grows square by square (older saves are ignored). */
  v: 2
  t: number
  land: string[]
  looks: PigLook[]
  pigs: { x: number; z: number; hunger: number; happy: number; issues: number; care?: [number, number] }[]
  beds: { stage: BedSnap['stage']; left: number }[]
  bowls: number[]
  hoppers?: number[]
  coins?: number
  upgrades?: string[]
  craving?: string
  jobs?: Job[]
  diary?: Record<string, Record<string, number>>
  door?: boolean
  zoomMeter?: number
  salad?: number[]
  saladServed?: boolean
  sacks?: number
  racks?: number[]
  /** Ms until each hay patch is ready again. */
  hayLeft?: number[]
}

interface Job {
  kind: Stat
  goal: number
  n: number
}

/** What happened today, for the end-of-day report. */
interface DayStats {
  treats: number
  saves: number
  lost: number
  /** Pigs that were caught outside after dark. */
  outAtNight: Set<number>
  /** Pigs that got a bite of the day's craving, and pigs that got a cuddle. */
  craved: Set<number>
  cuddled: Set<number>
  /** Kinds of veg in tonight's salad, once it's served. */
  salad: number
  /** Pigs that ate hay. */
  hay: Set<number>
}
const newDayStats = (): DayStats => ({ treats: 0, saves: 0, lost: 0, outAtNight: new Set(), craved: new Set(), cuddled: new Set(), salad: 0, hay: new Set() })
const zeroStats = () => Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>

const SPEED: Partial<Record<PigState, number>> = { wander: PIG_WALK, home: PIG_WALK * 1.5, seek: PIG_SCURRY, flee: PIG_FLEE, zoom: PIG_SCURRY }
/** States a pig can be interrupted out of by food, begging or nightfall. */
const CALM: PigState[] = ['idle', 'wander', 'graze', 'beg', 'popcorn', 'zoom', 'scratch', 'sneeze']
/** States that don't get shoved about by other pigs. */
const SETTLED: PigState[] = ['sleep', 'hide', 'eat']
const AWAY: PigState[] = ['held', 'carried', 'lost']
/** Food ids of the hoppers come after the bowls. */
export const HOPPER_ID = BOWLS.length
/** The served salad platter is a fixed food too, after the hoppers. */
export const SALAD_ID = HOPPER_ID + HOPPERS.length
/** Then the hay racks. */
export const RACK_ID = SALAD_ID + 1
const PIG_GAP = 0.6
const FOOD_RING = 0.45
const BOWL_RING = 0.6

const r2 = (v: number) => Math.round(v * 100) / 100
const isVeg = (k: Food['kind']): k is Veg => VEGGIES.includes(k as Veg)
const bits = (n: number) => ISSUES.reduce((c, i) => c + (n & ISSUE_BIT[i] ? 1 : 0), 0)
const DONE: Record<Issue, string> = {
  nails: 'trimmed {pig}’s nails ✂️',
  mites: 'treated {pig} for mites 🧴',
  sniffles: 'warmed {pig} up and gave them vitamin C 🍊',
  teeth: 'filed down {pig}’s teeth 🦷',
}

/**
 * The whole farm, with no networking: the server feeds it messages and the clock, then sends whatever
 * piles up in `out`. Farmers own their own movement; everything else (pigs, food, crops, predators,
 * time of day) is decided here. The farm clock `t` only moves while somebody is on.
 */
export class Farm {
  t = 0
  out: Outgoing[] = []
  pigs: Pig[]
  foods = new Map<number, Food>()
  beds: Bed[]
  preds: Pred[] = []
  farmers = new Map<number, Farmer>()
  private nextId = 100
  private nextFarmer = 1
  nextFoxAt: number
  nextHawkAt: number
  private appleAt: number[]
  private wasNight: boolean
  private readonly rand: () => number
  coins = START_COINS
  upgrades: UpgradeId[] = []
  private today: DayStats = newDayStats()
  /** The salad platter being made at the station (veg in VEGGIES order), and whether tonight's has been served. */
  salad: number[] = VEGGIES.map(() => 0)
  saladServed = false
  /** When each patch of the hay meadow is ready to cut again (farm time). */
  hayField: number[] = HAY_PATCHES.map(() => 0)
  /** Sacks of pellets left in the feed bin today: one per hopper, restocked at dawn. */
  sacks = 1
  /** The last day everyone was reminded to serve the salad. */
  private saladCalled = 0
  /** Treat of the day: the veg the pigs are craving. */
  craving: Veg = 'carrot'
  jobs: Job[] = []
  /** Everything each farmer (by name) has done, all time. */
  diary = new Map<string, Record<Stat, number>>()
  doorShut = false
  /** Today's rain shower, in farm time (none if they're equal). */
  rainFrom = 0
  rainTo = 0
  private wasRaining = false
  zoomiesUntil = 0
  /** The zoomometer, 0..1. */
  zoomMeter = 0
  /** Since when everyone's been tucked up asleep (at night), for skipping to morning. */
  private asleepSince = Infinity
  /** The squares of land the farm owns. */
  land: SquareId[] = [...START_LAND]

  constructor(rand: () => number = Math.random, save?: unknown) {
    this.rand = rand
    setLand(this.land)
    this.pigs = makePigLooks(PIG_COUNT, rand).map((look) => this.newPig(look))
    this.beds = BEDS.map((b, i) =>
      // The yard's little bed is ready to go; the rest start empty (and unbought).
      b.square === 'yard' ? { stage: i % 2 ? 'growing' : 'ripe', plantedAt: 0, readyAt: this.between(10_000, GROW_MS) } : { stage: 'empty', plantedAt: 0, readyAt: 0 },
    )
    BOWLS.forEach((b, id) => this.foods.set(id, { id, kind: 'carrot', x: b.x, z: b.z, bites: 12, landAt: 0, landed: true, bowl: true, tree: null, by: null }))
    HOPPERS.forEach((h, i) => {
      const id = HOPPER_ID + i
      this.foods.set(id, { id, kind: 'pellets', x: h.x, z: h.z, bites: i === 0 ? 30 : 0, landAt: 0, landed: true, bowl: true, tree: null, by: null })
    })
    this.foods.set(SALAD_ID, { id: SALAD_ID, kind: 'salad', ...SALAD_SPOT, bites: 0, landAt: 0, landed: true, bowl: true, tree: null, by: null })
    HAY_RACKS.forEach((r, i) => {
      // Pigs eat the hay that falls on the floor in front of the rack.
      const id = RACK_ID + i
      this.foods.set(id, { id, kind: 'hay', x: r.x, z: r.z + 0.5, bites: 0, landAt: 0, landed: true, bowl: true, tree: null, by: null })
    })
    if (save) this.load(save)
    setLand(this.land)
    // A fresh farm: a craving and jobs that don't need the dice, so tests stay put.
    if (!save || !(save as FarmSave).craving) this.craving = VEGGIES[this.day % VEGGIES.length]
    if (!this.jobs.length) {
      const kinds = this.jobKinds()
      this.jobs = this.dealJobs((i) => kinds[(this.day * JOBS_PER_DAY + i) % kinds.length])
    }
    this.appleAt = TREES.map(() => this.t + this.between(...APPLE_EVERY_MS))
    this.nextFoxAt = this.t + FIRST_PREDATOR_MS
    this.nextHawkAt = this.t + this.between(...HAWK_EVERY_MS)
    this.wasNight = this.night
  }

  private between(a: number, b: number) {
    return a + this.rand() * (b - a)
  }
  private pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rand() * xs.length)]
  }

  private newPig(look: PigLook): Pig {
    const spot = this.randomSpot(this.rand() < 0.35)
    const issues = ISSUES.reduce((n, i) => (i !== 'sniffles' && this.rand() < 0.12 ? n | ISSUE_BIT[i] : n), 0)
    return {
      ...look,
      x: spot.x,
      z: spot.z,
      yaw: this.rand() * Math.PI * 2,
      state: 'idle',
      until: this.between(0, 3000),
      tx: spot.x,
      tz: spot.z,
      food: null,
      nextBite: 0,
      hunger: this.between(50, 90),
      happy: this.between(55, 80),
      issues,
      heldBy: null,
      carriedBy: null,
      lostUntil: 0,
      homebody: this.rand(),
      cuddleAt: -1e9,
      careGood: 0,
      careTotal: 0,
      hayAt: -1e9,
      stuckAt: 0,
      stuckX: spot.x,
      stuckZ: spot.z,
    }
  }

  // ---------------------------------------------------------------- time

  /** Time of day, 0..1. 0 is dawn; night starts at NIGHT_START. */
  get dayTime() {
    return this.days % 1
  }
  get day() {
    return Math.floor(this.days) + 1
  }
  get night() {
    return this.dayTime >= NIGHT_START
  }
  /** Days since the farm began, with the fraction: what pigs' `born` and `due` are in. */
  get days() {
    return farmDays(this.t)
  }

  /** Make the map's fences and solids match this farm's land (there's one map, and tests make lots of farms). */
  private syncLand() {
    setLand(this.land)
  }

  /** Can this farm have that job yet? (No apples without an orchard.) */
  private jobKinds() {
    return JOB_KINDS.filter((k) => !JOBS[k]!.needs || this.land.includes(JOBS[k]!.needs!))
  }

  // ---------------------------------------------------------------- farmers

  join(name: string, color: number): number | null {
    if (this.farmers.size >= MAX_FARMERS) return null
    if (this.farmers.size === 0) {
      // The farm wakes up: give people a minute before anything turns up.
      this.nextFoxAt = Math.max(this.nextFoxAt, this.t + FIRST_PREDATOR_MS)
      this.nextHawkAt = Math.max(this.nextHawkAt, this.t + FIRST_PREDATOR_MS)
    }
    const id = this.nextFarmer++
    const spot = { x: FARMER_SPAWN.x + this.between(-3, 3), z: FARMER_SPAWN.z + this.between(-1, 1) }
    settleFarmer(spot)
    this.farmers.set(id, { id, name, color, ...spot, y: 0, yaw: 0, basket: VEGGIES.map(() => 0), holding: null, sack: false, hay: false, lastShoo: -1e9, lastEmote: -1e9 })
    this.alert('farmer', `👋 ${name} arrived on the farm`)
    return id
  }

  leave(id: number) {
    const f = this.farmers.get(id)
    if (!f) return
    this.putDown(f)
    this.farmers.delete(id)
    this.alert('farmer', `${f.name} went home`)
  }

  handle(id: number, msg: ClientMsg) {
    const f = this.farmers.get(id)
    if (!f) return
    this.syncLand()
    switch (msg.t) {
      case 'state':
        f.x = msg.x
        f.y = msg.y
        f.z = msg.z
        f.yaw = msg.yaw
        settleFarmer(f, f.y)
        return
      case 'throw':
        return this.throwVeg(f, msg.veg, msg)
      case 'plant': {
        const bed = this.beds[msg.bed]
        if (bed.stage !== 'empty' || !this.bedOpen(msg.bed) || !this.nearBed(f, msg.bed)) return
        bed.stage = 'growing'
        bed.plantedAt = this.t
        bed.readyAt = this.t + growMs(this.upgrades)
        this.credit(f.name, 'plant')
        return
      }
      case 'harvest': {
        const bed = this.beds[msg.bed]
        const room = basketMax(this.upgrades) - this.basketCount(f)
        if (bed.stage !== 'ripe' || room <= 0 || !this.bedOpen(msg.bed) || !this.nearBed(f, msg.bed)) return
        const picked = Math.min(harvestYield(this.upgrades), room)
        f.basket[VEGGIES.indexOf(BEDS[msg.bed].kind)] += picked
        bed.stage = 'empty'
        this.credit(f.name, 'harvest', picked)
        return
      }
      case 'fill':
        return this.fillBowl(f, msg.bowl, msg.veg)
      case 'gather': {
        const food = this.foods.get(msg.food)
        if (!food || food.bowl || !isVeg(food.kind) || !food.landed || dist(f, food) > REACH) return
        if (this.basketCount(f) >= basketMax(this.upgrades)) return
        f.basket[VEGGIES.indexOf(food.kind)]++
        this.foods.delete(food.id)
        if (food.kind === 'apple') this.credit(f.name, 'apples')
        return
      }
      case 'pickup': {
        const p = this.pigs[msg.pig]
        if (!p || f.holding !== null || f.sack || f.hay || AWAY.includes(p.state) || dist(f, p) > REACH) return
        p.state = 'held'
        p.heldBy = f.id
        p.food = null
        f.holding = p.id
        return
      }
      case 'putdown':
        return this.putDown(f)
      case 'cuddle': {
        const p = f.holding === null ? null : this.pigs[f.holding]
        if (!p || this.t - p.cuddleAt < CUDDLE_COOLDOWN_MS) return
        p.cuddleAt = this.t
        p.happy = Math.min(100, p.happy + 12)
        if (p.due !== undefined) p.careGood += CARE_CUDDLE_S
        this.out.push({ to: 'all', msg: { t: 'purr', pig: p.id } })
        if (!this.today.cuddled.has(p.id)) this.credit(f.name, 'cuddle')
        this.today.cuddled.add(p.id)
        return
      }
      case 'treat': {
        const p = f.holding === null ? null : this.pigs[f.holding]
        const bit = ISSUE_BIT[msg.issue]
        if (!p || !(p.issues & bit)) return
        p.issues &= ~bit
        p.happy = Math.min(100, p.happy + 10)
        this.today.treats++
        this.alert('care', `${f.name} ${DONE[msg.issue].replace('{pig}', p.name)}`)
        this.credit(f.name, 'fix')
        return
      }
      case 'shoo':
        return this.shoo(f)
      case 'sack':
        // Pick up a sack at the feed bin (if today's aren't all used), or put it back.
        if (f.holding !== null || f.hay || dist(f, FEED_BIN) > REACH) return
        if (f.sack) {
          f.sack = false
          this.sacks++
        } else if (this.sacks > 0) {
          f.sack = true
          this.sacks--
        }
        return
      case 'hay': {
        // Cut an armful from a patch of the hay meadow (it grows back), or put it back.
        if (f.holding !== null || f.sack || !owns('meadow') || !inRect(f, HAY_PATCHES[msg.patch], 0.8)) return
        if (f.hay) {
          f.hay = false
          this.hayField[msg.patch] = Math.min(this.hayField[msg.patch], this.t)
        } else if (this.t >= this.hayField[msg.patch]) {
          f.hay = true
          this.hayField[msg.patch] = this.t + HAY_REGROW_MS
        }
        return
      }
      case 'rack': {
        const rack = this.foods.get(RACK_ID + msg.rack)!
        if (!f.hay || dist(f, HAY_RACKS[msg.rack]) > REACH || rack.bites >= HAY_RACK_MAX) return
        f.hay = false
        rack.bites = Math.min(HAY_RACK_MAX, rack.bites + HAY_ARMFUL)
        rack.by = f.name
        this.excite(rack, EXCITE_RADIUS)
        this.credit(f.name, 'hay')
        return
      }
      case 'pour': {
        const hopper = this.foods.get(HOPPER_ID + msg.hopper)!
        const max = hopperMax(this.upgrades)
        if (!f.sack || !this.hopperBuilt(msg.hopper) || dist(f, hopper) > REACH || hopper.bites >= max) return
        f.sack = false
        hopper.bites = Math.min(max, hopper.bites + SACK_PELLETS)
        hopper.by = f.name
        this.excite(hopper, EXCITE_RADIUS)
        this.credit(f.name, 'pour')
        return
      }
      case 'land': {
        const sq = LAND[msg.square]
        if (!canBuy(msg.square, this.land) || this.coins < sq.cost) return
        this.coins -= sq.cost
        this.land.push(msg.square)
        this.syncLand()
        this.alert('shop', `🗺️ ${f.name} bought the ${sq.icon} ${sq.name}!`)
        return
      }
      case 'buy': {
        const up = UPGRADES[msg.upgrade]
        if (this.upgrades.includes(msg.upgrade) || this.coins < up.cost || (up.needs && !owns(up.needs))) return
        this.coins -= up.cost
        this.upgrades.push(msg.upgrade)
        if (msg.upgrade === 'hopper2') this.sacks++ // its first sack, today
        this.alert('shop', `🛒 ${f.name} bought ${up.icon} ${up.name}!`)
        return
      }
      case 'rename': {
        const p = f.holding === null ? null : this.pigs[f.holding]
        if (!p || p.name === msg.name) return
        this.alert('fun', `✏️ ${f.name} renamed ${p.name}: say hello to ${msg.name}!`)
        p.name = msg.name
        return this.pigChanged(p)
      }
      case 'adopt': {
        const p = f.holding === null ? null : this.pigs[f.holding]
        if (!p) return
        if (p.adopter === f.name) {
          p.adopter = undefined
        } else {
          p.adopter = f.name
          this.alert('fun', `⭐ ${f.name} adopted ${p.name}!`)
        }
        return this.pigChanged(p)
      }
      case 'emote':
        if (this.t - f.lastEmote < EMOTE_COOLDOWN_MS) return
        f.lastEmote = this.t
        this.out.push({ to: 'all', msg: { t: 'emote', by: f.id, e: msg.e } })
        return
      case 'door':
        if (dist(f, DOOR_MID) > REACH + 0.5) return
        this.doorShut = !this.doorShut
        this.alert('fun', `🚪 ${f.name} ${this.doorShut ? 'shut' : 'opened'} the barn door`)
        return
      case 'salad': {
        // Everything in your basket goes in, up to a full platter.
        if (this.saladServed || dist(f, SALAD_TABLE) > REACH) return
        let added = 0
        for (let i = 0; i < VEGGIES.length; i++) {
          const n = Math.min(f.basket[i], SALAD_MAX - this.saladSize())
          f.basket[i] -= n
          this.salad[i] += n
          added += n
        }
        if (added) this.credit(f.name, 'fill')
        return
      }
      case 'serve':
        if (dist(f, SALAD_TABLE) > REACH || !this.canServe()) return
        return this.serveSalad(f)
      case 'diary':
        this.out.push({ to: f.id, msg: { t: 'diary', rows: this.diaryRows() } })
        return
    }
  }

  saladSize() {
    return this.salad.reduce((a, b) => a + b, 0)
  }
  saladKinds() {
    return this.salad.filter((n) => n > 0).length
  }
  saladReady() {
    return this.saladSize() >= SALAD_MIN && this.saladKinds() >= SALAD_KINDS
  }
  /** Ready, not served yet tonight, and late enough in the day. */
  canServe() {
    return !this.saladServed && this.saladReady() && (this.night || this.dayTime >= SALAD_FROM)
  }

  /** Supper! The platter goes down in the barn and every pig that's not stuffed comes in for it. */
  private serveSalad(f: Farmer) {
    const kinds = this.saladKinds()
    const platter = this.foods.get(SALAD_ID)!
    platter.bites = this.saladSize() * SALAD_BITES
    platter.by = f.name
    this.salad = VEGGIES.map(() => 0)
    this.saladServed = true
    this.today.salad = kinds
    this.alert('fun', `🥗 ${f.name} served the salad platter (${kinds} kinds of veg)! Everyone in for supper!`)
    this.credit(f.name, 'salad')
    this.excite(platter, 200)
    // The ones too full to eat head in anyway.
    for (const p of this.pigs) if (!isInside(p) && CALM.includes(p.state)) this.goHome(p)
  }

  /** A farmer did something: count it in the diary and towards today's jobs. */
  credit(name: string, stat: Stat, n = 1) {
    let row = this.diary.get(name)
    if (!row) this.diary.set(name, (row = zeroStats()))
    row[stat] += n
    for (const job of this.jobs) {
      if (job.kind !== stat || job.n >= job.goal) continue
      job.n = Math.min(job.goal, job.n + n)
      if (job.n < job.goal) continue
      this.coins += JOB_PAY
      this.alert('job', `✅ Job done: ${this.jobText(job)}! +${JOB_PAY} 🪙`)
    }
  }

  private jobText(job: Job) {
    return JOBS[job.kind]!.text.replace('{n}', String(job.goal))
  }

  private dealJobs(kind: (i: number) => Stat): Job[] {
    const jobs: Job[] = []
    for (let i = 0; jobs.length < JOBS_PER_DAY && i < 50; i++) {
      const k = kind(i)
      if (!jobs.some((j) => j.kind === k)) jobs.push({ kind: k, goal: JOBS[k]!.goal, n: 0 })
    }
    return jobs
  }

  diaryRows(): DiaryRow[] {
    return [...this.diary].map(([name, row]) => ({ name, ...row }))
  }

  /** Something about a pig that everyone's client keeps (name, adopter, family, rosettes) changed. */
  private pigChanged(p: Pig) {
    this.out.push({ to: 'all', msg: { t: 'pig', look: this.lookOf(p) } })
  }

  hopperBuilt(i: number) {
    return i === 0 || this.upgrades.includes('hopper2')
  }

  basketCount(f: { basket: number[] }) {
    return f.basket.reduce((a, b) => a + b, 0)
  }

  /** Beds only work on land the farm owns. */
  bedOpen(bed: number) {
    return this.land.includes(BEDS[bed].square)
  }

  private nearBed(f: P, bed: number) {
    const b = BEDS[bed]
    const pad = REACH * 0.6
    return inRect(f, { x0: b.x - BED_W / 2, x1: b.x + BED_W / 2, z0: b.z - BED_D / 2, z1: b.z + BED_D / 2 }, pad)
  }

  private throwVeg(f: Farmer, veg: Veg, at: P) {
    const i = VEGGIES.indexOf(veg)
    if (f.holding !== null || f.sack || f.hay || f.basket[i] <= 0) return
    let dx = at.x - f.x
    let dz = at.z - f.z
    const d = Math.hypot(dx, dz)
    if (d > THROW_RANGE) {
      dx *= THROW_RANGE / d
      dz *= THROW_RANGE / d
    }
    const to = { x: f.x + dx, z: f.z + dz }
    settlePig(to, 0.25) // never lands somewhere a pig can't reach
    f.basket[i]--
    const ms = Math.round(FLIGHT_BASE_MS + Math.min(d, THROW_RANGE) * FLIGHT_PER_M_MS)
    this.addFood(veg, to, this.t + ms, null).by = f.name
    this.credit(f.name, 'fed')
    this.out.push({ to: 'all', msg: { t: 'thrown', by: f.id, kind: veg, from: { x: r2(f.x), z: r2(f.z) }, to: { x: r2(to.x), z: r2(to.z) }, ms } })
  }

  private addFood(kind: Veg, at: P, landAt: number, tree: number | null): Food {
    const ground = [...this.foods.values()].filter((x) => !x.bowl)
    if (ground.length >= MAX_GROUND_FOOD) this.foods.delete(ground[0].id)
    const food: Food = { id: this.nextId++, kind, x: at.x, z: at.z, bites: VEG_BITES[kind], landAt, landed: false, bowl: false, tree, by: null }
    this.foods.set(food.id, food)
    return food
  }

  private fillBowl(f: Farmer, bowl: number, veg: Veg) {
    const food = this.foods.get(bowl)!
    if (dist(f, food) > REACH) return
    // Use what was asked for, or whatever's in the basket.
    let i = VEGGIES.indexOf(veg)
    if (f.basket[i] <= 0) i = f.basket.findIndex((n) => n > 0)
    if (i < 0 || food.bites >= BOWL_MAX) return
    while (f.basket[i] > 0 && food.bites < BOWL_MAX) {
      f.basket[i]--
      food.bites = Math.min(BOWL_MAX, food.bites + VEG_BITES[VEGGIES[i]])
    }
    food.kind = VEGGIES[i]
    food.by = f.name
    this.excite(food, EXCITE_RADIUS)
    this.credit(f.name, 'fill')
  }

  private putDown(f: Farmer) {
    if (f.holding === null) return
    const p = this.pigs[f.holding]
    f.holding = null
    p.heldBy = null
    p.x = f.x - Math.sin(f.yaw) * 0.8
    p.z = f.z - Math.cos(f.yaw) * 0.8
    settlePig(p, PIG_RADIUS)
    this.setState(p, 'idle', 800)
  }

  private shoo(f: Farmer) {
    if (this.t - f.lastShoo < SHOO_COOLDOWN_MS) return
    f.lastShoo = this.t
    this.out.push({ to: 'all', msg: { t: 'shoo', by: f.id, x: r2(f.x), z: r2(f.z) } })
    for (const pred of this.preds) {
      const reach = SHOO_RADIUS + (pred.kind === 'hawk' ? HAWK_SHOO_EXTRA : 0)
      if (pred.state !== 'flee' && dist(f, pred) <= reach) this.scare(pred, f.name)
    }
  }

  // ---------------------------------------------------------------- the clock

  tick(dtMs: number) {
    if (this.farmers.size === 0) return
    this.syncLand()
    const dt = dtMs / 1000
    this.t += dtMs

    if (this.night !== this.wasNight) {
      this.wasNight = this.night
      if (this.night) {
        this.alert('night', '🌙 Night is falling: get the piggies in and shut the barn door (E by the door)!')
        for (const p of this.pigs) if (!isInside(p) && CALM.includes(p.state)) this.goHome(p)
      } else {
        this.doorShut = false
        this.alert('day', `☀️ Morning! Day ${this.day} on the farm. The barn door is open`)
        this.payDay()
      }
    }

    // Dusk: time for the salad.
    if (!this.saladServed && !this.night && this.dayTime >= SALAD_FROM && this.saladCalled !== this.day) {
      this.saladCalled = this.day
      this.alert('fun', this.saladReady() ? '🥗 Dusk! Serve the salad platter in the barn (E at the salad station)' : '🥗 Dusk! Make up the salad platter in the barn: 10+ veg, 3+ kinds')
    }

    // The zoomometer: charges while the herd is happy (faster the happier), drains when it isn't, rests at night.
    if (!this.night && !this.zooming) {
      const here = this.pigs.filter((p) => p.state !== 'lost')
      const avg = here.reduce((a, p) => a + p.happy, 0) / Math.max(1, here.length)
      const rate = avg >= ZOOM_HAPPY ? 1 + (avg - ZOOM_HAPPY) / (100 - ZOOM_HAPPY) : -ZOOM_DRAIN
      this.zoomMeter = Math.max(0, Math.min(1, this.zoomMeter + (rate * dtMs) / ZOOM_FILL_MS))
    }
    if (this.zoomMeter >= 1) {
      this.zoomMeter = 0
      this.zoomiesUntil = this.t + ZOOMIES_MS
      this.alert('fun', '🎉 ZOOMIES! The piggies have gone completely wild!')
      for (const p of this.pigs) if (CALM.includes(p.state) && p.happy >= ZOOMIES_HAPPY) this.zoom(p)
    }

    // Rain: everyone runs for the barn, and the garden loves it.
    if (this.raining !== this.wasRaining) {
      this.wasRaining = this.raining
      if (this.raining) {
        this.alert('rain', '🌧️ It’s raining! The piggies are running for the barn')
        for (const p of this.pigs) if (!isInside(p) && CALM.includes(p.state)) this.goIn(p)
      } else {
        this.alert('rain', '🌤️ The rain has stopped')
      }
    }
    if (this.raining) for (const bed of this.beds) if (bed.stage === 'growing') bed.readyAt -= dtMs * (RAIN_GROW - 1)
    if (this.night) for (const p of this.pigs) if (!isInside(p) && !AWAY.includes(p.state)) this.today.outAtNight.add(p.id)
    this.skipNight()

    for (const food of this.foods.values()) {
      if (!food.landed && this.t >= food.landAt) {
        food.landed = true
        this.excite(food, food.tree === null ? EXCITE_RADIUS : EXCITE_RADIUS * 0.6)
      } else if (!food.bowl && food.landed && this.t - food.landAt > FOOD_ROT_MS) {
        this.foods.delete(food.id)
      }
    }

    // Apples fall in the orchard.
    TREES.forEach((tree, i) => {
      if (this.t < this.appleAt[i] || !owns('orchard')) return
      this.appleAt[i] = this.t + this.between(...APPLE_EVERY_MS) * (this.upgrades.includes('orchard') ? 0.5 : 1)
      const under = [...this.foods.values()].filter((x) => x.tree === i).length
      if (under >= APPLES_PER_TREE) return
      const a = this.rand() * Math.PI * 2
      const d = this.between(0.8, 2.3)
      const at = { x: tree.x + Math.cos(a) * d, z: tree.z + Math.sin(a) * d }
      settlePig(at, 0.25)
      this.addFood('apple', at, this.t, i)
    })

    for (const bed of this.beds) if (bed.stage === 'growing' && this.t >= bed.readyAt) bed.stage = 'ripe'

    this.breed(dtMs)
    this.spawnPredators()
    for (const pred of [...this.preds]) this.updatePred(pred, dt)
    for (const p of this.pigs) this.updatePig(p, dt)
    this.separatePigs()
  }

  // ---------------------------------------------------------------- pigs

  private setState(p: Pig, state: PigState, ms = 0) {
    p.state = state
    p.until = this.t + ms
    if (state !== 'seek' && state !== 'eat') p.food = null
  }

  private walk(p: Pig, to: P, state: PigState) {
    p.state = state
    p.tx = to.x
    p.tz = to.z
    p.food = null
    p.stuckAt = this.t
    p.stuckX = p.x
    p.stuckZ = p.z
  }

  private seek(p: Pig, food: Food) {
    p.state = 'seek'
    p.food = food.id
    p.stuckAt = this.t
    p.stuckX = p.x
    p.stuckZ = p.z
  }

  /** Somewhere a pig could go: inside the barn or out on the lawn. */
  randomSpot(inside: boolean): P {
    for (let i = 0; i < 40; i++) {
      if (inside) {
        const p = { x: this.between(BARN_IN.x0 + 0.8, BARN_IN.x1 - 0.8), z: this.between(BARN_IN.z0 + 0.8, BARN_IN.z1 - 0.8) }
        if (pigCanStand(p, 0.4)) return p
      } else {
        // Anywhere outdoors on the farm's land.
        const s = square(this.pick(this.land.filter((id) => id !== 'barn')))
        const p = { x: this.between(s.x0 + 1, s.x1 - 1), z: this.between(s.z0 + 1, s.z1 - 1) }
        if (pigCanStand(p) && !inRect(p, BARN_OUTER, 1.5) && !gardens().some((g) => inRect(p, g, 1))) return p
      }
    }
    return inside ? { x: 0, z: -16 } : { ...DOOR_OUT }
  }

  hidden(p: P) {
    return hideys().some((h) => dist(p, h) < 1)
  }

  get raining() {
    return this.t >= this.rainFrom && this.t < this.rainTo
  }

  get zooming() {
    return this.t < this.zoomiesUntil
  }

  /** At night with the door left open, a fox can get into the barn. */
  get barnOpen() {
    return this.night && !this.doorShut
  }

  /** Where a predator can get at it: out in the open (or in the barn, for a fox, if the door's left open at night). */
  exposed(p: Pig, kind: PredKind = 'fox') {
    if (AWAY.includes(p.state) || this.hidden(p)) return false
    return !isInside(p) || (kind === 'fox' && this.barnOpen)
  }

  /**
   * Is something coming for this pig? Hawks are hard to miss. A sneaking fox is only spotted up close,
   * closer still by a pig with its face in its dinner, and not always straight away.
   */
  private threatened(p: Pig, dt: number) {
    if (this.hidden(p)) return false
    const inside = isInside(p)
    const busy = p.state === 'eat' || p.state === 'graze' || p.state === 'seek'
    return this.preds.some((pred) =>
      pred.kind === 'fox'
        ? (pred.state === 'sneak' || pred.state === 'carry') &&
          isInside(pred) === inside &&
          dist(p, pred) < (busy ? FOX_NOTICE / 2 : FOX_NOTICE) &&
          this.rand() < 3 * dt
        : !inside && (pred.state === 'circle' || pred.state === 'swoop') && dist(p, pred) < HAWK_FEAR,
    )
  }

  private flee(p: Pig) {
    if (isInside(p)) {
      // A fox in the barn: run for the pig house furthest from it.
      const fox = this.preds.filter((x) => x.kind === 'fox' && isInside(x))
      const far = (h: P) => Math.min(...fox.map((x) => dist(h, x)))
      const house = fox.length ? PIG_HOUSES.reduce((a, b) => (far(a) >= far(b) ? a : b)) : this.pick(PIG_HOUSES)
      return this.walk(p, { x: house.x + Math.cos(p.id) * 0.6, z: house.z + Math.sin(p.id) * 0.5 }, 'flee')
    }
    // Nearest hidey hut, or the barn if that's closer (and open).
    let best: P = this.randomSpot(true)
    let bestD = this.doorShut ? Infinity : dist(p, DOOR_OUT) + 2
    for (const h of hideys()) {
      const d = dist(p, h)
      if (d < bestD) {
        bestD = d
        const a = p.id * 2.4
        best = { x: h.x + Math.cos(a) * 0.3, z: h.z + Math.sin(a) * 0.2 }
      }
    }
    this.walk(p, best, 'flee')
  }

  private goHome(p: Pig) {
    if (this.doorShut && !isInside(p)) return this.waitAtDoor(p)
    // Bedtime: head for one of the little houses in the barn.
    const house = this.pick(PIG_HOUSES)
    const a = this.rand() * Math.PI * 2
    const spot = { x: house.x + Math.cos(a) * 1.2, z: house.z + Math.sin(a) * 0.9 }
    clampTo(spot, BARN_IN, 0.5)
    this.walk(p, spot, 'home')
  }

  /** In out of the rain (not to bed). */
  private goIn(p: Pig) {
    if (this.doorShut) return this.waitAtDoor(p)
    this.walk(p, this.randomSpot(true), 'home')
  }

  /** Shut out: queue up at the barn door and wheek to be let in. */
  private waitAtDoor(p: Pig) {
    const lane = (((p.id * 0.618) % 1) - 0.5) * 2 * (DOOR_HALF - 0.4)
    this.walk(p, { x: lane, z: DOOR_OUT.z + 0.3 + (p.id % 3) * 0.6 }, 'home')
  }

  /** Zoomies: a happy little leap, or a dash somewhere close by. */
  private zoom(p: Pig) {
    const a = this.rand() * Math.PI * 2
    const d = this.between(2, 5)
    const to = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }
    if (this.rand() < 0.4 || !pigCanStand(to, 0.3) || isInside(to) !== isInside(p)) return this.setState(p, 'popcorn', 1400)
    this.walk(p, to, 'zoom')
  }

  /** A spot next to another pig, for following mum or hanging out with a friend. */
  private beside(p: Pig, other: P): P {
    const a = p.id * 2.4
    return { x: other.x + Math.cos(a) * 0.7, z: other.z + Math.sin(a) * 0.7 }
  }

  /** Mum (for a pup) or best friend, if they're about on the same side of the barn wall. */
  private buddy(p: Pig, id: number | undefined): Pig | null {
    const b = id === undefined ? undefined : this.pigs[id]
    return b && !AWAY.includes(b.state) && isInside(b) === isInside(p) ? b : null
  }

  /** The closest food worth walking to. `snacks` means only veg and apples on the ground, not bowls or hoppers. */
  private findFood(p: Pig, radius: number, sameSide = false, snacks = false): Food | null {
    const inside = isInside(p)
    let best: Food | null = null
    let bestCost = radius
    for (const food of this.foods.values()) {
      if (!food.landed || food.bites <= 0 || (snacks && food.bowl)) continue
      const across = isInside(food) !== inside
      if (across && (sameSide || this.doorShut)) continue
      const cost = dist(p, food) + (across ? 6 : 0)
      if (cost < bestCost) {
        bestCost = cost
        best = food
      }
    }
    return best
  }

  /** Food just turned up: every peckish pig in earshot comes running (and wheeking). */
  private excite(food: Food, radius: number) {
    let wheeks = 0
    for (const p of this.pigs) {
      if (AWAY.includes(p.state) || p.state === 'flee' || p.state === 'hide' || p.state === 'eat') continue
      if (p.hunger >= FULL) continue
      const across = isInside(p) !== isInside(food)
      if (across && this.doorShut) continue
      const d = dist(p, food) + (across ? 4 : 0)
      if (d > (p.state === 'sleep' ? 4 : radius)) continue
      if (p.state === 'seek') {
        const current = p.food === null ? undefined : this.foods.get(p.food)
        if (current && dist(p, current) <= d) continue
      }
      this.seek(p, food)
      wheeks++
    }
    if (food.by && wheeks) this.credit(food.by, 'wheeks', wheeks)
  }

  private foodSpot(p: Pig, food: Food): P {
    // Along the front of a hay rack.
    if (food.kind === 'hay') return { x: food.x + (((p.id * 0.618) % 1) - 0.5) * 2.4, z: food.z + 0.35 }
    const a = p.id * 2.39996
    const ring = food.bowl ? BOWL_RING : FOOD_RING
    return { x: food.x + Math.cos(a) * ring, z: food.z + Math.sin(a) * ring }
  }

  private decide(p: Pig) {
    const inside = isInside(p)
    const platter = this.foods.get(SALAD_ID)!
    if (platter.bites > 0 && p.hunger < FULL && !(this.doorShut && !inside)) return this.seek(p, platter)
    if (this.night) {
      if (!inside) return this.goHome(p)
      if (p.hunger < HUNGRY) {
        const food = this.findFood(p, SEEK_RADIUS, true)
        if (food) return this.seek(p, food)
      }
      if (this.rand() < 0.3 && PIG_HOUSES.every((h) => dist(p, h) > 2.5)) return this.goHome(p)
      return this.setState(p, 'sleep', this.between(8000, 25_000))
    }
    if (this.raining && !inside) return this.goIn(p)
    if (this.zooming && p.happy >= ZOOMIES_HAPPY) return this.zoom(p)
    if (p.hunger < HUNGRY) {
      const food = this.findFood(p, SEEK_RADIUS)
      if (food) return this.seek(p, food)
    }
    // They love snacks: an apple or a bit of veg lying about is always worth a trot.
    if (p.hunger < SNACKY) {
      const snack = this.findFood(p, SEEK_RADIUS, false, true)
      if (snack) return this.seek(p, snack)
    }
    // Pups stick close to mum; everyone likes to hang out with their best friend.
    // Pups never stray far from mum: back to her side, or a nibble and a sit right next to her.
    const mum = p.age === 0 ? this.buddy(p, p.mum) : null
    if (mum && dist(p, mum) > 1.2) return this.walk(p, this.beside(p, mum), 'wander')
    if (mum) return this.setState(p, !inside && this.rand() < 0.5 ? 'graze' : 'idle', this.between(1500, 4000))
    const friend = this.buddy(p, p.friend)
    if (friend && dist(p, friend) > 2.5 && this.rand() < 0.25) return this.walk(p, this.beside(p, friend), 'wander')
    if (p.hunger < FULL && !this.raining && !(inside && this.doorShut) && this.rand() < SNACK_TRIP * (inside ? 1 - p.homebody : 1))
      return this.walk(p, this.snackSpot(), 'wander')
    if (p.issues & ISSUE_BIT.mites && this.rand() < 0.25) return this.setState(p, 'scratch', 1800)
    if (p.issues & ISSUE_BIT.sniffles && this.rand() < 0.25) return this.setState(p, 'sneeze', 1200)
    if (p.happy > 75 && this.rand() < 0.15) return this.setState(p, 'popcorn', 1600)
    const r = this.rand()
    if (!inside && p.hunger < 90 && r < 0.4) return this.setState(p, 'graze', this.between(4000, 10_000))
    if (r < 0.75) {
      const stayIn = this.raining ? 1 : inside ? 0.6 + 0.35 * p.homebody : 0.25 * p.homebody
      const goIn = this.rand() < stayIn
      return this.walk(p, this.randomSpot(this.doorShut ? inside : goIn), 'wander')
    }
    this.setState(p, 'idle', this.between(1500, 5000))
  }

  /** Somewhere snacks turn up: under an apple tree, or at the garden fence (by a ripe bed if there is one). */
  private snackSpot(): P {
    const open = BEDS.filter((_, i) => this.bedOpen(i))
    for (let i = 0; i < 20; i++) {
      let spot: P
      if (trees().length && (this.rand() < 0.5 || !open.length)) {
        const tree = this.pick(trees())
        const a = this.rand() * Math.PI * 2
        const d = this.between(0.9, 2.2)
        spot = { x: tree.x + Math.cos(a) * d, z: tree.z + Math.sin(a) * d }
      } else {
        if (!open.length) break
        const ripe = open.filter((b) => this.beds[b.id].stage === 'ripe')
        const bed = this.pick(ripe.length ? ripe : open)
        // The closest bit of the garden's fence to the bed that a pig can get at.
        const g = gardens().find((x) => x.square === bed.square)!
        const sides: P[] = [
          { x: g.x1 + 0.8, z: bed.z + this.between(-1.5, 1.5) },
          { x: bed.x + this.between(-1, 1), z: g.z0 - 0.8 },
          { x: bed.x + this.between(-1, 1), z: g.z1 + 0.8 },
        ].filter((side) => pigCanStand(side, 0.4))
        if (!sides.length) continue
        spot = sides.reduce((a, b) => (dist(a, bed) <= dist(b, bed) ? a : b))
      }
      if (pigCanStand(spot, 0.4)) return spot
    }
    return this.randomSpot(false)
  }

  /** Got to the end of a walk: peer at the veg through the garden fence, nibble under the apple trees, or just stop. */
  private arrived(p: Pig) {
    const garden = gardens().find((g) => inRect(p, g, 1.2))
    if (garden) {
      const ripe = BEDS.filter((b, i) => b.square === garden.square && this.beds[i].stage === 'ripe')
      if (ripe.length) {
        const bed = ripe.reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b))
        this.setState(p, 'beg', this.between(2500, 5000))
        p.yaw = yawTowards(p, bed)
        return
      }
    }
    if (p.hunger < 90 && trees().some((t) => dist(p, t) < 2.6)) return this.setState(p, 'graze', this.between(5000, 12_000))
    this.setState(p, 'idle', this.between(1000, 4000))
  }

  private afterMeal(p: Pig) {
    p.food = null
    if (p.hunger < FULL - 5) {
      const food = this.findFood(p, 5)
      if (food) return this.seek(p, food)
    }
    if (p.happy > 60 && this.rand() < 0.4) return this.setState(p, 'popcorn', 1600)
    this.decide(p)
  }

  /** Walks towards a point (through the door if need be). True once there. */
  private moveTo(p: Pig, to: P, speed: number, dt: number, near = 0.15): boolean {
    const step = nextStep(p, to, (((p.id * 0.618) % 1) - 0.5) * 2)
    const final = step === to
    const dx = step.x - p.x
    const dz = step.z - p.z
    const d = Math.hypot(dx, dz)
    if (final && d < near) return true
    if (d > 1e-6) {
      const move = Math.min(d, speed * dt)
      p.x += (dx / d) * move
      p.z += (dz / d) * move
      p.yaw = yawTowards({ x: 0, z: 0 }, { x: dx, z: dz })
    }
    settlePig(p, PIG_RADIUS)
    if (this.doorShut) pushOut(p, PIG_RADIUS, [DOOR_GATE])
    // Walking into a wall for a while: give up and think again.
    if (this.t - p.stuckAt > 1500) {
      const moved = Math.hypot(p.x - p.stuckX, p.z - p.stuckZ)
      p.stuckAt = this.t
      p.stuckX = p.x
      p.stuckZ = p.z
      if (moved < 0.3) {
        this.setState(p, 'idle', 500)
        return false
      }
    }
    return final && Math.hypot(to.x - p.x, to.z - p.z) < near
  }

  private updatePig(p: Pig, dt: number) {
    if (p.state === 'lost') {
      if (this.t >= p.lostUntil) this.comeBack(p)
      return
    }
    if (p.state === 'held') {
      const f = p.heldBy === null ? undefined : this.farmers.get(p.heldBy)
      if (!f) return this.setState(p, 'idle', 500)
      p.x = f.x - Math.sin(f.yaw) * 0.5
      p.z = f.z - Math.cos(f.yaw) * 0.5
      p.yaw = f.yaw
      return
    }
    if (p.state === 'carried') {
      const pred = this.preds.find((x) => x.id === p.carriedBy)
      if (pred) {
        p.x = pred.x
        p.z = pred.z
        return
      }
      p.carriedBy = null
      settlePig(p, PIG_RADIUS)
      this.flee(p)
    }

    // Needs
    const sleeping = p.state === 'sleep'
    const expecting = p.due !== undefined
    p.hunger = Math.max(0, p.hunger - HUNGER_PER_S * dt * (sleeping ? 0.4 : 1) * (expecting ? PREGNANT_HUNGER : 1))
    // The hay meadow's lush grass fills a tummy faster; the wild flowers are a treat; the pond is calming.
    const here = squareAt(p)?.id
    if (p.state === 'graze') {
      p.hunger = Math.min(100, p.hunger + GRAZE_PER_S * (here === 'meadow' ? LUSH_GRAZE : 1) * dt)
      if (here === 'flowers') p.happy = Math.min(100, p.happy + FLOWER_HAPPY * dt)
    }
    if (owns('pond') && CALM.includes(p.state) && inRect(p, POND, POND_CALM)) p.happy = Math.min(100, p.happy + POND_HAPPY * dt)
    if (expecting) {
      p.careTotal += dt
      if (p.hunger >= CARE_OK && p.happy >= CARE_OK) p.careGood += dt
    }
    const coldNight = (this.night || this.raining) && !isInside(p)
    for (const issue of ISSUES) {
      if (p.issues & ISSUE_BIT[issue]) continue
      if (issue === 'sniffles' && !coldNight) continue
      if (issue === 'teeth' && this.t - p.hayAt < dayLength(this.day) && this.rand() > HAY_TEETH) continue
      if (this.rand() < ISSUE_RATE[issue] * dt) p.issues |= ISSUE_BIT[issue]
    }
    const cosy = this.upgrades.includes('heater') && isInside(p) ? 10 : 0
    const friend = p.friend === undefined ? undefined : this.pigs[p.friend]
    const missing = friend && (friend.state === 'lost' || friend.state === 'carried') ? 10 : 0
    const content = 25 + 0.6 * p.hunger - 15 * bits(p.issues) - (coldNight ? 15 : 0) + cosy - missing
    p.happy += (Math.max(0, Math.min(100, content)) - p.happy) * Math.min(1, dt * 0.03)

    // Danger beats everything.
    if (p.state !== 'flee' && p.state !== 'hide') {
      if (this.threatened(p, dt)) return this.flee(p)
    } else if (p.state === 'hide' && this.preds.some((pred) => pred.state !== 'flee' && dist(p, pred) < HAWK_FEAR)) {
      // Stay in the hut while there's still something out there.
      p.until = Math.max(p.until, this.t + 2000)
    }

    // Hungry pigs near someone with a full basket beg.
    if (CALM.includes(p.state) && p.state !== 'beg' && p.hunger < 80 && this.rand() < 0.25 * dt) {
      for (const f of this.farmers.values()) {
        if (f.holding === null && this.basketCount(f) > 0 && dist(p, f) < BEG_RADIUS) {
          this.setState(p, 'beg', 1600)
          p.yaw = yawTowards(p, f)
          break
        }
      }
    }

    // No wandering off outside after dark.
    if (this.night && p.state === 'wander' && !isInside({ x: p.tx, z: p.tz })) return this.goHome(p)

    switch (p.state) {
      case 'seek': {
        const food = p.food === null ? undefined : this.foods.get(p.food)
        if (!food || food.bites <= 0) return this.afterMeal(p)
        if (this.moveTo(p, this.foodSpot(p, food), PIG_SCURRY, dt, 0.25)) {
          p.state = 'eat'
          p.nextBite = this.t + BITE_MS * 0.5
          p.yaw = yawTowards(p, food)
        }
        return
      }
      case 'eat': {
        const food = p.food === null ? undefined : this.foods.get(p.food)
        if (!food || food.bites <= 0) return this.afterMeal(p)
        p.yaw = yawTowards(p, food)
        if (this.t >= p.nextBite) {
          p.nextBite = this.t + BITE_MS
          food.bites--
          p.hunger = Math.min(100, p.hunger + BITE_HUNGER)
          const craved = food.kind === this.craving
          if (craved) this.today.craved.add(p.id)
          if (food.kind === 'hay') {
            p.hayAt = this.t
            this.today.hay.add(p.id)
          }
          const treat = food.kind === 'salad' ? 2 + this.today.salad : craved ? CRAVING_HAPPY : food.kind === 'pellets' || food.kind === 'hay' ? 1 : 2
          p.happy = Math.min(100, p.happy + treat)
          if (food.bites <= 0 && !food.bowl) this.foods.delete(food.id)
          if (food.bites <= 0 || p.hunger >= 100) this.afterMeal(p)
        }
        return
      }
      case 'wander':
      case 'home':
      case 'zoom':
      case 'flee': {
        const state = p.state
        if (!this.moveTo(p, { x: p.tx, z: p.tz }, SPEED[state]!, dt)) return
        if (state === 'flee') return this.setState(p, this.hidden(p) ? 'hide' : 'idle', this.between(8000, 14_000))
        if (state === 'zoom') return this.decide(p)
        if (state === 'home' && this.doorShut && !isInside(p)) {
          // Shut out: wheek at the door.
          this.setState(p, 'beg', this.between(2000, 3500))
          p.yaw = yawTowards(p, DOOR_MID)
          return
        }
        if (state === 'home' && this.night) return this.setState(p, 'sleep', this.between(15_000, 40_000))
        if (state === 'wander') return this.arrived(p)
        return this.setState(p, 'idle', this.between(1000, 4000))
      }
      default:
        if (this.t >= p.until) this.decide(p)
    }
  }

  private separatePigs() {
    const here = this.pigs.filter((p) => !AWAY.includes(p.state))
    for (let i = 0; i < here.length; i++) {
      const a = here[i]
      for (let j = i + 1; j < here.length; j++) {
        const b = here[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const d2 = dx * dx + dz * dz
        if (d2 >= PIG_GAP * PIG_GAP) continue
        const wa = SETTLED.includes(a.state) ? 0 : 1
        const wb = SETTLED.includes(b.state) ? 0 : 1
        if (wa + wb === 0) continue
        const d = Math.sqrt(d2) || 0.01
        const push = (PIG_GAP - d) / (wa + wb)
        const nx = d2 > 1e-6 ? dx / d : 1
        const nz = d2 > 1e-6 ? dz / d : 0
        a.x -= nx * push * wa
        a.z -= nz * push * wa
        b.x += nx * push * wb
        b.z += nz * push * wb
      }
    }
    for (const p of here) if (!SETTLED.includes(p.state)) settlePig(p, PIG_RADIUS)
  }

  private comeBack(p: Pig) {
    // Squeezes back in under the fence somewhere.
    const e = this.pick(FENCE_EDGES.filter((x) => !x.barn))
    const t = this.between(0.3, 0.7)
    const at = { x: e.a.x + (e.b.x - e.a.x) * t - e.out.x * 1.5, z: e.a.z + (e.b.z - e.a.z) * t - e.out.z * 1.5 }
    settlePig(at, PIG_RADIUS)
    p.x = at.x
    p.z = at.z
    p.happy = 15
    this.alert('home', `🏡 ${p.name} found their way back under the fence, a bit shaken`)
    if (this.night) this.goHome(p)
    else this.walk(p, { x: p.x - e.out.x * 3, z: p.z - e.out.z * 3 }, 'wander')
    const friend = p.friend === undefined ? undefined : this.pigs[p.friend]
    if (friend && !AWAY.includes(friend.state)) {
      this.alert('fun', `💕 ${friend.name} is so happy ${p.name} is back!`)
      friend.happy = Math.min(100, friend.happy + 15)
      if (CALM.includes(friend.state) || friend.state === 'sleep') this.setState(friend, 'popcorn', 2400)
    }
  }

  // ---------------------------------------------------------------- predators

  private spawnPredators() {
    if (this.t >= this.nextFoxAt) {
      const [a, b] = this.night ? FOX_EVERY_MS.night : FOX_EVERY_MS.day
      this.nextFoxAt = this.t + this.between(a, b) * (this.upgrades.includes('fence') ? 2 : 1)
      if (this.pigs.some((p) => this.exposed(p, 'fox')) && this.preds.filter((x) => x.kind === 'fox').length < MAX_FOXES) this.spawnFox()
    }
    if (this.t >= this.nextHawkAt) {
      this.nextHawkAt = this.t + this.between(...HAWK_EVERY_MS) * (this.upgrades.includes('scarecrow') ? 2 : 1)
      if (this.pigs.some((p) => this.exposed(p, 'hawk')) && !this.night && !this.preds.some((x) => x.kind === 'hawk')) this.spawnHawk()
    }
  }

  private newPred(kind: PredKind, at: P, y: number, state: PredState): Pred {
    const pred: Pred = {
      id: this.nextId++,
      kind,
      x: at.x,
      y,
      z: at.z,
      state,
      pig: null,
      since: this.t,
      until: 0,
      cx: at.x,
      cz: at.z,
      ang: 0,
      tries: 0,
      exit: at,
      retargetAt: 0,
      inBarn: false,
    }
    this.preds.push(pred)
    return pred
  }

  /** A fox turns up outside the fence somewhere (not behind the barn), or at `at`. */
  spawnFox(at?: P) {
    const edges = FENCE_EDGES.filter((e) => !e.barn)
    let roll = this.rand() * edges.reduce((a, e) => a + dist(e.a, e.b), 0)
    const e = edges.find((x) => (roll -= dist(x.a, x.b)) <= 0) ?? edges[0]
    const t = this.between(0.15, 0.85)
    const spot = at ?? { x: e.a.x + (e.b.x - e.a.x) * t + e.out.x * 4, z: e.a.z + (e.b.z - e.a.z) * t + e.out.z * 4 }
    this.newPred('fox', spot, 0, 'sneak')
    const side = e.out.x < 0 ? 'west' : e.out.x > 0 ? 'east' : e.out.z > 0 ? 'south' : 'north'
    this.alert('fox', `🦊 A fox is sneaking in from the ${side}!`)
  }

  spawnHawk() {
    const c = this.randomSpot(false)
    const pred = this.newPred('hawk', c, HAWK_HEIGHT, 'circle')
    pred.until = this.t + this.between(...HAWK_CIRCLE_MS)
    pred.ang = this.rand() * Math.PI * 2
    this.alert('hawk', '🦅 A hawk is circling over the farm!')
  }

  private nearestExposed(from: P, radius: number, kind: PredKind): Pig | null {
    let best: Pig | null = null
    let bestD = radius
    for (const p of this.pigs) {
      if (!this.exposed(p, kind)) continue
      const d = dist(from, p)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /**
   * The nearest way off the farm: straight out through the nearest bit of each run of fence, skipping any way that
   * runs into a garden, tree or the like. From the barn, that's out of the door first.
   */
  private exitFrom(from: P): P {
    const p = isInside(from) ? { x: from.x, z: DOOR_OUT.z } : from
    const options = FENCE_EDGES.filter((e) => !e.barn).map((e) => {
      const dx = e.b.x - e.a.x
      const dz = e.b.z - e.a.z
      const t = Math.max(0.05, Math.min(0.95, ((p.x - e.a.x) * dx + (p.z - e.a.z) * dz) / (dx * dx + dz * dz)))
      return { x: e.a.x + dx * t + e.out.x * 4, z: e.a.z + dz * t + e.out.z * 4 }
    })
    const clear = options.filter((o) => !FOX_SOLIDS.some((b) => b !== DOOR_GATE && crosses(p, o, b)))
    return (clear.length ? clear : options).reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b))
  }

  private moveFlat(pred: Pred, to: P, speed: number, dt: number, wobble = 0) {
    const dx = to.x - pred.x
    const dz = to.z - pred.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-6) return
    const move = Math.min(d, speed * dt)
    // Foxes zig-zag a little, which also stops them getting stuck square-on against a tree.
    const side = wobble * Math.sin(this.t / 300 + pred.id)
    pred.x += (dx / d) * move - (dz / d) * side * move
    pred.z += (dz / d) * move + (dx / d) * side * move
    // In through the door if it's left open at night; always able to squeeze back out.
    if (pred.kind === 'fox') pushOut(pred, 0.35, this.barnOpen || isInside(pred) ? PIG_SOLIDS : FOX_SOLIDS)
  }

  /** Where a fox heads next on the way to `to`: through the barn door if `to` is on the other side. */
  private foxStep(pred: Pred, to: P): P {
    return isInside(pred) || (this.barnOpen && isInside(to)) ? nextStep(pred, to) : to
  }

  /** Squeezing under the fence (or still outside it). */
  private atFence(p: P) {
    return !onFarm(p) || nearestFence(p).d < FENCE_BAND
  }

  private removePred(pred: Pred) {
    this.preds = this.preds.filter((x) => x !== pred)
  }

  private grab(pred: Pred, p: Pig) {
    pred.state = 'carry'
    pred.pig = p.id
    pred.exit = this.exitFrom(pred)
    p.state = 'carried'
    p.carriedBy = pred.id
    p.food = null
    p.happy = Math.max(0, p.happy - 25)
    const who = pred.kind === 'fox' ? '🦊 The fox' : '🦅 The hawk'
    this.alert(pred.kind, `${who} has grabbed ${p.name}! Quick, shoo it (F)!`)
  }

  private carriedOff(pred: Pred) {
    const p = pred.pig === null ? null : this.pigs[pred.pig]
    this.removePred(pred)
    if (!p || p.state !== 'carried') return
    p.state = 'lost'
    p.carriedBy = null
    p.lostUntil = this.t + LOST_MS
    this.today.lost++
    this.alert('lost', `The ${pred.kind} got away with ${p.name}… they’ll find their way home`)
  }

  private scare(pred: Pred, by: string) {
    const p = pred.pig === null ? null : this.pigs[pred.pig]
    this.credit(by, 'shoo')
    if (pred.state === 'carry' && p) {
      p.carriedBy = null
      p.x = pred.x
      p.z = pred.z
      settlePig(p, PIG_RADIUS)
      p.happy = Math.max(0, p.happy - 10)
      this.flee(p)
      this.today.saves++
      this.credit(by, 'save')
      this.alert('saved', `🎉 ${by} saved ${p.name} from the ${pred.kind}!`)
    } else {
      this.alert('saved', `${by} shooed the ${pred.kind} away!`)
    }
    pred.pig = null
    pred.state = 'flee'
    pred.exit = this.exitFrom(pred)
  }

  private updatePred(pred: Pred, dt: number) {
    if (pred.kind === 'fox') {
      if (pred.state === 'sneak') {
        if (this.t >= pred.retargetAt) {
          pred.retargetAt = this.t + 1000
          pred.pig = this.nearestExposed(pred, 60, 'fox')?.id ?? null
        }
        const p = pred.pig === null ? null : this.pigs[pred.pig]
        if (!p || !this.exposed(p) || this.t - pred.since > FOX_GIVE_UP_MS) {
          if (this.t - pred.since > FOX_GIVE_UP_MS || !this.pigs.some((x) => this.exposed(x, 'fox'))) {
            pred.state = 'flee'
            pred.pig = null
            pred.exit = this.exitFrom(pred)
          }
          return
        }
        const close = dist(pred, p) < FOX_POUNCE_RANGE
        const speed = this.atFence(pred) ? FOX_UNDER_FENCE * (this.upgrades.includes('fence') ? 0.5 : 1) : close ? FOX_POUNCE : FOX_SNEAK
        this.moveFlat(pred, this.foxStep(pred, p), speed, dt, close ? 0 : 0.5)
        if (isInside(pred) && !pred.inBarn) {
          pred.inBarn = true
          this.alert('fox', '🦊 A fox got into the barn! Shoo it, and shut the door at night (E by the door)')
        }
        if (dist(pred, p) < 0.6) this.grab(pred, p)
      } else {
        const carrying = pred.state === 'carry'
        const speed = carrying ? (this.atFence(pred) ? FOX_UNDER_FENCE_CARRYING : FOX_CARRY) : FOX_RUN
        this.moveFlat(pred, this.foxStep(pred, pred.exit), speed, dt)
        if (offFarm(pred, 1.5) && dist(pred, pred.exit) < 2.5) {
          if (pred.state === 'carry') this.carriedOff(pred)
          else this.removePred(pred)
        }
      }
      return
    }

    // Hawk
    switch (pred.state) {
      case 'circle':
        pred.ang += dt * 0.7
        pred.x = pred.cx + Math.cos(pred.ang) * 5
        pred.z = pred.cz + Math.sin(pred.ang) * 5
        pred.y += (HAWK_HEIGHT - pred.y) * Math.min(1, dt)
        if (this.t < pred.until) return
        {
          const p = pred.tries < 2 ? this.nearestExposed({ x: pred.cx, z: pred.cz }, 18, 'hawk') : null
          if (p) {
            pred.state = 'swoop'
            pred.pig = p.id
            pred.tries++
          } else {
            pred.state = 'flee'
            pred.exit = this.exitFrom(pred)
          }
        }
        return
      case 'swoop': {
        const p = pred.pig === null ? null : this.pigs[pred.pig]
        if (!p || !this.exposed(p, 'hawk')) {
          // Missed: back up to circle and try again.
          pred.state = 'circle'
          pred.pig = null
          pred.cx = pred.x
          pred.cz = pred.z
          pred.until = this.t + 6000
          return
        }
        const dx = p.x - pred.x
        const dy = 0.3 - pred.y
        const dz = p.z - pred.z
        const d = Math.hypot(dx, dy, dz)
        const move = Math.min(d, HAWK_SWOOP * dt)
        pred.x += (dx / d) * move
        pred.y += (dy / d) * move
        pred.z += (dz / d) * move
        if (d < 0.7) this.grab(pred, p)
        return
      }
      default:
        this.moveFlat(pred, pred.exit, pred.state === 'carry' ? HAWK_CARRY : HAWK_CARRY * 2, dt)
        pred.y = Math.min(HAWK_HEIGHT, pred.y + dt * 3)
        if (offFarm(pred, 3) && dist(pred, pred.exit) < 2) {
          if (pred.state === 'carry') this.carriedOff(pred)
          else this.removePred(pred)
        }
    }
  }

  // ---------------------------------------------------------------- money

  /** The day is done: work out how it went, pay the farm and tell everyone. */
  payDay() {
    const here = this.pigs.filter((p) => p.state !== 'lost')
    const avgHappy = here.length ? here.reduce((a, p) => a + p.happy, 0) / here.length : 0
    const d = this.today
    const lines = [
      { label: `💗 Happy piggies (${Math.round(avgHappy)}% happy)`, coins: Math.round(avgHappy * PAY.happy) },
      { label: `😋 Well fed (${here.filter((p) => p.hunger >= 50).length} of ${this.pigs.length})`, coins: here.filter((p) => p.hunger >= 50).length * PAY.fed },
      { label: `🩺 Health fixes (${d.treats})`, coins: d.treats * PAY.treat },
      { label: `🦸 Rescues (${d.saves})`, coins: d.saves * PAY.save },
      { label: `🦊 Carried off (${d.lost})`, coins: d.lost * PAY.lost },
      { label: `🌙 Out after dark (${d.outAtNight.size})`, coins: d.outAtNight.size * PAY.outAtNight },
      { label: `🤒 Still poorly (${here.filter((p) => p.issues).length})`, coins: here.filter((p) => p.issues).length * PAY.poorly },
      { label: `🤤 Fed their craving: ${this.craving}s (${d.craved.size} piggies)`, coins: d.craved.size * PAY.craving },
      { label: `🥗 Salad night (${d.salad} kinds of veg)`, coins: d.salad ? PAY.salad + d.salad * PAY.saladKind : 0 },
      { label: `🌾 Hay munchers (${d.hay.size})`, coins: d.hay.size * PAY.hay },
    ].filter((l) => l.coins !== 0)
    // Every few days, the pig show: the best-kept piggy wins a rosette and a prize.
    const winner = daysToShow(this.day - 1) === 0 ? this.bestInShow(here) : null
    if (winner) {
      winner.rosettes = (winner.rosettes ?? 0) + 1
      this.pigChanged(winner)
      lines.push({ label: `🏆 Pig show: ${winner.name} won Best in Show!`, coins: SHOW_PRIZE })
      this.alert('fun', `🏆 ${winner.name}${winner.adopter ? ` (${winner.adopter}’s piggy)` : ''} won Best in Show!`)
    }
    const total = Math.max(0, lines.reduce((a, l) => a + l.coins, 0))
    const stars = 1 + STARS.filter((s) => total >= s).length
    this.coins += total
    this.out.push({ to: 'all', msg: { t: 'report', day: this.day - 1, lines, total, stars, coins: this.coins } })
    this.newDay()
  }

  /** Happy, well fed, healthy and fussed over. */
  private bestInShow(pigs: Pig[]): Pig | null {
    const score = (p: Pig) => p.happy + p.hunger * 0.3 + (p.issues ? 0 : 20) + (this.today.cuddled.has(p.id) ? 15 : 0) + (p.age === 0 ? -50 : 0)
    return pigs.reduce<Pig | null>((best, p) => (!best || score(p) > score(best) ? p : best), null)
  }

  /** Dawn: a new craving, new jobs, maybe rain. */
  private newDay() {
    this.today = newDayStats()
    // The feed bin is restocked: a sack for each hopper.
    this.sacks = HOPPERS.filter((_, i) => this.hopperBuilt(i)).length
    // Last night's leftovers get cleared away; a new platter can be made.
    this.saladServed = false
    this.foods.get(SALAD_ID)!.bites = 0
    this.craving = this.pick(VEGGIES.filter((v) => v !== this.craving))
    this.alert('fun', `🤤 Today the piggies are craving ${this.craving}s!`)
    const kinds = this.jobKinds()
    this.jobs = this.dealJobs(() => kinds.splice(Math.floor(this.rand() * kinds.length), 1)[0])
    if (this.rand() < RAIN_CHANCE) {
      this.rainFrom = this.t + this.between(0.1, 0.5) * NIGHT_START * dayLength(this.day)
      this.rainTo = this.rainFrom + this.between(...RAIN_MS)
    } else {
      this.rainFrom = this.rainTo = 0
    }
    if (daysToShow(this.day) === 0) this.alert('fun', '🏆 Pig show tonight! Feed, cuddle and health-check everyone: the best-kept piggy wins')
  }

  /** Everyone in the barn asleep (or settling into bed), nothing prowling: why wait? On to morning. */
  private skipNight() {
    const tucked = this.night && !this.preds.length && this.pigs.every((p) => p.state === 'lost' || (isInside(p) && (p.state === 'sleep' || p.state === 'home')))
    if (!tucked) {
      this.asleepSince = Infinity
      return
    }
    this.asleepSince = Math.min(this.asleepSince, this.t)
    if (this.t - this.asleepSince < SLEEP_SKIP_MS) return
    this.asleepSince = Infinity
    this.alert('night', '😴 All the piggies are fast asleep… and it’s morning!')
    // Just before dawn, so the next tick is dawn as usual (pay day, report card).
    this.t = Math.max(this.t, farmTime(Math.floor(this.days) + 1) - 1)
  }

  /** Now and then a happy sow gets pregnant (with a boar about and room in the barn); mums give birth; pups grow up. */
  private breed(dtMs: number) {
    const boar = this.pigs.some((p) => p.sex === 'boar' && p.age > 0 && !AWAY.includes(p.state))
    // Room for everyone, counting the litters on the way (two each, say).
    let coming = this.pigs.length + this.pigs.filter((p) => p.due !== undefined).length * 2
    for (const p of [...this.pigs]) {
      if (p.due !== undefined) {
        if (this.days >= p.due && !AWAY.includes(p.state)) this.giveBirth(p)
      } else if (p.age === 0) {
        if (this.days - (p.born ?? 0) >= PUP_DAYS) {
          p.age = 1
          this.pigChanged(p)
          this.alert('baby', `🎂 ${p.name} is all grown up!`)
        }
      } else if (boar && coming + 2 <= herdMax(this.upgrades) && p.sex === 'sow' && !AWAY.includes(p.state) && p.happy >= PREGNANT_HAPPY && p.hunger >= 50) {
        if (this.rand() < (PREGNANCY_PER_DAY * dtMs) / dayLength(this.day)) {
          this.conceive(p)
          coming += 2
        }
      }
    }
  }

  conceive(p: Pig) {
    p.due = this.days + PREGNANCY_DAYS
    p.careGood = p.careTotal = 0
    this.pigChanged(p)
    this.alert('baby', `🤰 ${p.name} is expecting! Keep her well fed and happy for a bigger litter`)
  }

  /** 1–4 pups (4 is rare); fewer if mum wasn't looked after. */
  giveBirth(mum: Pig): Pig[] {
    const care = mum.careTotal > 0 ? mum.careGood / mum.careTotal : 1
    let roll = this.rand()
    let size = LITTER.findIndex((chance) => (roll -= chance) < 0) + 1 || LITTER.length
    if (care < 0.5) size = Math.min(size, 2)
    if (care < 0.25) size = 1
    size = Math.max(1, Math.min(size, herdMax(this.upgrades) - this.pigs.length))
    mum.due = undefined
    mum.happy = Math.min(100, mum.happy + 10)
    this.pigChanged(mum)
    const pups: Pig[] = []
    for (let i = 0; i < size; i++) {
      const look = babyLook(this.pigs.length, mum, this.pigs.map((p) => p.name), this.days, this.rand)
      const pup = this.newPig(look)
      const a = (i / size) * Math.PI * 2
      pup.x = pup.tx = mum.x + Math.cos(a) * 0.6
      pup.z = pup.tz = mum.z + Math.sin(a) * 0.6
      pup.hunger = pup.happy = 90
      pup.issues = 0
      pup.state = 'idle'
      settlePig(pup, PIG_RADIUS)
      this.pigs.push(pup)
      this.pigChanged(pup)
      pups.push(pup)
    }
    const names = pups.map((p) => p.name)
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
    this.alert('baby', size === 1 ? `🐣 ${mum.name} had a baby! Say hello to little ${list}` : `🐣 ${mum.name} had ${size} babies! Say hello to ${list}`)
    return pups
  }

  // ---------------------------------------------------------------- output

  private alert(kind: AlertKind, text: string) {
    this.out.push({ to: 'all', msg: { t: 'alert', kind, text } })
  }

  snapshot(): Extract<ServerMsg, { t: 'snap' }> {
    const farmers: FarmerSnap[] = [...this.farmers.values()].map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      x: r2(f.x),
      y: r2(f.y),
      z: r2(f.z),
      yaw: r2(f.yaw),
      basket: [...f.basket],
      holding: f.holding,
      sack: f.sack,
      hay: f.hay,
    }))
    const pigs: PigSnap[] = this.pigs.map((p) => ({
      id: p.id,
      x: r2(p.x),
      z: r2(p.z),
      yaw: r2(p.yaw),
      s: p.state,
      hunger: Math.round(p.hunger),
      happy: Math.round(p.happy),
      issues: p.issues,
      ...(p.due !== undefined ? { care: Math.round((100 * p.careGood) / Math.max(1, p.careTotal)) } : {}),
    }))
    const ground = [...this.foods.values()].filter((f): f is Food & { kind: Veg } => !f.bowl && f.landed && f.kind !== 'pellets')
    const preds: PredSnap[] = this.preds.map((p) => ({ id: p.id, kind: p.kind, x: r2(p.x), y: r2(p.y), z: r2(p.z), s: p.state, pig: p.pig }))
    return {
      t: 'snap',
      time: Math.round(this.dayTime * 10_000) / 10_000,
      day: this.day,
      farmers,
      pigs,
      foods: ground.map((f) => ({ id: f.id, kind: f.kind, x: r2(f.x), z: r2(f.z), bites: f.bites })),
      beds: this.beds.map((b) => ({
        stage: b.stage,
        grow: b.stage === 'growing' ? r2(Math.min(1, (this.t - b.plantedAt) / Math.max(1, b.readyAt - b.plantedAt))) : b.stage === 'ripe' ? 1 : 0,
      })),
      bowls: BOWLS.map((_, i) => {
        const bowl = this.foods.get(i)!
        return { bites: bowl.bites, kind: isVeg(bowl.kind) ? bowl.kind : 'carrot' }
      }),
      hoppers: HOPPERS.map((_, i) => this.foods.get(HOPPER_ID + i)!.bites),
      sacks: this.sacks,
      racks: HAY_RACKS.map((_, i) => this.foods.get(RACK_ID + i)!.bites),
      hayField: this.hayField.map((at) => r2(Math.max(0, Math.min(1, 1 - (at - this.t) / HAY_REGROW_MS)))),
      preds,
      coins: this.coins,
      upgrades: [...this.upgrades],
      craving: this.craving,
      jobs: this.jobs.map((j): JobSnap => ({ kind: j.kind, text: this.jobText(j), n: j.n, goal: j.goal })),
      rain: this.raining,
      door: this.doorShut,
      zoom: r2(this.zoomMeter),
      land: [...this.land],
      salad: { veg: [...this.salad], served: this.saladServed, bites: this.foods.get(SALAD_ID)!.bites },
    }
  }

  private lookOf({ id, name, breed, pattern, coat, sex, age, weight, adopter, friend, mum, born, rosettes, due }: Pig): PigLook {
    const look: PigLook = { id, name, breed, pattern, coat, sex, age, weight }
    if (adopter !== undefined) look.adopter = adopter
    if (friend !== undefined) look.friend = friend
    if (mum !== undefined) look.mum = mum
    if (born !== undefined) look.born = born
    if (rosettes) look.rosettes = rosettes
    if (due !== undefined) look.due = due
    return look
  }

  looks(): PigLook[] {
    return this.pigs.map((p) => this.lookOf(p))
  }

  // ---------------------------------------------------------------- saving

  save(): FarmSave {
    return {
      v: 2,
      t: this.t,
      land: [...this.land],
      salad: [...this.salad],
      saladServed: this.saladServed,
      looks: this.looks(),
      pigs: this.pigs.map((p) => ({
        x: r2(p.x),
        z: r2(p.z),
        hunger: r2(p.hunger),
        happy: r2(p.happy),
        issues: p.issues,
        ...(p.due !== undefined ? { care: [r2(p.careGood), r2(p.careTotal)] as [number, number] } : {}),
      })),
      beds: this.beds.map((b) => ({ stage: b.stage, left: Math.max(0, b.readyAt - this.t) })),
      bowls: BOWLS.map((_, i) => this.foods.get(i)!.bites),
      hoppers: HOPPERS.map((_, i) => this.foods.get(HOPPER_ID + i)!.bites),
      sacks: this.sacks,
      racks: HAY_RACKS.map((_, i) => this.foods.get(RACK_ID + i)!.bites),
      hayLeft: this.hayField.map((at) => Math.max(0, at - this.t)),
      coins: this.coins,
      upgrades: [...this.upgrades],
      craving: this.craving,
      jobs: this.jobs.map((j) => ({ ...j })),
      diary: Object.fromEntries(this.diary),
      door: this.doorShut,
      zoomMeter: r2(this.zoomMeter),
    }
  }

  /** Restores a saved farm. Anything that doesn't look right is ignored and the fresh farm is kept. */
  private load(raw: unknown) {
    const s = raw as Partial<FarmSave>
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    if (s?.v !== 2 || !num(s.t) || !Array.isArray(s.land) || !Array.isArray(s.looks) || !Array.isArray(s.pigs) || !Array.isArray(s.beds) || !Array.isArray(s.bowls))
      return
    if (s.looks.length !== s.pigs.length || s.looks.length === 0 || s.beds.length > BEDS.length || s.bowls.length !== BOWLS.length) return
    if (!s.pigs.every((p) => num(p?.x) && num(p?.z) && num(p?.hunger) && num(p?.happy) && num(p?.issues))) return
    this.t = s.t!
    this.land = SQUARE_IDS.filter((id) => START_LAND.includes(id) || s.land!.includes(id))
    setLand(this.land)
    this.pigs = s.looks.map((look, i) => {
      const saved = s.pigs![i]
      const p = this.newPig(look)
      p.x = p.tx = p.stuckX = saved.x
      p.z = p.tz = p.stuckZ = saved.z
      p.hunger = saved.hunger
      p.happy = saved.happy
      p.issues = saved.issues
      if (Array.isArray(saved.care) && num(saved.care[0]) && num(saved.care[1])) [p.careGood, p.careTotal] = saved.care
      p.until = this.t
      settlePig(p, PIG_RADIUS)
      return p
    })
    this.beds = BEDS.map((_, i) => {
      const b = s.beds![i] ?? { stage: 'empty', left: 0 }
      return {
        stage: b.stage === 'ripe' || b.stage === 'growing' ? b.stage : 'empty',
        plantedAt: this.t - (GROW_MS - (num(b.left) ? b.left : 0)),
        readyAt: this.t + (num(b.left) ? b.left : 0),
      }
    })
    s.bowls.forEach((bites, i) => {
      if (num(bites)) this.foods.get(i)!.bites = Math.max(0, Math.min(BOWL_MAX, bites))
    })
    // Added later: older saves don't have these.
    if (Array.isArray(s.upgrades)) this.upgrades = UPGRADE_IDS.filter((u) => s.upgrades!.includes(u))
    if (num(s.coins)) this.coins = Math.max(0, s.coins!)
    if (VEGGIES.includes(s.craving as Veg)) this.craving = s.craving as Veg
    if (Array.isArray(s.jobs))
      this.jobs = s.jobs
        .filter((j) => JOB_KINDS.includes(j?.kind) && num(j.n) && num(j.goal))
        .map((j) => ({ kind: j.kind, goal: j.goal, n: Math.min(j.goal, j.n) }))
    if (s.diary && typeof s.diary === 'object')
      for (const [name, row] of Object.entries(s.diary)) {
        const clean = zeroStats()
        for (const k of STATS) if (num(row?.[k])) clean[k] = row[k]
        this.diary.set(name, clean)
      }
    this.doorShut = s.door === true
    if (Array.isArray(s.salad) && s.salad.length === VEGGIES.length && s.salad.every(num)) this.salad = s.salad.map((n) => Math.max(0, Math.min(SALAD_MAX, n)))
    this.saladServed = s.saladServed === true
    if (num(s.sacks)) this.sacks = Math.max(0, Math.min(HOPPERS.length, s.sacks!))
    if (Array.isArray(s.hayLeft))
      s.hayLeft.slice(0, HAY_PATCHES.length).forEach((left, i) => {
        if (num(left)) this.hayField[i] = this.t + Math.max(0, Math.min(HAY_REGROW_MS, left))
      })
    if (Array.isArray(s.racks))
      s.racks.slice(0, HAY_RACKS.length).forEach((bites, i) => {
        if (num(bites)) this.foods.get(RACK_ID + i)!.bites = Math.max(0, Math.min(HAY_RACK_MAX, bites))
      })
    if (num(s.zoomMeter)) this.zoomMeter = Math.max(0, Math.min(1, s.zoomMeter!))
    // Family and friends must point at real pigs; saves from before friends pair up in twos.
    const n = this.pigs.length
    const old = !this.pigs.some((p) => p.friend !== undefined)
    for (const p of this.pigs) {
      if (old && p.mum === undefined && (p.id ^ 1) < n) p.friend = p.id ^ 1
      if (p.friend !== undefined && !(p.friend >= 0 && p.friend < n && p.friend !== p.id)) p.friend = undefined
      if (p.mum !== undefined && !(p.mum >= 0 && p.mum < n)) p.mum = undefined
    }
    if (Array.isArray(s.hoppers))
      s.hoppers.slice(0, HOPPERS.length).forEach((bites, i) => {
        if (num(bites)) this.foods.get(HOPPER_ID + i)!.bites = Math.max(0, Math.min(hopperMax(this.upgrades), bites))
      })
  }
}

import {
  BARN_IN,
  BARN_OUTER,
  BEDS,
  BED_D,
  BED_W,
  BOUNDS,
  BOWLS,
  DOOR_OUT,
  FARM_GATE,
  FARMER_SPAWN,
  FOX_SOLIDS,
  GARDEN,
  HIDEYS,
  PIG_HOUSES,
  TREES,
  clampTo,
  dist,
  inRect,
  isInside,
  nextStep,
  pigCanStand,
  pushOut,
  settleFarmer,
  settlePig,
  type P,
} from './map.ts'
import { makePigLooks, type PigLook } from './pigs.ts'
import type {
  AlertKind,
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
  BASKET_MAX,
  BEG_RADIUS,
  BITE_HUNGER,
  BITE_MS,
  BOWL_MAX,
  CUDDLE_COOLDOWN_MS,
  DAY_MS,
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
  HARVEST_YIELD,
  HAWK_CARRY,
  HAWK_CIRCLE_MS,
  HAWK_EVERY_MS,
  HAWK_FEAR,
  HAWK_SHOO_EXTRA,
  HAWK_HEIGHT,
  HAWK_SWOOP,
  HUNGER_PER_S,
  HUNGRY,
  ISSUE_BIT,
  ISSUE_RATE,
  ISSUES,
  LOST_MS,
  MAX_FARMERS,
  MAX_FOXES,
  MAX_GROUND_FOOD,
  NIGHT_START,
  PIG_COUNT,
  PIG_FLEE,
  PIG_RADIUS,
  PIG_SCURRY,
  PIG_WALK,
  REACH,
  SEEK_RADIUS,
  SHOO_COOLDOWN_MS,
  SHOO_RADIUS,
  START_TIME,
  THROW_RANGE,
  VEG_BITES,
  VEGGIES,
  type Issue,
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
  /** For noticing a pig that is walking into a wall. */
  stuckAt: number
  stuckX: number
  stuckZ: number
}

/** Food on the ground, or a bowl (bowls are ids 0..3 and never go away). */
export interface Food {
  id: number
  kind: Veg
  x: number
  z: number
  bites: number
  landAt: number
  landed: boolean
  bowl: boolean
  tree: number | null
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
}

interface Farmer {
  id: number
  name: string
  color: number
  x: number
  z: number
  yaw: number
  basket: number[]
  holding: number | null
  lastShoo: number
}

export interface Outgoing {
  to: number | 'all'
  msg: ServerMsg
}

export interface FarmSave {
  v: 1
  t: number
  looks: PigLook[]
  pigs: { x: number; z: number; hunger: number; happy: number; issues: number }[]
  beds: { stage: BedSnap['stage']; left: number }[]
  bowls: number[]
}

const SPEED: Partial<Record<PigState, number>> = { wander: PIG_WALK, home: PIG_WALK * 1.5, seek: PIG_SCURRY, flee: PIG_FLEE }
/** States a pig can be interrupted out of by food, begging or nightfall. */
const CALM: PigState[] = ['idle', 'wander', 'graze', 'beg', 'popcorn', 'scratch', 'sneeze']
/** States that don't get shoved about by other pigs. */
const SETTLED: PigState[] = ['sleep', 'hide', 'eat']
const AWAY: PigState[] = ['held', 'carried', 'lost']
const PIG_GAP = 0.6
const FOOD_RING = 0.45
const BOWL_RING = 0.6

const r2 = (v: number) => Math.round(v * 100) / 100
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

  constructor(rand: () => number = Math.random, save?: unknown) {
    this.rand = rand
    this.pigs = makePigLooks(PIG_COUNT, rand).map((look) => this.newPig(look))
    this.beds = BEDS.map((_, i) => ({ stage: i % 2 ? 'growing' : 'ripe', plantedAt: 0, readyAt: this.between(10_000, GROW_MS) }))
    BOWLS.forEach((b, id) => this.foods.set(id, { id, kind: 'carrot', x: b.x, z: b.z, bites: 12, landAt: 0, landed: true, bowl: true, tree: null }))
    if (save) this.load(save)
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
      stuckAt: 0,
      stuckX: spot.x,
      stuckZ: spot.z,
    }
  }

  // ---------------------------------------------------------------- time

  /** Time of day, 0..1. 0 is dawn; night starts at NIGHT_START. */
  get dayTime() {
    return (START_TIME + this.t / DAY_MS) % 1
  }
  get day() {
    return Math.floor(START_TIME + this.t / DAY_MS) + 1
  }
  get night() {
    return this.dayTime >= NIGHT_START
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
    this.farmers.set(id, { id, name, color, ...spot, yaw: 0, basket: VEGGIES.map(() => 0), holding: null, lastShoo: -1e9 })
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
    switch (msg.t) {
      case 'state':
        f.x = msg.x
        f.z = msg.z
        f.yaw = msg.yaw
        settleFarmer(f)
        return
      case 'throw':
        return this.throwVeg(f, msg.veg, msg)
      case 'plant': {
        const bed = this.beds[msg.bed]
        if (bed.stage !== 'empty' || !this.nearBed(f, msg.bed)) return
        bed.stage = 'growing'
        bed.plantedAt = this.t
        bed.readyAt = this.t + GROW_MS
        return
      }
      case 'harvest': {
        const bed = this.beds[msg.bed]
        const room = BASKET_MAX - this.basketCount(f)
        if (bed.stage !== 'ripe' || room <= 0 || !this.nearBed(f, msg.bed)) return
        f.basket[VEGGIES.indexOf(BEDS[msg.bed].kind)] += Math.min(HARVEST_YIELD, room)
        bed.stage = 'empty'
        return
      }
      case 'fill':
        return this.fillBowl(f, msg.bowl, msg.veg)
      case 'gather': {
        const food = this.foods.get(msg.food)
        if (!food || food.bowl || !food.landed || dist(f, food) > REACH || this.basketCount(f) >= BASKET_MAX) return
        f.basket[VEGGIES.indexOf(food.kind)]++
        this.foods.delete(food.id)
        return
      }
      case 'pickup': {
        const p = this.pigs[msg.pig]
        if (!p || f.holding !== null || AWAY.includes(p.state) || dist(f, p) > REACH) return
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
        this.out.push({ to: 'all', msg: { t: 'purr', pig: p.id } })
        return
      }
      case 'treat': {
        const p = f.holding === null ? null : this.pigs[f.holding]
        const bit = ISSUE_BIT[msg.issue]
        if (!p || !(p.issues & bit)) return
        p.issues &= ~bit
        p.happy = Math.min(100, p.happy + 10)
        this.alert('care', `${f.name} ${DONE[msg.issue].replace('{pig}', p.name)}`)
        return
      }
      case 'shoo':
        return this.shoo(f)
    }
  }

  basketCount(f: { basket: number[] }) {
    return f.basket.reduce((a, b) => a + b, 0)
  }

  private nearBed(f: P, bed: number) {
    const b = BEDS[bed]
    const pad = REACH * 0.6
    return inRect(f, { x0: b.x - BED_W / 2, x1: b.x + BED_W / 2, z0: b.z - BED_D / 2, z1: b.z + BED_D / 2 }, pad)
  }

  private throwVeg(f: Farmer, veg: Veg, at: P) {
    const i = VEGGIES.indexOf(veg)
    if (f.holding !== null || f.basket[i] <= 0) return
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
    this.addFood(veg, to, this.t + ms, null)
    this.out.push({ to: 'all', msg: { t: 'thrown', by: f.id, kind: veg, from: { x: r2(f.x), z: r2(f.z) }, to: { x: r2(to.x), z: r2(to.z) }, ms } })
  }

  private addFood(kind: Veg, at: P, landAt: number, tree: number | null): Food {
    const ground = [...this.foods.values()].filter((x) => !x.bowl)
    if (ground.length >= MAX_GROUND_FOOD) this.foods.delete(ground[0].id)
    const food: Food = { id: this.nextId++, kind, x: at.x, z: at.z, bites: VEG_BITES[kind], landAt, landed: false, bowl: false, tree }
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
    this.excite(food, EXCITE_RADIUS)
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
    const dt = dtMs / 1000
    this.t += dtMs

    if (this.night !== this.wasNight) {
      this.wasNight = this.night
      if (this.night) {
        this.alert('night', '🌙 Night is falling: get the piggies indoors!')
        for (const p of this.pigs) if (!isInside(p) && CALM.includes(p.state)) this.goHome(p)
      } else {
        this.alert('day', `☀️ Morning! Day ${this.day} on the farm`)
      }
    }

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
      if (this.t < this.appleAt[i]) return
      this.appleAt[i] = this.t + this.between(...APPLE_EVERY_MS)
      const under = [...this.foods.values()].filter((x) => x.tree === i).length
      if (under >= APPLES_PER_TREE) return
      const a = this.rand() * Math.PI * 2
      const d = this.between(0.8, 2.3)
      const at = { x: tree.x + Math.cos(a) * d, z: tree.z + Math.sin(a) * d }
      settlePig(at, 0.25)
      this.addFood('apple', at, this.t, i)
    })

    for (const bed of this.beds) if (bed.stage === 'growing' && this.t >= bed.readyAt) bed.stage = 'ripe'

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
        const p = { x: this.between(BOUNDS.x0 + 1, BOUNDS.x1 - 1), z: this.between(BOUNDS.z0 + 1, BOUNDS.z1 - 1) }
        if (pigCanStand(p) && !inRect(p, BARN_OUTER, 1.5) && !inRect(p, GARDEN, 1)) return p
      }
    }
    return inside ? { x: 0, z: -16 } : { ...DOOR_OUT }
  }

  hidden(p: P) {
    return HIDEYS.some((h) => dist(p, h) < 1)
  }

  /** Out in the open, where a predator can get at it. */
  exposed(p: Pig) {
    return !AWAY.includes(p.state) && !isInside(p) && !this.hidden(p)
  }

  /**
   * Is something coming for this pig? Hawks are hard to miss. A sneaking fox is only spotted up close,
   * closer still by a pig with its face in its dinner, and not always straight away.
   */
  private threatened(p: Pig, dt: number) {
    if (isInside(p) || this.hidden(p)) return false
    const busy = p.state === 'eat' || p.state === 'graze' || p.state === 'seek'
    return this.preds.some((pred) =>
      pred.kind === 'fox'
        ? (pred.state === 'sneak' || pred.state === 'carry') &&
          dist(p, pred) < (busy ? FOX_NOTICE / 2 : FOX_NOTICE) &&
          this.rand() < 3 * dt
        : (pred.state === 'circle' || pred.state === 'swoop') && dist(p, pred) < HAWK_FEAR,
    )
  }

  private flee(p: Pig) {
    // Nearest hidey hut, or the barn if that's closer.
    let best: P = this.randomSpot(true)
    let bestD = isInside(p) ? 0 : dist(p, DOOR_OUT) + 2
    for (const h of HIDEYS) {
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
    // Bedtime: head for one of the little houses in the barn.
    const house = this.pick(PIG_HOUSES)
    const a = this.rand() * Math.PI * 2
    const spot = { x: house.x + Math.cos(a) * 1.2, z: house.z + Math.sin(a) * 0.9 }
    clampTo(spot, BARN_IN, 0.5)
    this.walk(p, spot, 'home')
  }

  private findFood(p: Pig, radius: number, sameSide = false): Food | null {
    const inside = isInside(p)
    let best: Food | null = null
    let bestCost = radius
    for (const food of this.foods.values()) {
      if (!food.landed || food.bites <= 0) continue
      const across = isInside(food) !== inside
      if (across && sameSide) continue
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
    for (const p of this.pigs) {
      if (AWAY.includes(p.state) || p.state === 'flee' || p.state === 'hide' || p.state === 'eat') continue
      if (p.hunger >= FULL) continue
      const d = dist(p, food) + (isInside(p) !== isInside(food) ? 4 : 0)
      if (d > (p.state === 'sleep' ? 4 : radius)) continue
      if (p.state === 'seek') {
        const current = p.food === null ? undefined : this.foods.get(p.food)
        if (current && dist(p, current) <= d) continue
      }
      this.seek(p, food)
    }
  }

  private foodSpot(p: Pig, food: Food): P {
    const a = p.id * 2.39996
    const ring = food.bowl ? BOWL_RING : FOOD_RING
    return { x: food.x + Math.cos(a) * ring, z: food.z + Math.sin(a) * ring }
  }

  private decide(p: Pig) {
    const inside = isInside(p)
    if (this.night) {
      if (!inside) return this.goHome(p)
      if (p.hunger < HUNGRY) {
        const food = this.findFood(p, SEEK_RADIUS, true)
        if (food) return this.seek(p, food)
      }
      if (this.rand() < 0.3 && PIG_HOUSES.every((h) => dist(p, h) > 2.5)) return this.goHome(p)
      return this.setState(p, 'sleep', this.between(8000, 25_000))
    }
    if (p.hunger < HUNGRY) {
      const food = this.findFood(p, SEEK_RADIUS)
      if (food) return this.seek(p, food)
    }
    if (p.issues & ISSUE_BIT.mites && this.rand() < 0.25) return this.setState(p, 'scratch', 1800)
    if (p.issues & ISSUE_BIT.sniffles && this.rand() < 0.25) return this.setState(p, 'sneeze', 1200)
    if (p.happy > 75 && this.rand() < 0.15) return this.setState(p, 'popcorn', 1600)
    const r = this.rand()
    if (!inside && p.hunger < 90 && r < 0.4) return this.setState(p, 'graze', this.between(4000, 10_000))
    if (r < 0.75) {
      const stayIn = inside ? 0.6 + 0.35 * p.homebody : 0.25 * p.homebody
      return this.walk(p, this.randomSpot(this.rand() < stayIn), 'wander')
    }
    this.setState(p, 'idle', this.between(1500, 5000))
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
    p.hunger = Math.max(0, p.hunger - HUNGER_PER_S * dt * (sleeping ? 0.4 : 1))
    if (p.state === 'graze') p.hunger = Math.min(100, p.hunger + GRAZE_PER_S * dt)
    const coldNight = this.night && !isInside(p)
    for (const issue of ISSUES) {
      if (p.issues & ISSUE_BIT[issue]) continue
      if (issue === 'sniffles' && !coldNight) continue
      if (this.rand() < ISSUE_RATE[issue] * dt) p.issues |= ISSUE_BIT[issue]
    }
    const content = 25 + 0.6 * p.hunger - 15 * bits(p.issues) - (coldNight ? 15 : 0)
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
          p.happy = Math.min(100, p.happy + 2)
          if (food.bites <= 0 && !food.bowl) this.foods.delete(food.id)
          if (food.bites <= 0 || p.hunger >= 100) this.afterMeal(p)
        }
        return
      }
      case 'wander':
      case 'home':
      case 'flee': {
        const state = p.state
        if (!this.moveTo(p, { x: p.tx, z: p.tz }, SPEED[state]!, dt)) return
        if (state === 'flee') return this.setState(p, this.hidden(p) ? 'hide' : 'idle', this.between(8000, 14_000))
        if (state === 'home' && this.night) return this.setState(p, 'sleep', this.between(15_000, 40_000))
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
    p.x = FARM_GATE.x + this.between(-1.5, 1.5)
    p.z = FARM_GATE.z
    p.happy = 15
    this.alert('home', `🏡 ${p.name} found their way back to the gate, a bit shaken`)
    if (this.night) this.goHome(p)
    else this.walk(p, { x: p.x, z: p.z - 3 }, 'wander')
  }

  // ---------------------------------------------------------------- predators

  private spawnPredators() {
    const outside = this.pigs.some((p) => this.exposed(p))
    if (this.t >= this.nextFoxAt) {
      const [a, b] = this.night ? FOX_EVERY_MS.night : FOX_EVERY_MS.day
      this.nextFoxAt = this.t + this.between(a, b)
      if (outside && this.preds.filter((x) => x.kind === 'fox').length < MAX_FOXES) this.spawnFox()
    }
    if (this.t >= this.nextHawkAt) {
      this.nextHawkAt = this.t + this.between(...HAWK_EVERY_MS)
      if (outside && !this.night && !this.preds.some((x) => x.kind === 'hawk')) this.spawnHawk()
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
    }
    this.preds.push(pred)
    return pred
  }

  spawnFox(side = this.pick(['west', 'east', 'south'] as const)) {
    // Away from the veggie garden, which foxes can't get through.
    const at =
      side === 'west'
        ? { x: BOUNDS.x0 - 4, z: this.pick([this.between(-9, -7.5), this.between(20, 24)]) }
        : side === 'east'
          ? { x: BOUNDS.x1 + 4, z: this.between(-8, 24) }
          : { x: this.between(-12, 28), z: BOUNDS.z1 + 4 }
    this.newPred('fox', at, 0, 'sneak')
    this.alert('fox', `🦊 A fox is sneaking in from the ${side}!`)
  }

  spawnHawk() {
    const c = this.randomSpot(false)
    const pred = this.newPred('hawk', c, HAWK_HEIGHT, 'circle')
    pred.until = this.t + this.between(...HAWK_CIRCLE_MS)
    pred.ang = this.rand() * Math.PI * 2
    this.alert('hawk', '🦅 A hawk is circling over the farm!')
  }

  private nearestExposed(from: P, radius: number): Pig | null {
    let best: Pig | null = null
    let bestD = radius
    for (const p of this.pigs) {
      if (!this.exposed(p)) continue
      const d = dist(from, p)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /** The nearest point off the farm (not through the barn). */
  private exitFrom(p: P): P {
    const options: P[] = [
      { x: BOUNDS.x0 - 4, z: p.z },
      { x: BOUNDS.x1 + 4, z: p.z },
      { x: p.x, z: BOUNDS.z1 + 4 },
    ]
    if (Math.abs(p.x) > 13) options.push({ x: p.x, z: BOUNDS.z0 - 4 })
    // Not through the garden either.
    const ok = options.filter((o) => !(o.x < 0 && p.z > GARDEN.z0 - 1 && p.z < GARDEN.z1 + 1 && o.z === p.z))
    return ok.reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b))
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
    if (pred.kind === 'fox') pushOut(pred, 0.35, FOX_SOLIDS)
  }

  /** Squeezing under the fence (or still outside it). */
  private atFence(p: P) {
    return !inRect(p, BOUNDS, -FENCE_BAND)
  }

  private offFarm(p: P, pad: number) {
    return !inRect(p, BOUNDS, pad)
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
    this.alert('lost', `The ${pred.kind} got away with ${p.name}… they’ll find their way home`)
  }

  private scare(pred: Pred, by: string) {
    const p = pred.pig === null ? null : this.pigs[pred.pig]
    if (pred.state === 'carry' && p) {
      p.carriedBy = null
      p.x = pred.x
      p.z = pred.z
      settlePig(p, PIG_RADIUS)
      p.happy = Math.max(0, p.happy - 10)
      this.flee(p)
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
          pred.pig = this.nearestExposed(pred, 60)?.id ?? null
        }
        const p = pred.pig === null ? null : this.pigs[pred.pig]
        if (!p || !this.exposed(p) || this.t - pred.since > FOX_GIVE_UP_MS) {
          if (this.t - pred.since > FOX_GIVE_UP_MS || !this.pigs.some((x) => this.exposed(x))) {
            pred.state = 'flee'
            pred.pig = null
            pred.exit = this.exitFrom(pred)
          }
          return
        }
        const close = dist(pred, p) < FOX_POUNCE_RANGE
        const speed = this.atFence(pred) ? FOX_UNDER_FENCE : close ? FOX_POUNCE : FOX_SNEAK
        this.moveFlat(pred, p, speed, dt, close ? 0 : 0.5)
        if (dist(pred, p) < 0.6) this.grab(pred, p)
      } else {
        const carrying = pred.state === 'carry'
        const speed = carrying ? (this.atFence(pred) ? FOX_UNDER_FENCE_CARRYING : FOX_CARRY) : FOX_RUN
        this.moveFlat(pred, pred.exit, speed, dt)
        if (this.offFarm(pred, 1.5) && dist(pred, pred.exit) < 2.5) {
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
          const p = pred.tries < 2 ? this.nearestExposed({ x: pred.cx, z: pred.cz }, 18) : null
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
        if (!p || !this.exposed(p)) {
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
        if (this.offFarm(pred, 3) && dist(pred, pred.exit) < 2) {
          if (pred.state === 'carry') this.carriedOff(pred)
          else this.removePred(pred)
        }
    }
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
      z: r2(f.z),
      yaw: r2(f.yaw),
      basket: [...f.basket],
      holding: f.holding,
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
    }))
    const ground = [...this.foods.values()].filter((f) => !f.bowl && f.landed)
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
      bowls: BOWLS.map((_, i) => ({ bites: this.foods.get(i)!.bites, kind: this.foods.get(i)!.kind })),
      preds,
    }
  }

  looks(): PigLook[] {
    return this.pigs.map(({ id, name, breed, pattern, coat, sex, age, weight }) => ({ id, name, breed, pattern, coat, sex, age, weight }))
  }

  // ---------------------------------------------------------------- saving

  save(): FarmSave {
    return {
      v: 1,
      t: this.t,
      looks: this.looks(),
      pigs: this.pigs.map((p) => ({ x: r2(p.x), z: r2(p.z), hunger: r2(p.hunger), happy: r2(p.happy), issues: p.issues })),
      beds: this.beds.map((b) => ({ stage: b.stage, left: Math.max(0, b.readyAt - this.t) })),
      bowls: BOWLS.map((_, i) => this.foods.get(i)!.bites),
    }
  }

  /** Restores a saved farm. Anything that doesn't look right is ignored and the fresh farm is kept. */
  private load(raw: unknown) {
    const s = raw as Partial<FarmSave>
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    if (s?.v !== 1 || !num(s.t) || !Array.isArray(s.looks) || !Array.isArray(s.pigs) || !Array.isArray(s.beds) || !Array.isArray(s.bowls))
      return
    if (s.looks.length !== s.pigs.length || s.looks.length === 0 || s.beds.length !== BEDS.length || s.bowls.length !== BOWLS.length) return
    if (!s.pigs.every((p) => num(p?.x) && num(p?.z) && num(p?.hunger) && num(p?.happy) && num(p?.issues))) return
    this.t = s.t!
    this.pigs = s.looks.map((look, i) => {
      const saved = s.pigs![i]
      const p = this.newPig(look)
      p.x = p.tx = p.stuckX = saved.x
      p.z = p.tz = p.stuckZ = saved.z
      p.hunger = saved.hunger
      p.happy = saved.happy
      p.issues = saved.issues
      p.until = this.t
      settlePig(p, PIG_RADIUS)
      return p
    })
    this.beds = s.beds.map((b) => ({
      stage: b.stage === 'ripe' || b.stage === 'growing' ? b.stage : 'empty',
      plantedAt: this.t - (GROW_MS - (num(b.left) ? b.left : 0)),
      readyAt: this.t + (num(b.left) ? b.left : 0),
    }))
    s.bowls.forEach((bites, i) => {
      if (num(bites)) this.foods.get(i)!.bites = Math.max(0, Math.min(BOWL_MAX, bites))
    })
  }
}

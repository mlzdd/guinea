import { describe, expect, it } from 'vitest'
import { Farm, HOPPER_ID, type Pig } from '../../src/core/farm.ts'
import { BEDS, BOWLS, FARM_GATE, FEED_BIN, HOPPERS, isInside, pigCanStand } from '../../src/core/map.ts'
import { parseClientMsg } from '../../src/core/protocol.ts'
import {
  BASKET_MAX,
  BOWL_MAX,
  DAY_MS,
  GROW_MS,
  HARVEST_YIELD,
  ISSUE_BIT,
  LOST_MS,
  NIGHT_START,
  SACK_PELLETS,
  UPGRADES,
  START_TIME,
  THROW_RANGE,
  TICK_MS,
  VEGGIES,
} from '../../src/core/rules.ts'

/** Seeded random so every run is the same. */
function seeded(seed = 1) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A farm with one farmer and no predators, unless a test asks for them. */
function setup(seed = 1) {
  const farm = new Farm(seeded(seed))
  const id = farm.join('Ann', 0)!
  farm.nextFoxAt = farm.nextHawkAt = Infinity
  const me = farm.farmers.get(id)!
  return { farm, id, me }
}

function run(farm: Farm, ms: number, until?: () => boolean) {
  for (let t = 0; t < ms; t += TICK_MS) {
    farm.tick(TICK_MS)
    if (until?.()) return true
  }
  return false
}

const veg = (name: (typeof VEGGIES)[number]) => VEGGIES.indexOf(name)

/** Puts one pig somewhere and sends every other pig far away and stuffed, so they stay out of it. */
function lonePig(farm: Farm, x: number, z: number, hunger = 30): Pig {
  for (const p of farm.pigs) {
    p.hunger = 100
    p.x = 28
    p.z = -20
    p.state = 'sleep'
    p.until = Infinity
  }
  const p = farm.pigs[0]
  Object.assign(p, { x, z, hunger, state: 'idle', until: Infinity, issues: 0 })
  return p
}

describe('feeding', () => {
  it('a thrown carrot brings a hungry pig running, and it eats it all up', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 6, 6)
    Object.assign(me, { x: 0, z: 6 })
    me.basket[veg('carrot')] = 2
    farm.handle(id, { t: 'throw', veg: 'carrot', x: 3, z: 6 })
    expect(me.basket[veg('carrot')]).toBe(1)
    expect(farm.out.some((o) => o.msg.t === 'thrown')).toBe(true)
    // Nothing happens until it lands.
    expect(pig.state).toBe('idle')

    expect(run(farm, 1000, () => pig.state === 'seek')).toBe(true)
    expect(run(farm, 3000, () => pig.state === 'eat')).toBe(true)
    const food = [...farm.foods.values()].find((f) => !f.bowl)!
    expect(food.kind).toBe('carrot')
    run(farm, 5000, () => !farm.foods.has(food.id))
    expect(farm.foods.has(food.id)).toBe(false)
    expect(pig.hunger).toBeGreaterThan(45)
  })

  it('throws need veg in the basket, are capped at throwing range and land where pigs can reach', () => {
    const { farm, id, me } = setup()
    Object.assign(me, { x: 0, z: 0 })
    farm.handle(id, { t: 'throw', veg: 'lettuce', x: 3, z: 0 })
    expect(farm.out.some((o) => o.msg.t === 'thrown')).toBe(false)

    me.basket[veg('lettuce')] = 3
    farm.handle(id, { t: 'throw', veg: 'lettuce', x: 40, z: 0 })
    const thrown = farm.out.find((o) => o.msg.t === 'thrown')!.msg
    if (thrown.t !== 'thrown') throw new Error()
    expect(thrown.to.x).toBeCloseTo(THROW_RANGE, 0)

    // Into the veggie garden: it bounces out onto the lawn.
    Object.assign(me, { x: -13, z: 6 })
    farm.handle(id, { t: 'throw', veg: 'lettuce', x: -22, z: 6 })
    const last = [...farm.foods.values()].at(-1)!
    expect(pigCanStand(last, 0.2)).toBe(true)
  })

  it('farmers fill bowls from their basket and indoor pigs come to eat', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 0, -15)
    farm.foods.get(1)!.bites = 0
    Object.assign(me, { x: BOWLS[1].x, z: BOWLS[1].z + 1.5 })
    me.basket[veg('cucumber')] = 10
    farm.handle(id, { t: 'fill', bowl: 1, veg: 'cucumber' })
    expect(farm.foods.get(1)!.bites).toBe(BOWL_MAX)
    expect(me.basket[veg('cucumber')]).toBe(2) // only as many as fit
    expect(pig.state).toBe('seek')
    expect(run(farm, 5000, () => pig.state === 'eat')).toBe(true)
    // Asking for a veg you don't have uses whatever you've got.
    farm.foods.get(0)!.bites = 0
    Object.assign(me, { x: BOWLS[0].x, z: BOWLS[0].z + 1 })
    farm.handle(id, { t: 'fill', bowl: 0, veg: 'apple' })
    expect(farm.foods.get(0)!.bites).toBe(6)
  })

  it('hungry pigs beg from a farmer carrying veg', () => {
    const { farm, me } = setup()
    const pig = lonePig(farm, 5, 5, 70) // peckish, but not hungry enough to go looking
    Object.assign(me, { x: 7, z: 5 })
    me.basket[veg('pepper')] = 1
    let begged = false
    for (let i = 0; i < 2000 && !begged; i++) {
      Object.assign(pig, { x: 5, z: 5, hunger: 70 })
      if (pig.state !== 'beg') Object.assign(pig, { state: 'idle', until: Infinity })
      farm.tick(TICK_MS)
      begged = pig.state === 'beg'
    }
    expect(begged).toBe(true)
  })
})

describe('garden', () => {
  it('ripe beds harvest into the basket, then can be replanted and regrow', () => {
    const { farm, id, me } = setup()
    const bed = BEDS[0]
    farm.beds[0].stage = 'ripe'
    // Too far away
    Object.assign(me, { x: 0, z: 0 })
    farm.handle(id, { t: 'harvest', bed: 0 })
    expect(farm.beds[0].stage).toBe('ripe')

    Object.assign(me, { x: bed.x + 2, z: bed.z })
    farm.handle(id, { t: 'harvest', bed: 0 })
    expect(me.basket[veg(bed.kind)]).toBe(HARVEST_YIELD)
    expect(farm.beds[0].stage).toBe('empty')

    farm.handle(id, { t: 'plant', bed: 0 })
    expect(farm.beds[0].stage).toBe('growing')
    run(farm, GROW_MS / 2)
    expect(farm.snapshot().beds[0].grow).toBeCloseTo(0.5, 1)
    run(farm, GROW_MS / 2 + 100)
    expect(farm.beds[0].stage).toBe('ripe')
  })

  it('the basket only holds so much', () => {
    const { farm, id, me } = setup()
    farm.beds[0].stage = 'ripe'
    me.basket[veg('apple')] = BASKET_MAX - 1
    Object.assign(me, { x: BEDS[0].x + 2, z: BEDS[0].z })
    farm.handle(id, { t: 'harvest', bed: 0 })
    expect(farm.basketCount(me)).toBe(BASKET_MAX)
  })

  it('apples fall in the orchard and can be gathered', () => {
    const { farm, id, me } = setup()
    run(farm, 61_000)
    const apple = [...farm.foods.values()].find((f) => f.kind === 'apple')!
    expect(apple).toBeDefined()
    Object.assign(me, { x: apple.x + 1, z: apple.z })
    farm.handle(id, { t: 'gather', food: apple.id })
    expect(me.basket[veg('apple')]).toBe(1)
    expect(farm.foods.has(apple.id)).toBe(false)
  })
})

describe('health checks', () => {
  it('pick up a pig, treat what is wrong, cuddle, put down', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 2, 2, 80)
    pig.issues = ISSUE_BIT.nails | ISSUE_BIT.mites
    Object.assign(me, { x: 10, z: 10 })
    farm.handle(id, { t: 'pickup', pig: 0 })
    expect(me.holding).toBeNull() // too far

    Object.assign(me, { x: 3, z: 2 })
    farm.handle(id, { t: 'pickup', pig: 0 })
    expect(me.holding).toBe(0)
    expect(pig.state).toBe('held')
    farm.tick(TICK_MS)
    expect(Math.hypot(pig.x - me.x, pig.z - me.z)).toBeLessThan(1)

    const before = pig.happy
    farm.handle(id, { t: 'treat', issue: 'nails' })
    expect(pig.issues).toBe(ISSUE_BIT.mites)
    farm.handle(id, { t: 'treat', issue: 'teeth' }) // nothing wrong with its teeth
    expect(pig.issues).toBe(ISSUE_BIT.mites)
    farm.handle(id, { t: 'cuddle' })
    farm.handle(id, { t: 'cuddle' }) // too soon, doesn't count twice
    expect(farm.out.filter((o) => o.msg.t === 'purr')).toHaveLength(1)
    expect(pig.happy).toBeGreaterThan(before + 15)

    // Can't throw while your hands are full.
    me.basket[0] = 1
    farm.handle(id, { t: 'throw', veg: 'carrot', x: 5, z: 5 })
    expect(me.basket[0]).toBe(1)

    farm.handle(id, { t: 'putdown' })
    expect(me.holding).toBeNull()
    expect(pig.state).toBe('idle')
  })

  it('a pig is put down when its farmer leaves', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 2, 2, 80)
    Object.assign(me, { x: 3, z: 2 })
    farm.handle(id, { t: 'pickup', pig: 0 })
    farm.leave(id)
    expect(pig.state).toBe('idle')
    expect(pig.heldBy).toBeNull()
  })
})

describe('predators', () => {
  it('a fox grabs a pig out in the open, and shooing it makes it drop the pig', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 20, 22, 90)
    Object.assign(me, { x: -20, z: 22 })
    farm.spawnFox('south')
    const fox = farm.preds[0]
    Object.assign(fox, { x: 20.4, z: 22 })
    farm.tick(TICK_MS)
    expect(pig.state).toBe('carried')
    expect(fox.state).toBe('carry')

    // Too far away to scare it
    farm.handle(id, { t: 'shoo' })
    expect(fox.state).toBe('carry')
    Object.assign(me, { x: fox.x - 2, z: fox.z })
    run(farm, 600)
    farm.handle(id, { t: 'shoo' })
    expect(fox.state).toBe('flee')
    expect(pig.state).toBe('flee')
    expect(farm.out.some((o) => o.msg.t === 'alert' && o.msg.kind === 'saved')).toBe(true)
    expect(run(farm, 10_000, () => farm.preds.length === 0)).toBe(true)
  })

  it('a pig the fox gets away with comes back to the gate later', () => {
    const { farm } = setup()
    const pig = lonePig(farm, 28, 22, 90)
    farm.spawnFox('east')
    Object.assign(farm.preds[0], { x: 28.4, z: 22 })
    expect(run(farm, 30_000, () => pig.state === 'lost')).toBe(true)
    expect(farm.preds).toHaveLength(0)
    expect(farm.snapshot().pigs[0].s).toBe('lost')
    expect(run(farm, LOST_MS + 1000, () => pig.state !== 'lost')).toBe(true)
    expect(Math.hypot(pig.x - FARM_GATE.x, pig.z - FARM_GATE.z)).toBeLessThan(5)
    expect(pig.happy).toBeLessThan(30)
  })

  it('pigs run from a fox they notice, and a fox with nobody to catch gives up', () => {
    const { farm } = setup()
    const pig = lonePig(farm, 2, 3, 90)
    farm.spawnFox('south')
    Object.assign(farm.preds[0], { x: 2, z: 6.2 })
    expect(run(farm, 400, () => pig.state === 'flee')).toBe(true)
    expect(run(farm, 8000, () => pig.state === 'hide' || isInside(pig))).toBe(true)
    expect(run(farm, 60_000, () => farm.preds.length === 0)).toBe(true)
    expect(pig.state).not.toBe('carried')
  })

  it('a hawk circles, swoops on a pig in the open, and can be shooed', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 20, 21, 90)
    farm.spawnHawk()
    const hawk = farm.preds[0]
    Object.assign(hawk, { cx: 20, cz: 20, until: farm.t + 100 })
    // Keep the pig from running off so the swoop can land.
    let grabbed = false
    for (let i = 0; i < 400 && !grabbed; i++) {
      Object.assign(pig, { x: 20, z: 21, state: 'idle', until: Infinity })
      farm.tick(TICK_MS)
      grabbed = (pig.state as string) === 'carried'
    }
    expect(grabbed).toBe(true)
    Object.assign(me, { x: hawk.x + 1, z: hawk.z })
    farm.handle(id, { t: 'shoo' })
    expect(hawk.state).toBe('flee')
    expect(pig.state).toBe('flee')
  })
})

describe('day and night', () => {
  it('at nightfall the pigs head into the barn and go to sleep', () => {
    const { farm } = setup(3)
    farm.t = (NIGHT_START - START_TIME) * DAY_MS - 2000
    run(farm, 3000)
    expect(farm.night).toBe(true)
    expect(farm.out.some((o) => o.msg.t === 'alert' && o.msg.kind === 'night')).toBe(true)
    // Plenty of time to waddle home, door and all.
    run(farm, 60_000, () => farm.pigs.every((p) => isInside(p)))
    const outside = farm.pigs.filter((p) => !isInside(p)).map((p) => `${p.name} ${p.state} ${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    expect(outside).toEqual([])
    run(farm, 20_000)
    expect(farm.pigs.filter((p) => p.state === 'sleep').length).toBeGreaterThan(farm.pigs.length / 2)
  })

  it('the farm clock stops while nobody is on', () => {
    const farm = new Farm(seeded())
    farm.tick(10_000)
    expect(farm.t).toBe(0)
  })
})

describe('saving', () => {
  it('a saved farm loads back the same pigs, beds and bowls', () => {
    const { farm } = setup()
    run(farm, 5000)
    farm.pigs[3].issues = ISSUE_BIT.teeth
    farm.beds[2].stage = 'empty'
    const saved = JSON.parse(JSON.stringify(farm.save()))
    const again = new Farm(seeded(99), saved)
    expect(again.looks()).toEqual(farm.looks())
    expect(again.pigs[3].issues).toBe(ISSUE_BIT.teeth)
    expect(again.pigs.map((p) => Math.round(p.hunger))).toEqual(farm.pigs.map((p) => Math.round(p.hunger)))
    expect(again.beds[2].stage).toBe('empty')
    expect(again.t).toBe(farm.t)
  })

  it('a broken save is ignored', () => {
    const farm = new Farm(seeded(), { v: 1, t: 'soon', pigs: 'lots' })
    expect(farm.pigs.length).toBeGreaterThan(0)
    expect(farm.t).toBe(0)
  })
})

describe('the farm over time', () => {
  it('a busy few minutes with predators never leaves a pig stuck in a wall or off the farm', () => {
    const farm = new Farm(seeded(7))
    farm.join('Ann', 0)
    farm.nextFoxAt = farm.t + 5000
    for (let i = 0; i < (5 * 60_000) / TICK_MS; i++) {
      farm.tick(TICK_MS)
      for (const p of farm.pigs) {
        if (p.state === 'lost' || p.state === 'carried' || p.state === 'held') continue
        if (!pigCanStand(p, -0.05)) throw new Error(`${p.name} is stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)} (${p.state})`)
      }
    }
  })
})

describe('pellets', () => {
  it('farmers carry a sack from the feed bin to the hopper, and hungry pigs eat the pellets', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, -6, -18)
    for (const b of BOWLS.keys()) farm.foods.get(b)!.bites = 0
    const hopper = farm.foods.get(HOPPER_ID)!
    hopper.bites = 0

    // No sack, no pellets.
    Object.assign(me, { x: HOPPERS[0].x + 1.5, z: HOPPERS[0].z })
    farm.handle(id, { t: 'pour', hopper: 0 })
    expect(hopper.bites).toBe(0)

    Object.assign(me, { x: FEED_BIN.x, z: FEED_BIN.z + 1 })
    farm.handle(id, { t: 'sack' })
    expect(me.sack).toBe(true)
    // Hands full: no throwing or picking up pigs.
    me.basket[0] = 1
    farm.handle(id, { t: 'throw', veg: 'carrot', x: 0, z: -15 })
    expect(me.basket[0]).toBe(1)

    Object.assign(me, { x: HOPPERS[0].x + 1.5, z: HOPPERS[0].z })
    farm.handle(id, { t: 'pour', hopper: 0 })
    expect(me.sack).toBe(false)
    expect(hopper.bites).toBe(SACK_PELLETS)
    expect(pig.state).toBe('seek')
    expect(run(farm, 8000, () => pig.state === 'eat')).toBe(true)
    run(farm, 3000)
    expect(hopper.bites).toBeLessThan(SACK_PELLETS)
    expect(farm.snapshot().hoppers[0]).toBe(hopper.bites)
  })

  it('the second hopper only works once it is bought', () => {
    const { farm, id, me } = setup()
    Object.assign(me, { x: FEED_BIN.x, z: FEED_BIN.z })
    farm.handle(id, { t: 'sack' })
    Object.assign(me, { x: HOPPERS[1].x - 1.5, z: HOPPERS[1].z })
    farm.handle(id, { t: 'pour', hopper: 1 })
    expect(farm.foods.get(HOPPER_ID + 1)!.bites).toBe(0)
    expect(me.sack).toBe(true)

    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'hopper2' })
    farm.handle(id, { t: 'pour', hopper: 1 })
    expect(farm.foods.get(HOPPER_ID + 1)!.bites).toBe(SACK_PELLETS)
  })
})

describe('money and upgrades', () => {
  it('upgrades cost coins from the shared wallet, once each', () => {
    const { farm, id, me } = setup()
    farm.coins = UPGRADES.basket.cost - 1
    farm.handle(id, { t: 'buy', upgrade: 'basket' })
    expect(farm.upgrades).toEqual([])

    farm.coins = UPGRADES.basket.cost + 5
    farm.handle(id, { t: 'buy', upgrade: 'basket' })
    farm.handle(id, { t: 'buy', upgrade: 'basket' })
    expect(farm.upgrades).toEqual(['basket'])
    expect(farm.coins).toBe(5)
    expect(farm.snapshot()).toMatchObject({ coins: 5, upgrades: ['basket'] })

    // The bigger basket holds more.
    farm.beds[0].stage = 'ripe'
    me.basket[veg('apple')] = BASKET_MAX - 1
    Object.assign(me, { x: BEDS[0].x + 2, z: BEDS[0].z })
    farm.handle(id, { t: 'harvest', bed: 0 })
    expect(farm.basketCount(me)).toBe(BASKET_MAX - 1 + HARVEST_YIELD)
  })

  it('sprinklers make crops grow faster', () => {
    const { farm, id, me } = setup()
    farm.upgrades = ['sprinkler']
    farm.beds[0].stage = 'empty'
    Object.assign(me, { x: BEDS[0].x + 2, z: BEDS[0].z })
    farm.handle(id, { t: 'plant', bed: 0 })
    run(farm, GROW_MS * 0.65)
    expect(farm.beds[0].stage).toBe('ripe')
  })

  it('each morning the day is scored and the farm gets paid', () => {
    const { farm, id, me } = setup()
    const before = farm.coins
    // A good day: a fix and a rescue. A bad bit: one pig carried off.
    const pig = lonePig(farm, 2, 2, 90)
    pig.issues = ISSUE_BIT.nails
    Object.assign(me, { x: 3, z: 2 })
    farm.handle(id, { t: 'pickup', pig: 0 })
    farm.handle(id, { t: 'treat', issue: 'nails' })
    farm.handle(id, { t: 'putdown' })
    // Everyone tucked up in the barn.
    for (const p of farm.pigs) Object.assign(p, { hunger: 90, happy: 80, issues: 0, x: -8 + (p.id % 9) * 2, z: -20 + Math.floor(p.id / 9) * 2 })

    farm.t = DAY_MS * (1 - START_TIME) - 1000 // just before dawn
    farm.tick(TICK_MS)
    farm.out = []
    run(farm, 2000)
    const report = farm.out.find((o) => o.msg.t === 'report')?.msg
    if (report?.t !== 'report') throw new Error('no report')
    expect(report.day).toBe(1)
    expect(report.lines.find((l) => l.label.includes('Health fixes'))?.coins).toBe(5)
    expect(report.total).toBeGreaterThan(50)
    expect(report.stars).toBeGreaterThanOrEqual(2)
    expect(farm.coins).toBe(before + report.total)
    expect(report.coins).toBe(farm.coins)
  })

  it('a farm saves its coins, upgrades and pellets', () => {
    const { farm } = setup()
    farm.coins = 123
    farm.upgrades = ['hopper2', 'fence']
    farm.foods.get(HOPPER_ID + 1)!.bites = 17
    const again = new Farm(seeded(5), JSON.parse(JSON.stringify(farm.save())))
    expect(again.coins).toBe(123)
    expect(again.upgrades).toEqual(['hopper2', 'fence'])
    expect(again.foods.get(HOPPER_ID + 1)!.bites).toBe(17)
  })
})

describe('messages', () => {
  it('rejects junk and cleans names', () => {
    expect(parseClientMsg('nope')).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'throw', veg: 'cake', x: 1, z: 1 }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'state', x: 1e9, z: 0, yaw: 0 }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'harvest', bed: 99 }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'buy', upgrade: 'rocket' }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'pour', hopper: 2 }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'buy', upgrade: 'fence' }))).toEqual({ t: 'buy', upgrade: 'fence' })
    expect(parseClientMsg(JSON.stringify({ t: 'treat', issue: 'nails' }))).toEqual({ t: 'treat', issue: 'nails' })
    expect(parseClientMsg(JSON.stringify({ t: 'join', name: '<b>Bo</b>', color: 42 }))).toEqual({ t: 'join', name: 'bBob', color: 0 })
  })
})

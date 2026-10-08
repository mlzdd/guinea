import { describe, expect, it } from 'vitest'
import { lonePig, ownAll, run, seeded, setup, veg } from './helpers.ts'
import { Farm, HOPPER_ID, RACK_ID } from '../../src/core/farm.ts'
import { BED_SPOTS, BEDS, BOWLS, SALAD_SPOT, FEED_BIN, HAY_BALE, HAY_PATCHES, HAY_FIELD, HAY_RACKS, HAY_STACKS, HOPPERS, center, rackBuilt, rackFront, TREES, dist, gardens, inRect, isInside, nearestFence, onFarm, pigCanStand } from '../../src/core/map.ts'
import { parseClientMsg } from '../../src/core/protocol.ts'
import {
  BALE_ARMFULS,
  BASKET_MAX,
  BOWL_MAX,
  GROW_MS,
  FOOD_SLEEPERS,
  HARVEST_YIELD,
  HAY_ARMFUL,
  HAY_RACK_MAX,
  HAY_SLOTS,
  HAY_REGROW_MS,
  HAY_STACK_MAX,
  ISSUE_BIT,
  LOST_MS,
  NIGHT_START,
  SACK_PELLETS,
  UPGRADES,
  basketMax,
  level,
  farmTime,
  THROW_RANGE,
  TICK_MS,
} from '../../src/core/rules.ts'

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

  it('an armful of hay can be dropped on the ground, and a hungry pig eats it', () => {
    const { farm, id, me } = setup()
    const pig = lonePig(farm, 6, 6)
    Object.assign(me, { x: 0, z: 6 })
    farm.handle(id, { t: 'throw', veg: 'hay', x: 0.7, z: 6 })
    expect(farm.out.some((o) => o.msg.t === 'thrown')).toBe(false) // no hay on you
    me.hay = 1
    farm.handle(id, { t: 'throw', veg: 'hay', x: 0.7, z: 6 })
    expect(me.hay).toBe(0)
    const pile = [...farm.foods.values()].find((f) => !f.bowl)!
    expect(pile.kind).toBe('hay')
    expect(pile.bites).toBe(HAY_ARMFUL)
    expect(run(farm, 4000, () => pig.state === 'eat' && pig.food === pile.id)).toBe(true)
    expect(farm.snapshot().foods.some((f) => f.kind === 'hay')).toBe(true)
    expect(parseClientMsg(JSON.stringify({ t: 'throw', veg: 'hay', x: 1, z: 2 }))).toEqual({ t: 'throw', veg: 'hay', x: 1, z: 2 })
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

  it('beds on land the farm has not bought cannot be planted', () => {
    const { farm, id, me } = setup(1, true)
    const i = BEDS.findIndex((b) => b.square === 'patch2')
    const bed = BEDS[i]
    expect(farm.beds[i].stage).toBe('empty')
    Object.assign(me, { x: bed.x + 2, z: bed.z })
    farm.handle(id, { t: 'plant', bed: i })
    expect(farm.beds[i].stage).toBe('empty')

    ownAll(farm)
    farm.handle(id, { t: 'plant', bed: i })
    expect(farm.beds[i].stage).toBe('growing')
    run(farm, GROW_MS + 100)
    farm.handle(id, { t: 'harvest', bed: i })
    expect(me.basket[veg(bed.kind)]).toBe(HARVEST_YIELD)
  })

  it('apples fall in the orchard and can be gathered', () => {
    const { farm, id, me } = setup()
    lonePig(farm, -30.3, -16, 100) // everyone else tucked away, so nobody eats the apples first
    run(farm, 61_000)
    const apple = [...farm.foods.values()].find((f) => f.kind === 'apple')!
    expect(apple).toBeDefined()
    Object.assign(me, { x: apple.x + 1, z: apple.z })
    farm.handle(id, { t: 'gather', food: apple.id })
    expect(me.basket[veg('apple')]).toBe(1)
    expect(farm.foods.has(apple.id)).toBe(false)
  })

  it('pigs trot over for an apple even when they are not hungry', () => {
    const { farm } = setup()
    lonePig(farm, -30.3, -16, 100)
    run(farm, 61_000)
    const apple = [...farm.foods.values()].find((f) => f.kind === 'apple')!
    const p = lonePig(farm, apple.x - 4, apple.z, 75)
    p.until = 0
    expect(run(farm, 10_000, () => p.state === 'eat' && farm.foods.get(p.food!)?.kind === 'apple')).toBe(true)
  })

  it('pigs go on snack trips: nibbling under the apple trees and wheeking at ripe veg through the garden fence', () => {
    const { farm } = setup()
    let orchard = 0
    let fence = 0
    run(farm, 150_000, () => {
      for (const p of farm.pigs) {
        if (p.state === 'graze' && TREES.some((t) => dist(p, t) < 2.6)) orchard++
        if (p.state === 'beg' && gardens().some((g) => inRect(p, g, 1.2))) fence++
      }
      return false
    })
    expect(orchard).toBeGreaterThan(0)
    expect(fence).toBeGreaterThan(0)
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
    farm.spawnFox()
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

  it('a pig the fox gets away with comes back under the fence later', () => {
    const { farm } = setup()
    const pig = lonePig(farm, 28, 22, 90)
    farm.spawnFox()
    Object.assign(farm.preds[0], { x: 28.4, z: 22 })
    expect(run(farm, 30_000, () => pig.state === 'lost')).toBe(true)
    expect(farm.preds).toHaveLength(0)
    expect(farm.snapshot().pigs[0].s).toBe('lost')
    expect(run(farm, LOST_MS + 1000, () => pig.state !== 'lost')).toBe(true)
    expect(onFarm(pig)).toBe(true)
    expect(nearestFence(pig).d).toBeLessThan(3)
    expect(pig.happy).toBeLessThan(30)
  })

  it('pigs run from a fox they notice, and a fox with nobody to catch gives up', () => {
    // A pig this close doesn't always spot the fox in time, or outrun its pounce (that's the point of foxes),
    // so try a few farms: plenty should get away.
    let escaped = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { farm } = setup(seed)
      const pig = lonePig(farm, 2, 3, 90)
      farm.spawnFox()
      Object.assign(farm.preds[0], { x: 2, z: 6.2 })
      if (!run(farm, 400, () => pig.state === 'flee')) continue
      if (!run(farm, 8000, () => pig.state === 'hide' || isInside(pig))) continue
      // Safe in the hut, the fox has nobody to catch and gives up.
      expect(run(farm, 60_000, () => farm.preds.length === 0)).toBe(true)
      expect(pig.state).not.toBe('carried')
      escaped++
    }
    expect(escaped).toBeGreaterThanOrEqual(8)
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
    farm.t = farmTime(NIGHT_START) - 2000
    run(farm, 3000)
    expect(farm.night).toBe(true)
    expect(farm.out.some((o) => o.msg.t === 'alert' && o.msg.kind === 'night')).toBe(true)
    // Plenty of time to waddle home, door and all.
    run(farm, 60_000, () => farm.pigs.every((p) => isInside(p)))
    const outside = farm.pigs.filter((p) => !isInside(p)).map((p) => `${p.name} ${p.state} ${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    expect(outside).toEqual([])
    // Once they're all tucked up asleep there's no point waiting: it's morning.
    expect(run(farm, 60_000, () => farm.day === 2)).toBe(true)
    expect(farm.out.some((o) => o.msg.t === 'alert' && o.msg.text.includes('fast asleep'))).toBe(true)
    expect(farm.out.some((o) => o.msg.t === 'report')).toBe(true)
  })

  it('pigs sleep tucked up round the edges of the barn, not in the middle (a couple on the food piles at most)', () => {
    const { farm } = setup(5)
    farm.t = farmTime(NIGHT_START) + 1000
    for (const p of farm.pigs)
      Object.assign(p, { x: -4 + (p.id % 5) * 2, z: -19 + Math.floor(p.id / 5) * 1.5, hunger: 90, state: 'idle', until: farm.t + 100 })
    // Where they all were the moment the night was skipped (everyone tucked up).
    let last: { x: number; z: number; state: string }[] = []
    expect(
      run(farm, 90_000, () => {
        if (farm.night) last = farm.pigs.map(({ x, z, state }) => ({ x, z, state }))
        return farm.day === 2
      }),
    ).toBe(true)
    const asleep = last.filter((p) => p.state === 'sleep')
    expect(asleep.length).toBeGreaterThan(farm.pigs.length / 2)
    const astray = asleep.filter((p) => !BED_SPOTS.some((b) => dist(p, b) < 1.3))
    expect(astray.length).toBeLessThanOrEqual(FOOD_SLEEPERS)
    for (const p of astray) expect([...BOWLS, ...HOPPERS, SALAD_SPOT].some((f) => dist(p, f) < 1.5)).toBe(true)
  })

  it('the night is not skipped while a pig is still up, or a fox is about', () => {
    const { farm } = setup(3)
    farm.t = farmTime(NIGHT_START) + 1000
    for (const p of farm.pigs) Object.assign(p, { x: -5 + (p.id % 6) * 2, z: -20 + Math.floor(p.id / 6) * 1.5, state: 'sleep', until: Infinity })
    const owl = farm.pigs[3]
    Object.assign(owl, { state: 'idle', until: Infinity })
    run(farm, 10_000)
    expect(farm.day).toBe(1)
    owl.state = 'sleep'
    farm.spawnFox()
    run(farm, 5000)
    expect(farm.day).toBe(1)
    farm.preds = []
    expect(run(farm, 5000, () => farm.day === 2)).toBe(true)
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

  it('a save from before the second veggie patch loads, with its beds empty', () => {
    const { farm } = setup()
    const saved = JSON.parse(JSON.stringify(farm.save()))
    saved.beds = saved.beds.slice(0, 6)
    saved.beds[1].stage = 'empty'
    const again = new Farm(seeded(99), saved)
    expect(again.t).toBe(farm.t)
    expect(again.beds).toHaveLength(BEDS.length)
    expect(again.beds[1].stage).toBe('empty')
    expect(again.beds.slice(6).every((b) => b.stage === 'empty')).toBe(true)
  })

  it('a broken save is ignored', () => {
    const farm = new Farm(seeded(), { v: 1, t: 'soon', pigs: 'lots' })
    expect(farm.pigs.length).toBeGreaterThan(0)
    expect(farm.t).toBe(0)
  })
})

describe('the farm over time', () => {
  it('the same with all the land bought', () => {
    const farm = new Farm(seeded(8))
    ownAll(farm)
    farm.join('Ann', 0)
    farm.nextFoxAt = farm.t + 5000
    for (let i = 0; i < (4 * 60_000) / TICK_MS; i++) {
      farm.tick(TICK_MS)
      for (const p of farm.pigs) {
        if (p.state === 'lost' || p.state === 'carried' || p.state === 'held') continue
        // Sneaky pigs raiding a veg patch are allowed inside its fence.
        const ok = p.state === 'raid' ? onFarm(p) && gardens().some((g) => inRect(p, g, 0.5)) || pigCanStand(p, -0.05) : pigCanStand(p, -0.05)
        if (!ok) throw new Error(`${p.name} is stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)} (${p.state})`)
      }
    }
  })

  it('a busy few minutes with predators never leaves a pig stuck in a wall or off the farm', () => {
    const farm = new Farm(seeded(7))
    farm.join('Ann', 0)
    farm.nextFoxAt = farm.t + 5000
    for (let i = 0; i < (5 * 60_000) / TICK_MS; i++) {
      farm.tick(TICK_MS)
      for (const p of farm.pigs) {
        if (p.state === 'lost' || p.state === 'carried' || p.state === 'held') continue
        // Sneaky pigs raiding a veg patch are allowed inside its fence.
        const ok = p.state === 'raid' ? onFarm(p) && gardens().some((g) => inRect(p, g, 0.5)) || pigCanStand(p, -0.05) : pigCanStand(p, -0.05)
        if (!ok) throw new Error(`${p.name} is stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)} (${p.state})`)
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

  it('pellets are rationed: one sack per hopper a day, restocked at dawn', () => {
    const { farm, id, me } = setup()
    expect(farm.snapshot().sacks).toBe(1)
    Object.assign(me, { x: FEED_BIN.x, z: FEED_BIN.z + 1 })
    farm.handle(id, { t: 'sack' })
    expect(me.sack).toBe(true)
    // Putting it back puts it back in the bin.
    farm.handle(id, { t: 'sack' })
    expect(farm.sacks).toBe(1)
    farm.handle(id, { t: 'sack' })
    Object.assign(me, { x: HOPPERS[0].x + 1.5, z: HOPPERS[0].z })
    farm.handle(id, { t: 'pour', hopper: 0 })
    // That was today's: you just can't grab another.
    Object.assign(me, { x: FEED_BIN.x, z: FEED_BIN.z + 1 })
    farm.handle(id, { t: 'sack' })
    expect(me.sack).toBe(false)
    expect(farm.snapshot().sacks).toBe(0)
    farm.payDay()
    expect(farm.sacks).toBe(1)
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'hopper2' })
    expect(farm.sacks).toBe(2)
    farm.payDay()
    expect(farm.sacks).toBe(2)
  })
})

describe('hay', () => {
  it('a bale of hay on the hay table, from day one: as much as fits in your basket, a new one every dawn', () => {
    const { farm, id, me } = setup()
    expect(farm.snapshot().bale).toBe(BALE_ARMFULS)
    expect(parseClientMsg(JSON.stringify({ t: 'bale' }))).toEqual({ t: 'bale' })
    // Too far away.
    farm.handle(id, { t: 'bale' })
    expect(me.hay).toBe(0)

    // Room for two armfuls.
    Object.assign(me, { x: HAY_BALE.x, z: HAY_BALE.z + 1 })
    me.basket[0] = BASKET_MAX - 2 * HAY_SLOTS
    farm.handle(id, { t: 'bale' })
    expect(me.hay).toBe(2)
    expect(farm.bale).toBe(BALE_ARMFULS - 2)
    me.basket[0] = 0
    farm.handle(id, { t: 'bale' })
    expect(me.hay).toBe(BALE_ARMFULS)
    expect(farm.snapshot().bale).toBe(0)

    // Into the rack; the pigs come for it.
    Object.assign(me, { x: HAY_RACKS[0].x, z: HAY_RACKS[0].z + 1.2 })
    farm.handle(id, { t: 'rack', rack: 0 })
    expect(farm.foods.get(RACK_ID)!.bites).toBe(HAY_RACK_MAX)

    // That was today's bale; it's kept in the save, and there's a new one at dawn.
    expect(new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save()))).bale).toBe(0)
    farm.payDay()
    expect(farm.bale).toBe(BALE_ARMFULS)
  })

  it('farmers cut armfuls of hay into their basket and take them to the racks, and pigs eat it', () => {
    const { farm, id, me } = setup()
    const rack = farm.foods.get(RACK_ID)!
    expect(rack.bites).toBe(0)
    Object.assign(me, center(HAY_PATCHES[0]))
    farm.handle(id, { t: 'hay', patch: 1 }) // not standing on that one
    expect(me.hay).toBe(0)
    farm.handle(id, { t: 'hay', patch: 0 })
    expect(me.hay).toBe(1)
    expect(farm.snapshot().hayField[0]).toBe(0)
    expect(farm.snapshot().farmers[0].hay).toBe(1)
    // In the basket, not your hands: you can still throw veg; it takes two places in the basket.
    me.basket[0] = 1
    farm.handle(id, { t: 'throw', veg: 'carrot', x: -20, z: -10 })
    expect(me.basket[0]).toBe(0)
    expect(farm.basketCount(me)).toBe(HAY_SLOTS)
    // Several armfuls, one from each patch.
    Object.assign(me, center(HAY_PATCHES[1]))
    farm.handle(id, { t: 'hay', patch: 1 })
    expect(me.hay).toBe(2)

    const pig = lonePig(farm, HAY_RACKS[0].x, -19, 40)
    Object.assign(me, { x: HAY_RACKS[0].x, z: HAY_RACKS[0].z + 1.5 })
    farm.handle(id, { t: 'rack', rack: 0 })
    // Both go in (the rack holds two armfuls).
    expect(me.hay).toBe(0)
    expect(rack.bites).toBe(2 * HAY_ARMFUL)
    expect(farm.snapshot().racks[0]).toBe(2 * HAY_ARMFUL)
    expect(run(farm, 8000, () => pig.state === 'eat' && pig.food === RACK_ID)).toBe(true)
    run(farm, 3000)
    expect(rack.bites).toBeLessThan(2 * HAY_ARMFUL)
    expect(pig.hayAt).toBeGreaterThan(0)

    // Paid for in the morning.
    farm.out = []
    farm.payDay()
    const report = farm.out.find((o) => o.msg.t === 'report')?.msg
    if (report?.t !== 'report') throw new Error('no report')
    expect(report.lines.find((l) => l.label.includes('Hay'))?.coins).toBe(1)
  })

  it('as much hay as the basket holds (two places an armful), and a full rack takes no more', () => {
    const { farm, id, me } = setup()
    for (let patch = 0; patch < 10; patch++) {
      Object.assign(me, center(HAY_PATCHES[patch]))
      farm.handle(id, { t: 'hay', patch })
    }
    expect(me.hay).toBe(BASKET_MAX / HAY_SLOTS)
    expect(farm.snapshot().hayField[9]).toBe(1) // that one wasn't cut: no room
    Object.assign(me, { x: HAY_RACKS[2].x, z: HAY_RACKS[2].z + 1.5 })
    farm.handle(id, { t: 'rack', rack: 2 })
    expect(farm.foods.get(RACK_ID + 2)!.bites).toBe(HAY_RACK_MAX)
    expect(me.hay).toBe(BASKET_MAX / HAY_SLOTS - HAY_RACK_MAX / HAY_ARMFUL)
    farm.handle(id, { t: 'rack', rack: 2 })
    expect(me.hay).toBe(BASKET_MAX / HAY_SLOTS - HAY_RACK_MAX / HAY_ARMFUL)
  })

  it('racks round the barn, inside and out, and more go up with the barn improvements', () => {
    const { farm, id, me } = setup()
    const fill = (i: number) => {
      const front = rackFront(HAY_RACKS[i], 1.2)
      Object.assign(me, front, { hay: 2, basket: [0, 0, 0, 0, 0] })
      farm.handle(id, { t: 'rack', rack: i })
      return farm.foods.get(RACK_ID + i)!.bites
    }
    const open = HAY_RACKS.map((_, i) => i).filter((i) => rackBuilt(i, farm.upgrades))
    expect(open.length).toBeGreaterThanOrEqual(5)
    expect(open.some((i) => !isInside(rackFront(HAY_RACKS[i])))).toBe(true) // one outside
    for (const i of open) expect(fill(i)).toBe(HAY_RACK_MAX)
    // Not through the barn wall: the outside one by the door from inside.
    const out = open.find((i) => !isInside(rackFront(HAY_RACKS[i])))!
    farm.foods.get(RACK_ID + out)!.bites = 0
    Object.assign(me, { x: HAY_RACKS[out].x, z: HAY_RACKS[out].z - 1.5, hay: 2 })
    farm.handle(id, { t: 'rack', rack: out })
    expect(farm.foods.get(RACK_ID + out)!.bites).toBe(0)

    const later = HAY_RACKS.map((_, i) => i).filter((i) => !rackBuilt(i, farm.upgrades))
    expect(later.length).toBeGreaterThanOrEqual(2)
    expect(fill(later[0])).toBe(0)
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'land_barn' })
    farm.handle(id, { t: 'buy', upgrade: 'land_barn' })
    for (const i of later) expect(fill(i)).toBe(2 * HAY_ARMFUL)
    // Every rack's hay is where pigs can get at it.
    for (const r of HAY_RACKS) expect(pigCanStand(rackFront(r))).toBe(true)
  })

  it('the stack yard is down the right of the hay field, nearest the barn', () => {
    for (const s of HAY_STACKS) expect(s.x).toBeGreaterThan(HAY_FIELD.x1)
  })

  it('a cut patch grows back before it can be cut again', () => {
    const { farm, id, me } = setup()
    expect(HAY_PATCHES.length).toBeGreaterThanOrEqual(12)
    Object.assign(me, center(HAY_PATCHES[3]))
    farm.handle(id, { t: 'hay', patch: 3 })
    farm.handle(id, { t: 'hay', patch: 3 })
    expect(me.hay).toBe(1) // still stubble
    run(farm, HAY_REGROW_MS / 2)
    expect(farm.snapshot().hayField[3]).toBeCloseTo(0.5, 1)
    run(farm, HAY_REGROW_MS / 2 + 100)
    farm.handle(id, { t: 'hay', patch: 3 })
    expect(me.hay).toBe(2)
    // Saved and loaded mid-regrow.
    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.snapshot().hayField[3]).toBe(0)
  })

  it('cut hay is stacked up in the stack yard and taken to the racks later', () => {
    const { farm, id, me } = setup()
    for (const patch of [0, 1, 2]) {
      Object.assign(me, center(HAY_PATCHES[patch]))
      farm.handle(id, { t: 'hay', patch })
    }
    expect(me.hay).toBe(3)
    Object.assign(me, { x: HAY_STACKS[1].x + 1, z: HAY_STACKS[1].z })
    farm.handle(id, { t: 'stack', stack: 1 })
    expect(me.hay).toBe(0)
    expect(farm.snapshot().stacks[1]).toBe(3)
    // Not from over here.
    farm.handle(id, { t: 'stack', stack: 0 })
    expect(me.hay).toBe(0)
    // Take it back off: as much as fits in the basket.
    me.basket = [0, 0, 0, 0, BASKET_MAX - HAY_SLOTS * 2]
    farm.handle(id, { t: 'stack', stack: 1 })
    expect(me.hay).toBe(2)
    expect(farm.hayStacks[1]).toBe(1)
    // A stack only holds so much: the rest stays in your basket.
    farm.hayStacks[0] = HAY_STACK_MAX - 1
    Object.assign(me, { x: HAY_STACKS[0].x + 1, z: HAY_STACKS[0].z })
    farm.handle(id, { t: 'stack', stack: 0 })
    expect(farm.hayStacks[0]).toBe(HAY_STACK_MAX)
    expect(me.hay).toBe(1)
    // Saved.
    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.hayStacks).toEqual([HAY_STACK_MAX, 1, 0])
  })

  it('no hay meadow, no hay', () => {
    const { farm, id, me } = setup(1, true)
    Object.assign(me, center(HAY_PATCHES[0]))
    farm.handle(id, { t: 'hay', patch: 0 })
    expect(me.hay).toBe(0)
  })

  it('hay keeps teeth healthy', () => {
    const teeth = (hay: boolean) => {
      let n = 0
      for (let seed = 1; seed <= 6; seed++) {
        const { farm } = setup(seed)
        for (const p of farm.pigs) Object.assign(p, { issues: 0, hayAt: hay ? farm.t + 1e9 : -1e9, state: 'sleep', until: Infinity })
        run(farm, 60_000)
        n += farm.pigs.filter((p) => p.issues & ISSUE_BIT.teeth).length
      }
      return n
    }
    expect(teeth(true)).toBeLessThan(teeth(false))
  })
})

describe('money and upgrades', () => {
  it('upgrades cost coins from the shared wallet, a level at a time up to the top', () => {
    const { farm, id, me } = setup()
    const [one, two, three] = UPGRADES.basket.levels
    farm.coins = one.cost - 1
    farm.handle(id, { t: 'buy', upgrade: 'basket' })
    expect(farm.upgrades).toEqual([])

    farm.coins = one.cost + 5
    farm.handle(id, { t: 'buy', upgrade: 'basket' })
    farm.handle(id, { t: 'buy', upgrade: 'basket' }) // can't afford level 2
    expect(farm.upgrades).toEqual(['basket'])
    expect(farm.coins).toBe(5)
    expect(farm.snapshot()).toMatchObject({ coins: 5, upgrades: ['basket'] })
    expect(basketMax(farm.upgrades)).toBe(BASKET_MAX + 8)

    // The bigger basket holds more.
    farm.beds[0].stage = 'ripe'
    me.basket[veg('apple')] = BASKET_MAX - 1
    Object.assign(me, { x: BEDS[0].x + 2, z: BEDS[0].z })
    farm.handle(id, { t: 'harvest', bed: 0 })
    expect(farm.basketCount(me)).toBe(BASKET_MAX - 1 + HARVEST_YIELD)

    // Levels 2 and 3, then it's maxed.
    farm.coins = two.cost + three.cost + 100
    for (let i = 0; i < 3; i++) farm.handle(id, { t: 'buy', upgrade: 'basket' })
    expect(level(farm.upgrades, 'basket')).toBe(3)
    expect(farm.coins).toBe(100)
    expect(basketMax(farm.upgrades)).toBe(BASKET_MAX + 24)
  })

  it('bigger hoppers come with bigger sacks', () => {
    const { farm, id, me } = setup()
    farm.upgrades = ['bighopper', 'bighopper']
    const hopper = farm.foods.get(HOPPER_ID)!
    hopper.bites = 0
    Object.assign(me, { x: FEED_BIN.x + 1, z: FEED_BIN.z })
    farm.handle(id, { t: 'sack' })
    Object.assign(me, { x: HOPPERS[0].x + 1, z: HOPPERS[0].z })
    farm.handle(id, { t: 'pour', hopper: 0 })
    expect(hopper.bites).toBe(SACK_PELLETS * 3)
  })

  it('feed delivery brings extra sacks each morning, and its first one straight away', () => {
    const { farm, id } = setup()
    farm.sacks = 0
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'sacks' })
    expect(farm.sacks).toBe(1)
    farm.handle(id, { t: 'buy', upgrade: 'sacks' })
    farm.payDay()
    expect(farm.sacks).toBe(1 + 2) // the one hopper's sack, and two delivered
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

    farm.t = farmTime(1) - 1000 // just before dawn
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

  it('baskets are kept by name: through leaving, saving and loading', () => {
    const { farm, id, me } = setup()
    me.basket[veg('carrot')] = 5
    me.hay = 2
    // Saved while on the farm, loaded into a fresh server, then back again.
    const again = new Farm(seeded(5), JSON.parse(JSON.stringify(farm.save())))
    const back = again.farmers.get(again.join('Ann', 0)!)!
    expect(back.basket[veg('carrot')]).toBe(5)
    expect(back.hay).toBe(2)
    // Someone else doesn't get it; going home and coming back keeps it.
    expect(again.farmers.get(again.join('Bo', 0)!)!.basket[veg('carrot')]).toBe(0)
    farm.sacks = 0
    me.sack = true
    farm.leave(id)
    expect(farm.sacks).toBe(1) // the sack went back in the bin
    expect(farm.farmers.get(farm.join('Ann', 0)!)!.basket[veg('carrot')]).toBe(5)
  })

  it('a farm saves its coins, upgrades and pellets', () => {
    const { farm } = setup()
    farm.coins = 123
    farm.upgrades = ['hopper2', 'fence', 'fence', 'fence']
    farm.foods.get(HOPPER_ID + 1)!.bites = 17
    const again = new Farm(seeded(5), JSON.parse(JSON.stringify(farm.save())))
    expect(again.coins).toBe(123)
    // Levels kept, but no more than there are (the fence has two).
    expect(level(again.upgrades, 'fence')).toBe(2)
    expect(level(again.upgrades, 'hopper2')).toBe(1)
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

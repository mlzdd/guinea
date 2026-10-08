import { describe, expect, it } from 'vitest'
import { Farm, RACK_ID } from '../../src/core/farm.ts'
import { BEDS, HAY_PATCHES, HAY_RACKS, HAY_STACKS, TREES, center } from '../../src/core/map.ts'
import { parseClientMsg } from '../../src/core/protocol.ts'
import {
  LAND_UPGRADES, SQUARE_IDS, START_LAND, UPGRADES, FOOD_ROT_MS, GROW_MS, HAY_REGROW_MS,
  growMs, hayRegrowMs, harvestYield, landLevel, extraSacks, farmTime,
  type SquareId, type UpgradeId,
} from '../../src/core/rules.ts'
import { lonePig, setup, veg } from './helpers.ts'

const tiers = (square: SquareId, count = 3): UpgradeId[] => Array<UpgradeId>(count).fill(LAND_UPGRADES[square])

describe('land upgrade progression', () => {
  it.each(SQUARE_IDS)('%s has exactly three cumulative purchases, requires its land, and survives saving', (square) => {
    const { farm, id } = setup(1, true)
    const upgrade = LAND_UPGRADES[square]
    const definitions = UPGRADES[upgrade].levels
    expect(definitions).toHaveLength(3)
    expect(parseClientMsg(JSON.stringify({ t: 'buy', upgrade }))).toEqual({ t: 'buy', upgrade })
    farm.coins = 10_000
    if (!START_LAND.includes(square)) {
      farm.handle(id, { t: 'buy', upgrade })
      expect(farm.upgrades).toEqual([])
      expect(farm.coins).toBe(10_000)
      farm.land.push(square)
    }
    for (const [i, tier] of definitions.entries()) {
      farm.coins = tier.cost - 1
      farm.handle(id, { t: 'buy', upgrade })
      expect(landLevel(farm.upgrades, square)).toBe(i)
      expect(farm.coins).toBe(tier.cost - 1)
      farm.coins = tier.cost
      farm.handle(id, { t: 'buy', upgrade })
      expect(farm.coins).toBe(0)
      expect(landLevel(farm.snapshot().upgrades, square)).toBe(i + 1)
    }
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade })
    expect(farm.coins).toBe(1000)
    const again = new Farm(undefined, farm.save())
    expect(landLevel(again.upgrades, square)).toBe(3)
  })

  it('loads older farms and drops impossible or excess land tiers', () => {
    const { farm } = setup(1, true)
    const save = farm.save()
    save.upgrades = [...tiers('barn', 8), ...tiers('orchard'), 'basket']
    const again = new Farm(undefined, save)
    expect(again.upgrades).toEqual([...tiers('barn'), 'basket'])
    delete save.upgrades
    const old = new Farm(undefined, save)
    expect(old.upgrades).toEqual([])
  })
})

describe('productive land features', () => {
  it.each(['garden', 'patch2'] as const)('%s adds local yield, quicker growth and automatic replanting', (square) => {
    const { farm, id, me } = setup()
    farm.jobs = []
    const bed = BEDS.find((b) => b.square === square)!
    farm.upgrades = [...tiers(square), 'compost', 'sprinkler', ...tiers('flowers')]
    Object.assign(me, bed, { basket: [0, 0, 0, 0, 0] })
    farm.beds[bed.id].stage = 'ripe'
    farm.handle(id, { t: 'harvest', bed: bed.id })
    expect(me.basket[veg(bed.kind)]).toBe(4 + 2 + (square === 'garden' ? 2 : 3))
    expect(farm.beds[bed.id].stage).toBe('growing')
    expect(farm.beds[bed.id].readyAt - farm.t).toBeCloseTo(GROW_MS * 0.6 * 0.75 * 0.85)
    expect(harvestYield(farm.upgrades, 'yard')).toBe(6)
    expect(growMs(farm.upgrades, 'yard')).toBeCloseTo(GROW_MS * 0.6 * 0.85)
    const restored = new Farm(undefined, farm.save())
    expect(restored.beds[bed.id].readyAt).toBeCloseTo(farm.beds[bed.id].readyAt, 2)
    expect(restored.beds[bed.id].plantedAt).toBeCloseTo(farm.beds[bed.id].plantedAt, 2)
    // A full basket must not harvest or restart the crop.
    me.basket = [16, 0, 0, 0, 0]
    farm.beds[bed.id].stage = 'ripe'
    farm.handle(id, { t: 'harvest', bed: bed.id })
    expect(farm.beds[bed.id].stage).toBe('ripe')
  })

  it('new irrigation and reseeding improve already growing crops without losing progress', () => {
    const { farm, id } = setup()
    farm.coins = 1000
    farm.upgrades = [...tiers('garden', 1), ...tiers('meadow', 2)]
    const bed = BEDS.find((b) => b.square === 'garden')!
    farm.beds[bed.id] = { stage: 'growing', plantedAt: farm.t - 10_000, readyAt: farm.t + 40_000, eaten: 0 }
    farm.hayField[0] = farm.t + 60_000
    farm.handle(id, { t: 'buy', upgrade: 'land_garden' })
    expect(farm.beds[bed.id].readyAt - farm.t).toBe(30_000)
    expect(farm.t - farm.beds[bed.id].plantedAt).toBe(7500)
    farm.handle(id, { t: 'buy', upgrade: 'land_meadow' })
    expect(farm.hayField[0] - farm.t).toBe(45_000)
  })

  it('cuts double hay with basket limits, stores twelve armfuls, and fills deeper racks', () => {
    const { farm, id, me } = setup()
    farm.upgrades = [...tiers('meadow'), ...tiers('barn'), 'fertiliser']
    me.basket.fill(0)
    Object.assign(me, center(HAY_PATCHES[0]))
    farm.handle(id, { t: 'hay', patch: 0 })
    expect(me.hay).toBe(2)
    expect(farm.hayField[0] - farm.t).toBeCloseTo(HAY_REGROW_MS * 0.7 * 0.75)
    expect(hayRegrowMs(farm.upgrades)).toBeCloseTo(HAY_REGROW_MS * 0.7 * 0.75)
    me.basket[0] = 10
    farm.hayField[0] = 0
    farm.handle(id, { t: 'hay', patch: 0 })
    expect(me.hay).toBe(3) // only one armful fits
    farm.hayField[0] = 0
    farm.handle(id, { t: 'hay', patch: 0 })
    expect(me.hay).toBe(3)
    expect(farm.hayField[0]).toBe(0)
    Object.assign(me, HAY_STACKS[0])
    farm.hayStacks[0] = 10
    farm.handle(id, { t: 'stack', stack: 0 })
    expect(farm.hayStacks[0]).toBe(12)
    expect(me.hay).toBe(1)
    Object.assign(me, HAY_RACKS[0], { hay: 4, basket: [0, 0, 0, 0, 0] })
    farm.handle(id, { t: 'rack', rack: 0 })
    expect(farm.foods.get(RACK_ID)!.bites).toBe(80)
    expect(me.hay).toBe(0)
    const again = new Farm(undefined, farm.save())
    expect(again.hayStacks[0]).toBe(12)
    expect(again.foods.get(RACK_ID)!.bites).toBe(80)
  })

  it('the pantry supplies a sack immediately and again at dawn', () => {
    const { farm, id } = setup()
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'land_barn' })
    const sacks = farm.sacks
    farm.handle(id, { t: 'buy', upgrade: 'land_barn' })
    expect(farm.sacks).toBe(sacks + 1)
    expect(extraSacks(farm.upgrades)).toBe(1)
    farm.t = farmTime(0.9)
    farm.tick(50)
    farm.sacks = 0
    farm.t = farmTime(1)
    farm.tick(50)
    expect(farm.sacks).toBe(2)
  })

  it('fruit catchers allow six apples, pruning drops pairs, and shade doubles shelf life', () => {
    const { farm } = setup()
    farm.upgrades = tiers('orchard')
    farm.pigs = []
    for (let n = 0; n < 4; n++) {
      farm.t += 60_001
      farm.tick(50)
      expect([...farm.foods.values()].filter((f) => f.tree === 0)).toHaveLength(Math.min(6, (n + 1) * 2))
    }
    const apples = [...farm.foods.values()].filter((f) => f.tree === 0)
    expect(apples).toHaveLength(6)
    expect(apples.every((f) => Math.hypot(f.x - TREES[0].x, f.z - TREES[0].z) < 3)).toBe(true)
    for (const apple of apples) apple.landAt = farm.t - FOOD_ROT_MS - 1
    farm.tick(50)
    expect(apples.every((a) => farm.foods.has(a.id))).toBe(true)
    for (const apple of apples) apple.landAt = farm.t - FOOD_ROT_MS * 2 - 1
    farm.tick(50)
    expect(apples.some((a) => farm.foods.has(a.id))).toBe(false)
  })
})

// Compare the same short simulation with and without a tier: test effects, not just helper formulas.
function needs(square: SquareId, count: number, x: number, z: number, state: 'idle' | 'graze' | 'sleep' | 'hide' = 'idle', rain = false) {
  const { farm } = setup()
  farm.upgrades = tiers(square, count)
  const pig = lonePig(farm, x, z, 50)
  Object.assign(pig, { happy: 40, state, until: Infinity })
  if (rain) { farm.rainFrom = -1; farm.rainTo = Infinity }
  farm.tick(50)
  return { hunger: pig.hunger, happy: pig.happy, issues: pig.issues }
}

describe('land benefits for the herd', () => {
  it('snug bedding halves sleeping hunger loss only inside the barn', () => {
    const base = needs('barn', 2, 5, -17, 'sleep').hunger
    const snug = needs('barn', 3, 5, -17, 'sleep').hunger
    expect(50 - snug).toBeCloseTo((50 - base) / 2)
    expect(needs('barn', 3, 5, 0, 'sleep').hunger).toBe(needs('barn', 2, 5, 0, 'sleep').hunger)
  })
  it.each(['yard', 'flowers'] as const)('%s clover improves grazing locally', (square) => {
    const [x, z] = square === 'yard' ? [-5, 0] : [20, 15]
    expect(needs(square, 1, x, z, 'graze').hunger).toBeGreaterThan(needs(square, 0, x, z, 'graze').hunger)
    expect(needs(square, 1, 5, -17, 'graze').hunger).toBe(needs(square, 0, 5, -17, 'graze').hunger)
  })
  it('play arches, flowers, soft huts and lilies improve local happiness', () => {
    expect(needs('yard', 2, -5, 0).happy).toBeGreaterThan(needs('yard', 1, -5, 0).happy)
    expect(needs('flowers', 2, 20, 15, 'graze').happy).toBeGreaterThan(needs('flowers', 1, 20, 15, 'graze').happy)
    expect(needs('huts', 1, -1, 12, 'hide').happy).toBeGreaterThan(needs('huts', 0, -1, 12, 'hide').happy)
    expect(needs('pond', 1, -22, 9).happy).toBeGreaterThan(needs('pond', 0, -22, 9).happy)
    expect(needs('pond', 2, -22, 12).happy).toBeGreaterThan(needs('pond', 1, -22, 12).happy)
  })
  it('windbreaks remove the cold happiness penalty inside hut meadow shelters', () => {
    expect(needs('huts', 2, -1, 12, 'hide', true).happy).toBeGreaterThan(needs('huts', 1, -1, 12, 'hide', true).happy)
    expect(needs('huts', 2, 4, 14, 'idle', true).happy).toBe(needs('huts', 1, 4, 14, 'idle', true).happy)
  })
  it('the yard bell extends actual shooing range', () => {
    const { farm, me, id } = setup()
    farm.spawnFox()
    Object.assign(farm.preds[0], { x: me.x + 7.5, z: me.z })
    farm.t = 1000
    farm.handle(id, { t: 'shoo' })
    expect(farm.preds[0].state).not.toBe('flee')
    farm.upgrades = tiers('yard')
    farm.t += 1000
    farm.handle(id, { t: 'shoo' })
    expect(farm.preds[0].state).toBe('flee')
  })
})

describe('shelter and pond protection', () => {
  it('lookout flags warn hut meadow pigs about foxes beyond their normal notice distance', () => {
    const state = (count: number) => {
      let fixed = false
      const farm = new Farm(() => fixed ? 0.1 : 0.5)
      farm.land = [...SQUARE_IDS]
      farm.join('Ann', 0)
      farm.nextFoxAt = farm.nextHawkAt = Infinity
      farm.upgrades = tiers('huts', count)
      const pig = lonePig(farm, -3, 15, 90)
      pig.happy = 90
      farm.spawnFox()
      Object.assign(farm.preds[0], { x: 2.5, z: 15, state: 'sneak' })
      fixed = true
      farm.tick(50)
      return pig.state
    }
    expect(state(2)).toBe('idle')
    expect(state(3)).toBe('flee')
  })

  it('the herb border reduces new health problems only within the pond area', () => {
    const issues = (count: number, x: number, z: number) => {
      let fixed = false
      // A roll between the normal and halved probability of nails starting this tick.
      const farm = new Farm(() => fixed ? 0.75 * (1 / 2400) * 0.05 : 0.5)
      farm.land = [...SQUARE_IDS]
      farm.join('Ann', 0)
      farm.nextFoxAt = farm.nextHawkAt = Infinity
      farm.upgrades = tiers('pond', count)
      const pig = lonePig(farm, x, z, 90)
      fixed = true
      farm.tick(50)
      return pig.issues & 1
    }
    expect(issues(2, -22, 12)).toBe(1)
    expect(issues(3, -22, 12)).toBe(0)
    expect(issues(3, -5, 0)).toBe(1)
  })

  it('windbreaks prevent weather sniffles inside huts without protecting exposed pigs', () => {
    const sniffles = (count: number, x: number, z: number) => {
      let fixed = false
      const farm = new Farm(() => fixed ? 0.0005 : 0.5)
      farm.land = [...SQUARE_IDS]
      farm.join('Ann', 0)
      farm.nextFoxAt = farm.nextHawkAt = Infinity
      farm.upgrades = tiers('huts', count)
      const pig = lonePig(farm, x, z, 90)
      pig.state = 'hide'
      farm.rainFrom = -1
      farm.rainTo = Infinity
      fixed = true
      farm.tick(50)
      return pig.issues & 4
    }
    expect(sniffles(1, -1, 12)).toBe(4)
    expect(sniffles(2, -1, 12)).toBe(0)
    expect(sniffles(2, 4, 14)).toBe(4)
  })
})

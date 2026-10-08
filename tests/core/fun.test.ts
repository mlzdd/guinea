import { describe, expect, it } from 'vitest'
import { Farm, SALAD_ID } from '../../src/core/farm.ts'
import { pigCanStand, BEDS, GARDENS, HIDEY_D, HIDEY_W, inRect, BOUNDS, DOOR_MID, DOOR_OUT, FENCE_EDGES, nearestFence, HIDEYS, HIDEY_H, SALAD_TABLE, canBuy, dist, groundAt, isInside, onFarm, settleFarmer, settlePig } from '../../src/core/map.ts'
import { moveFarmer, type Body } from '../../src/core/move.ts'
import { parseClientMsg, type ServerMsg } from '../../src/core/protocol.ts'
import {
  CRAVING_HAPPY,
  DAY_MS,
  DAY_RAMP,
  START_TIME,
  GRAVITY,
  GROW_MS,
  HERD_MAX,
  ISSUE_BIT,
  LAND,
  LITTER,
  PAY,
  PIG_COUNT,
  PREGNANCY_DAYS,
  RUN_SPEED,
  SALAD_BITES,
  SALAD_FROM,
  TICK_MS,
  SQUARE_IDS,
  WALK_SPEED,
  dayLength,
  farmDays,
  farmTime,
  poorly,
  JOB_PAY,
  JUMP_V,
  JOBS_PER_DAY,
  NIGHT_START,
  isSneaky,
  HEAD_HOME,
  OUT_LATE,
  PUP_DAYS,
  RAIN_GROW,
  SHOW_PRIZE,
  ZOOMIES_MS,
  ZOOM_FILL_MS,
} from '../../src/core/rules.ts'
import { lonePig, run, seeded, setup, veg } from './helpers.ts'

const sent = (farm: Farm) => farm.out.map((o) => o.msg)
const alerts = (farm: Farm, kind: string) => sent(farm).filter((m): m is Extract<ServerMsg, { t: 'alert' }> => m.t === 'alert' && m.kind === kind)
const report = (farm: Farm) => {
  const r = sent(farm).find((m) => m.t === 'report')
  if (r?.t !== 'report') throw new Error('no report')
  return r
}
/** Farm time for a given day (1-based) and time of day. */
const at = (day: number, time: number) => farmTime(day - 1 + time)

describe('treat of the day', () => {
  it('a bite of the craving cheers a pig up extra, and the day pays for it', () => {
    const { farm, id, me } = setup()
    farm.craving = 'pepper'
    const p = lonePig(farm, 2, 2, 40)
    p.happy = 50
    me.basket[veg('pepper')] = 1
    Object.assign(me, { x: 2, z: 6 })
    farm.handle(id, { t: 'throw', veg: 'pepper', x: 2, z: 3 })
    expect(run(farm, 8000, () => p.state === 'eat')).toBe(true)
    const before = p.happy
    run(farm, 1200)
    expect(p.happy - before).toBeGreaterThan(CRAVING_HAPPY - 1)

    farm.out = []
    farm.payDay()
    expect(report(farm).lines.find((l) => l.label.includes('craving'))?.coins).toBe(1)
    // A new day, a new craving.
    expect(farm.craving).not.toBe('pepper')
    expect(farm.snapshot().craving).toBe(farm.craving)
  })
})

describe('the farm clock', () => {
  it('the first days are short and get longer, so a new farm gets going quickly', () => {
    expect(dayLength(1)).toBeLessThan(dayLength(2))
    expect(dayLength(1)).toBe(DAY_MS / 2)
    expect(dayLength(DAY_RAMP + 1)).toBe(DAY_MS)
    expect(dayLength(20)).toBe(DAY_MS)
    // farmTime and farmDays go back and forth.
    for (const d of [0.05, 0.5, 1, 2.76, 4.2, 9.9]) expect(farmDays(farmTime(d))).toBeCloseTo(d, 6)
    const { farm } = setup()
    expect(farm.day).toBe(1)
    expect(farm.dayTime).toBeCloseTo(START_TIME)
    farm.t = farmTime(1) + 1
    expect(farm.day).toBe(2)
    // Day 1 is over in half the time a full day takes.
    expect(farmTime(1) - farmTime(START_TIME)).toBeCloseTo(DAY_MS / 2 * (1 - START_TIME))
  })
})

describe('daily jobs', () => {
  it('a fresh farm has a few different jobs, and a new lot comes each morning', () => {
    const { farm } = setup()
    expect(new Set(farm.jobs.map((j) => j.kind)).size).toBe(JOBS_PER_DAY)
    farm.jobs[0].n = 1
    farm.payDay()
    expect(new Set(farm.jobs.map((j) => j.kind)).size).toBe(JOBS_PER_DAY)
    expect(farm.jobs.every((j) => j.n === 0)).toBe(true)
  })

  it('jobs pay out as soon as they are done', () => {
    const { farm, id, me } = setup()
    farm.jobs = [{ kind: 'plant', goal: 2, n: 0 }]
    const coins = farm.coins
    for (const i of [0, 1]) {
      farm.beds[i].stage = 'empty'
      Object.assign(me, { x: BEDS[i].x + 2, z: BEDS[i].z })
      farm.handle(id, { t: 'plant', bed: i })
    }
    expect(farm.coins).toBe(coins + JOB_PAY)
    expect(alerts(farm, 'job')).toHaveLength(1)
    // A celebration: called out big on everyone's screen (an everyday line like planting isn't).
    expect(alerts(farm, 'job')[0].cheer).toBe(true)
    expect(sent(farm).some((m) => m.t === 'alert' && m.kind !== 'job' && m.cheer)).toBe(false)
    expect(farm.snapshot().jobs[0]).toMatchObject({ kind: 'plant', n: 2, goal: 2, text: 'Plant 2 beds' })
    // Done is done: no paying twice.
    farm.beds[2].stage = 'empty'
    Object.assign(me, { x: BEDS[2].x + 2, z: BEDS[2].z })
    farm.handle(id, { t: 'plant', bed: 2 })
    expect(farm.coins).toBe(coins + JOB_PAY)
  })
})

describe('names and favourites', () => {
  it('rename and adopt the pig you are holding; everyone hears about it; it is saved', () => {
    const { farm, id, me } = setup()
    const p = lonePig(farm, 2, 2, 90)
    farm.handle(id, { t: 'rename', name: 'Nope' })
    expect(p.name).not.toBe('Nope')

    Object.assign(me, { x: 3, z: 2 })
    farm.handle(id, { t: 'pickup', pig: 0 })
    farm.handle(id, { t: 'rename', name: 'Sir Wheeks' })
    farm.handle(id, { t: 'adopt' })
    expect(p.name).toBe('Sir Wheeks')
    expect(p.adopter).toBe('Ann')
    const looks = sent(farm).filter((m) => m.t === 'pig')
    expect(looks.at(-1)).toMatchObject({ t: 'pig', look: { id: 0, name: 'Sir Wheeks', adopter: 'Ann' } })

    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.looks()[0]).toMatchObject({ name: 'Sir Wheeks', adopter: 'Ann' })

    // Adopting again lets them go.
    farm.handle(id, { t: 'adopt' })
    expect(p.adopter).toBeUndefined()
  })
})

describe('emotes', () => {
  it('go out to everyone, but not too fast', () => {
    const { farm, id } = setup()
    farm.handle(id, { t: 'emote', e: 1 })
    farm.handle(id, { t: 'emote', e: 2 })
    expect(sent(farm).filter((m) => m.t === 'emote')).toEqual([{ t: 'emote', by: id, e: 1 }])
    run(farm, 1000)
    farm.handle(id, { t: 'emote', e: 2 })
    expect(sent(farm).filter((m) => m.t === 'emote')).toHaveLength(2)
  })
})

describe('jumping', () => {
  it('anything lower than your feet does not get in the way, and you can stand on the huts', () => {
    setup()
    expect((JUMP_V * JUMP_V) / (2 * GRAVITY)).toBeGreaterThan(1.4) // high enough for the hay
    // The garden fence stops you on the ground, but not mid-jump.
    const walking = { x: -14.8, z: -3 }
    settleFarmer(walking, 0)
    expect(walking.x).toBeGreaterThan(-14.6)
    const jumping = { x: -14.8, z: -3 }
    settleFarmer(jumping, 1)
    expect(jumping).toEqual({ x: -14.8, z: -3 })
    // Barn walls are too tall to jump.
    const wall = { x: 11.8, z: -18 }
    settleFarmer(wall, 1.5)
    expect(wall.x === 11.8).toBe(false)
    // Huts and hay are somewhere to stand.
    expect(groundAt(HIDEYS[0])).toBe(HIDEY_H)
    expect(groundAt({ x: HIDEYS[0].x, z: HIDEYS[0].z + 2 })).toBe(0)
    // Over the farm fence, but not far.
    const out = { x: BOUNDS.x1 + 3, z: 0 }
    settleFarmer(out, 0)
    expect(out.x).toBe(BOUNDS.x1 + 3)
    const far = { x: BOUNDS.x1 + 20, z: 0 }
    settleFarmer(far, 0)
    expect(far.x).toBeLessThan(BOUNDS.x1 + 6)
  })

  it('the server takes your height, so you can be up on things', () => {
    const { farm, id, me } = setup()
    farm.handle(id, { t: 'state', x: -14.8, y: 0, z: -3, yaw: 0 })
    expect(me.x).toBeGreaterThan(-14.6)
    farm.handle(id, { t: 'state', x: -14.8, y: 1, z: -3, yaw: 0 })
    expect(me.x).toBe(-14.8)
    expect(farm.snapshot().farmers[0]).toMatchObject({ x: -14.8, y: 1 })
    // Older clients don't send it; nonsense heights are ignored.
    expect(parseClientMsg(JSON.stringify({ t: 'state', x: 1, z: 2, yaw: 0 }))).toEqual({ t: 'state', x: 1, y: 0, z: 2, yaw: 0 })
    expect(parseClientMsg(JSON.stringify({ t: 'state', x: 1, y: 99, z: 2, yaw: 0 }))).toMatchObject({ y: 0 })
  })
})

describe('zoomies', () => {
  const happyHerd = (farm: Farm, happy: number) => {
    for (const p of farm.pigs) Object.assign(p, { happy, hunger: 100, issues: 0, state: 'idle', until: farm.t + 600_000 })
  }
  const zoomies = (farm: Farm) => alerts(farm, 'fun').filter((a) => a.text.includes('ZOOMIES')).length

  it('the zoomometer fills while the herd is happy, then the pigs go wild for a bit', () => {
    const { farm } = setup()
    happyHerd(farm, 90)
    run(farm, ZOOM_FILL_MS / 4)
    expect(farm.snapshot().zoom).toBeGreaterThan(0.2)
    expect(zoomies(farm)).toBe(0)
    expect(run(farm, ZOOM_FILL_MS, () => zoomies(farm) > 0)).toBe(true)
    expect(farm.zoomMeter).toBe(0)
    run(farm, 400)
    expect(farm.pigs.filter((p) => p.state === 'zoom' || p.state === 'popcorn').length).toBeGreaterThan(farm.pigs.length / 2)
    run(farm, ZOOMIES_MS + 10_000)
    expect(farm.pigs.filter((p) => p.state === 'zoom')).toHaveLength(0)
  })

  it('a grumpy herd drains it, and it rests at night', () => {
    const { farm } = setup()
    farm.zoomMeter = 0.5
    happyHerd(farm, 30)
    run(farm, 10_000)
    expect(farm.zoomMeter).toBeLessThan(0.5)
    const meter = farm.zoomMeter
    farm.t = at(1, NIGHT_START) + 1000
    happyHerd(farm, 100)
    run(farm, 10_000)
    expect(farm.zoomMeter).toBe(meter)
  })
})

describe('weather', () => {
  it('rain sends the pigs into the barn and makes the garden grow faster', () => {
    const { farm } = setup(4)
    farm.beds[0].stage = 'growing'
    farm.beds[0].plantedAt = farm.t
    farm.beds[0].readyAt = farm.t + GROW_MS
    farm.rainFrom = farm.t + 100
    farm.rainTo = farm.t + 120_000
    run(farm, 500)
    expect(farm.snapshot().rain).toBe(true)
    expect(alerts(farm, 'rain')).toHaveLength(1)
    run(farm, 60_000)
    const out = farm.pigs.filter((p) => !isInside(p) && p.state !== 'lost')
    expect(out.length).toBeLessThan(farm.pigs.length / 10)
    run(farm, GROW_MS / RAIN_GROW - 60_000 + 1000)
    expect(farm.beds[0].stage).toBe('ripe')
  })
})

describe('the barn door', () => {
  const night = (farm: Farm) => {
    farm.t = at(1, NIGHT_START) + 1000
    farm.tick(50)
  }

  it('farmers shut it from close by; shut out pigs wait at the door until it opens', () => {
    const { farm, id, me } = setup()
    farm.handle(id, { t: 'door' })
    expect(farm.doorShut).toBe(false) // too far away
    Object.assign(me, { x: DOOR_MID.x + 1, z: DOOR_MID.z + 1 })
    farm.handle(id, { t: 'door' })
    expect(farm.doorShut).toBe(true)
    expect(farm.snapshot().door).toBe(true)

    night(farm)
    const p = lonePig(farm, 3, 2, 90)
    p.until = 0
    run(farm, 20_000)
    expect(isInside(p)).toBe(false)
    expect(dist(p, DOOR_OUT)).toBeLessThan(3)

    farm.handle(id, { t: 'door' })
    expect(run(farm, 20_000, () => isInside(p))).toBe(true)
  })

  it('left open at night, a fox can get into the barn', () => {
    const { farm } = setup()
    night(farm)
    const p = lonePig(farm, 0, -17, 90)
    farm.spawnFox()
    Object.assign(farm.preds[0], { x: 0, z: -4 })
    expect(run(farm, 40_000, () => p.state === 'carried')).toBe(true)
    expect(alerts(farm, 'fox').some((a) => a.text.includes('barn'))).toBe(true)
  })

  it('shut, the barn is safe', () => {
    const { farm } = setup()
    farm.doorShut = true
    night(farm)
    const p = lonePig(farm, 0, -17, 90)
    farm.spawnFox()
    Object.assign(farm.preds[0], { x: 0, z: -4 })
    let inBarn = false
    run(farm, 40_000, () => {
      inBarn ||= farm.preds.some((x) => isInside(x))
      return p.state === 'carried'
    })
    expect(p.state).not.toBe('carried')
    expect(inBarn).toBe(false)
  })

  it('opens itself at dawn', () => {
    const { farm } = setup()
    farm.doorShut = true
    farm.t = at(2, 0) - 100
    run(farm, 500)
    expect(farm.doorShut).toBe(false)
  })
})

describe('babies', () => {
  const breed = (farm: Farm, days: number) => farm['breed'](days * DAY_MS)

  it('a happy sow (with a boar about) gets pregnant now and then, and needs looking after', () => {
    const { farm } = setup()
    for (const p of farm.pigs) Object.assign(p, { happy: 90, hunger: 90 })
    breed(farm, 100) // so many days that it's sure to happen
    const mums = farm.pigs.filter((p) => p.due !== undefined)
    expect(mums.length).toBeGreaterThan(0)
    expect(mums.every((p) => p.sex === 'sow')).toBe(true)
    expect(alerts(farm, 'baby').length).toBe(mums.length)
    expect(sent(farm).some((m) => m.t === 'pig' && m.look.due !== undefined)).toBe(true)

    // Expecting mums get hungry faster, and how well she's looked after shows on the snapshot.
    const mum = mums[0]
    const other = farm.pigs.find((p) => p.due === undefined)!
    for (const p of [mum, other]) Object.assign(p, { hunger: 30, state: 'sleep', until: Infinity, x: -25, z: -20 })
    run(farm, 10_000)
    expect(mum.hunger).toBeLessThan(other.hunger)
    expect(farm.snapshot().pigs[mum.id].care).toBe(0)
  })

  it('no boar, no babies; and none once the barn is full', () => {
    const { farm } = setup()
    for (const p of farm.pigs) Object.assign(p, { happy: 90, hunger: 90, sex: 'sow' })
    breed(farm, 100)
    expect(farm.pigs.some((p) => p.due !== undefined)).toBe(false)

    const full = setup().farm
    for (const p of full.pigs) Object.assign(p, { happy: 90, hunger: 90 })
    while (full.pigs.length < HERD_MAX) full.giveBirth(full.pigs[0])
    breed(full, 100)
    expect(full.pigs.some((p) => p.due !== undefined)).toBe(false)
  })

  it('litters are 2 to 5 (5 is rare), smaller for a mum nobody looked after', () => {
    expect(LITTER.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    const sizes: number[] = []
    for (let seed = 1; seed <= 80; seed++) {
      const { farm } = setup(seed)
      const mum = farm.pigs[0]
      Object.assign(mum, { careGood: 100, careTotal: 100 })
      sizes.push(farm.giveBirth(mum).length)
    }
    expect(Math.min(...sizes)).toBe(2)
    expect(Math.max(...sizes)).toBe(5)
    expect(sizes.filter((n) => n >= 3).length).toBeGreaterThan(30)
    expect(sizes.filter((n) => n === 5).length).toBeLessThan(20)

    for (let seed = 1; seed <= 20; seed++) {
      const { farm } = setup(seed)
      const mum = farm.pigs[0]
      Object.assign(mum, { careGood: 0, careTotal: 100 })
      expect(farm.giveBirth(mum)).toHaveLength(2)
    }
  })

  it('when she is due, mum has her babies; they follow her about and grow up', () => {
    const { farm } = setup()
    const mum = farm.pigs[0]
    farm.conceive(mum)
    expect(mum.due).toBeCloseTo(farm.days + PREGNANCY_DAYS)
    mum.due = farm.days + 0.0001
    farm.out = []
    run(farm, 200)
    expect(mum.due).toBeUndefined()
    const pups = farm.pigs.filter((p) => p.mum === mum.id)
    expect(pups.length).toBeGreaterThan(0)
    expect(pups.every((p) => p.age === 0)).toBe(true)
    expect(alerts(farm, 'baby').some((a) => a.text.includes(mum.name))).toBe(true)

    const pup = pups[0]
    for (const p of farm.pigs) Object.assign(p, { state: 'sleep', until: Infinity, x: -25, z: -20 })
    Object.assign(mum, { x: -3, z: -4, state: 'idle', until: Infinity })
    Object.assign(pup, { x: -3, z: 4, state: 'idle', until: 0, hunger: 95 })
    expect(run(farm, 20_000, () => dist(pup, mum) < 2)).toBe(true)

    pup.born = farm.days - PUP_DAYS
    run(farm, 100)
    expect(pup.age).toBe(1)
  })

  it('a saved farm keeps its babies and mums-to-be', () => {
    const { farm } = setup()
    const [pup] = farm.giveBirth(farm.pigs[0])
    const mum = farm.pigs.find((p) => p.sex === 'sow' && p.age > 0 && p.id !== 0)!
    farm.conceive(mum)
    mum.careGood = 5
    mum.careTotal = 10
    const again = new Farm(seeded(5), JSON.parse(JSON.stringify(farm.save())))
    expect(again.pigs).toHaveLength(farm.pigs.length)
    expect(again.pigs[pup.id]).toMatchObject({ age: 0, mum: pup.mum, name: pup.name })
    expect(again.pigs[mum.id]).toMatchObject({ due: mum.due, careGood: 5, careTotal: 10 })
  })
})

describe('land', () => {
  it('a new farm is small: the barn, the yard and a dozen piggies who stay on it', () => {
    const { farm } = setup(7, true)
    expect(farm.land).toEqual(['barn', 'yard'])
    expect(farm.pigs).toHaveLength(PIG_COUNT)
    expect(farm.snapshot().land).toEqual(['barn', 'yard'])
    // A thrown carrot over the fence lands back on the farm.
    const out = { x: -20, z: 0 }
    settlePig(out, 0.25)
    expect(onFarm(out)).toBe(true)
    // No orchard, no apples; and no apple jobs either.
    run(farm, 90_000)
    expect([...farm.foods.values()].some((f) => f.kind === 'apple')).toBe(false)
    expect(farm.jobs.some((j) => j.kind === 'apples')).toBe(false)
    expect(farm.pigs.every((p) => p.state === 'lost' || p.state === 'carried' || onFarm(p))).toBe(true)
  })

  it('squares are bought next to land the farm has, and the fence moves out', () => {
    const { farm, id } = setup(1, true)
    farm.coins = 1000
    const fence = FENCE_EDGES.length
    farm.handle(id, { t: 'land', square: 'pond' })
    expect(farm.land).not.toContain('pond') // not next door
    farm.handle(id, { t: 'land', square: 'garden' })
    expect(farm.land).toContain('garden')
    expect(farm.coins).toBe(1000 - LAND.garden.cost)
    expect(alerts(farm, 'shop')).toHaveLength(1)
    expect(FENCE_EDGES.length).not.toBe(fence)
    expect(onFarm({ x: -20, z: 0 })).toBe(true)
    farm.handle(id, { t: 'land', square: 'pond' }) // next to the garden now
    expect(farm.land).toContain('pond')
    expect(canBuy('flowers', farm.land)).toBe(false)

    // Not without the coins.
    farm.coins = 0
    farm.handle(id, { t: 'land', square: 'huts' })
    expect(farm.land).not.toContain('huts')

    // Saved and loaded.
    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.land).toEqual(expect.arrayContaining(['barn', 'yard', 'garden', 'pond']))
  })

  it('some upgrades need land first', () => {
    const { farm, id } = setup(1, true)
    farm.coins = 1000
    farm.handle(id, { t: 'buy', upgrade: 'orchard' })
    expect(farm.upgrades).not.toContain('orchard')
    farm.handle(id, { t: 'land', square: 'orchard' })
    farm.handle(id, { t: 'buy', upgrade: 'orchard' })
    expect(farm.upgrades).toContain('orchard')
  })

  it('foxes come in over the fence of a small farm, and carry pigs back out', () => {
    const { farm } = setup(3, true)
    const pig = farm.pigs[0]
    Object.assign(pig, { x: 8, z: 7.5, hunger: 90, state: 'idle', until: Infinity })
    farm.spawnFox()
    const fox = farm.preds[0]
    expect(onFarm(fox)).toBe(false)
    Object.assign(fox, { x: 8.3, z: 7.5 })
    run(farm, 100)
    expect(pig.state).toBe('carried')
    expect(run(farm, 30_000, () => pig.state === 'lost')).toBe(true)
  })

  it('a shooed fox runs off and is gone once it is past the fence, whatever shape the farm is', () => {
    // Foxes used to get stuck just outside the fence where their way out ran close to another square of the farm.
    const lands = [['barn', 'yard'], ['barn', 'yard', 'garden'], ['barn', 'yard', 'garden', 'meadow'], ['barn', 'yard', 'orchard'], [...SQUARE_IDS]]
    for (let seed = 1; seed <= 60; seed++) {
      const { farm, id, me } = setup(seed, true)
      farm.land = [...lands[seed % lands.length]] as typeof farm.land
      farm.tick(50)
      farm.spawnFox()
      const fox = farm.preds[0]
      run(farm, 2000 + (seed % 7) * 3000)
      if (!farm.preds.includes(fox)) continue
      Object.assign(me, { x: fox.x + 1, z: fox.z })
      farm.handle(id, { t: 'shoo' })
      expect(run(farm, 15_000, () => !farm.preds.includes(fox)), `seed ${seed}: fox left at ${fox.x.toFixed(1)},${fox.z.toFixed(1)}`).toBe(true)
    }
  })

  it('old saves are ignored: everyone starts small', () => {
    const { farm } = setup()
    const save = { ...JSON.parse(JSON.stringify(farm.save())), v: 1 }
    const again = new Farm(seeded(2), save)
    expect(again.land).toEqual(['barn', 'yard'])
    expect(again.t).toBe(0)
  })

  it('pigs enjoy the new land: lush meadow grass, wild flowers and the pond', () => {
    const { farm } = setup()
    const p = lonePig(farm, -22, -15, 40)
    p.happy = 40
    Object.assign(p, { state: 'graze', until: Infinity })
    run(farm, 5000)
    const meadow = p.hunger
    Object.assign(p, { x: 6, z: -5, hunger: 40 })
    run(farm, 5000)
    expect(meadow).toBeGreaterThan(p.hunger)

    Object.assign(p, { x: 20, z: 15, happy: 40 })
    run(farm, 5000)
    const flowers = p.happy
    Object.assign(p, { x: 6, z: -5, happy: 40 })
    run(farm, 5000)
    expect(flowers).toBeGreaterThan(p.happy)

    Object.assign(p, { x: -22, z: 12.5, happy: 40, state: 'idle' })
    run(farm, 5000)
    expect(p.happy).toBeGreaterThan(41)
  })
})

describe('poorly piggies', () => {
  it('a hungry, glum or unwell pig is slow, and mopes about in corners and along the fence', () => {
    expect(poorly({ hunger: 90, happy: 80, issues: 0 })).toBe(false)
    expect(poorly({ hunger: 20, happy: 80, issues: 0 })).toBe(true)
    expect(poorly({ hunger: 90, happy: 20, issues: 0 })).toBe(true)
    expect(poorly({ hunger: 90, happy: 80, issues: ISSUE_BIT.nails })).toBe(true)

    // Same walk, well and poorly: the poorly one gets less far.
    const walked = (issues: number) => {
      const { farm } = setup()
      const p = lonePig(farm, -5, 0, 90)
      Object.assign(p, { happy: 80, issues })
      farm['walk'](p, { x: 5, z: 0 }, 'wander')
      run(farm, 2000)
      return p.x + 5
    }
    expect(walked(ISSUE_BIT.teeth)).toBeLessThan(walked(0) * 0.7)

    // Left to it, a poorly pig spends its time moping, near the edge of things; a well one never does.
    const mopes = (issues: number) => {
      const { farm } = setup(1, true)
      const p = lonePig(farm, 0, 0, 90)
      Object.assign(p, { happy: 80, issues, until: 0 })
      let moping = 0
      let edge = 0
      run(farm, 60_000, () => {
        if (p.issues !== issues) p.issues = issues
        if (p.state === 'mope') {
          moping++
          if (nearestFence(p).d < 2.5 || (isInside(p) && (Math.abs(p.x) > 8 || p.z < -22))) edge++
        }
        return false
      })
      return { moping, edge }
    }
    const sick = mopes(ISSUE_BIT.mites)
    expect(sick.moping).toBeGreaterThan(200)
    expect(sick.edge).toBeGreaterThan(sick.moping / 3)
    expect(mopes(0).moping).toBe(0)
  })
})

describe('herding', () => {
  /** Walks the farmer along (as their browser would), a tick at a time. */
  const walkTo = (farm: Farm, id: number, me: { x: number; z: number }, to: { x: number; z: number }, speed = 5) => {
    for (let i = 0; i < 400; i++) {
      const d = Math.hypot(to.x - me.x, to.z - me.z)
      if (d < 0.1) return
      const step = Math.min(d, (speed * TICK_MS) / 1000)
      farm.handle(id, { t: 'state', x: me.x + ((to.x - me.x) / d) * step, y: 0, z: me.z + ((to.z - me.z) / d) * step, yaw: 0 })
      farm.tick(TICK_MS)
    }
  }

  it('walk at a calm pig and it scoots out of the way, along the way you are going; stand still and it stays put', () => {
    const { farm, id, me } = setup()
    const p = lonePig(farm, 0, 3, 95)
    p.happy = 80
    Object.assign(me, { x: -5, z: 3 })
    farm.tick(TICK_MS)
    walkTo(farm, id, me, { x: -1.5, z: 3 })
    expect(p.state).toBe('scoot')
    expect(p.tx).toBeGreaterThan(0.5) // off ahead of the farmer

    const q = lonePig(farm, 0, 3, 95)
    Object.assign(q, { happy: 80, state: 'idle', until: farm.t + 60_000 })
    Object.assign(me, { x: -1.8, z: 3 })
    run(farm, 2000)
    expect(q.state).toBe('idle')
    expect(q.x).toBe(0)
  })

  it('you can herd a pig in through the barn door', () => {
    const { farm, id, me } = setup()
    const p = lonePig(farm, 0.3, -5, 95)
    Object.assign(p, { happy: 80, state: 'idle', until: farm.t + 600_000 })
    Object.assign(me, { x: 0, z: 1 })
    farm.tick(TICK_MS)
    for (let i = 0; i < 6 && !isInside(p); i++) {
      // Get round behind it, then walk it towards the door.
      Object.assign(me, { x: p.x * 0.5, z: p.z + 4 })
      farm.tick(TICK_MS)
      walkTo(farm, id, me, { x: p.x * 0.3, z: Math.max(-9, p.z - 3) }, 4)
      run(farm, 1500)
    }
    expect(isInside(p)).toBe(true)
  })
})

describe('salad night', () => {
  const dusk = (farm: Farm) => {
    farm.t = at(1, SALAD_FROM) + 500
    farm.tick(50)
  }

  it('farmers make up a platter at the station and serve it at dusk; everyone comes in for supper', () => {
    const { farm, id, me } = setup()
    Object.assign(me, { x: SALAD_TABLE.x, z: SALAD_TABLE.z + 1 })
    me.basket = [4, 4, 0, 0, 0]
    farm.handle(id, { t: 'salad' })
    expect(farm.salad).toEqual([4, 4, 0, 0, 0])
    expect(me.basket).toEqual([0, 0, 0, 0, 0])
    expect(farm.snapshot().salad).toMatchObject({ veg: [4, 4, 0, 0, 0], served: false, bites: 0 })
    // Not enough variety yet.
    dusk(farm)
    farm.handle(id, { t: 'serve' })
    expect(farm.saladServed).toBe(false)

    me.basket = [0, 0, 3, 3, 0]
    farm.handle(id, { t: 'salad' })
    expect(farm.saladReady()).toBe(true)

    // Everybody's out on the lawn and peckish.
    for (const p of farm.pigs) Object.assign(p, { x: -3 + (p.id % 6) * 1.5, z: 2 + Math.floor(p.id / 6) * 1.5, hunger: 70, state: 'idle', until: farm.t + 1000 })
    farm.out = []
    farm.handle(id, { t: 'serve' })
    expect(farm.saladServed).toBe(true)
    expect(farm.foods.get(SALAD_ID)!.bites).toBe(14 * SALAD_BITES)
    expect(alerts(farm, 'fun').some((a) => a.text.includes('salad'))).toBe(true)
    expect(run(farm, 40_000, () => farm.pigs.filter((p) => isInside(p)).length === farm.pigs.length)).toBe(true)
    expect(run(farm, 20_000, () => farm.foods.get(SALAD_ID)!.bites < 14 * SALAD_BITES)).toBe(true)

    // Once a night.
    me.basket = [5, 5, 5, 0, 0]
    farm.handle(id, { t: 'salad' })
    expect(farm.saladSize()).toBe(0)

    // Paid for in the morning, then a fresh platter can be made.
    farm.out = []
    farm.payDay()
    expect(report(farm).lines.find((l) => l.label.includes('Salad'))?.coins).toBe(PAY.salad + 4 * PAY.saladKind)
    expect(farm.saladServed).toBe(false)
  })

  it('not before dusk, and only at the station', () => {
    const { farm, id, me } = setup()
    farm.salad = [3, 3, 3, 3, 0]
    Object.assign(me, { x: SALAD_TABLE.x, z: SALAD_TABLE.z + 1 })
    farm.handle(id, { t: 'serve' })
    expect(farm.saladServed).toBe(false)
    dusk(farm)
    Object.assign(me, { x: 5, z: 5 })
    farm.handle(id, { t: 'serve' })
    expect(farm.saladServed).toBe(false)
    Object.assign(me, { x: SALAD_TABLE.x, z: SALAD_TABLE.z + 1 })
    farm.handle(id, { t: 'serve' })
    expect(farm.saladServed).toBe(true)
  })
})

describe('momentum', () => {
  const body = (x = 0, z = 0): Body => ({ x, y: 0, z, vx: 0, vy: 0, vz: 0 })
  const steps = (b: Body, want: { x: number; z: number }, s: number, jump = false) => {
    let air = false
    for (let i = 0; i < s / 0.016; i++) air = moveFarmer(b, want, jump && i === 0, 0.016).airborne
    return air
  }

  it('you speed up and slow down quickly, but not instantly', () => {
    setup()
    const b = body(0, 0)
    steps(b, { x: WALK_SPEED, z: 0 }, 0.05)
    expect(b.vx).toBeGreaterThan(0)
    expect(b.vx).toBeLessThan(WALK_SPEED)
    steps(b, { x: WALK_SPEED, z: 0 }, 0.5)
    expect(b.vx).toBeCloseTo(WALK_SPEED, 1)
    steps(b, { x: 0, z: 0 }, 0.05)
    expect(b.vx).toBeGreaterThan(0)
    steps(b, { x: 0, z: 0 }, 0.5)
    expect(b.vx).toBe(0)
  })

  it('a jump keeps your speed, and you can only steer a little in the air', () => {
    setup()
    const b = body(0, 0)
    steps(b, { x: RUN_SPEED, z: 0 }, 0.5)
    const x0 = b.x
    // Let go of the keys mid-jump: still flying along.
    expect(steps(b, { x: 0, z: 0 }, 0.3, true)).toBe(true)
    expect(b.vx).toBeCloseTo(RUN_SPEED, 1)
    expect(b.x - x0).toBeGreaterThan(RUN_SPEED * 0.25)
    // Steering the other way only slows you down bit by bit.
    const before = b.vx
    steps(b, { x: -RUN_SPEED, z: 0 }, 0.1)
    expect(b.vx).toBeLessThan(before)
    expect(b.vx).toBeGreaterThan(0)
  })

  it('a wall stops you', () => {
    setup()
    const b = body(13, -18) // just outside the barn's east wall
    steps(b, { x: -RUN_SPEED, z: 0 }, 1)
    expect(b.x).toBeGreaterThan(12)
    expect(Math.abs(b.vx)).toBeLessThan(0.01)
  })
})

describe('friends', () => {
  it('every pig has a best friend, and they are overjoyed when a lost friend comes home', () => {
    const { farm } = setup()
    expect(farm.pigs[0].friend).toBe(1)
    expect(farm.pigs[1].friend).toBe(0)
    const p = farm.pigs[0]
    Object.assign(p, { state: 'lost', lostUntil: farm.t + 100 })
    run(farm, 300)
    expect(alerts(farm, 'fun').some((a) => a.text.includes(p.name) && a.text.includes('💕'))).toBe(true)
  })

  it('old saves without friends get paired up', () => {
    const { farm } = setup()
    const save = JSON.parse(JSON.stringify(farm.save()))
    for (const look of save.looks) delete look.friend
    const again = new Farm(seeded(6), save)
    expect(again.pigs[2].friend).toBe(3)
  })
})

describe('the pig show', () => {
  it('every few days the best-kept pig wins a rosette and a prize', () => {
    const { farm } = setup()
    // Day 3 ends: show day.
    farm.t = at(4, 0) + 100
    for (const p of farm.pigs) Object.assign(p, { happy: 50, hunger: 60 })
    const star = farm.pigs[5]
    Object.assign(star, { happy: 100, hunger: 100, issues: 0 })
    farm.out = []
    farm.payDay()
    expect(star.rosettes).toBe(1)
    expect(report(farm).lines.find((l) => l.label.includes('Pig show'))?.coins).toBe(SHOW_PRIZE)
    expect(sent(farm).some((m) => m.t === 'pig' && m.look.id === 5 && m.look.rosettes === 1)).toBe(true)

    // Not every day.
    farm.t = at(5, 0) + 100
    farm.out = []
    farm.payDay()
    expect(report(farm).lines.some((l) => l.label.includes('Pig show'))).toBe(false)
  })
})

describe('the farm diary', () => {
  it('counts what each farmer does, sends it on request and is saved', () => {
    const { farm, id, me } = setup()
    lonePig(farm, 2, 2, 30)
    me.basket[veg('carrot')] = 2
    Object.assign(me, { x: 2, z: 6 })
    farm.handle(id, { t: 'throw', veg: 'carrot', x: 2, z: 3 })
    run(farm, 1000)
    farm.handle(id, { t: 'diary' })
    const diary = farm.out.find((o) => o.msg.t === 'diary')
    expect(diary?.to).toBe(id)
    if (diary?.msg.t !== 'diary') throw new Error('no diary')
    expect(diary.msg.rows[0]).toMatchObject({ name: 'Ann', fed: 1, wheeks: 1 })

    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.diaryRows()[0]).toMatchObject({ name: 'Ann', fed: 1 })
  })
})

describe('saving the day', () => {
  it('keeps the craving, jobs and barn door', () => {
    const { farm } = setup()
    farm.craving = 'apple'
    farm.jobs[0].n = 1
    farm.doorShut = true
    const again = new Farm(seeded(2), JSON.parse(JSON.stringify(farm.save())))
    expect(again.craving).toBe('apple')
    expect(again.jobs).toEqual(farm.jobs)
    expect(again.doorShut).toBe(true)
  })
})

describe('new messages', () => {
  it('are checked', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'rename', name: '  <Mr> Biscuits!  ' }))).toEqual({ t: 'rename', name: 'Mr Biscuits!' })
    expect(parseClientMsg(JSON.stringify({ t: 'rename', name: '<<>>' }))).toBeNull()
    expect(parseClientMsg(JSON.stringify({ t: 'emote', e: 3 }))).toEqual({ t: 'emote', e: 3 })
    expect(parseClientMsg(JSON.stringify({ t: 'emote', e: 4 }))).toBeNull()
    for (const t of ['adopt', 'door', 'diary', 'salad', 'serve', 'sack', 'putdown', 'cuddle', 'shoo']) expect(parseClientMsg(JSON.stringify({ t }))).toEqual({ t })
    expect(parseClientMsg(JSON.stringify({ t: 'hay', patch: 2 }))).toEqual({ t: 'hay', patch: 2 })
    expect(parseClientMsg(JSON.stringify({ t: 'hay' }))).toBeNull()
  })
})

describe('bedtime and the morning report', () => {
  it('pigs head in at dusk, and only count as out after dark once the grace hour is up', () => {
    const { farm } = setup()
    const p = lonePig(farm, 2, 6, 100)
    expect(isInside(p)).toBe(false)
    const outside = () => {
      Object.assign(p, { x: 2, z: 6, state: 'idle', until: farm.t + 60_000 })
    }

    // Dusk: off home before it gets dark.
    farm.t = farmTime(HEAD_HOME) - 200
    outside()
    run(farm, 500)
    expect(p.state).toBe('home')

    // Still out just after dark: not counted yet.
    farm.t = farmTime(NIGHT_START) + 500
    outside()
    run(farm, 200)
    expect(farm['today'].outAtNight.has(p.id)).toBe(false)

    // Still out at 9pm: that counts.
    farm.t = farmTime(OUT_LATE) + 100
    outside()
    run(farm, 100)
    expect(farm['today'].outAtNight.has(p.id)).toBe(true)
  })

  it('only problems you can see count as still poorly, and the report says which', () => {
    const { farm } = setup()
    for (const p of farm.pigs) p.issues = 0
    farm.pigs[0].issues = ISSUE_BIT.nails | ISSUE_BIT.teeth // looks fine
    farm.pigs[1].issues = ISSUE_BIT.mites
    farm.pigs[2].issues = ISSUE_BIT.mites | ISSUE_BIT.sniffles
    farm.payDay()
    const line = report(farm).lines.find((l) => l.label.includes('Still poorly'))!
    expect(line.label).toContain('2: 2 mites, sniffles')
    expect(line.coins).toBe(2 * PAY.poorly)
  })
})

describe('guinea pig trains', () => {
  it('two pigs going the same way walk in a line, then each goes to its own spot', () => {
    const { farm } = setup()
    const a = lonePig(farm, 2, 4, 100)
    const b = farm.pigs.find((p) => p !== a)!
    for (const p of farm.pigs) if (p !== a && p !== b) Object.assign(p, { state: 'sleep', until: Infinity })
    // Both off across the yard, the same way; a is a little ahead and a bit to one side.
    Object.assign(a, { x: 2, z: 4, state: 'wander', tx: 2, tz: 14, until: Infinity, hunger: 100, happy: 90, issues: 0 })
    Object.assign(b, { x: 2.6, z: 3, state: 'wander', tx: 2.6, tz: 14.5, until: Infinity, hunger: 100, happy: 90, issues: 0 })
    let behind = 0
    for (let i = 0; i < 60; i++) {
      run(farm, 100)
      if (b.follow === a.id) behind++
    }
    expect(behind).toBeGreaterThan(30)
    // In a line: b has fallen in right behind a.
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.4)
    expect(a.z - b.z).toBeGreaterThan(0.4)
    // Nearly there, it peels off for its own spot.
    run(farm, 15_000, () => b.state !== 'wander')
    expect(Math.hypot(b.x - 2.6, b.z - 14.5)).toBeLessThan(0.5)
  })
})

describe('pause', () => {
  it('P stops everything for everyone till someone carries on; nobody left, it carries on by itself', () => {
    const { farm, id, me } = setup()
    const bob = farm.join('Bob', 1)!
    const p = lonePig(farm, 0, 0, 100)
    farm['walk'](p, { x: 6, z: 6 }, 'wander')
    farm.handle(id, { t: 'pause' })
    expect(farm.snapshot().paused).toBe('Ann')
    expect(alerts(farm, 'farmer').some((a) => a.text.includes('Ann paused the farm'))).toBe(true)
    const t = farm.t
    const at = { x: p.x, z: p.z }
    run(farm, 5000)
    expect(farm.t).toBe(t)
    expect({ x: p.x, z: p.z }).toEqual(at)
    // Nothing gets done meanwhile.
    me.basket[0] = 3
    farm.handle(id, { t: 'throw', veg: 'carrot', x: 1, z: 1 })
    expect(me.basket[0]).toBe(3)
    expect(parseClientMsg(JSON.stringify({ t: 'pause' }))).toEqual({ t: 'pause' })

    // Anyone can carry on.
    farm.handle(bob, { t: 'pause' })
    expect(farm.paused).toBeNull()
    run(farm, 1000)
    expect(farm.t).toBeGreaterThan(t)
    expect(p.x).not.toBe(at.x)

    farm.handle(id, { t: 'pause' })
    farm.leave(id)
    expect(farm.paused).toBe('Ann')
    farm.leave(bob)
    expect(farm.paused).toBeNull()
  })
})

describe('finding the way', () => {
  it('pigs behind the barn go round to the door, not into the wall', () => {
    for (const [x, z] of [
      [13, -20], // between the barn and the far veg patch
      [20, -12], // in front of the far veg patch
      [-14, -20], // the hay meadow's stack yard
    ]) {
      const { farm } = setup()
      const p = lonePig(farm, x, z, 100)
      farm['walk'](p, { x: 0, z: -18 }, 'wander')
      // Round the corner, along the front and in: about 30 m, a little under 30 s at a walk. Sliding along the
      // walls takes far longer.
      expect(run(farm, 35_000, () => isInside(p))).toBe(true)
    }
  })

  it('round a veg patch to the far side of it, not into the fence (raiders excepted)', () => {
    const { farm } = setup()
    const garden = GARDENS.find((g) => g.square === 'garden')!
    const p = lonePig(farm, -22, garden.z0 - 1.5, 100)
    farm['walk'](p, { x: -22, z: garden.z1 + 1.5 }, 'wander')
    let through = false
    expect(
      run(farm, 30_000, () => {
        through ||= inRect(p, garden)
        return p.state !== 'wander'
      }),
    ).toBe(true)
    expect(through).toBe(false)
    expect(Math.hypot(p.x + 22, p.z - garden.z1 - 1.5)).toBeLessThan(0.5)
  })
})

describe('hidey huts', () => {
  it('pigs only get in and out by the open front, round the back and sides', () => {
    const { farm } = setup()
    const hut = HIDEYS.find((h) => h.square === 'yard' && h.x > 0)!
    const inHut = (p: { x: number; z: number }) => Math.abs(p.x - hut.x) < HIDEY_W / 2 && Math.abs(p.z - hut.z) < HIDEY_D / 2
    const front = hut.z + HIDEY_D / 2
    // Every way into (or out of) the hut is across its front edge.
    const watch = (p: { x: number; z: number }, until: () => boolean) => {
      let was = { x: p.x, z: p.z }
      return run(farm, 20_000, () => {
        if (inHut(p) !== inHut(was)) expect(Math.max(p.z, was.z)).toBeGreaterThan(front - 0.35)
        was = { x: p.x, z: p.z }
        return until()
      })
    }
    for (const [x, z] of [
      [hut.x, hut.z - 2.5], // behind
      [hut.x - 2.5, hut.z], // beside
      [hut.x + 2, hut.z - 2], // behind a corner
    ]) {
      const p = lonePig(farm, x, z, 100)
      farm['flee'](p)
      expect(watch(p, () => p.state === 'hide')).toBe(true)
      expect(inHut(p)).toBe(true)
      // And out again, to a spot behind it.
      farm['walk'](p, { x: hut.x, z: hut.z - 3 }, 'wander')
      expect(watch(p, () => p.state !== 'wander')).toBe(true)
      expect(Math.hypot(p.x - hut.x, p.z - (hut.z - 3))).toBeLessThan(0.5)
    }
  })
})

describe('sneaky piggies', () => {
  it('squeeze into the veg patch and munch a bed, which stops growing, until a farmer catches them', () => {
    const { farm, me } = setup()
    const p = lonePig(farm, 2, 9, 40)
    Object.assign(me, { x: -30, z: 20 })
    const bed = farm.beds[0]
    Object.assign(bed, { stage: 'growing', plantedAt: farm.t, readyAt: farm.t + 50_000 })
    farm['startRaid'](p, 0)
    // Only once it's actually in there.
    expect(alerts(farm, 'fun').some((a) => a.text.includes('sneaked into the veg patch'))).toBe(false)
    expect(run(farm, 15_000, () => p.munchFrom > 0)).toBe(true)
    expect(alerts(farm, 'fun').some((a) => a.text.includes('sneaked into the veg patch'))).toBe(true)
    expect(Math.hypot(p.x - BEDS[0].x, p.z - BEDS[0].z)).toBeLessThan(1.5)

    // Munching away: tummy fills, the bed stands still.
    const grow = () => (farm.t - bed.plantedAt) / (bed.readyAt - bed.plantedAt)
    const before = grow()
    const hunger = p.hunger
    run(farm, 4000)
    expect(p.state).toBe('raid')
    expect(p.hunger).toBeGreaterThan(hunger)
    expect(grow()).toBeCloseTo(before, 5)

    // A farmer comes along: caught! Out it squeezes, and the bed grows again.
    Object.assign(me, { x: p.x + 1.5, z: p.z })
    run(farm, 200)
    expect(alerts(farm, 'fun').some((a) => a.text.startsWith('🥬 Caught!'))).toBe(true)
    expect(p.raid).toBeNull()
    Object.assign(me, { x: -30, z: 20 })
    expect(run(farm, 10_000, () => p.state !== 'raid')).toBe(true)
    expect(pigCanStand(p, -0.05)).toBe(true)
    const after = grow()
    run(farm, 2000)
    expect(grow()).toBeGreaterThan(after)
  })

  it('find their way into any patch: round apple trees, along the barn, under the fence into the bed', () => {
    // From the orchard (trees in the way) to the far veg patch, and from the yard to the one behind the barn.
    for (const [bed, x, z] of [
      [4, 20, 0],
      [2, 22, -8],
      [6, -20, 10],
      [8, 0, 20],
    ]) {
      const { farm, me } = setup()
      Object.assign(me, { x: -30, z: 24 })
      const p = lonePig(farm, x, z, 40)
      Object.assign(farm.beds[bed], { stage: 'growing', plantedAt: farm.t, readyAt: farm.t + 500_000 })
      expect(farm['startRaid'](p, bed)).toBe(true)
      expect(run(farm, 60_000, () => p.munchFrom > 0)).toBe(true)
      expect(Math.hypot(p.x - BEDS[bed].x, p.z - BEDS[bed].z)).toBeLessThan(1.5)
      expect(GARDENS.some((g) => inRect(p, g))).toBe(true)
    }
  })

  it('only some piggies are sneaky', () => {
    const sneaky = Array.from({ length: 30 }, (_, i) => isSneaky(i)).filter(Boolean).length
    expect(sneaky).toBeGreaterThan(10)
    expect(sneaky).toBeLessThan(20)
  })
})

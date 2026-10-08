import { Farm, type Pig } from '../../src/core/farm.ts'
import { setLand } from '../../src/core/map.ts'
import { SQUARE_IDS, TICK_MS, VEGGIES } from '../../src/core/rules.ts'

/** Seeded random so every run is the same. */
export function seeded(seed = 1) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Owns every square of land (most tests want the whole farm to play with). */
export function ownAll(farm: Farm) {
  farm.land = [...SQUARE_IDS]
  setLand(farm.land)
}

/** A farm with all its land, one farmer and no predators, unless a test asks for them. `small` keeps the starting land. */
export function setup(seed = 1, small = false) {
  const farm = new Farm(seeded(seed))
  if (!small) ownAll(farm)
  const id = farm.join('Ann', 0)!
  farm.nextFoxAt = farm.nextHawkAt = Infinity
  const me = farm.farmers.get(id)!
  return { farm, id, me }
}

export function run(farm: Farm, ms: number, until?: () => boolean) {
  for (let t = 0; t < ms; t += TICK_MS) {
    farm.tick(TICK_MS)
    if (until?.()) return true
  }
  return false
}

export const veg = (name: (typeof VEGGIES)[number]) => VEGGIES.indexOf(name)

/** Puts one pig somewhere and sends every other pig far away and stuffed, so they stay out of it. */
export function lonePig(farm: Farm, x: number, z: number, hunger = 30): Pig {
  for (const p of farm.pigs) {
    p.hunger = 100
    // The strip of hay meadow below the field.
    p.x = -24
    p.z = -9.5
    p.state = 'sleep'
    p.until = Infinity
  }
  const p = farm.pigs[0]
  Object.assign(p, { x, z, hunger, state: 'idle', until: Infinity, issues: 0 })
  return p
}

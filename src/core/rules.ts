/** Every gameplay number lives here. Times are farm time in ms; the farm clock only runs while someone is on. */

export const TICK_MS = 50
export const MAX_FARMERS = 12
export const PIG_COUNT = 36
/** Overalls colours to pick from in the lobby. Duplicates are fine. */
export const FARMER_COLORS = [0x3c7ee8, 0xe8453c, 0x3cc45a, 0xf2c230, 0xa25ce0, 0xf28a30, 0x30c8d0, 0xe85ab4]

// Day and night
/** One whole day: daytime then night. */
export const DAY_MS = 8 * 60_000
/** Fraction of the day when night falls (it ends at 1.0 = dawn). */
export const NIGHT_START = 0.76
/** A fresh farm starts in the morning. */
export const START_TIME = 0.05

// Farmers
export const WALK_SPEED = 5
export const RUN_SPEED = 8.5
export const FARMER_RADIUS = 0.4
/** How close you must be to pick up, harvest, fill or gather. */
export const REACH = 2.2
export const BASKET_MAX = 16
export const THROW_RANGE = 13
export const SHOO_RADIUS = 6.5
export const SHOO_COOLDOWN_MS = 500
export const CUDDLE_COOLDOWN_MS = 3000

// Food
export const VEGGIES = ['carrot', 'lettuce', 'cucumber', 'pepper', 'apple'] as const
export type Veg = (typeof VEGGIES)[number]
/** How many bites one of each lasts. */
export const VEG_BITES: Record<Veg, number> = { carrot: 3, lettuce: 4, cucumber: 3, pepper: 2, apple: 2 }
export const BITE_MS = 1100
export const BITE_HUNGER = 7
/** Ground food rots away after this. */
export const FOOD_ROT_MS = 4 * 60_000
export const MAX_GROUND_FOOD = 80
export const BOWL_MAX = 24
/** Pellet hoppers in the barn: farmers fill them a sack at a time; pigs help themselves. */
export const HOPPER_MAX = 60
export const SACK_PELLETS = 40
/** Throws fly for this long plus a bit per metre. */
export const FLIGHT_BASE_MS = 300
export const FLIGHT_PER_M_MS = 40

// Garden and orchard
export const GROW_MS = 50_000
export const HARVEST_YIELD = 4
export const APPLE_EVERY_MS: [number, number] = [25_000, 60_000]
export const APPLES_PER_TREE = 3

// Piggies
export const PIG_RADIUS = 0.3
export const PIG_WALK = 1.1
export const PIG_SCURRY = 3.4
export const PIG_FLEE = 4
/** Full to starving in six minutes. */
export const HUNGER_PER_S = 100 / 360
/** Nibbling grass outside: slows hunger but never keeps a pig full. */
export const GRAZE_PER_S = 0.5
/** Below this a pig goes looking for food by itself. */
export const HUNGRY = 60
/** Above this a pig ignores food. */
export const FULL = 97
/** Pigs this close to where food lands come running. */
export const EXCITE_RADIUS = 10
/** How far a hungry pig looks for food by itself. */
export const SEEK_RADIUS = 14
/** Hungry pigs near a farmer with a full basket beg. */
export const BEG_RADIUS = 5

// Health problems (bit flags). Found by a health check, fixed by the matching treatment.
export const ISSUES = ['nails', 'mites', 'sniffles', 'teeth'] as const
export type Issue = (typeof ISSUES)[number]
export const ISSUE_BIT: Record<Issue, number> = { nails: 1, mites: 2, sniffles: 4, teeth: 8 }
/** Chance per second of a problem starting. Sniffles only come from being outside at night. */
export const ISSUE_RATE: Record<Issue, number> = { nails: 1 / 2400, mites: 1 / 3600, sniffles: 1 / 60, teeth: 1 / 6000 }

// Predators
/** Pigs only notice a sneaking fox this close. */
export const FOX_NOTICE = 3.5
export const FOX_SNEAK = 2.3
/** The last dash at a pig. */
export const FOX_POUNCE = 5.5
export const FOX_POUNCE_RANGE = 2.5
/** Pigs are heavy. */
export const FOX_CARRY = 1.8
/** Getting under the fence is slow, in and (with a pig) out again: that's the farmers' chance. */
export const FENCE_BAND = 1.5
export const FOX_UNDER_FENCE = 0.9
export const FOX_UNDER_FENCE_CARRYING = 0.45
export const FOX_RUN = 8
export const FOX_GIVE_UP_MS = 35_000
export const FOX_EVERY_MS = { day: [90_000, 170_000], night: [35_000, 70_000] } as const
export const MAX_FOXES = 2
/** Nothing turns up in the first minute after the farm wakes. */
export const FIRST_PREDATOR_MS = 60_000
export const HAWK_EVERY_MS: [number, number] = [100_000, 200_000]
export const HAWK_CIRCLE_MS: [number, number] = [12_000, 18_000]
/** Below the camera, so it stays in view. */
export const HAWK_HEIGHT = 8
export const HAWK_FEAR = 9
export const HAWK_SWOOP = 11
export const HAWK_CARRY = 2.5
/** Hawks are a bit further away, so shooing reaches further. */
export const HAWK_SHOO_EXTRA = 3
/** A carried-off pig turns up at the gate this long after. */
export const LOST_MS = 40_000

// Money and upgrades
export const START_COINS = 20
/** What a day earns: per point of average happiness, per well-fed pig, per fix, per rescue… */
export const PAY = { happy: 0.6, fed: 1, treat: 5, save: 10, lost: -10, outAtNight: -2, poorly: -2 }
/** Stars on the day's report card, by coins earned. */
export const STARS = [40, 70, 100, 130]

export const UPGRADES = {
  basket: { icon: '🧺', name: 'Bigger basket', cost: 40, desc: 'Carry 24 veg instead of 16' },
  orchard: { icon: '🍎', name: 'Orchard care', cost: 50, desc: 'Apples fall twice as often' },
  bighopper: { icon: '🥣', name: 'Bigger hoppers', cost: 60, desc: 'Hoppers hold twice the pellets' },
  compost: { icon: '🪱', name: 'Compost heap', cost: 60, desc: '+2 veg every harvest' },
  sprinkler: { icon: '💦', name: 'Garden sprinklers', cost: 70, desc: 'Crops grow 40% faster' },
  hopper2: { icon: '🏗️', name: 'Second hopper', cost: 80, desc: 'Another pellet hopper in the barn' },
  heater: { icon: '🔥', name: 'Barn heater', cost: 80, desc: 'Cosy barn: pigs inside are happier' },
  scarecrow: { icon: '🧑‍🌾', name: 'Scarecrow', cost: 90, desc: 'Hawks come half as often' },
  fence: { icon: '🛡️', name: 'Fox-proof fence', cost: 120, desc: 'Foxes come half as often and dig in slower' },
} as const
export type UpgradeId = keyof typeof UPGRADES
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]

export const basketMax = (u: readonly UpgradeId[]) => (u.includes('basket') ? 24 : BASKET_MAX)
export const hopperMax = (u: readonly UpgradeId[]) => (u.includes('bighopper') ? HOPPER_MAX * 2 : HOPPER_MAX)
export const harvestYield = (u: readonly UpgradeId[]) => HARVEST_YIELD + (u.includes('compost') ? 2 : 0)
export const growMs = (u: readonly UpgradeId[]) => GROW_MS * (u.includes('sprinkler') ? 0.6 : 1)

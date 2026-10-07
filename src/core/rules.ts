/** Every gameplay number lives here. Times are farm time in ms; the farm clock only runs while someone is on. */

export const TICK_MS = 50
export const MAX_FARMERS = 12
/** A new farm starts small: this many piggies, and they breed from there. */
export const PIG_COUNT = 12
/** Overalls colours to pick from in the lobby. Duplicates are fine. */
export const FARMER_COLORS = [0x3c7ee8, 0xe8453c, 0x3cc45a, 0xf2c230, 0xa25ce0, 0xf28a30, 0x30c8d0, 0xe85ab4]

// Day and night
/** One whole day (daytime then night), once the farm's got going… */
export const DAY_MS = 8 * 60_000
/** …but the first days are shorter, getting longer each day until day DAY_RAMP + 1, so a new farm gets going quickly. */
export const FIRST_DAY_MS = 4 * 60_000
export const DAY_RAMP = 4
/** Fraction of the day when night falls (it ends at 1.0 = dawn). */
export const NIGHT_START = 0.76
/** A fresh farm starts in the morning. */
export const START_TIME = 0.05
/** Pigs sleep at their bed spots (BED_SPOTS in map.ts); only this many will doze off on a food pile instead. */
export const FOOD_SLEEPERS = 2
/** At night, once every pig is tucked up asleep in the barn for this long (and nothing's prowling), it's morning. */
export const SLEEP_SKIP_MS = 3000

/** The farm clock: time of day (0 = dawn) as hours from 6 (6am) to 30 (6am next day). Daytime is 6am–8pm, night 8pm–6am. */
export const clockHours = (time: number) => (time < NIGHT_START ? 6 + (time / NIGHT_START) * 14 : 20 + ((time - NIGHT_START) / (1 - NIGHT_START)) * 10)

/** How long day `day` (1 = the first) lasts. */
export const dayLength = (day: number) => (day > DAY_RAMP ? DAY_MS : FIRST_DAY_MS + ((DAY_MS - FIRST_DAY_MS) * (day - 1)) / DAY_RAMP)

/** Farm time `t` (ms of play) as days since the farm began, with the fraction (0 = the first dawn). */
export function farmDays(t: number): number {
  let ms = t + START_TIME * dayLength(1)
  for (let day = 1; day <= DAY_RAMP; day++) {
    const len = dayLength(day)
    if (ms < len) return day - 1 + ms / len
    ms -= len
  }
  return DAY_RAMP + ms / DAY_MS
}

/** The other way: the farm time when it's `days` days in (e.g. 2.5 = midday on day 3). */
export function farmTime(days: number): number {
  let ms = 0
  for (let day = 1; day <= DAY_RAMP && days > 0; day++) {
    const part = Math.min(1, days)
    ms += part * dayLength(day)
    days -= part
  }
  return ms + days * DAY_MS - START_TIME * dayLength(1)
}

// Farmers
export const WALK_SPEED = 5.5
export const RUN_SPEED = 9.5
export const FARMER_RADIUS = 0.4
/** Getting up to speed and stopping on the ground (m/s²): quick, but with a little give. */
export const FARMER_ACCEL = 40
export const FARMER_STOP = 28
/** In the air you keep your momentum and can only steer this much. */
export const AIR_ACCEL = 10
/** Jumping (Space): about 1.6 m at the top, over fences and onto the hidey huts with room to spare. */
export const JUMP_V = 8.9
export const GRAVITY = 25
/** How far outside the farm fence farmers can go. */
export const FARMER_ROAM = 5
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
/**
 * Pellets are rationed: the feed bin holds one sack a day for each hopper (restocked at dawn). Hay is the main food:
 * as much as they like, fetched an armful at a time from the hay meadow's stacks into the racks in the barn.
 */
export const HAY_RACK_MAX = 40
export const HAY_ARMFUL = 20
/** Hay goes in the basket: each armful takes this many places in it. */
export const HAY_SLOTS = 2
/** Armfuls a haystack in the stack yard can hold. */
export const HAY_STACK_MAX = 6
/** A cut patch of the hay meadow grows back in this long. */
export const HAY_REGROW_MS = 120_000
/** A pig that's had hay in the last day is this much less likely to get overgrown teeth (hay wears them down). */
export const HAY_TEETH = 0.2
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
/** Below this a pig still trots over for a snack on the ground nearby (apples, thrown veg), hungry or not. */
export const SNACKY = 85
/** Chance, each time a pig picks what to do by day, that it goes on a snack trip: under an apple tree or to the garden fence. */
export const SNACK_TRIP = 0.3
/**
 * Poorly piggies (hungry, glum, or with something wrong, even the hidden nails and teeth) go slow and mope about in
 * corners, so you can tell who needs looking after.
 */
export const POORLY_HUNGER = 35
export const POORLY_HAPPY = 35
/** How fast they get about: wandering, going for food, running away. */
export const POORLY_PACE = { walk: 0.55, food: 0.75, flee: 0.85 }
export const poorly = (p: { hunger: number; happy: number; issues: number }) => p.hunger < POORLY_HUNGER || p.happy < POORLY_HAPPY || p.issues !== 0
/**
 * Herding: walk at a calm pig and it scoots away from you (along the way you're going), so you can steer them about
 * (into the barn at dusk, say). Only a farmer on the move does it: stand still and they stay put to be picked up.
 */
export const HERD_RADIUS = 3
/** A farmer moving at least this fast (m/s), roughly towards the pig. */
export const HERD_SPEED = 2.5
/** How far a pig scoots, and how fast. */
export const HERD_STEP = 2.5
export const PIG_SCOOT = 3.2
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
export const PAY = { happy: 0.6, fed: 1, treat: 5, save: 10, lost: -10, outAtNight: -2, poorly: -2, craving: 1, salad: 10, saladKind: 3, hay: 1 }
/** Stars on the day's report card, by coins earned. */
export const STARS = [40, 70, 100, 130]

/** Most pigs the barn has room for; the bigger barn adds more. */
export const HERD_MAX = 24
export const BIG_BARN_EXTRA = 12

// Land: the farm is a 3×3 grid of squares (laid out in map.ts). It starts with the barn and the yard; the rest is
// bought in the shop, a square at a time, next to land the farm already has.
export const LAND = {
  barn: { icon: '🏠', name: 'Barn', cost: 0, desc: 'Where the piggies sleep' },
  yard: { icon: '🌱', name: 'Yard', cost: 0, desc: 'The lawn in front of the barn, with a little veg bed' },
  garden: { icon: '🥬', name: 'Veg patch', cost: 40, desc: '4 more veg beds behind a fence' },
  meadow: { icon: '🌾', name: 'Hay meadow', cost: 50, desc: 'Hay! Unlimited hay for the racks in the barn (pellets are rationed). Hay keeps teeth healthy. Lush grass and a hidey hut too' },
  orchard: { icon: '🍎', name: 'Orchard', cost: 60, desc: 'Apple trees: apples drop for the piggies and your basket' },
  huts: { icon: '🛖', name: 'Hut meadow', cost: 60, desc: 'Three hidey huts to dive into when a fox or hawk comes' },
  flowers: { icon: '🌼', name: 'Wild flowers', cost: 70, desc: 'Nibbling dandelions and clover cheers piggies right up' },
  patch2: { icon: '🥕', name: 'Veg patch 2', cost: 80, desc: '3 more veg beds' },
  pond: { icon: '🦆', name: 'Pond', cost: 80, desc: 'A calm spot: piggies resting by the water get happier' },
} as const
export type SquareId = keyof typeof LAND
export const SQUARE_IDS = Object.keys(LAND) as SquareId[]
export const START_LAND: SquareId[] = ['barn', 'yard']
/** Grazing in the hay meadow fills a tummy this many times faster. */
export const LUSH_GRAZE = 2
/** Happiness per second for a pig nibbling the wild flowers, or resting by the pond. */
export const FLOWER_HAPPY = 0.6
export const POND_HAPPY = 0.4

// The shop: land, then upgrades in tabs. Some upgrades need a square of land first.
export const SHOP_TABS = { land: '🗺️ Land', barn: '🏠 Barn', garden: '🥕 Garden', critters: '🐹 Critters' } as const
export type ShopTab = keyof typeof SHOP_TABS
export interface Upgrade {
  tab: ShopTab
  icon: string
  name: string
  /** Each level in turn: what it costs, and what it does. */
  levels: { cost: number; desc: string; name?: string }[]
  needs?: SquareId
}
const lv = (...levels: [number, string][]) => levels.map(([cost, desc]) => ({ cost, desc }))
/** Each square has three cumulative improvements, separate from the farm-wide equipment. */
export const LAND_UPGRADES = {
  barn: 'land_barn', yard: 'land_yard', garden: 'land_garden', meadow: 'land_meadow',
  orchard: 'land_orchard', huts: 'land_huts', flowers: 'land_flowers', patch2: 'land_patch2', pond: 'land_pond',
} as const satisfies Record<SquareId, string>
const landUpgrade = (needs: SquareId, ...tiers: [number, string, string][]): Upgrade => ({
  tab: 'land', needs, icon: LAND[needs].icon, name: `${LAND[needs].name} improvements`,
  levels: tiers.map(([cost, name, desc]) => ({ cost, name, desc })),
})
const UPGRADE_LIST = {
  land_barn: landUpgrade('barn',
    [45, 'Deep hay racks', 'Each barn rack holds 80 bites of hay instead of 40.'],
    [95, 'Feed pantry', 'One extra pellet sack every dawn, plus one now.'],
    [180, 'Snug bedding', 'Sleeping pigs in the barn get hungry half as fast.']),
  land_yard: landUpgrade('yard',
    [35, 'Clover lawn', 'Grazing in the yard fills tummies twice as fast.'],
    [80, 'Play arches', 'Calm pigs in the yard gain 0.3 happiness per second.'],
    [150, 'Shepherd’s bell', 'Shooing reaches 25% further everywhere, on top of your whistle.']),
  land_garden: landUpgrade('garden',
    [50, 'Raised beds', 'Harvest 2 extra veg from each bed in this patch.'],
    [110, 'Water barrels', 'This patch takes 25% less time to grow each crop.'],
    [200, 'Seed station', 'Harvesting automatically replants the bed for free.']),
  land_meadow: landUpgrade('meadow',
    [55, 'Scythe stand', 'Cut 2 armfuls of hay per patch, if your basket has room.'],
    [110, 'Hay store', 'Each haystack holds 12 armfuls instead of 6.'],
    [190, 'Reseeding beds', 'Hay takes 25% less time to regrow, on top of fertiliser.']),
  land_orchard: landUpgrade('orchard',
    [55, 'Fruit catchers', 'Each tree can leave 6 apples on the ground instead of 3.'],
    [115, 'Shade canopies', 'Fallen orchard apples stay fresh twice as long.'],
    [210, 'Pruning station', 'Two apples fall at a time when there is room.']),
  land_huts: landUpgrade('huts',
    [45, 'Soft hut bedding', 'Calm or hiding pigs near these huts gain 0.4 happiness per second.'],
    [100, 'Hut windbreaks', 'Pigs inside these huts avoid cold and rain penalties and weather sniffles.'],
    [180, 'Lookout flags', 'Pigs in the hut meadow notice foxes 3 metres further away.']),
  land_flowers: landUpgrade('flowers',
    [45, 'Clover beds', 'Grazing among the flowers fills tummies twice as fast.'],
    [100, 'Dandelion planters', 'Flower grazing gives twice the happiness.'],
    [190, 'Bee hotel', 'All vegetable beds take 15% less time to grow.']),
  land_patch2: landUpgrade('patch2',
    [60, 'Growing cloches', 'This patch takes 25% less time to grow each crop.'],
    [120, 'Rich soil beds', 'Harvest 3 extra veg from each bed in this patch.'],
    [220, 'Seed station', 'Harvesting automatically replants the bed for free.']),
  land_pond: landUpgrade('pond',
    [50, 'Reed beds', 'The calming area reaches 7 metres from the water instead of 4.'],
    [105, 'Water lilies', 'Resting near the pond gives twice the happiness.'],
    [190, 'Herb border', 'New health problems are half as likely in the pond’s calming area.']),

  basket: { tab: 'critters', icon: '🧺', name: 'Bigger basket', levels: lv([40, 'Carry 24 veg instead of 16'], [120, 'Carry 32 veg'], [300, 'Carry 40 veg']) },
  boots: { tab: 'critters', icon: '🥾', name: 'Go-faster wellies', levels: lv([70, 'Walk and run 12% faster'], [200, 'Walk and run 25% faster']) },
  whistle: { tab: 'critters', icon: '📯', name: 'Shepherd’s whistle', levels: lv([60, 'Shooing (F) reaches 30% further'], [180, 'Shooing reaches 60% further']) },
  scarecrow: { tab: 'critters', icon: '🧑‍🌾', name: 'Scarecrow', levels: lv([90, 'Hawks come half as often'], [260, 'Two scarecrows: hawks come a third as often']) },
  fence: { tab: 'critters', icon: '🛡️', name: 'Fox-proof fence', levels: lv([120, 'Foxes come half as often and dig in slower'], [320, 'Foxes come a third as often and dig in slower still']) },
  vet: { tab: 'critters', icon: '🩺', name: 'Vet visits', levels: lv([100, 'Health problems start 30% less often'], [280, 'Health problems start half as often']) },
  orchard: { tab: 'garden', icon: '🍎', name: 'Orchard care', needs: 'orchard', levels: lv([50, 'Apples fall twice as often'], [150, 'Apples fall three times as often'], [350, 'Apples fall four times as often']) },
  compost: { tab: 'garden', icon: '🪱', name: 'Compost heap', levels: lv([60, '+2 veg every harvest'], [160, '+4 veg every harvest'], [380, '+6 veg every harvest']) },
  sprinkler: { tab: 'garden', icon: '💦', name: 'Garden sprinklers', levels: lv([70, 'Crops grow 40% faster'], [180, 'Crops grow 55% faster'], [400, 'Crops grow 65% faster']) },
  fertiliser: { tab: 'garden', icon: '🌾', name: 'Meadow fertiliser', needs: 'meadow', levels: lv([80, 'Hay grows back 30% faster'], [220, 'Hay grows back twice as fast']) },
  bighopper: { tab: 'barn', icon: '🥣', name: 'Bigger hoppers', levels: lv([60, 'Hoppers hold twice the pellets, and the sacks are twice as big'], [160, 'Three times the pellets, in bigger sacks'], [360, 'Four times the pellets, in bigger sacks']) },
  hopper2: { tab: 'barn', icon: '🏗️', name: 'Second hopper', levels: lv([80, 'Another pellet hopper in the barn']) },
  sacks: { tab: 'barn', icon: '📦', name: 'Feed delivery', levels: lv([90, 'An extra sack of pellets every morning'], [250, 'Two extra sacks every morning']) },
  heater: { tab: 'barn', icon: '🔥', name: 'Barn heater', levels: lv([80, 'Cosy barn: pigs inside are happier'], [200, 'Cosier still'], [420, 'Toasty: pigs inside are much happier']) },
  toys: { tab: 'barn', icon: '🧸', name: 'Piggy toys', levels: lv([90, 'Tunnels to play in: the zoomometer fills 25% faster'], [240, 'A whole play park: it fills 45% faster']) },
  nursery: { tab: 'barn', icon: '🍼', name: 'Nursery corner', levels: lv([100, 'Sows are 50% likelier to get pregnant'], [260, 'Sows are twice as likely to get pregnant']) },
  bigbarn: {
    tab: 'barn',
    icon: '🐣',
    name: 'Bigger barn',
    levels: lv([110, `Room for ${BIG_BARN_EXTRA} more piggies (${HERD_MAX + BIG_BARN_EXTRA} in all)`], [320, `Room for ${BIG_BARN_EXTRA} more again (${HERD_MAX + 2 * BIG_BARN_EXTRA})`]),
  },
} satisfies Record<string, Upgrade>
export type UpgradeId = keyof typeof UPGRADE_LIST
export const UPGRADES: Record<UpgradeId, Upgrade> = UPGRADE_LIST
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]

/** Upgrades come in levels: each level bought is one more of it in the farm's list. */
export const level = (u: readonly UpgradeId[], id: UpgradeId) => u.reduce((n, x) => n + (x === id ? 1 : 0), 0)
/** The next level of an upgrade to buy, or null once it's maxed. */
export const nextLevel = (u: readonly UpgradeId[], id: UpgradeId) => UPGRADES[id].levels[level(u, id)] ?? null

export const landLevel = (u: readonly UpgradeId[], square: SquareId) => level(u, LAND_UPGRADES[square])

export const basketMax = (u: readonly UpgradeId[]) => BASKET_MAX + 8 * level(u, 'basket')
export const hopperMax = (u: readonly UpgradeId[]) => HOPPER_MAX * (1 + level(u, 'bighopper'))
/** Bigger hoppers come with bigger sacks to fill them. */
export const sackPellets = (u: readonly UpgradeId[]) => SACK_PELLETS * (1 + level(u, 'bighopper'))
export const harvestYield = (u: readonly UpgradeId[], square?: SquareId) => HARVEST_YIELD + 2 * level(u, 'compost')
  + (square === 'garden' && landLevel(u, 'garden') >= 1 ? 2 : 0)
  + (square === 'patch2' && landLevel(u, 'patch2') >= 2 ? 3 : 0)
export const growMs = (u: readonly UpgradeId[], square?: SquareId) => GROW_MS * [1, 0.6, 0.45, 0.35][level(u, 'sprinkler')]
  * ((square === 'garden' && landLevel(u, 'garden') >= 2) || (square === 'patch2' && landLevel(u, 'patch2') >= 1) ? 0.75 : 1)
  * (landLevel(u, 'flowers') >= 3 ? 0.85 : 1)
export const herdMax = (u: readonly UpgradeId[]) => HERD_MAX + BIG_BARN_EXTRA * level(u, 'bigbarn')
/** How much more often apples fall, hawks and foxes stay away, and so on, by level. */
export const appleEvery = (u: readonly UpgradeId[]) => [1, 0.5, 0.35, 0.25][level(u, 'orchard')]
export const hawkEvery = (u: readonly UpgradeId[]) => 1 + level(u, 'scarecrow')
export const foxEvery = (u: readonly UpgradeId[]) => 1 + level(u, 'fence')
export const foxDig = (u: readonly UpgradeId[]) => [1, 0.5, 0.35][level(u, 'fence')]
/** Extra happiness for a pig inside a heated barn. */
export const cosy = (u: readonly UpgradeId[]) => [0, 10, 16, 22][level(u, 'heater')]
export const issueRate = (u: readonly UpgradeId[]) => [1, 0.7, 0.5][level(u, 'vet')]
export const pregnancyRate = (u: readonly UpgradeId[]) => 1 + 0.5 * level(u, 'nursery')
export const zoomFillMs = (u: readonly UpgradeId[]) => ZOOM_FILL_MS * [1, 0.75, 0.55][level(u, 'toys')]
export const shooRadius = (u: readonly UpgradeId[]) => SHOO_RADIUS * (1 + 0.3 * level(u, 'whistle')) * (landLevel(u, 'yard') >= 3 ? 1.25 : 1)
export const farmerSpeed = (u: readonly UpgradeId[]) => [1, 1.12, 1.25][level(u, 'boots')]
export const extraSacks = (u: readonly UpgradeId[]) => level(u, 'sacks') + (landLevel(u, 'barn') >= 2 ? 1 : 0)
export const hayRegrowMs = (u: readonly UpgradeId[]) => HAY_REGROW_MS * [1, 0.7, 0.5][level(u, 'fertiliser')] * (landLevel(u, 'meadow') >= 3 ? 0.75 : 1)

// Treat of the day: each morning the pigs crave one veg. A bite of it cheers them up more than usual.
export const CRAVING_HAPPY = 5

// Salad night: farmers build a salad platter at the station in the barn through the day, then serve it at dusk.
// Every pig comes in for supper, and the more kinds of veg in it the happier they are.
export const SALAD_MAX = 30
/** Ready to serve with at least this much veg, of at least this many kinds. */
export const SALAD_MIN = 10
export const SALAD_KINDS = 3
/** Bites in the served platter, per veg in it. */
export const SALAD_BITES = 2
/** It can be served from a little before nightfall (fraction of the day). */
export const SALAD_FROM = NIGHT_START - 0.06

// Zoomies: the zoomometer charges while the herd is happy; when it's full, every happy pig goes wild for a bit.
export const ZOOMIES_MS = 25_000
/** A pig this happy joins in. */
export const ZOOMIES_HAPPY = 50
/** The zoomometer charges while the herd's average happiness is at least this… */
export const ZOOM_HAPPY = 70
/** …taking this long to fill at exactly ZOOM_HAPPY, and half as long with everyone at 100%. */
export const ZOOM_FILL_MS = 120_000
/** Below ZOOM_HAPPY it drains, this much slower than it fills. */
export const ZOOM_DRAIN = 0.5

// Farmer emotes: no voice chat in the office, so wave instead. Z X C V.
export const EMOTES = ['👋', '❤️', 'Help!', '😂'] as const
export const EMOTE_COOLDOWN_MS = 800

// Daily jobs: a few small shared goals each day, paid as soon as they're done.
export const JOBS_PER_DAY = 3
export const JOB_PAY = 15
/** What farmers get credited for (the farm diary counts these too). */
export const STATS = ['fed', 'wheeks', 'harvest', 'plant', 'apples', 'fill', 'pour', 'hay', 'fix', 'cuddle', 'shoo', 'save', 'salad'] as const
export type Stat = (typeof STATS)[number]
/** `needs`: only dealt once the farm has that square. */
export const JOBS: Partial<Record<Stat, { goal: number; text: string; needs?: SquareId }>> = {
  harvest: { goal: 12, text: 'Harvest {n} veg' },
  plant: { goal: 3, text: 'Plant {n} beds' },
  apples: { goal: 8, text: 'Gather {n} apples', needs: 'orchard' },
  fed: { goal: 20, text: 'Throw the piggies {n} veg' },
  fill: { goal: 4, text: 'Fill the bowls {n} times' },
  pour: { goal: 1, text: 'Top up the pellet hopper' },
  hay: { goal: 3, text: 'Put out {n} armfuls of hay', needs: 'meadow' },
  fix: { goal: 3, text: 'Fix {n} health problems' },
  cuddle: { goal: 5, text: 'Cuddle {n} piggies' },
  shoo: { goal: 2, text: 'Shoo away {n} foxes or hawks' },
  salad: { goal: 1, text: 'Serve the salad platter at dusk' },
}
export const JOB_KINDS = Object.keys(JOBS) as Stat[]

// Breeding: now and then a happy, well-fed sow (with a boar about, and room in the barn) gets pregnant.
/** Chance per day for each sow who's happy enough. Low, so the herd grows slowly. */
export const PREGNANCY_PER_DAY = 0.08
export const PREGNANT_HAPPY = 60
/** A pregnancy lasts this many days. */
export const PREGNANCY_DAYS = 2
/** Expecting sows get hungry this much faster… */
export const PREGNANT_HUNGER = 1.4
/** …and count as looked after while their tummy and happiness are at least this. A cuddle counts for this many seconds. */
export const CARE_OK = 60
export const CARE_CUDDLE_S = 30
/** How likely a litter of 1, 2, 3 or 4 is (4 is rare). Poorly looked-after mums have smaller litters. */
export const LITTER = [0.35, 0.35, 0.22, 0.08]
/** Pups grow from half size and follow mum about for this many days. */
export const PUP_DAYS = 3

// Weather: some days it rains for a while. Pigs run indoors; crops grow faster.
export const RAIN_CHANCE = 0.4
export const RAIN_MS: [number, number] = [60_000, 120_000]
export const RAIN_GROW = 1.6

// The pig show: every few days, the best-kept pig wins a rosette and a prize.
export const SHOW_EVERY = 3
export const SHOW_PRIZE = 30
/** Days until the next show: 0 means it's judged at the end of today. */
export const daysToShow = (day: number) => (SHOW_EVERY - (day % SHOW_EVERY)) % SHOW_EVERY

/** Local effects for the three land tiers. Rates are per second; distances are metres. */
export const LAND_BONUS = {
  sleepHunger: 0.5, cloverGraze: 2, yardHappy: 0.3, flowerHappy: 2,
  hutHappy: 0.4, hutComfortRadius: 2.5, hutFoxNotice: 3,
  pondHappy: 2, pondIssueRate: 0.5, appleFreshness: 2, appleDrop: 2,
} as const

/** Tile benefits shared by the simulation, prompts and world rendering. */
export const hayRackMax = (u: readonly UpgradeId[]) => HAY_RACK_MAX * (landLevel(u, 'barn') >= 1 ? 2 : 1)
export const hayStackMax = (u: readonly UpgradeId[]) => HAY_STACK_MAX * (landLevel(u, 'meadow') >= 2 ? 2 : 1)
export const hayYield = (u: readonly UpgradeId[]) => landLevel(u, 'meadow') >= 1 ? 2 : 1
export const applesPerTree = (u: readonly UpgradeId[]) => APPLES_PER_TREE * (landLevel(u, 'orchard') >= 1 ? 2 : 1)
export const pondCalmRadius = (u: readonly UpgradeId[]) => landLevel(u, 'pond') >= 1 ? 7 : 4
export const autoReplant = (u: readonly UpgradeId[], square: SquareId) =>
  (square === 'garden' || square === 'patch2') && landLevel(u, square) >= 3

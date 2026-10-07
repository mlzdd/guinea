/** What each guinea pig looks like and who they are. Made once per farm; only the name, family, friends and prizes change. */

export type Breed = 'smooth' | 'abyssinian' | 'peruvian' | 'teddy' | 'crested' | 'skinny'
export const BREEDS: readonly Breed[] = ['smooth', 'abyssinian', 'peruvian', 'teddy', 'crested', 'skinny']
/**
 * How `coat` is used: self = one colour; dutch = white with coloured cheeks and rear; patches = base
 * with two patch colours; himalayan = white with dark nose, ears and feet; roan = base with white hairs
 * mixed through; brindle = base with dark hairs streaked through. Agouti anywhere is drawn ticked.
 */
export type Pattern = 'self' | 'dutch' | 'patches' | 'himalayan' | 'roan' | 'brindle'

export interface PigLook {
  id: number
  name: string
  breed: Breed
  pattern: Pattern
  /** Base colour, then patch colours, as #rrggbb. */
  coat: [string, string, string]
  sex: 'sow' | 'boar'
  /** Age in years. */
  age: number
  /** Weight in grams when well fed. */
  weight: number
  /** The farmer who adopted this pig (their name), if anyone has. */
  adopter?: string
  /** Best friend: they like to hang out together. */
  friend?: number
  /** A baby's mum, and when it was born, in farm days (pups are age 0 until they grow up). */
  mum?: number
  born?: number
  /** Expecting: when the babies are due, in farm days. */
  due?: number
  /** Pig show wins. */
  rosettes?: number
}

export const BREED_NAMES: Record<Breed, string> = {
  smooth: 'Smooth-coat',
  abyssinian: 'Abyssinian',
  peruvian: 'Peruvian',
  teddy: 'Teddy',
  crested: 'Crested',
  skinny: 'Skinny pig',
}

export const COLORS = {
  white: '#f6f1e7',
  cream: '#f0d6a4',
  ginger: '#d98a3d',
  brown: '#8f5b34',
  chocolate: '#5b3b27',
  black: '#2b2623',
  agouti: '#8c7559',
  lilac: '#b8a8a0',
}
const C = COLORS

const NAMES = [
  'Biscuit', 'Peanut', 'Nugget', 'Pumpkin', 'Waffles', 'Pickle', 'Bramble', 'Hazel', 'Clover', 'Truffle',
  'Mochi', 'Toffee', 'Fudge', 'Pepper', 'Sprout', 'Bean', 'Crumpet', 'Muffin', 'Nibbles', 'Popcorn',
  'Dumpling', 'Basil', 'Ginger', 'Marmite', 'Custard', 'Pip', 'Squeak', 'Wilbur', 'Daisy', 'Buttons',
  'Teacake', 'Scone', 'Parsnip', 'Turnip', 'Radish', 'Maple', 'Cinnamon', 'Nutmeg', 'Cocoa', 'Oreo',
  'Hobnob', 'Bourbon', 'Jammie', 'Fig', 'Olive', 'Bagel', 'Pudding', 'Snowy', 'Smudge', 'Patch',
  'Rolo', 'Twix', 'Kipper', 'Bubble', 'Doughnut', 'Gherkin', 'Rocket', 'Sage', 'Wasabi', 'Noodle',
]

const NAME_LIMIT = 16

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

export function makePigLooks(count: number, rand: () => number): PigLook[] {
  const names = [...NAMES]
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  const solid = [C.white, C.cream, C.ginger, C.brown, C.chocolate, C.black, C.agouti, C.lilac]
  const looks: PigLook[] = []
  for (let id = 0; id < count; id++) {
    const pattern = pick(rand, ['self', 'dutch', 'patches', 'patches', 'himalayan', 'roan', 'brindle'] as const)
    let coat: [string, string, string]
    if (pattern === 'self') {
      const c = pick(rand, solid)
      coat = [c, c, c]
    } else if (pattern === 'dutch') {
      const c = pick(rand, [C.ginger, C.black, C.brown, C.agouti, C.chocolate])
      coat = [C.white, c, c]
    } else if (pattern === 'himalayan') {
      coat = [C.white, pick(rand, [C.chocolate, C.black]), C.white]
    } else if (pattern === 'roan') {
      const c = pick(rand, [C.black, C.chocolate, C.ginger, C.agouti, C.lilac])
      coat = [c, C.white, C.white]
    } else if (pattern === 'brindle') {
      const c = pick(rand, [C.ginger, C.cream, C.brown])
      coat = [c, C.black, C.black]
    } else {
      const base = pick(rand, [C.white, C.cream, C.ginger, C.white])
      const others = solid.filter((c) => c !== base)
      const a = pick(rand, others)
      coat = [base, a, pick(rand, others.filter((c) => c !== a))]
    }
    looks.push({
      id,
      name: names[id % names.length] + (id >= names.length ? ` ${Math.floor(id / names.length) + 1}` : ''),
      breed: pick(rand, ['smooth', 'smooth', 'abyssinian', 'peruvian', 'teddy', 'crested', 'skinny'] as const),
      pattern,
      coat,
      sex: rand() < 0.5 ? 'sow' : 'boar',
      age: 1 + Math.floor(rand() * 6),
      weight: Math.round((850 + rand() * 400) / 10) * 10,
    })
  }
  // At least one of each, so there can be babies.
  if (looks.length > 1) {
    looks[0].sex = 'sow'
    looks[1].sex = 'boar'
  }
  // Everyone has a best friend: pigs pair up in twos.
  for (const look of looks) if ((look.id ^ 1) < looks.length) look.friend = look.id ^ 1
  return looks
}

/** A newborn: mum's colours (more or less), a name nobody on the farm has yet. */
export function babyLook(id: number, mum: PigLook, taken: string[], born: number, rand: () => number): PigLook {
  const free = NAMES.filter((n) => !taken.includes(n))
  const name = free.length ? pick(rand, free) : `${mum.name} Jr`
  const coat: [string, string, string] = rand() < 0.7 ? [...mum.coat] : [mum.coat[0], pick(rand, Object.values(COLORS)), mum.coat[2]]
  return {
    id,
    name: name.slice(0, NAME_LIMIT),
    breed: rand() < 0.75 ? mum.breed : pick(rand, BREEDS),
    pattern: mum.pattern,
    coat,
    sex: rand() < 0.5 ? 'sow' : 'boar',
    age: 0,
    weight: Math.round((850 + rand() * 400) / 10) * 10,
    mum: mum.id,
    born,
  }
}

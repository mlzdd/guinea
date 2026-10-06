/** What each guinea pig looks like and who they are. Made once per farm and never changes. */

export type Breed = 'smooth' | 'abyssinian' | 'peruvian' | 'teddy'
/**
 * How `coat` is used: self = one colour; dutch = white with coloured cheeks and rear; patches = base
 * with two patch colours; himalayan = white with dark nose, ears and feet.
 */
export type Pattern = 'self' | 'dutch' | 'patches' | 'himalayan'

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
}

export const BREED_NAMES: Record<Breed, string> = {
  smooth: 'Smooth-coat',
  abyssinian: 'Abyssinian',
  peruvian: 'Peruvian',
  teddy: 'Teddy',
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
    const pattern = pick(rand, ['self', 'dutch', 'patches', 'patches', 'himalayan'] as const)
    let coat: [string, string, string]
    if (pattern === 'self') {
      const c = pick(rand, solid)
      coat = [c, c, c]
    } else if (pattern === 'dutch') {
      const c = pick(rand, [C.ginger, C.black, C.brown, C.agouti, C.chocolate])
      coat = [C.white, c, c]
    } else if (pattern === 'himalayan') {
      coat = [C.white, pick(rand, [C.chocolate, C.black]), C.white]
    } else {
      const base = pick(rand, [C.white, C.cream, C.ginger, C.white])
      const others = solid.filter((c) => c !== base)
      const a = pick(rand, others)
      coat = [base, a, pick(rand, others.filter((c) => c !== a))]
    }
    looks.push({
      id,
      name: names[id % names.length] + (id >= names.length ? ` ${Math.floor(id / names.length) + 1}` : ''),
      breed: pick(rand, ['smooth', 'smooth', 'abyssinian', 'peruvian', 'teddy'] as const),
      pattern,
      coat,
      sex: rand() < 0.5 ? 'sow' : 'boar',
      age: 1 + Math.floor(rand() * 6),
      weight: Math.round((850 + rand() * 400) / 10) * 10,
    })
  }
  return looks
}

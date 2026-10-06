import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Farm } from '../src/core/farm.ts'
import { clockHours } from '../src/core/rules.ts'

/**
 * Checkpoints: a copy of the farm every half hour of farm-clock time, so you can go back to one (`npm run restore`).
 * They come thick and fast (a farm half hour is ten seconds or so), so only the last KEEP are kept, plus the 6am one
 * of each of the last KEEP_DAWNS days.
 */
export const KEEP = 48
export const KEEP_DAWNS = 14

/** Which farm half hour it is: counts up through the days. */
export const halfHour = (farm: Farm) => (farm.day - 1) * 48 + Math.floor((clockHours(farm.dayTime) - 6) * 2)

/** e.g. day003-1430 (2:30pm on day 3), day003-0100 (1am, the night after day 3's daytime). */
export function checkpointName(farm: Farm) {
  const hours = clockHours(farm.dayTime)
  const h = Math.floor(hours) % 24
  const m = Math.floor((hours % 1) * 2) * 30
  return `day${String(farm.day).padStart(3, '0')}-${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
}

/** All the checkpoints in `dir`, newest first. */
export function listCheckpoints(dir: string): { name: string; file: string; time: number }[] {
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names
    .map((n) => {
      const file = join(dir, n)
      return { name: n.slice(0, -5), file, time: statSync(file).mtimeMs }
    })
    .sort((a, b) => order(b.name) - order(a.name) || b.time - a.time)
}

/** Farm order from a name: day, then time, with 00:00–05:30 being the night after that day's evening. */
function order(name: string) {
  const m = /^day(\d+)-(\d\d)(\d\d)$/.exec(name)
  if (!m) return -1
  const h = Number(m[2]) + Number(m[3]) / 60
  return Number(m[1]) * 48 + (h < 6 ? h + 24 : h) * 2
}

export function writeCheckpoint(dir: string, farm: Farm) {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${checkpointName(farm)}.json`), JSON.stringify(farm.save()))
    // Prune: the newest KEEP, and the dawn (6am) ones of the last KEEP_DAWNS days.
    const all = listCheckpoints(dir)
    const dawns = all.filter((c) => c.name.endsWith('-0600'))
    const keep = new Set([...all.slice(0, KEEP), ...dawns.slice(0, KEEP_DAWNS)].map((c) => c.file))
    for (const c of all) if (!keep.has(c.file)) rmSync(c.file, { force: true })
  } catch (e) {
    console.warn('[guinea] could not write a checkpoint:', e)
  }
}

/** Call every tick: writes a checkpoint whenever the farm clock passes a half hour. */
export function checkpointer(dir: string) {
  let last: number | null = null
  return (farm: Farm) => {
    const now = halfHour(farm)
    if (last !== null && now !== last) writeCheckpoint(dir, farm)
    last = now
  }
}

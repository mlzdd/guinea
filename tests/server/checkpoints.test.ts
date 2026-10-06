import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KEEP, KEEP_DAWNS, checkpointName, checkpointer, listCheckpoints } from '../../server/checkpoints.ts'
import { Farm } from '../../src/core/farm.ts'
import { farmTime } from '../../src/core/rules.ts'
import { seeded } from '../core/helpers.ts'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** The farm time at a farm-clock hour (6..30) on a day. */
const at = (day: number, hours: number) => farmTime(day - 1 + (hours < 20 ? ((hours - 6) / 14) * 0.76 : 0.76 + ((hours - 20) / 10) * 0.24))

describe('checkpoints', () => {
  it('a copy of the farm every ten farm minutes, named by day and time, that loads back', () => {
    dir = mkdtempSync(join(tmpdir(), 'guinea-'))
    const farm = new Farm(seeded(1))
    const tick = checkpointer(dir)
    farm.t = at(3, 14.51)
    tick(farm)
    expect(listCheckpoints(dir)).toHaveLength(0) // the first look just notes the time
    farm.t = at(3, 14.6)
    tick(farm)
    expect(listCheckpoints(dir)).toHaveLength(0) // same ten minutes
    farm.t = at(3, 14.7)
    tick(farm)
    expect(listCheckpoints(dir).map((c) => c.name)).toEqual(['day003-1440'])
    farm.t = at(3, 25.2)
    expect(checkpointName(farm)).toBe('day003-0110')

    const back = new Farm(seeded(2), JSON.parse(readFileSync(listCheckpoints(dir)[0].file, 'utf8')))
    expect(back.t).toBe(at(3, 14.7))
  })

  it('keeps the latest ones and each morning, not all of them', () => {
    dir = mkdtempSync(join(tmpdir(), 'guinea-'))
    const farm = new Farm(seeded(1))
    const tick = checkpointer(dir)
    for (let day = 1; day <= 20; day++)
      for (let h = 6; h < 30; h += 1 / 6) {
        farm.t = at(day, h + 0.05)
        tick(farm)
      }
    const all = listCheckpoints(dir)
    expect(all.length).toBeLessThanOrEqual(KEEP + KEEP_DAWNS)
    expect(all.filter((c) => c.name.endsWith('-0600')).length).toBe(KEEP_DAWNS)
    expect(all.some((c) => c.name === 'day020-0550')).toBe(true)
  })
})

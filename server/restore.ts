/**
 * Go back to a checkpoint: `npm run restore` lists them, `npm run restore -- day003-1430` loads that one.
 * Stop the farm server first: it saves over data/farm.json when it stops.
 */
import { copyFileSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { listCheckpoints } from './checkpoints.ts'

const SAVE = 'data/farm.json'
const DIR = 'data/checkpoints'

/** Is something listening on the dev (5173) or preview (4173) port? */
const listening = (port: number) =>
  new Promise<boolean>((done) => {
    const s = connect({ port, host: '127.0.0.1' })
    s.once('connect', () => (s.destroy(), done(true)))
    s.once('error', () => done(false))
  })

const all = listCheckpoints(DIR)
const want = process.argv[2]
if (!want) {
  if (!all.length) console.log('No checkpoints yet: they\'re written every 10 farm minutes while someone\'s playing.')
  else {
    console.log('Checkpoints, newest first (day, then farm time):\n')
    for (const c of all) console.log(`  ${c.name}    saved ${new Date(c.time).toLocaleString()}`)
    console.log('\nLoad one with:  npm run restore -- <name>   (stop the farm server first)')
  }
} else {
  const c = all.find((x) => x.name === want.replace(/\.json$/, ''))
  if (!c) {
    console.error(`No checkpoint called ${want}. Run \`npm run restore\` to see them.`)
    process.exit(1)
  }
  if ((await listening(5173)) || (await listening(4173))) {
    console.error('The farm server looks like it\'s running (port 5173 or 4173). Stop it first: it saves over the farm when it stops.')
    process.exit(1)
  }
  if (existsSync(SAVE)) copyFileSync(SAVE, 'data/farm.before-restore.json')
  copyFileSync(c.file, SAVE)
  console.log(`Restored ${c.name}. (The farm as it was is in data/farm.before-restore.json.) Start the server again to play.`)
}

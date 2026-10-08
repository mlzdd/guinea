import dayUrl from '../../Guinea Pig Orchard.mp3?url'
import dayUrl2 from '../../Guinea Pig Orchard 2.mp3?url'
import nightUrl from '../../Guinea Pig Orchard at Night.mp3?url'
import nightUrl2 from '../../Guinea Pig Orchard at Night 2.mp3?url'

const VOLUME = 0.35
const FADE_MS = 3000
const STEP_MS = 50

function track(url: string) {
  const a = new Audio(url)
  a.preload = 'auto'
  a.volume = 0
  // At the end of a song the next one for this time of day comes on (or the same again if it's the only one).
  a.addEventListener('ended', () => {
    if (a !== playing()) return
    next()
    playing().currentTime = 0
    playing().volume = VOLUME
    play(playing())
  })
  return a
}

/** The songs for the day and for the night, played in turn. */
const day = [track(dayUrl), track(dayUrl2)]
const night = [track(nightUrl), track(nightUrl2)]
const all = [...day, ...night]
// Which song of each list is on (or comes on next), starting at random so it isn't always the same one.
const at = { day: Math.floor(Math.random() * day.length), night: Math.floor(Math.random() * night.length) }
let isNight = false
let started = false
let heardClock = false // the first clock reading switches straight over, later ones crossfade
let fader = 0

const playing = () => (isNight ? night[at.night] : day[at.day])

/** On to the next song for this time of day. */
function next() {
  if (isNight) at.night = (at.night + 1) % night.length
  else at.day = (at.day + 1) % day.length
}

function play(a: HTMLAudioElement) {
  void a.play().then(() => {
    removeEventListener('pointerup', retry)
    removeEventListener('keydown', retry)
  }).catch((error: unknown) => {
    // If playback needs another user gesture, retry on the next interaction.
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      addEventListener('pointerup', retry)
      addEventListener('keydown', retry)
    }
  })
}

function retry() {
  if (playing().paused) play(playing())
}

/** Fades the current track up and the others down, pausing each once silent. */
function fade() {
  if (fader) return
  const step = (VOLUME * STEP_MS) / FADE_MS
  fader = window.setInterval(() => {
    const on = playing()
    let done = true
    for (const a of all) {
      if (a === on) a.volume = Math.min(VOLUME, a.volume + step)
      else if (a.volume > 0) a.volume = Math.max(0, a.volume - step)
      if (a !== on && a.volume === 0 && !a.paused) a.pause()
      if (a === on ? a.volume < VOLUME : a.volume > 0) done = false
    }
    if (done) {
      clearInterval(fader)
      fader = 0
    }
  }, STEP_MS)
}

/** Call from a user gesture (joining) so the browser lets it play. */
export function startMusic() {
  started = true
  playing().volume = VOLUME
  play(playing())
}

/** Day music by day, night music at night. */
export function setNight(n: boolean) {
  if (heardClock && n === isNight) return
  const first = !heardClock
  heardClock = true
  if (n === isNight) return
  const from = playing()
  isNight = n
  // Each dusk and dawn brings the other song from last time.
  if (!first) next()
  if (!started) return
  const to = playing()
  to.currentTime = 0
  if (first) {
    // Joined at night: swap without a fade.
    from.pause()
    from.volume = 0
    to.volume = VOLUME
  }
  play(to)
  if (!first) fade()
}

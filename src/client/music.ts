import dayUrl from '../../Guinea Pig Orchard.mp3?url'
import nightUrl from '../../Guinea Pig Orchard at Night.mp3?url'

const VOLUME = 0.35
const FADE_MS = 3000
const STEP_MS = 50

function track(url: string) {
  const a = new Audio(url)
  a.loop = true
  a.preload = 'auto'
  a.volume = 0
  return a
}

const day = track(dayUrl)
const night = track(nightUrl)
let isNight = false
let started = false
let heardClock = false // the first clock reading switches straight over, later ones crossfade
let fader = 0

const playing = () => (isNight ? night : day)

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

/** Fades the current track up and the other down, pausing it once silent. */
function fade() {
  if (fader) return
  const step = (VOLUME * STEP_MS) / FADE_MS
  fader = window.setInterval(() => {
    const on = playing()
    const off = on === day ? night : day
    on.volume = Math.min(VOLUME, on.volume + step)
    off.volume = Math.max(0, off.volume - step)
    if (off.volume === 0) off.pause()
    if (on.volume === VOLUME && off.volume === 0) {
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

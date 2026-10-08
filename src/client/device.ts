/**
 * What we're running on: a touch screen (phones, tablets: on-screen controls and the phone layout) and how much
 * drawing it can take (`FAST`: lower resolution, smaller shadows, fewer fur shells and hairs).
 *
 * `?touch=1` / `?touch=0` forces the controls either way (handy in the browser's device mode), and the graphics
 * setting in the help panel is remembered (`guinea.quality`), defaulting to fast on touch screens.
 */
const params = new URLSearchParams(location.search)
const QUALITY_KEY = 'guinea.quality'

export const TOUCH = params.has('touch') ? params.get('touch') !== '0' : matchMedia('(pointer: coarse)').matches

function savedQuality(): string | null {
  try {
    return localStorage.getItem(QUALITY_KEY)
  } catch {
    return null
  }
}

export const FAST = (params.get('quality') ?? savedQuality() ?? (TOUCH ? 'fast' : 'nice')) === 'fast'

/** Switches the graphics setting (the piggies are built with it, so it takes a reload). */
export function setQuality(fast: boolean) {
  try {
    localStorage.setItem(QUALITY_KEY, fast ? 'fast' : 'nice')
  } catch {
    // Storage blocked: it'll be back to the default next time.
  }
  const url = new URL(location.href)
  url.searchParams.delete('quality')
  location.replace(url)
}

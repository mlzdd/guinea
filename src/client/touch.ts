import { EMOTES } from '../core/rules.ts'

const EMOTE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV']

/**
 * The on-screen buttons for touch screens, each pressing the key it stands for: the action (E), jump (Space),
 * SHOO (F) and emotes (Z X C V) under your right thumb; the shop, diary, help and pause along the top right; and the
 * farmers-and-jobs drawer top left. The prompt itself can be tapped too (E).
 */
export class TouchControls {
  private readonly action: HTMLButtonElement
  private readonly shoo: HTMLButtonElement
  private readonly emotes: HTMLElement

  constructor(press: (code: string) => void) {
    const hud = document.getElementById('hud')!
    const button = (cls: string, html: string, code: string | (() => void), label: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.innerHTML = html
      b.setAttribute('aria-label', label)
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (typeof code === 'string') press(code)
        else code()
      })
      return b
    }

    const pad = document.createElement('div')
    pad.id = 'pad'
    this.action = button('act', '✋', 'KeyE', 'Do it (E)')
    this.shoo = button('shoo', '📣', 'KeyF', 'Shoo (F)')
    const jump = button('jump', '⤴️', 'Space', 'Jump')
    this.emotes = document.createElement('div')
    this.emotes.className = 'emotes'
    this.emotes.hidden = true
    EMOTES.forEach((e, i) =>
      this.emotes.append(
        button('emote', e, () => {
          press(EMOTE_KEYS[i])
          this.emotes.hidden = true
        }, `Emote ${e}`),
      ),
    )
    const emote = button('say', '😀', () => (this.emotes.hidden = !this.emotes.hidden), 'Emotes')
    pad.append(this.action, this.shoo, jump, emote, this.emotes)

    const menu = document.createElement('div')
    menu.id = 'menu'
    menu.append(
      button('', '🛒', 'KeyB', 'Shop (B)'),
      button('', '📖', 'KeyL', 'Farm diary (L)'),
      button('', '❓', 'KeyH', 'How to play (H)'),
      button('', '⏸️', 'KeyP', 'Pause (P)'),
    )

    const drawer = button('', '📋', () => document.getElementById('left')!.classList.toggle('open'), 'Farmers and jobs')
    drawer.id = 'drawer'

    // Tap the prompt to do it.
    document.getElementById('prompt')!.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      press('KeyE')
    })

    hud.append(pad, menu, drawer)
  }

  /** Lights up the action button when there's something to do, and SHOO when there's something to shoo. */
  set(canAct: boolean, canShoo: boolean) {
    this.action.classList.toggle('ready', canAct)
    this.shoo.classList.toggle('ready', canShoo)
  }
}

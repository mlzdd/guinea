import { BREED_NAMES, type PigLook } from '../core/pigs.ts'
import type { AlertKind, FarmerSnap, PigSnap, ServerMsg } from '../core/protocol.ts'
import { FARMER_COLORS, ISSUE_BIT, NIGHT_START, UPGRADES, UPGRADE_IDS, VEGGIES, type Issue, type UpgradeId } from '../core/rules.ts'
import { VEG_ICON, VEG_LABEL } from './veg.ts'

const $ = (id: string) => document.getElementById(id)!
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

type Check = 'weigh' | Issue
const CHECKS: { id: Check; icon: string; label: string; ok: string; bad: string; fix: string }[] = [
  { id: 'weigh', icon: '⚖️', label: 'Weigh', ok: '', bad: '', fix: '' },
  { id: 'nails', icon: '✂️', label: 'Nails', ok: 'Nice and short', bad: 'Too long and curly!', fix: 'Trim' },
  { id: 'mites', icon: '🔍', label: 'Coat & skin', ok: 'Glossy and clean', bad: 'Mites! Very itchy', fix: 'Treat' },
  { id: 'sniffles', icon: '👃', label: 'Breathing', ok: 'Clear as a bell', bad: 'Sniffly and wheezy', fix: 'Vitamin C' },
  { id: 'teeth', icon: '🦷', label: 'Teeth', ok: 'Lovely gnashers', bad: 'Overgrown!', fix: 'File' },
]
const CHECK_MS = 700

export interface CheckActions {
  treat(issue: Issue): void
  cuddle(): void
  putDown(): void
}

/** What a pig is up to, in words, for the hover label. */
export function mood(p: PigSnap): string {
  if (p.s === 'sleep') return 'fast asleep'
  if (p.s === 'eat') return 'munching'
  if (p.s === 'flee' || p.s === 'hide') return 'scared!'
  if (p.hunger < 30) return 'starving!'
  if (p.hunger < 60) return 'hungry'
  if (p.happy > 80) return 'very happy'
  if (p.happy < 35) return 'grumpy'
  return 'content'
}

/** The DOM overlay. */
export class Hud {
  private readonly check = $('check')
  private checkPig: number | null = null
  private checked = new Map<Check, number>() // when each check finishes
  private lastAlert = new Map<string, number>()

  constructor() {
    $('hud').hidden = false
  }

  setClock(day: number, time: number) {
    // 0 = dawn = 6am; night falls at NIGHT_START (~8pm) and dawn is 6am again.
    const hours = time < NIGHT_START ? 6 + (time / NIGHT_START) * 14 : 20 + ((time - NIGHT_START) / (1 - NIGHT_START)) * 10
    const h = Math.floor(hours) % 24
    const m = Math.floor((hours % 1) * 60 / 10) * 10
    const icon = time >= NIGHT_START ? '🌙' : time > NIGHT_START - 0.05 ? '🌇' : time < 0.04 ? '🌅' : '☀️'
    $('clock').innerHTML = `${icon} <b>Day ${day}</b> · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  setStats(pigs: PigSnap[], inside: number, total: number) {
    const here = pigs.filter((p) => p.s !== 'lost')
    const hungry = here.filter((p) => p.hunger < 60).length
    const happy = here.length ? Math.round(here.reduce((a, p) => a + p.happy, 0) / here.length) : 0
    const lost = pigs.length - here.length
    const hearts = '♥'.repeat(Math.round(happy / 20)).padEnd(5, '♡')
    $('stats').innerHTML =
      `<span title="Indoors">🏠 ${inside}/${total} in</span>` +
      `<span title="Hungry piggies" class="${hungry > total / 3 ? 'warn' : ''}">😋 ${hungry} hungry</span>` +
      (lost ? `<span class="warn">🦊 ${lost} missing</span>` : '') +
      `<span title="How happy the farm is" class="hearts">${hearts} ${happy}%</span>`
  }

  setFarmers(farmers: FarmerSnap[], me: number) {
    $('farmers').innerHTML = farmers
      .map((f) => `<div style="color:${css(FARMER_COLORS[f.color])}">${f.id === me ? '▶ ' : ''}${esc(f.name)}</div>`)
      .join('')
  }

  alert(kind: AlertKind, text: string) {
    // Don't spam the same line.
    const now = performance.now()
    if ((this.lastAlert.get(text) ?? -1e9) > now - 3000) return
    this.lastAlert.set(text, now)
    const feed = $('feed')
    const line = document.createElement('div')
    line.className = `alert ${kind}`
    line.textContent = text
    feed.prepend(line)
    while (feed.children.length > 6) feed.lastElementChild!.remove()
    setTimeout(() => line.classList.add('old'), 9000)
    setTimeout(() => line.remove(), 10_000)
    if (kind === 'fox' || kind === 'hawk') this.toast(text, 'danger')
  }

  setBasket(counts: number[], selected: number, max: number) {
    const total = counts.reduce((a, b) => a + b, 0)
    $('basket').innerHTML =
      VEGGIES.map(
        (v, i) =>
          `<div class="slot ${i === selected ? 'on' : ''} ${counts[i] ? '' : 'empty'}" title="${VEG_LABEL[v]}">` +
          `<small>${i + 1}</small><span>${VEG_ICON[v]}</span><b>${counts[i]}</b></div>`,
      ).join('') + `<div class="total">🧺 ${total}/${max}</div>`
  }

  setCoins(coins: number) {
    const el = $('coins')
    const text = `🪙 ${coins}`
    if (el.textContent === text) return
    if (el.textContent) {
      el.classList.remove('bump')
      void el.offsetWidth
      el.classList.add('bump')
    }
    el.textContent = text
  }

  // ---------------------------------------------------------------- shop

  private shopKey = ''

  get shopOpen() {
    return !$('shop').hidden
  }

  toggleShop(open = !this.shopOpen) {
    $('shop').hidden = !open
    this.shopKey = ''
  }

  /** Redraws the shop if it's open and something changed. */
  updateShop(coins: number, owned: UpgradeId[], buy: (id: UpgradeId) => void) {
    const el = $('shop')
    const key = `${coins}|${owned.join()}`
    if (el.hidden || key === this.shopKey) return
    this.shopKey = key
    el.innerHTML = `
      <h3>Farm shop</h3>
      <p class="wallet">🪙 <b>${coins}</b> in the farm wallet. Everyone shares it: spend it wisely!</p>
      <table>${UPGRADE_IDS.map((id) => {
        const u = UPGRADES[id]
        const have = owned.includes(id)
        const button = have
          ? '<span class="owned">✓ Got it</span>'
          : `<button data-buy="${id}" ${coins < u.cost ? 'disabled' : ''}>🪙 ${u.cost}</button>`
        return `<tr class="${have ? 'have' : ''}"><td class="icon">${u.icon}</td><td><b>${u.name}</b><br><small>${u.desc}</small></td><td>${button}</td></tr>`
      }).join('')}</table>
      <p class="hint">Earn coins each morning for happy, well-fed piggies. <kbd>B</kbd> to close</p>`
    el.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.buy as UpgradeId)))
  }

  // ---------------------------------------------------------------- end of day

  private reportTimer = 0

  showReport(r: Extract<ServerMsg, { t: 'report' }>, openShop: () => void) {
    const el = $('report')
    const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)
    const verdict = ['Oh dear…', 'Not bad', 'Good day!', 'Great day!', 'Piggy paradise!'][r.stars - 1]
    el.innerHTML = `
      <h3>Day ${r.day} done!</h3>
      <p class="stars">${stars}</p>
      <p class="verdict">${verdict}</p>
      <table>${r.lines
        .map((l) => `<tr><td>${esc(l.label)}</td><td class="${l.coins < 0 ? 'bad' : 'ok'}">${l.coins > 0 ? '+' : ''}${l.coins}</td></tr>`)
        .join('')}
        <tr class="sum"><td>Earned today</td><td>🪙 ${r.total}</td></tr>
      </table>
      <p class="wallet">Farm wallet: 🪙 <b>${r.coins}</b></p>
      <div class="buttons"><button id="rp-shop">🛒 Go shopping <kbd>B</kbd></button><button id="rp-ok">Lovely!</button></div>`
    el.hidden = false
    const close = () => (el.hidden = true)
    el.querySelector('#rp-ok')!.addEventListener('click', close)
    el.querySelector('#rp-shop')!.addEventListener('click', () => {
      close()
      openShop()
    })
    clearTimeout(this.reportTimer)
    this.reportTimer = window.setTimeout(close, 25_000)
  }

  hideReport() {
    $('report').hidden = true
  }

  setPrompt(text: string | null) {
    const el = $('prompt')
    el.hidden = !text
    if (text) el.innerHTML = text
  }

  toast(text: string, style: 'info' | 'danger' = 'info') {
    const el = $('toast')
    el.textContent = text
    el.className = style
    void el.offsetWidth // restart the animation
    el.classList.add('show')
  }

  setTooltip(x: number, y: number, html: string | null) {
    const el = $('tooltip')
    el.hidden = !html
    if (!html) return
    el.innerHTML = html
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }

  /** Arrows round the edge of the screen pointing at predators you can't see. */
  setArrows(list: { x: number; y: number; angle: number; icon: string }[]) {
    const el = $('arrows')
    while (el.children.length < list.length) {
      const a = document.createElement('div')
      a.className = 'arrow'
      a.innerHTML = '<i>➤</i><span></span>'
      el.append(a)
    }
    ;[...el.children].forEach((child, i) => {
      const a = child as HTMLElement
      const item = list[i]
      a.hidden = !item
      if (!item) return
      a.style.left = `${item.x}px`
      a.style.top = `${item.y}px`
      ;(a.firstElementChild as HTMLElement).style.transform = `rotate(${item.angle}rad)`
      a.lastElementChild!.textContent = item.icon
    })
  }

  // ---------------------------------------------------------------- health check card

  /** Shows (or hides, with null) the health-check card for the pig in your arms. */
  showCheck(look: PigLook | null, snap: PigSnap | null, act: CheckActions) {
    if (!look || !snap) {
      this.check.hidden = true
      this.checkPig = null
      return
    }
    if (this.checkPig !== look.id) {
      this.checkPig = look.id
      this.checked.clear()
      this.buildCheck(look, act)
    }
    this.check.hidden = false
    this.updateCheck(look, snap)
  }

  private buildCheck(look: PigLook, act: CheckActions) {
    const sex = look.sex === 'sow' ? '♀ sow' : '♂ boar'
    this.check.innerHTML = `
      <h3>${esc(look.name)}</h3>
      <p class="who">${BREED_NAMES[look.breed]} · ${sex} · ${look.age} yr${look.age > 1 ? 's' : ''} old</p>
      <div class="bar"><label>Tummy</label><i><b id="ck-hunger"></b></i></div>
      <div class="bar"><label>Happy</label><i><b id="ck-happy"></b></i></div>
      <h4>Health check</h4>
      <table>${CHECKS.map(
        (c) => `<tr data-check="${c.id}"><td>${c.icon}</td><td>${c.label}</td><td class="res"></td><td class="act"></td></tr>`,
      ).join('')}</table>
      <div class="buttons">
        <button id="ck-all">🩺 Check everything</button>
        <button id="ck-cuddle">🤗 Cuddle</button>
        <button id="ck-down">⬇️ Put down <kbd>E</kbd></button>
      </div>`
    const start = (id: Check, delay = 0) => {
      if (!this.checked.has(id)) this.checked.set(id, performance.now() + delay + CHECK_MS)
    }
    this.check.querySelector('#ck-all')!.addEventListener('click', () => CHECKS.forEach((c, i) => start(c.id, i * 350)))
    this.check.querySelector('#ck-cuddle')!.addEventListener('click', () => act.cuddle())
    this.check.querySelector('#ck-down')!.addEventListener('click', () => act.putDown())
    this.check.querySelectorAll('tr').forEach((row) => {
      const id = row.dataset.check as Check
      row.querySelector('.act')!.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button')
        if (!b) return
        if (b.dataset.do === 'check') start(id)
        else if (id !== 'weigh') act.treat(id)
      })
    })
  }

  private updateCheck(look: PigLook, p: PigSnap) {
    const set = (id: string, v: number) => {
      const b = this.check.querySelector<HTMLElement>(`#${id}`)!
      b.style.width = `${v}%`
      b.className = v < 30 ? 'low' : v < 60 ? 'mid' : ''
    }
    set('ck-hunger', p.hunger)
    set('ck-happy', p.happy)
    const now = performance.now()
    for (const c of CHECKS) {
      const row = this.check.querySelector<HTMLElement>(`tr[data-check="${c.id}"]`)!
      const doneAt = this.checked.get(c.id)
      let res = ''
      let act = ''
      if (doneAt === undefined) act = '<button data-do="check">Check</button>'
      else if (now < doneAt) res = '<em>checking…</em>'
      else if (c.id === 'weigh') {
        const grams = Math.round((look.weight * (0.85 + (0.15 * p.hunger) / 100)) / 10) * 10
        res = `<b>${grams.toLocaleString()} g</b> ${p.hunger < 35 ? '<span class="bad">a bit light, feed up!</span>' : '<span class="ok">healthy</span>'}`
      } else if (p.issues & ISSUE_BIT[c.id]) {
        res = `<span class="bad">${c.bad}</span>`
        act = `<button data-do="fix" class="fix">${c.fix}</button>`
      } else {
        res = `<span class="ok">✓ ${c.ok}</span>`
      }
      // Only touch the DOM when it changes, or buttons get swapped out mid-click.
      if (row.dataset.res !== res) row.querySelector('.res')!.innerHTML = row.dataset.res = res
      if (row.dataset.act !== act) row.querySelector('.act')!.innerHTML = row.dataset.act = act
    }
  }
}

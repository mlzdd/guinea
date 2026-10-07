import { BREED_NAMES, type PigLook } from '../core/pigs.ts'
import type { AlertKind, DiaryRow, FarmerSnap, JobSnap, PigSnap, ServerMsg } from '../core/protocol.ts'
import { SQUARES, canBuy } from '../core/map.ts'
import {
  FARMER_COLORS,
  HAY_SLOTS,
  ISSUE_BIT,
  clockHours,
  LAND,
  LAND_UPGRADES,
  NIGHT_START,
  SHOP_TABS,
  UPGRADES,
  UPGRADE_IDS,
  level,
  nextLevel,
  VEGGIES,
  type Issue,
  type ShopTab,
  type SquareId,
  type Stat,
  type UpgradeId,
  type Veg,
} from '../core/rules.ts'
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
  rename(name: string): void
  adopt(): void
}

/** Extra lines for the check card: is this pig yours, and who's family. */
export interface CheckExtra {
  myName: string
  family: string
}

/** The farm diary's awards: who's top at what. */
const AWARDS: { icon: string; title: string; score: (r: DiaryRow) => number }[] = [
  { icon: '🥕', title: 'Top feeder', score: (r) => r.fed + r.fill },
  { icon: '🎵', title: 'Most wheeked at', score: (r) => r.wheeks },
  { icon: '🧺', title: 'Green fingers', score: (r) => r.harvest + r.plant + r.apples },
  { icon: '🩺', title: 'Vet of the farm', score: (r) => r.fix },
  { icon: '🦸', title: 'Pig saver', score: (r) => r.save * 3 + r.shoo },
  { icon: '🤗', title: 'Cuddle champion', score: (r) => r.cuddle },
]
const DIARY_COLS: { icon: string; title: string; stat: Stat }[] = [
  { icon: '🥕', title: 'Veg thrown', stat: 'fed' },
  { icon: '🎵', title: 'Wheeks (pigs who came running)', stat: 'wheeks' },
  { icon: '🧺', title: 'Veg harvested', stat: 'harvest' },
  { icon: '🩺', title: 'Health fixes', stat: 'fix' },
  { icon: '🦸', title: 'Pigs rescued', stat: 'save' },
  { icon: '🤗', title: 'Cuddles', stat: 'cuddle' },
]

/** What a pig is up to, in words, for the hover label. */
export function mood(p: PigSnap): string {
  if (p.s === 'sleep') return 'fast asleep'
  if (p.s === 'eat') return 'munching'
  if (p.s === 'raid') return 'raiding the veg patch!'
  if (p.s === 'flee' || p.s === 'hide') return 'scared!'
  if (p.s === 'scoot') return 'being herded'
  if (p.s === 'mope') return p.hunger < 35 ? 'weak with hunger' : p.issues ? 'feeling poorly' : 'glum'
  if (p.hunger < 30) return 'starving!'
  if (p.hunger < 60) return 'hungry'
  if (p.issues) return 'not looking well'
  if (p.happy > 80) return 'very happy'
  if (p.happy < 35) return 'grumpy'
  return 'content'
}

/** The DOM overlay. */
export class Hud {
  private readonly check = $('check')
  private checkPig: number | null = null
  private renaming = false
  private jobsKey = ''
  private todayKey = ''
  private checked = new Map<Check, number>() // when each check finishes
  private lastAlert = new Map<string, number>()

  /** A basket slot was clicked (veg index, or VEGGIES.length for the hay). */
  onSlot: (i: number) => void = () => {}

  constructor() {
    $('hud').hidden = false
    $('basket').addEventListener('pointerdown', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.slot')
      if (!slot) return
      e.preventDefault()
      this.onSlot(Number(slot.dataset.i))
    })
  }

  setClock(day: number, time: number) {
    const hours = clockHours(time)
    const h = Math.floor(hours) % 24
    const m = Math.floor((hours % 1) * 60 / 10) * 10
    const night = time >= NIGHT_START
    const icon = night ? '🌙' : time > NIGHT_START - 0.05 ? '🌇' : time < 0.04 ? '🌅' : '☀️'
    $('clock').innerHTML = `${icon} <b>${night ? 'Night' : 'Day'} ${day}</b> · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    $('topbar').classList.toggle('night', night)
  }

  /** Shades the edges of the screen as it gets dark (0..1). */
  setDarkness(dark: number) {
    $('nightshade').style.opacity = String(Math.round(dark * 100) / 100)
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

  setFarmers(farmers: FarmerSnap[], me: number, looks: PigLook[]) {
    const adopted = (name: string) => looks.filter((l) => l.adopter === name).length
    $('farmers').innerHTML = farmers
      .map((f) => {
        const n = adopted(f.name)
        return `<div style="color:${css(FARMER_COLORS[f.color])}">${f.id === me ? '▶ ' : ''}${esc(f.name)}${n ? ` <small title="Adopted piggies">⭐${n}</small>` : ''}</div>`
      })
      .join('')
  }

  /** Treat of the day and the countdown to the pig show, under the clock. */
  setToday(craving: Veg, showIn: number, rain: boolean, zoom: number) {
    const key = `${craving}|${showIn}|${rain}|${zoom}`
    if (key === this.todayKey) return
    this.todayKey = key
    const show = showIn === 0 ? 'tonight!' : `in ${showIn} day${showIn > 1 ? 's' : ''}`
    $('today').innerHTML =
      `<span title="Treat of the day: they love it extra">🤤 Craving ${VEG_ICON[craving]}</span>` +
      `<span title="Best-kept piggy wins a rosette and a prize">🏆 Pig show ${show}</span>` +
      `<span class="zoom" title="Zoomometer: fills while the piggies are 70%+ happy. Full = ZOOMIES!">🎉 <i><b style="width:${Math.round(zoom * 100)}%"></b></i></span>` +
      (rain ? '<span>🌧️ Raining</span>' : '')
  }

  setJobs(jobs: JobSnap[]) {
    const key = jobs.map((j) => `${j.kind}${j.n}`).join()
    if (key === this.jobsKey) return
    this.jobsKey = key
    $('jobs').innerHTML =
      '<h4>📋 Today’s jobs</h4>' +
      jobs
        .map((j) => {
          const done = j.n >= j.goal
          return `<div class="${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${esc(j.text)} <small>${done ? '' : `${j.n}/${j.goal}`}</small></div>`
        })
        .join('')
  }

  // ---------------------------------------------------------------- farm diary

  get diaryOpen() {
    return !$('diary').hidden
  }

  toggleDiary(open = !this.diaryOpen) {
    $('diary').hidden = !open
    if (open) $('diary').innerHTML = '<h3>Farm diary</h3><p class="hint">Opening the diary…</p>'
  }

  showDiary(rows: DiaryRow[], myName: string) {
    if (!this.diaryOpen) return
    const total = (r: DiaryRow) => AWARDS.reduce((a, w) => a + w.score(r), 0)
    const sorted = [...rows].sort((a, b) => total(b) - total(a))
    const awards = AWARDS.map((w) => {
      const top = sorted.reduce<DiaryRow | null>((best, r) => (w.score(r) > (best ? w.score(best) : 0) ? r : best), null)
      return top ? `<li>${w.icon} <b>${w.title}:</b> ${esc(top.name)} <small>(${w.score(top)})</small></li>` : ''
    }).join('')
    $('diary').innerHTML = `
      <h3>Farm diary</h3>
      ${awards ? `<ul class="awards">${awards}</ul>` : '<p class="hint">Nothing written yet: go and feed some piggies!</p>'}
      ${
        sorted.length
          ? `<table><tr><th></th>${DIARY_COLS.map((c) => `<th title="${c.title}">${c.icon}</th>`).join('')}</tr>${sorted
              .map(
                (r) =>
                  `<tr class="${r.name === myName ? 'me' : ''}"><td>${esc(r.name)}</td>${DIARY_COLS.map((c) => `<td>${r[c.stat]}</td>`).join('')}</tr>`,
              )
              .join('')}</table>`
          : ''
      }
      <p class="hint">Everyone who’s ever farmed here, all time. <kbd>L</kbd> to close</p>`
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

  setBasket(counts: number[], selected: number, max: number, hay: number) {
    const total = counts.reduce((a, b) => a + b, 0) + hay * HAY_SLOTS
    $('basket').innerHTML =
      VEGGIES.map(
        (v, i) =>
          `<div class="slot ${i === selected ? 'on' : ''} ${counts[i] ? '' : 'empty'}" data-i="${i}" title="${VEG_LABEL[v]}: click to hold, again to drop one">` +
          `<small>${i + 1}</small><span>${VEG_ICON[v]}</span><b>${counts[i]}</b></div>`,
      ).join('') +
      (hay
        ? `<div class="slot hay ${selected === VEGGIES.length ? 'on' : ''}" data-i="${VEGGIES.length}" title="Hay (each armful takes ${HAY_SLOTS} places): click to hold, again to drop an armful">` +
          `<span>🌾</span><b>${hay}</b></div>`
        : '') +
      `<div class="total">🧺 ${total}/${max}</div>`
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
  private shopTab: ShopTab = 'land'

  /** Redraws the shop if it's open and something changed: tabs for land and each kind of upgrade. */
  updateShop(coins: number, owned: UpgradeId[], land: SquareId[], buy: { upgrade(id: UpgradeId): void; land(id: SquareId): void }) {
    const el = $('shop')
    const key = `${coins}|${owned.join()}|${land.join()}|${this.shopTab}`
    if (el.hidden || key === this.shopKey) return
    this.shopKey = key
    const expanded = new Set([...el.querySelectorAll<HTMLDetailsElement>('details[data-square][open]')].map((d) => d.dataset.square))
    const tabs = (Object.keys(SHOP_TABS) as ShopTab[])
      .map((t) => `<button class="tab ${t === this.shopTab ? 'on' : ''}" data-tab="${t}">${SHOP_TABS[t]}</button>`)
      .join('')
    let body: string
    if (this.shopTab === 'land') {
      // A little map of the farm: what it has, what it can buy next, what's further off.
      body = `<div class="landmap">${SQUARES.map((sq) => {
        const info = LAND[sq.id]
        const mine = land.includes(sq.id)
        const next = canBuy(sq.id, land)
        const upgrade = LAND_UPGRADES[sq.id]
        const tiers = UPGRADES[upgrade].levels
        const lvl = level(owned, upgrade)
        const tier = nextLevel(owned, upgrade)
        const action = mine
          ? tier
            ? `<button data-buy="${upgrade}" ${coins < tier.cost ? 'disabled' : ''} aria-label="Buy ${esc(tier.name!)} for ${tier.cost} coins">Upgrade ${lvl + 1}/3 · 🪙 ${tier.cost}</button>`
            : '<span class="owned">✓ Fully upgraded</span>'
          : next
            ? `<button data-land="${sq.id}" ${coins < info.cost ? 'disabled' : ''}>Buy land · 🪙 ${info.cost}</button>`
            : '<small>🔒 buy next door first</small>'
        const preview = tiers[lvl] ?? tiers[2]
        const roadmap = `<details data-square="${sq.id}" ${expanded.has(sq.id) ? 'open' : ''}>
          <summary>All 3 upgrades</summary>
          <ol>${tiers.map((t, i) => `<li class="${i < lvl ? 'unlocked' : ''}"><b>${i < lvl ? '✓ ' : ''}${esc(t.name!)}</b> · 🪙 ${t.cost}<small>${esc(t.desc)}</small></li>`).join('')}</ol>
          <small>Each upgrade keeps the earlier benefits.</small>
        </details>`
        return `<div class="sq ${mine ? 'mine' : next ? 'next' : 'far'}">
          <span class="icon">${info.icon}</span><b>${info.name}</b><small>${info.desc}</small>
          <span class="land-progress" aria-label="${lvl} of 3 upgrades">${mine ? `${'●'.repeat(lvl)}${'○'.repeat(3 - lvl)} · ${lvl}/3` : 'Land required'}</span>
          <div class="land-benefit"><b>${!mine ? 'First upgrade: ' : !tier ? 'Complete: ' : 'Next: '}${esc(preview.name!)}</b><small>${esc(preview.desc)}</small></div>
          ${action}${roadmap}</div>`
      }).join('')}</div>`
    } else {
      const ids = UPGRADE_IDS.filter((id) => UPGRADES[id].tab === this.shopTab)
      body = `<table>${ids
        .map((id) => {
          const u = UPGRADES[id]
          const lvl = level(owned, id)
          const next = nextLevel(owned, id)
          const missing = u.needs && !land.includes(u.needs) ? u.needs : null
          const button = !next
            ? `<span class="owned">✓ ${u.levels.length > 1 ? 'Maxed' : 'Got it'}</span>`
            : missing
              ? `<small>needs ${LAND[missing].icon} ${LAND[missing].name}</small>`
              : `<button data-buy="${id}" ${coins < next.cost ? 'disabled' : ''}>🪙 ${next.cost}</button>`
          // Levels as pips (●●○), then what the next one does (or the top one, once maxed).
          const pips = u.levels.length > 1 ? ` <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(u.levels.length - lvl)}</span>` : ''
          const desc = next ? `${lvl ? 'Next: ' : ''}${next.desc}` : u.levels[lvl - 1].desc
          return `<tr class="${next ? '' : 'have'}"><td class="icon">${u.icon}</td><td><b>${u.name}</b>${pips}<br><small>${desc}</small></td><td>${button}</td></tr>`
        })
        .join('')}</table>`
    }
    el.innerHTML = `
      <h3>Farm shop</h3>
      <p class="wallet">🪙 <b>${coins}</b> in the farm wallet. Everyone shares it: spend it wisely!</p>
      <div class="tabs">${tabs}</div>
      ${body}
      <p class="hint">Earn coins each morning for happy, well-fed piggies. <kbd>B</kbd> to close</p>`
    el.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.shopTab = b.dataset.tab as ShopTab
        this.shopKey = ''
      }),
    )
    el.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach((b) => b.addEventListener('click', () => buy.upgrade(b.dataset.buy as UpgradeId)))
    el.querySelectorAll<HTMLButtonElement>('button[data-land]').forEach((b) => b.addEventListener('click', () => buy.land(b.dataset.land as SquareId)))
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
  showCheck(look: PigLook | null, snap: PigSnap | null, act: CheckActions, extra: CheckExtra) {
    if (!look || !snap) {
      this.check.hidden = true
      this.checkPig = null
      this.renaming = false
      return
    }
    if (this.checkPig !== look.id) {
      this.checkPig = look.id
      this.checked.clear()
      this.renaming = false
      this.buildCheck(look, act)
    }
    this.check.hidden = false
    this.updateCheck(look, snap, extra)
  }

  /** Swaps the pig's name for a text box. Enter saves, Escape doesn't. */
  private startRename(look: PigLook, act: CheckActions) {
    if (this.renaming) return
    this.renaming = true
    const h = this.check.querySelector('h3')!
    h.innerHTML = `<input id="ck-name" maxlength="16" value="${esc(look.name)}" autocomplete="off">`
    const input = h.querySelector('input')!
    input.focus()
    input.select()
    const done = (save: boolean) => {
      if (!this.renaming) return
      this.renaming = false
      const name = input.value.trim()
      if (save && name && name !== look.name) act.rename(name)
      h.textContent = look.name
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(true)
      if (e.key === 'Escape') done(false)
    })
    input.addEventListener('blur', () => done(true))
  }

  private buildCheck(look: PigLook, act: CheckActions) {
    const sex = look.sex === 'sow' ? '♀ sow' : '♂ boar'
    this.check.innerHTML = `
      <h3>${esc(look.name)}</h3>
      <p class="who">${BREED_NAMES[look.breed]} · ${sex} · ${look.age ? `${look.age} yr${look.age > 1 ? 's' : ''} old` : 'a baby!'}</p>
      <p class="family" id="ck-family"></p>
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
      </div>
      <div class="buttons">
        <button id="ck-adopt">⭐ Adopt</button>
        <button id="ck-rename">✏️ Rename</button>
      </div>`
    const start = (id: Check, delay = 0) => {
      if (!this.checked.has(id)) this.checked.set(id, performance.now() + delay + CHECK_MS)
    }
    this.check.querySelector('#ck-all')!.addEventListener('click', () => CHECKS.forEach((c, i) => start(c.id, i * 350)))
    this.check.querySelector('#ck-cuddle')!.addEventListener('click', () => act.cuddle())
    this.check.querySelector('#ck-down')!.addEventListener('click', () => act.putDown())
    this.check.querySelector('#ck-adopt')!.addEventListener('click', () => act.adopt())
    this.check.querySelector('#ck-rename')!.addEventListener('click', () => this.startRename(look, act))
    this.check.querySelector('h3')!.addEventListener('dblclick', () => this.startRename(look, act))
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

  private updateCheck(look: PigLook, p: PigSnap, extra: CheckExtra) {
    const h = this.check.querySelector('h3')!
    if (!this.renaming && h.textContent !== look.name) h.textContent = look.name
    const adopt = look.adopter === extra.myName ? '⭐ Yours! (let go)' : look.adopter ? `⭐ Adopt (${look.adopter}’s now)` : '⭐ Adopt'
    const ab = this.check.querySelector('#ck-adopt')!
    if (ab.textContent !== adopt) ab.textContent = adopt
    const fam = this.check.querySelector('#ck-family')!
    if (fam.innerHTML !== extra.family) fam.innerHTML = extra.family
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

import * as THREE from 'three'
import { BEDS, BED_D, BED_W, BOWLS, DOOR_MID, DOOR_OUT, FEED_BIN, HAY_BALE, SALAD_SPOT, HAY_RACKS, HOPPERS, rackBuilt, rackFront, SALAD_TABLE, dist, groundAt, hayPatchAt, hayStackAt, inRect, isInside, setLand } from '../core/map.ts'
import type { PigLook } from '../core/pigs.ts'
import type { ClientMsg, FarmerSnap, PigSnap, PigState, PredSnap, ServerMsg } from '../core/protocol.ts'
import {
  BOWL_MAX,
  EMOTES,
  FARMER_COLORS,
  HAY_ARMFUL,
  hayRackMax,
  hayYield,
  HAY_SLOTS,
  hayStackMax,
  LAND,
  NIGHT_START,
  HEAD_HOME,
  PUP_DAYS,
  REACH,
  SALAD_FROM,
  PLATTER_PLACE,
  SALAD_KINDS,
  SALAD_MAX,
  SALAD_MIN,
  RUN_SPEED,
  HAWK_SHOO_EXTRA,
  isSneaky,
  farmerSpeed,
  shooRadius,
  THROW_RANGE,
  VEG_BITES,
  VEGGIES,
  WALK_SPEED,
  type Veg,
  basketMax,
  daysToShow,
  poorly,
  hopperMax,
} from '../core/rules.ts'
import { moveFarmer } from '../core/move.ts'
import { facing, yawTowards } from '../core/vec.ts'
import { Bubbles, type BubbleStyle } from './bubbles.ts'
import { FarmerModel, FoxModel, HawkModel } from './critters.ts'
import { Hud, mood } from './hud.ts'
import { Input } from './input.ts'
import { FAST, TOUCH } from './device.ts'
import { TouchControls } from './touch.ts'
import { setNight } from './music.ts'
import type { Net } from './net.ts'
import { PigModel } from './pig.ts'
import { VEG_ICON, VEG_LABEL, makeVeg } from './veg.ts'
import { World, makeHay } from './world.ts'
import { ShowHall } from './showhall.ts'
import { CAR_FARM, CAR_REACH, TABLE_H, TABLE_REACH, TABLE_SPOT } from '../core/show.ts'

/** `selected` for the hay slot (after the veg). */
const HAY_SLOT = VEGGIES.length

const makeFood = (kind: Veg | 'hay') => (kind === 'hay' ? makeHay() : makeVeg(kind))

type Snap = Extract<ServerMsg, { t: 'snap' }>

const SEND_MS = 50
const CAM_PITCH = 0.95
const THROW_COOLDOWN = 0.2
/** Pigs further than this from you keep quiet, so the screen isn't all bubbles. */
const CHATTER_RANGE = 30
/** A grown-up boar this close to a grown-up sow (both up and about) rumblestruts at her. */
const STRUT_RANGE = 1.4
const STRUT_AT: PigState[] = ['idle', 'wander', 'graze']
/** Emote keys, in EMOTES order, and how each bubble looks. */
const EMOTE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV']
/** What the action's called in hints: the key, or the button on a touch screen. */
const ACT_KEY = TOUCH ? '✋' : 'E'
const EMOTE_STYLE: BubbleStyle[] = ['plain', 'love', 'eek', 'wheek']

const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const WHEEK = ['WHEEK!', 'wheek wheek!', 'WHEEEEK!', 'wheeek!', 'WHEEK WHEEK!']
const MONCH = ['monch monch', 'monch', 'nom nom', 'crunch', 'munch munch', 'monchmonch', 'nomnomnom']
const CHUTT = ['chutt chutt', 'purrr', 'chut?', 'mrrr']
/** Timothy hay green (in the basket). */
const HAY_COLOR = 0x98ad54
const VEG_COLOR: Record<Veg, number> = { carrot: 0xf07b1d, lettuce: 0x86c94a, cucumber: 0x2f7a2a, pepper: 0x4fae32, apple: 0xd8322b }

/** Turns `a` towards `b` the short way round. */
function lerpAngle(a: number, b: number, k: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

interface PigView {
  look: PigLook
  model: PigModel
  snap: PigSnap
  prev: PigState
  x: number
  z: number
  yaw: number
  speed: number
  nextChatter: number
  phase: number
  /** A boar rumblestrutting at a sow nearby. */
  strut: boolean
}

interface FarmerView {
  model: FarmerModel
  snap: FarmerSnap
  x: number
  y: number
  z: number
  yaw: number
  speed: number
}

interface PredView {
  snap: PredSnap
  fox: FoxModel | null
  hawk: HawkModel | null
  root: THREE.Object3D
  x: number
  y: number
  z: number
  yaw: number
  speed: number
  nextChatter: number
}

interface Flying {
  obj: THREE.Object3D
  from: THREE.Vector3
  to: THREE.Vector3
  age: number
  dur: number
}

interface Action {
  label: string
  msg: ClientMsg | null
  d: number
}

const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()))

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 300)
  private readonly world = new World()
  /** The pig show's barn, rivals and car. */
  private readonly hall: ShowHall
  /** What the judge was last seen doing (for the judge's bubbles and the judging card). */
  private judging = ''
  private readonly bubbles: Bubbles
  private readonly hud = new Hud()
  private readonly input: Input
  /** The on-screen buttons, on a touch screen. */
  private readonly touch: TouchControls | null = null
  private net!: Net
  private myId = -1
  private looks: PigLook[] = []

  private readonly me = { x: 0, y: 0, z: -5, vx: 0, vy: 0, vz: 0, yaw: 0, speed: 0, model: null as FarmerModel | null }
  private jumpQueued = false
  private readonly camYaw = 0 // the camera never turns
  /** How far the camera sits back (the wheel or a pinch changes it): a bit closer on a phone's small screen. */
  private camDist = TOUCH ? 16 : 22
  private readonly camTarget = new THREE.Vector3()

  private pigs: PigView[] = []
  private readonly farmers = new Map<number, FarmerView>()
  private readonly foods = new Map<number, THREE.Object3D>()
  private readonly preds = new Map<number, PredView>()
  private flying: Flying[] = []
  private snap: Snap | null = null
  private selected = 0
  /** Day, dusk or night, last we looked (null until the first snapshot, so joining doesn't announce anything). */
  private phase: 'day' | 'dusk' | 'night' | null = null
  private lastSend = 0
  private lastThrow = 0
  private clock = 0
  private action: Action | null = null
  private myName = ''
  /** The pig under the mouse, if any (from the hover label). */
  private pointedPig: number | null = null
  private lastDiary = 0

  private readonly aim = new THREE.Vector3()
  private readonly cursor: THREE.Mesh
  private readonly rangeRing: THREE.Mesh
  private readonly raycaster = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(canvas: HTMLCanvasElement) {
    // Fast graphics (phones): no antialiasing, fewer pixels, plain shadows.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !FAST, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, FAST ? 1.5 : 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = FAST ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    this.bubbles = new Bubbles(this.world.scene)
    this.hall = new ShowHall(this.world.scene)
    this.input = new Input(canvas)
    // A click does what E would; with nothing to do, it throws.
    this.input.onClick = () => {
      if (this.snap?.paused) return
      if (this.action?.msg) this.act()
      else this.throwVeg()
    }
    // A tap on a touch screen throws there (the action has its own button, and the prompt can be tapped).
    this.input.onTap = () => {
      if (this.snap?.paused || !this.me.model) return
      // Holding a piggy (the check card's up): a tap off the card places it down, like a click does.
      // (Not with the card tucked away: then you're walking about with it.)
      if (this.holding() !== null) return this.hud.checkOpen ? this.send({ t: 'putdown' }) : undefined
      // Hands full or nothing to throw: a stray tap does nothing (no telling off).
      if (this.hasSack() || this.mySnap()?.platter) return
      if (!this.basket().some((n) => n > 0) && this.hayArmfuls() <= 0) return
      this.updateAim(this.holding())
      this.throwVeg()
    }
    this.hud.onSlot = (i) => this.slot(i)
    this.input.onKey = (code) => this.key(code)
    if (TOUCH) this.touch = new TouchControls((code) => this.input.press(code))

    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    this.cursor.rotation.x = -Math.PI / 2
    this.cursor.renderOrder = 5
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(THROW_RANGE - 0.08, THROW_RANGE, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }),
    )
    this.rangeRing.rotation.x = -Math.PI / 2
    this.world.scene.add(this.cursor, this.rangeRing)

    addEventListener('resize', () => this.resize())
    this.resize()
  }

  /**
   * Gets everything ready behind the loading screen, a bit at a time so the screen can show how it's going: the
   * piggies (a couple per frame), then (once the first snapshot is in) everything placed, and the shaders compiled so
   * the first real frame doesn't stall. `progress` gets 0..1 and what's happening.
   */
  async load(net: Net, id: number, looks: PigLook[], progress: (k: number, text: string) => void) {
    this.net = net
    this.myId = id
    this.looks = []
    for (let i = 0; i < looks.length; i++) {
      this.setLook(looks[i])
      if (i % 2 === 1) {
        progress(0.3 + (0.5 * (i + 1)) / looks.length, `Fluffing up the piggies… ${i + 1}/${looks.length}`)
        await nextFrame()
      }
    }
  }

  /** Once the first snapshot's in: place everything, compile the shaders, draw a frame. */
  async warmUp() {
    for (let i = 0; i < 120 && !this.snap; i++) await nextFrame()
    this.frame(0)
    await this.renderer.compileAsync(this.world.scene, this.camera)
    this.frame(0)
    await nextFrame()
  }

  /** Off we go: the HUD and the main loop. */
  run() {
    this.hud.show()
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      this.frame(dt)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  /** A pig was born, or something about one changed (name, adopter, grown up, rosette). */
  private setLook(look: PigLook) {
    const old = this.pigs[look.id]
    this.looks[look.id] = look
    if (old && old.look.age === look.age) {
      old.look = look
      old.model.setRosettes(look.rosettes ?? 0)
      old.model.setPregnant(look.due !== undefined)
      return
    }
    // New, or a pup that grew up: (re)build the model.
    const model = new PigModel(look)
    model.setPregnant(look.due !== undefined)
    this.world.scene.add(model.root)
    if (old) old.model.root.removeFromParent()
    this.pigs[look.id] = {
      look,
      model,
      snap: old?.snap ?? { id: look.id, x: 0, z: 0, yaw: 0, s: 'idle', hunger: 100, happy: 100, issues: 0 },
      prev: old?.prev ?? 'idle',
      x: old?.x ?? 0,
      z: old?.z ?? 0,
      yaw: old?.yaw ?? 0,
      speed: 0,
      nextChatter: Math.random() * 5,
      phase: old?.phase ?? Math.random() * 10,
      strut: false,
    }
  }

  private resize() {
    const w = innerWidth
    const h = innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private send(msg: ClientMsg) {
    this.net.send(msg)
  }

  private mySnap(): FarmerSnap | undefined {
    return this.snap?.farmers.find((f) => f.id === this.myId)
  }

  private basket(): number[] {
    return this.mySnap()?.basket ?? VEGGIES.map(() => 0)
  }

  private basketMax(): number {
    return basketMax(this.snap?.upgrades ?? [])
  }

  private hasSack(): boolean {
    return this.mySnap()?.sack ?? false
  }

  /** Dawn, dusk and nightfall get a big callout in the middle of the screen. */
  private announcePhase(day: number, time: number) {
    const phase = time < HEAD_HOME ? 'day' : time < NIGHT_START ? 'dusk' : 'night'
    const was = this.phase
    this.phase = phase
    if (was === null || was === phase) return
    if (phase === 'day') this.hud.callout('☀️ Good morning!', `Day ${day}: time to feed the piggies`, 'dawn')
    else if (phase === 'dusk') this.hud.callout('🌇 Dusk', 'Bring the piggies in and serve the salad', 'dusk')
    else this.hud.callout('🌙 Night', 'Shut the barn door: the foxes are about!', 'night')
  }

  /** Armfuls of hay in my basket. */
  private hayArmfuls(): number {
    return this.mySnap()?.hay ?? 0
  }

  private holding(): number | null {
    return this.mySnap()?.holding ?? null
  }

  // ---------------------------------------------------------------- server messages

  onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'snap':
        return this.applySnap(msg)
      case 'thrown': {
        const obj = makeFood(msg.kind)
        this.world.scene.add(obj)
        this.flying.push({
          obj,
          from: new THREE.Vector3(msg.from.x, 1.4, msg.from.z),
          to: new THREE.Vector3(msg.to.x, 0, msg.to.z),
          age: 0,
          dur: msg.ms / 1000,
        })
        if (msg.by === this.myId) this.me.model?.throw()
        else this.farmers.get(msg.by)?.model.throw()
        return
      }
      case 'shoo':
        if (msg.by !== this.myId) {
          const f = this.farmers.get(msg.by)
          if (f) this.bubbles.say(f.model.root, 'SHOO!', 'shoo', 2.6, 0.8)
        }
        return
      case 'purr': {
        const v = this.pigs[msg.pig]
        if (v) this.bubbles.say(v.model.root, pickOne(['purrrr ♥', 'chutt chutt ♥', 'purr purr ♥']), 'love', 0.7)
        return
      }
      case 'teleport': {
        // Driven to the show, or home: straight there, camera and all.
        Object.assign(this.me, { x: msg.x, z: msg.z, y: 0, vx: 0, vy: 0, vz: 0 })
        this.camTarget.set(msg.x, 0.8, msg.z)
        return
      }
      case 'showResults':
        this.hud.showShowResults(msg, this.myName)
        return
      case 'report':
        this.hud.showReport(msg, () => this.hud.toggleShop(true))
        this.hud.alert('day', `🪙 Day ${msg.day} earned the farm ${msg.total} coins`)
        return
      case 'alert':
        this.hud.alert(msg.kind, msg.text, msg.cheer)
        return
      case 'pig': {
        const born = !this.pigs[msg.look.id]
        this.setLook(msg.look)
        if (born && this.snap) {
          const mum = msg.look.mum === undefined ? undefined : this.pigs[msg.look.mum]
          const v = this.pigs[msg.look.id]
          if (mum) Object.assign(v, { x: mum.x, z: mum.z })
          this.bubbles.say(v.model.root, 'squeak!', 'love', 0.5)
        }
        return
      }
      case 'emote': {
        const model = msg.by === this.myId ? this.me.model : this.farmers.get(msg.by)?.model
        if (model) this.bubbles.say(model.root, EMOTES[msg.e], EMOTE_STYLE[msg.e], 2.6, 0.8)
        return
      }
      case 'diary':
        this.hud.showDiary(msg.rows, this.myName)
        return
    }
  }

  private applySnap(snap: Snap) {
    const first = !this.snap
    this.snap = snap

    // Farmers
    const seen = new Set<number>()
    for (const f of snap.farmers) {
      seen.add(f.id)
      if (f.id === this.myId) {
        this.myName = f.name
        if (!this.me.model) {
          this.me.model = new FarmerModel(FARMER_COLORS[f.color], null)
          this.world.scene.add(this.me.model.root)
          this.me.x = f.x
          this.me.z = f.z
        }
        continue
      }
      let v = this.farmers.get(f.id)
      if (!v) {
        const model = new FarmerModel(FARMER_COLORS[f.color], f.name)
        this.world.scene.add(model.root)
        v = { model, snap: f, x: f.x, y: f.y, z: f.z, yaw: f.yaw, speed: 0 }
        this.farmers.set(f.id, v)
      }
      v.snap = f
    }
    for (const [id, v] of this.farmers) {
      if (!seen.has(id)) {
        v.model.root.removeFromParent()
        this.farmers.delete(id)
      }
    }

    // Pigs
    for (const s of snap.pigs) {
      const v = this.pigs[s.id]
      if (!v) continue
      if (first || v.snap.s === 'lost') {
        v.x = s.x
        v.z = s.z
        v.yaw = s.yaw
      }
      v.snap = s
    }

    // Food on the ground
    const here = new Set<number>()
    for (const f of snap.foods) {
      here.add(f.id)
      let obj = this.foods.get(f.id)
      if (!obj) {
        obj = makeFood(f.kind)
        obj.position.set(f.x, 0, f.z)
        obj.rotation.y = f.id * 1.7
        this.world.scene.add(obj)
        this.foods.set(f.id, obj)
      }
      obj.scale.setScalar(0.55 + (0.45 * f.bites) / (f.kind === 'hay' ? HAY_ARMFUL : VEG_BITES[f.kind]))
    }
    for (const [id, obj] of this.foods) {
      if (!here.has(id)) {
        obj.removeFromParent()
        this.foods.delete(id)
      }
    }

    // Predators
    const preds = new Set<number>()
    for (const p of snap.preds) {
      preds.add(p.id)
      let v = this.preds.get(p.id)
      if (!v) {
        const fox = p.kind === 'fox' ? new FoxModel() : null
        const hawk = p.kind === 'hawk' ? new HawkModel() : null
        const root = fox ? fox.root : hawk!.root
        this.world.scene.add(root)
        if (hawk) this.world.scene.add(hawk.shadow)
        v = { snap: p, fox, hawk, root, x: p.x, y: p.y, z: p.z, yaw: 0, speed: 0, nextChatter: 0 }
        this.preds.set(p.id, v)
      }
      if (v.snap.s !== p.s) this.predSays(v, p)
      v.snap = p
    }
    for (const [id, v] of this.preds) {
      if (!preds.has(id)) {
        v.root.removeFromParent()
        v.hawk?.shadow.removeFromParent()
        this.preds.delete(id)
      }
    }

    this.world.setBeds(snap.beds)
    this.world.setBowls(snap.bowls)
    this.world.setSalad(snap.salad.veg, snap.salad.bites)
    this.world.setPlatterCarried(snap.farmers.some((f) => f.platter))
    this.world.setHoppers(snap.hoppers, hopperMax(snap.upgrades))
    this.world.setUpgrades(snap.upgrades)
    this.world.setRacks(snap.racks)
    this.world.setHayField(snap.hayField)
    this.world.setStacks(snap.stacks)
    this.world.setSacks(snap.sacks)
    this.world.setBale(snap.bale)
    // The map's fences and solids follow the farm's land, for walking about here too.
    setLand(snap.land)
    this.world.setLand(snap.land)
    this.world.setDoor(snap.door)
    this.world.setRain(snap.rain)
    this.hud.setCoins(snap.coins)
    this.hud.setFarmers(snap.farmers, this.myId, this.looks)
    this.hud.setToday(snap.craving, daysToShow(snap.day), snap.rain, snap.zoom)
    this.hud.setJobs(snap.jobs)
    this.hud.setClock(snap.day, snap.time)
    setNight(snap.time >= NIGHT_START)
    this.announcePhase(snap.day, snap.time)
    this.hud.setStats(snap.pigs, snap.pigs.filter((p) => p.s !== 'lost' && isInside(p)).length, snap.pigs.length)
    if (this.selected === HAY_SLOT && this.hayArmfuls() <= 0) this.selected = 0
    this.hud.setBasket(this.basket(), this.selected, this.basketMax(), this.hayArmfuls())
  }

  private predSays(v: PredView, p: PredSnap) {
    const lines: Partial<Record<PredSnap['s'], [string, BubbleStyle]>> =
      p.kind === 'fox'
        ? { carry: ['hehehe!', 'eek'], flee: ['yelp!', 'shoo'] }
        : { swoop: ['SKREEEE!', 'eek'], flee: ['squawk!', 'shoo'] }
    const line = lines[p.s]
    if (line) this.bubbles.say(v.root, line[0], line[1], p.kind === 'fox' ? 1.2 : 0.8, 0.6)
  }

  // ---------------------------------------------------------------- input

  private key(code: string) {
    if (code === 'KeyP') return this.send({ t: 'pause' })
    // Paused: nothing to do but look at the help or the diary, or carry on.
    if (this.snap?.paused && !['KeyH', 'KeyL', 'Escape'].includes(code)) return
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(5)) - 1
      if (i >= 0 && i < VEGGIES.length) this.select(i)
    } else if (code === 'KeyE') {
      this.act()
    } else if (code === 'KeyF') {
      this.send({ t: 'shoo' })
      if (this.me.model) this.bubbles.say(this.me.model.root, pickOne(['SHOO!', 'GO ON, SHOO!', 'OI! SHOO!']), 'shoo', 2.6, 0.8)
    } else if (EMOTE_KEYS.includes(code)) {
      this.send({ t: 'emote', e: EMOTE_KEYS.indexOf(code) })
    } else if (code === 'KeyB') {
      this.hud.hideReport()
      this.hud.toggleDiary(false)
      this.hud.toggleShop()
    } else if (code === 'KeyL') {
      this.hud.hideReport()
      this.hud.toggleShop(false)
      this.hud.toggleDiary()
      if (this.hud.diaryOpen) this.askDiary()
    } else if (code === 'Escape') {
      this.hud.hideShowResults()
      this.hud.toggleShop(false)
      this.hud.toggleDiary(false)
      this.hud.hideReport()
    } else if (code === 'KeyH') {
      const help = document.getElementById('help')!
      help.classList.toggle('open')
    } else if (code === 'Space') {
      this.jumpQueued = true
    }
  }

  private askDiary() {
    this.lastDiary = this.clock
    this.send({ t: 'diary' })
  }

  /** E or left click: whatever the prompt offers. */
  private act() {
    if (this.action?.msg) this.send(this.action.msg)
  }

  private select(i: number) {
    this.selected = i
    this.hud.setBasket(this.basket(), this.selected, this.basketMax(), this.hayArmfuls())
  }

  /** A basket slot was clicked: take that in hand, or if it already is, drop one at your feet. */
  private slot(i: number) {
    if (this.snap?.paused) return
    if (i !== this.selected) return this.select(i)
    const ahead = facing(this.me.yaw)
    this.throwVeg({ x: this.me.x + ahead.x * 0.7, z: this.me.z + ahead.z * 0.7 })
  }

  private throwVeg(at: { x: number; z: number } = this.aim) {
    if (!this.snap || this.clock - this.lastThrow < THROW_COOLDOWN) return
    if (this.holding() !== null) {
      this.hud.toast(`Place the piggy down first (${ACT_KEY})`)
      return
    }
    if (this.hasSack()) {
      this.hud.toast(`Pour that sack into a hopper first (${ACT_KEY})`)
      return
    }
    if (this.mySnap()?.platter) {
      this.hud.toast(`Hands full: put the salad platter down in the middle of the barn first (${ACT_KEY})`)
      return
    }
    if (this.selected === HAY_SLOT) {
      if (this.hayArmfuls() <= 0) {
        this.selected = 0
        this.hud.toast('No hay on you! Take some off the bale on the hay table by the door 🌾')
        return
      }
      this.lastThrow = this.clock
      this.me.yaw = yawTowards(this.me, at)
      this.send({ t: 'throw', veg: 'hay', x: at.x, z: at.z })
      return
    }
    const basket = this.basket()
    if (basket[this.selected] <= 0) {
      const other = basket.findIndex((n) => n > 0)
      if (other < 0) {
        this.hud.toast('Your basket is empty! Pick veg in the garden 🥕 or apples in the orchard 🍎')
        return
      }
      this.selected = other
    }
    this.lastThrow = this.clock
    this.me.yaw = yawTowards(this.me, at)
    this.send({ t: 'throw', veg: VEGGIES[this.selected], x: at.x, z: at.z })
  }

  // ---------------------------------------------------------------- the frame

  private frame(dt: number) {
    this.clock += dt
    if (!this.snap || !this.me.model) {
      this.renderer.render(this.world.scene, this.camera)
      return
    }
    const holding = this.holding()

    // Camera zoom (it never turns)
    this.camDist = Math.max(10, Math.min(38, this.camDist + this.input.takeZoom() * 2))

    // Paused: everything stands still (no walking, no animation), just the picture and a banner.
    this.hud.setPaused(this.snap.paused)
    if (this.snap.paused) {
      this.jumpQueued = false
      this.me.vx = this.me.vz = 0
      this.input.takeZoom()
      const flat = this.camDist * Math.cos(CAM_PITCH)
      this.camera.position.set(
        this.camTarget.x + Math.sin(this.camYaw) * flat,
        this.camTarget.y + this.camDist * Math.sin(CAM_PITCH),
        this.camTarget.z + Math.cos(this.camYaw) * flat,
      )
      this.camera.lookAt(this.camTarget)
      this.renderer.render(this.world.scene, this.camera)
      return
    }

    // Walk relative to the camera (not while sat in the show car).
    const aboard = !!this.mySnap()?.aboard
    const mv = aboard ? { x: 0, y: 0 } : this.input.move()
    if (aboard) this.jumpQueued = false
    const fwd = facing(this.camYaw)
    const right = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) }
    const dx = right.x * mv.x + fwd.x * mv.y
    const dz = right.z * mv.x + fwd.z * mv.y
    const len = Math.hypot(dx, dz)
    const run = this.input.running() && holding === null
    // On a phone the check card covers the farm: walking off with your piggy tucks it away (a tab brings it back).
    if (TOUCH && len > 0 && holding !== null) this.hud.foldCheck(true)
    const speed = len > 0 ? ((run ? RUN_SPEED : WALK_SPEED) * farmerSpeed(this.snap.upgrades)) / len : 0

    // Momentum, jumping and falling: anything lower than your feet doesn't get in the way, and you land on whatever's under you.
    const { airborne } = moveFarmer(this.me, { x: dx * speed, z: dz * speed }, this.jumpQueued, dt)
    this.jumpQueued = false
    this.me.speed = Math.hypot(this.me.vx, this.me.vz)
    // Face where you're going (where you're steering, in the air).
    const face = airborne && len > 0 ? { x: dx, z: dz } : { x: this.me.vx, z: this.me.vz }
    if (Math.hypot(face.x, face.z) > 0.3) this.me.yaw = lerpAngle(this.me.yaw, yawTowards({ x: 0, z: 0 }, face), Math.min(1, dt * 12))
    const mine = this.me.model
    mine.root.visible = !aboard // sat in the show car
    mine.root.position.set(this.me.x, 0, this.me.z)
    mine.root.rotation.y = this.me.yaw
    const basket = this.basket()
    const top = basket.findLastIndex((n) => n > 0)
    const sack = this.hasSack()
    const hay = this.hayArmfuls()
    const used = basket.reduce((a, b) => a + b, 0) + hay * HAY_SLOTS
    mine.pose(dt, airborne ? 0 : this.me.speed, holding !== null || sack, used / this.basketMax(), hay ? HAY_COLOR : top < 0 ? 0 : VEG_COLOR[VEGGIES[top]], sack, airborne, hay > 0, !!this.mySnap()?.platter)
    mine.root.position.y += this.me.y

    if (performance.now() - this.lastSend > SEND_MS) {
      this.lastSend = performance.now()
      const r2 = (v: number) => Math.round(v * 100) / 100
      this.send({ t: 'state', x: r2(this.me.x), y: r2(this.me.y), z: r2(this.me.z), yaw: r2(this.me.yaw) })
    }

    // Camera follows from behind and above.
    this.camTarget.lerp(new THREE.Vector3(this.me.x, 0.8 + this.me.y * 0.5, this.me.z), Math.min(1, dt * 6))
    const flat = this.camDist * Math.cos(CAM_PITCH)
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * flat,
      this.camTarget.y + this.camDist * Math.sin(CAM_PITCH),
      this.camTarget.z + Math.cos(this.camYaw) * flat,
    )
    this.camera.lookAt(this.camTarget)

    this.updateFarmers(dt)
    this.updatePreds(dt)
    this.updatePigs(dt)
    this.updateFlying(dt)
    this.updateAim(holding)
    this.updateAction(holding)
    this.updateArrowsAndTooltip()

    const inside = isInside(this.me)
    this.world.setCutaway(inside)
    this.world.update(dt, this.camTarget)
    this.updateShow(dt)
    this.world.setTime(this.snap.time, this.camTarget)
    this.hud.setDarkness(this.world.darkness)
    // Keep the diary fresh while it's open.
    if (this.hud.diaryOpen && this.clock - this.lastDiary > 3) this.askDiary()
    this.bubbles.update(dt)
    this.hud.updateShop(this.snap.coins, this.snap.upgrades, this.snap.land, {
      upgrade: (upgrade) => this.send({ t: 'buy', upgrade }),
      land: (square) => this.send({ t: 'land', square }),
    })
    this.hud.showCheck(
      holding === null ? null : this.looks[holding],
      holding === null ? null : this.pigs[holding].snap,
      {
        treat: (issue) => this.send({ t: 'treat', issue }),
        cuddle: () => this.send({ t: 'cuddle' }),
        putDown: () => this.send({ t: 'putdown' }),
        rename: (name) => this.send({ t: 'rename', name }),
        adopt: () => this.send({ t: 'adopt' }),
      },
      { myName: this.myName, family: holding === null ? '' : this.family(this.looks[holding]) },
    )
    this.renderer.render(this.world.scene, this.camera)
  }

  private updateFarmers(dt: number) {
    for (const v of this.farmers.values()) {
      const s = v.snap
      const k = Math.min(1, dt * 10)
      const ox = v.x
      const oz = v.z
      v.x += (s.x - v.x) * k
      v.y += (s.y - v.y) * Math.min(1, dt * 15)
      v.z += (s.z - v.z) * k
      v.speed = v.speed * 0.8 + (Math.hypot(v.x - ox, v.z - oz) / dt) * 0.2
      v.yaw = lerpAngle(v.yaw, s.yaw, k)
      v.model.root.position.set(v.x, 0, v.z)
      v.model.root.rotation.y = v.yaw
      v.model.root.visible = !s.aboard // sat in the show car
      const top = s.basket.findLastIndex((n) => n > 0)
      const airborne = v.y > groundAt(v) + 0.05
      const used = s.basket.reduce((a, b) => a + b, 0) + s.hay * HAY_SLOTS
      v.model.pose(dt, airborne ? 0 : v.speed, s.holding !== null || s.sack, used / this.basketMax(), s.hay ? HAY_COLOR : top < 0 ? 0 : VEG_COLOR[VEGGIES[top]], s.sack, airborne, s.hay > 0, s.platter)
      v.model.root.position.y += v.y
    }
  }

  private updatePreds(dt: number) {
    for (const v of this.preds.values()) {
      const s = v.snap
      const k = Math.min(1, dt * 10)
      const ox = v.x
      const oz = v.z
      v.x += (s.x - v.x) * k
      v.y += (s.y - v.y) * k
      v.z += (s.z - v.z) * k
      const moved = Math.hypot(v.x - ox, v.z - oz)
      v.speed = v.speed * 0.8 + (moved / dt) * 0.2
      if (moved > 0.002) v.yaw = lerpAngle(v.yaw, yawTowards({ x: ox, z: oz }, { x: v.x, z: v.z }), Math.min(1, dt * 8))
      v.root.position.set(v.x, v.y, v.z)
      v.root.rotation.y = v.yaw
      if (v.fox) {
        v.fox.pose(dt, v.speed, s.s === 'sneak')
        if (s.s === 'sneak' && this.clock > v.nextChatter) {
          v.nextChatter = this.clock + 3 + Math.random() * 3
          this.bubbles.say(v.root, pickOne(['sniff sniff', '*sneaks*', 'hehe…']), 'plain', 1.2, 0.45)
        }
      }
      if (v.hawk) {
        v.hawk.pose(dt, s.s === 'swoop', v.y)
        v.hawk.shadow.position.set(v.x, 0.03, v.z)
        if (s.s === 'circle' && this.clock > v.nextChatter) {
          v.nextChatter = this.clock + 4 + Math.random() * 3
          this.bubbles.say(v.root, 'kee-eee-arr!', 'plain', 0.8, 0.55)
        }
      }
    }
  }

  private updatePigs(dt: number) {
    const holders = new Map<number, { x: number; y: number; z: number; yaw: number }>()
    for (const f of this.snap!.farmers) {
      if (f.holding === null) continue
      const v = f.id === this.myId ? this.me : this.farmers.get(f.id)
      if (v) holders.set(f.holding, v)
    }
    const carriers = new Map<number, PredView>()
    for (const v of this.preds.values()) if (v.snap.pig !== null && v.snap.s !== 'sneak' && v.snap.s !== 'circle' && v.snap.s !== 'swoop') carriers.set(v.snap.pig, v)

    // Pups grow from half size to full over PUP_DAYS.
    const days = this.snap!.day - 1 + this.snap!.time
    // Grown-up sows that are up and about, for boars to show off to.
    const sows = this.pigs.filter((v) => v.look.sex === 'sow' && v.look.age > 0 && STRUT_AT.includes(v.snap.s))
    for (const v of this.pigs) {
      const s = v.snap
      const m = v.model
      if (v.look.age === 0) m.root.scale.setScalar(0.5 + 0.5 * Math.min(1, Math.max(0, (days - (v.look.born ?? days)) / PUP_DAYS)))
      if (s.s === 'lost') {
        m.root.visible = false
        v.prev = s.s
        continue
      }
      m.root.visible = true
      const holder = s.s === 'held' ? holders.get(s.id) : undefined
      const carrier = s.s === 'carried' ? carriers.get(s.id) : undefined
      const ox = v.x
      const oz = v.z
      if (holder) {
        const f = facing(holder.yaw)
        v.x = holder.x + f.x * 0.45
        v.z = holder.z + f.z * 0.45
        v.yaw = holder.yaw + Math.PI / 2
        m.root.position.set(v.x, 1.0 + holder.y, v.z)
      } else if (carrier) {
        const f = facing(carrier.yaw)
        const fox = carrier.fox !== null
        v.x = carrier.x + f.x * (fox ? 0.75 : 0)
        v.z = carrier.z + f.z * (fox ? 0.75 : 0)
        v.yaw = carrier.yaw + Math.PI / 2
        m.root.position.set(v.x, fox ? 0.25 : Math.max(0, carrier.y - 0.55), v.z)
      } else {
        // A long way at once (off to the show and back): straight there.
        const k = Math.hypot(s.x - v.x, s.z - v.z) > 10 ? 1 : Math.min(1, dt * 10)
        v.x += (s.x - v.x) * k
        v.z += (s.z - v.z) * k
        v.yaw = lerpAngle(v.yaw, s.yaw, Math.min(1, dt * 8))
        // Up on the judging table at the show.
        m.root.position.set(v.x, s.s === 'show' ? TABLE_H : 0, v.z)
      }
      v.speed = v.speed * 0.7 + (Math.hypot(v.x - ox, v.z - oz) / dt) * 0.3
      m.root.rotation.y = v.yaw
      v.strut = v.look.sex === 'boar' && v.look.age > 0 && STRUT_AT.includes(s.s) && sows.some((w) => Math.hypot(w.x - v.x, w.z - v.z) < STRUT_RANGE)
      m.pose(s.s, holder || carrier ? 0 : v.speed, this.clock, v.phase, poorly(s), v.strut)
      this.chatter(v)
    }
  }

  /** Comic bubbles for what each pig is doing: no sound on the office PCs, so they say it instead. */
  private chatter(v: PigView) {
    const s = v.snap.s
    const changed = s !== v.prev
    const was = v.prev
    v.prev = s
    if (Math.hypot(v.x - this.me.x, v.z - this.me.z) > CHATTER_RANGE) return
    const say = (text: string, style: BubbleStyle, next: number) => {
      this.bubbles.say(v.model.root, text, style, s === 'held' ? 0.55 : 0.75)
      v.nextChatter = this.clock + next * (0.8 + Math.random() * 0.5)
    }
    if (changed) {
      switch (s) {
        case 'seek':
          return say(pickOne(WHEEK), 'wheek', 1.3)
        case 'eat':
          return say(pickOne(MONCH), 'monch', 1.2)
        case 'raid':
          return say(pickOne(['shh… 🤫', 'nobody look…', '🤫']), 'plain', 3)
        case 'chase':
          return say(pickOne(['WHEEEK!', 'WHEEK WHEEK!', 'salad?!', 'WHEEEEK!']), 'wheek', 0.9)
        case 'tunnel':
          return say(pickOne(['tunnel time!', 'wheee!', 'race you!']), 'love', 2.5)
        case 'peek':
          return say(pickOne(['hide and seek!', 'can’t see me!', 'hee hee']), 'love', 3)
        case 'flee':
          return say(pickOne(['EEK!', 'EEEK!', 'eek eek!']), 'eek', 1.5)
        case 'carried':
          return say('EEEEEK!!', 'eek', 0.8)
        case 'popcorn':
          return say(pickOne(['wheee!', 'popcorn!', 'boing!']), 'love', 1.6)
        case 'beg':
          return say(this.atShutDoor(v) ? pickOne(['let me in!', 'wheek? 🚪', 'WHEEK! door!']) : pickOne(['wheek? 🥕', 'WHEEK!', 'wheek wheek?']), 'wheek', 1)
        case 'zoom':
          return say(pickOne(['wheee!', 'ZOOM!', 'zoomies!', 'nyoom!']), 'love', 1.2)
        case 'mope':
          return say(v.snap.hunger < 35 ? 'wheek…' : pickOne(['sigh…', 'meh', '…']), 'plain', 6)
        case 'scoot':
          if (was !== 'scoot' && Math.random() < 0.35) return say(pickOne(['wheek!', 'okay okay!', 'eep!', 'chut!']), 'wheek', 2)
          return
        case 'sneeze':
          return say('achoo!', 'plain', 2)
        case 'scratch':
          return say('scritch scratch', 'plain', 2)
        case 'held':
          return say(pickOne(CHUTT), 'plain', 3)
        case 'sleep':
          return say('zzz', 'zzz', 5)
      }
      if (was === 'lost') return say('home!', 'love', 2)
      return
    }
    if (this.clock < v.nextChatter) return
    if (v.strut && Math.random() < 0.5) return say(pickOne(['rrrrrr', 'rumble rumble', 'rrrumble~']), 'love', 4)
    switch (s) {
      case 'raid':
        return say(pickOne(['nom nom 🤫', 'munch munch', 'shh… nom']), 'monch', 2.5)
      case 'chase':
        return say(pickOne(['WHEEK!', 'WHEEEK!', 'wheek wheek!', 'salad!!']), 'wheek', 1)
      case 'tunnel':
        return say(pickOne(['wheee!', 'zoom!', 'whoosh!']), 'love', 2.5)
      case 'peek':
        return say(pickOne(['👀', 'peekaboo!', 'hee hee']), 'love', 4)
      case 'eat':
        return say(pickOne(MONCH), 'monch', 1.3)
      case 'seek':
        return say(pickOne(WHEEK), 'wheek', 1.4)
      case 'beg':
        return say(this.atShutDoor(v) ? 'let me in!' : pickOne(WHEEK), 'wheek', 1)
      case 'carried':
        return say(pickOne(['EEEK!', 'HELP!', 'EEEEK!']), 'eek', 0.8)
      case 'sleep':
        return say(pickOne(['zzz', 'Zzz…', 'zz']), 'zzz', 6)
      case 'held':
        return say(pickOne(CHUTT), 'plain', 3)
      case 'mope':
        if (Math.random() < 0.3) return say(v.snap.hunger < 35 ? 'wheek…' : pickOne(['sigh…', '…', 'meh']), 'plain', 8)
        v.nextChatter = this.clock + 5
        return
      case 'graze':
        if (Math.random() < 0.4) return say(pickOne(['nibble', 'nibble nibble', 'munch']), 'monch', 5)
        v.nextChatter = this.clock + 4
        return
      case 'idle':
      case 'wander':
        // Hungry pigs complain; happy ones mutter.
        if (v.snap.hunger < 40 && Math.random() < 0.5) return say(pickOne(WHEEK), 'wheek', 5)
        if (Math.random() < 0.08) return say(pickOne(['chut chut', 'purr', 'wheek?']), 'plain', 8)
        v.nextChatter = this.clock + 3 + Math.random() * 4
    }
  }

  private atShutDoor(v: PigView) {
    return !!this.snap?.door && Math.hypot(v.x - DOOR_OUT.x, v.z - DOOR_OUT.z) < 3
  }

  /** Who a pig is to the others, for the check card and the hover label. */
  private family(look: PigLook): string {
    const bits: string[] = []
    const name = (id: number | undefined) => (id === undefined ? undefined : this.looks[id]?.name)
    if (look.adopter) bits.push(`⭐ ${look.adopter}’s piggy`)
    if (isSneaky(look.id)) bits.push('🤫 a sneaky one: keep an eye on the veg patch')
    if (name(look.friend)) bits.push(`💕 best friends with ${name(look.friend)}`)
    if (look.age === 0 && name(look.mum)) bits.push(`🐣 mum is ${name(look.mum)}`)
    if (look.due !== undefined && this.snap) {
      const left = Math.max(0, look.due - (this.snap.day - 1 + this.snap.time))
      const care = this.pigs[look.id]?.snap.care ?? 100
      bits.push(
        `🤰 expecting, due in ${left < 1 ? 'under a day' : `${left.toFixed(1)} days`} · looked after: <b class="${care < 50 ? 'bad' : 'ok'}">${care}%</b> (keep her fed and happy)`,
      )
    }
    const pups = this.looks.filter((l) => l.mum === look.id && l.age === 0).map((l) => l.name)
    if (pups.length) bits.push(`🍼 mum of ${pups.join(', ')}`)
    if (look.rosettes) bits.push(`🏆 ×${look.rosettes}`)
    return bits.join(' · ')
  }

  private updateFlying(dt: number) {
    this.flying = this.flying.filter((f) => {
      f.age += dt
      const t = Math.min(1, f.age / f.dur)
      const arc = 1.2 + f.from.distanceTo(f.to) * 0.15
      f.obj.position.lerpVectors(f.from, f.to, t)
      f.obj.position.y += Math.sin(t * Math.PI) * arc
      f.obj.rotation.x += dt * 9
      f.obj.rotation.z += dt * 5
      if (t < 1) return true
      f.obj.removeFromParent()
      return false
    })
  }

  private updateAim(holding: number | null) {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3())
    if (hit) this.aim.copy(hit)
    const dx = this.aim.x - this.me.x
    const dz = this.aim.z - this.me.z
    const d = Math.hypot(dx, dz)
    if (d > THROW_RANGE) {
      this.aim.x = this.me.x + (dx / d) * THROW_RANGE
      this.aim.z = this.me.z + (dz / d) * THROW_RANGE
    }
    const canThrow = holding === null && this.basket().some((n) => n > 0) && this.input.mouse.over
    this.cursor.visible = canThrow
    this.rangeRing.visible = canThrow
    this.cursor.position.set(this.aim.x, 0.05, this.aim.z)
    ;(this.cursor.material as THREE.MeshBasicMaterial).color.set(d > THROW_RANGE ? 0xffc04a : 0xffffff)
    this.rangeRing.position.set(this.me.x, 0.04, this.me.z)
  }

  /** What E would do right now, shown as a prompt. */
  private updateAction(holding: number | null) {
    const snap = this.snap!
    const me = this.me
    const basket = this.basket()
    const count = basket.reduce((a, b) => a + b, 0)
    const reach = REACH - 0.2
    let best: Action | null = null
    // The nearest thing you can actually do wins; something that's just information only shows if there's nothing to do.
    const offer = (a: Action) => {
      const doable = a.msg !== null
      if (!best) best = a
      else if (doable !== (best.msg !== null)) {
        if (doable) best = a
      } else if (a.d < best.d) best = a
    }

    const sack = this.hasSack()
    const hay = this.hayArmfuls()
    const max = this.basketMax()
    const used = count + hay * HAY_SLOTS
    const hayRoom = max - used >= HAY_SLOTS
    // The show car in the yard, while it waits.
    const mine = this.mySnap()
    const car = snap.show?.phase === 'boarding' && !mine?.aboard && !sack ? dist(me, CAR_FARM) : Infinity
    if (mine?.platter) {
      // Carrying the salad platter: to the glowing ring in the middle of the barn (or back on the station).
      if (dist(me, SALAD_SPOT) <= PLATTER_PLACE - 0.1) best = { label: '<b>Put the salad platter down 🥗 Supper time!</b>', msg: { t: 'serve' }, d: 0 }
      else if (dist(me, SALAD_TABLE) < REACH - 0.2) best = { label: 'Put the platter back on the station', msg: { t: 'serve' }, d: 0 }
      else best = { label: '🥗 Carry the platter to the glowing ring in the middle of the barn (the piggies are following you!)', msg: null, d: 0 }
    } else if (mine?.aboard || mine?.atShow) {
      best = this.showAction(holding)
    } else if (holding !== null) {
      best = { label: `Place <b>${this.looks[holding].name}</b> down`, msg: { t: 'putdown' }, d: 0 }
      if (car < CAR_REACH) best = { label: `<b>Take ${this.looks[holding].name} to the pig show 🚗</b>`, msg: { t: 'board' }, d: -1 }
    } else {
      if (car < CAR_REACH) offer({ label: 'Come and watch the pig show 🚗 (or carry a piggy here to enter it)', msg: { t: 'board' }, d: -1 })
      const door = dist(me, DOOR_MID)
      if (door < REACH + 0.3) offer({ label: snap.door ? 'Open the barn door 🚪' : 'Shut the barn door 🚪', msg: { t: 'door' }, d: door - 0.5 })
      const table = dist(me, SALAD_TABLE)
      if (table < REACH) {
        const sal = snap.salad
        const total = sal.veg.reduce((a, b) => a + b, 0)
        const kinds = sal.veg.filter((n) => n > 0).length
        const ready = total >= SALAD_MIN && kinds >= SALAD_KINDS
        const d = table - 0.8
        if (sal.served) offer({ label: '🥗 Tonight’s salad is served! Make another tomorrow', msg: null, d })
        else if (count > 0 && total < SALAD_MAX) offer({ label: `Put your veg in the salad 🥗 (${total}/${SALAD_MAX})`, msg: { t: 'salad' }, d })
        else if (ready && snap.time >= SALAD_FROM) {
          const carrier = snap.farmers.find((f) => f.platter)
          offer(carrier ? { label: `🥗 ${carrier.name} has the platter: follow them in!`, msg: null, d } : { label: '<b>Pick up the salad platter 🥗 Supper time!</b>', msg: { t: 'serve' }, d })
        }
        else if (ready) offer({ label: `🥗 Salad’s ready (${total} veg, ${kinds} kinds): serve it at dusk`, msg: null, d })
        else offer({ label: `🥗 Salad: ${total}/${SALAD_MIN} veg, ${kinds}/${SALAD_KINDS} kinds. Bring veg from the garden!`, msg: null, d })
      }
      const bin = dist(me, FEED_BIN)
      if (bin < reach) {
        if (sack) offer({ label: 'Put the sack back', msg: { t: 'sack' }, d: bin - 1 })
        else if (snap.sacks > 0) offer({ label: `Pick up a sack of pellets (${snap.sacks} left today)`, msg: { t: 'sack' }, d: bin - 1 })
        else
          offer({
            label: 'Feed bin’s empty: pellets are rationed, <b>one sack per hopper a day</b> (more at dawn). Hay’s the main food: take some off the 🌾 hay table next door',
            msg: null,
            d: bin - 1,
          })
      }
      // The hay table: today's bale, for the racks.
      const bale = dist(me, HAY_BALE)
      if (bale < reach) {
        const d = bale - 1
        if (sack) offer({ label: 'Hands full (pellet sack)', msg: null, d })
        else if (snap.bale <= 0)
          offer({ label: `Today’s bale is all used up: a new one comes at dawn${snap.land.includes('meadow') ? '. Cut more in the 🌾 hay meadow' : ''}`, msg: null, d })
        else if (!hayRoom) offer({ label: 'Basket full: no room for hay', msg: null, d })
        else
          offer({ label: `Take hay for the racks 🌾 (${Math.min(snap.bale, Math.floor((max - used) / HAY_SLOTS))} of ${snap.bale} armfuls left today)`, msg: { t: 'bale' }, d })
      }
      // The stack yard: build up haystacks from the field, take armfuls off them for the racks.
      const stack = snap.land.includes('meadow') ? hayStackAt(me) : -1
      if (stack >= 0) {
        const n = snap.stacks[stack]
        if (sack) offer({ label: 'Hands full (pellet sack)', msg: null, d: 0.4 })
        else if (hay && n < hayStackMax(snap.upgrades))
          offer({ label: `Stack your hay 🌾 (${Math.min(hayStackMax(snap.upgrades), n + hay)}/${hayStackMax(snap.upgrades)})`, msg: { t: 'stack', stack }, d: 0.4 })
        else if (hay) offer({ label: 'This haystack’s full: try another, or take your hay to the racks in the barn', msg: null, d: 0.4 })
        else if (n > 0 && hayRoom)
          offer({ label: `Take hay for the racks (${Math.min(n, Math.floor((max - used) / HAY_SLOTS))} of ${n} armfuls)`, msg: { t: 'stack', stack }, d: 0.4 })
        else if (n > 0) offer({ label: 'Basket full: no room for hay', msg: null, d: 0.4 })
        else offer({ label: 'Haystack spot: cut hay in the field and stack it here', msg: null, d: 0.4 })
      }
      // Hay: cut an armful from a patch of the hay meadow, put it in the racks in the barn.
      const patch = snap.land.includes('meadow') ? hayPatchAt(me) : -1
      if (patch >= 0) {
        const grown = snap.hayField[patch]
        if (sack) offer({ label: 'Hands full (pellet sack)', msg: null, d: 0.5 })
        else if (grown >= 1 && !hayRoom) offer({ label: `Basket full (${hay} armfuls of hay): stack it or take it to the racks`, msg: null, d: 0.5 })
        else if (grown >= 1) {
          const cut = Math.min(hayYield(snap.upgrades), Math.floor((max - used) / HAY_SLOTS))
          offer({ label: `Cut ${cut} armful${cut === 1 ? '' : 's'} of hay 🌾${hay ? ` (${hay} in your basket)` : ''}`, msg: { t: 'hay', patch }, d: 0.5 })
        }
        else offer({ label: `This hay’s still growing (${Math.round(grown * 100)}%): try another patch`, msg: null, d: 0.5 })
      }
      HAY_RACKS.forEach((r, i) => {
        // Not one that isn't up yet, or on the other side of the barn wall.
        const d = dist(me, r)
        if (d > reach || !rackBuilt(i, snap.upgrades) || isInside(me) !== isInside(rackFront(r))) return
        const level = `${Math.round((snap.racks[i] / hayRackMax(snap.upgrades)) * 100)}% full`
        if (hay) offer(snap.racks[i] >= hayRackMax(snap.upgrades) ? { label: 'This hay rack is full', msg: null, d: d - 1 } : { label: `Put your hay in the rack (${level})`, msg: { t: 'rack', rack: i }, d: d - 1.5 })
        else offer({ label: `Hay rack ${level}: grab hay from the 🌾 hay table by the door${snap.land.includes('meadow') ? ' or the hay meadow' : ''}`, msg: null, d: d - 1 })
      })
      HOPPERS.forEach((h, i) => {
        const d = dist(me, h)
        if (d > reach || (i > 0 && !snap.upgrades.includes('hopper2'))) return
        const hmax = hopperMax(snap.upgrades)
        const level = `${Math.round((snap.hoppers[i] / hmax) * 100)}% full`
        if (!sack) offer({ label: `Pellet hopper ${level}: fetch a sack from the feed bin`, msg: null, d: d - 1 })
        else if (snap.hoppers[i] >= hmax) offer({ label: 'The hopper is full', msg: null, d: d - 1 })
        else offer({ label: `Pour the pellets in (hopper ${level})`, msg: { t: 'pour', hopper: i }, d: d - 1.5 })
      })
      BOWLS.forEach((b, i) => {
        const d = dist(me, b)
        if (d > reach) return
        if (count === 0) offer({ label: 'Bowl: bring veg to fill it', msg: null, d: d - 1 })
        else if (snap.bowls[i].bites >= BOWL_MAX) offer({ label: 'Bowl is full', msg: null, d: d - 1 })
        else offer({ label: `Fill the bowl with ${VEG_ICON[VEGGIES[basket[this.selected] > 0 ? this.selected : basket.findIndex((n) => n > 0)]]}`, msg: { t: 'fill', bowl: i, veg: VEGGIES[this.selected] ?? VEGGIES[0] }, d: d - 1 })
      })
      BEDS.forEach((b, i) => {
        const rect = { x0: b.x - BED_W / 2, x1: b.x + BED_W / 2, z0: b.z - BED_D / 2, z1: b.z + BED_D / 2 }
        if (!inRect(me, rect, REACH * 0.55)) return
        const d = dist(me, b) - 2
        if (!snap.land.includes(b.square)) return offer({ label: `🔒 ${LAND[b.square].icon} ${LAND[b.square].name}: buy it in the shop (B)`, msg: null, d })
        const stage = snap.beds[i].stage
        const name = `${VEG_ICON[b.kind]} ${VEG_LABEL[b.kind].toLowerCase()}s`
        if (stage === 'ripe')
          offer(used >= max ? { label: 'Basket full!', msg: null, d } : { label: `Harvest ${name}${snap.beds[i].left !== undefined ? ' (a sneaky piggy’s been at them! 🐹)' : ''}`, msg: { t: 'harvest', bed: i }, d })
        else if (stage === 'empty') offer({ label: `Plant ${name}`, msg: { t: 'plant', bed: i }, d })
        else offer({ label: `${name} growing… ${Math.round(snap.beds[i].grow * 100)}%`, msg: null, d })
      })
      for (const f of snap.foods) {
        const d = dist(me, f)
        if (f.kind !== 'hay' && d < reach && used < max) offer({ label: `Pick up the ${VEG_LABEL[f.kind].toLowerCase()}`, msg: { t: 'gather', food: f.id }, d: d + 0.3 })
      }
      for (const v of this.pigs) {
        const s = v.snap.s
        if (sack || s === 'held' || s === 'carried' || s === 'lost') continue
        const d = Math.hypot(v.x - me.x, v.z - me.z)
        // The one you're pointing at first (handy for a pup tucked up against mum), then the nearest.
        if (d < reach) offer({ label: `Pick up <b>${v.look.name}</b> for a health check`, msg: { t: 'pickup', pig: v.look.id }, d: v.look.id === this.pointedPig ? -1 : d })
      }
    }
    this.action = best
    const lines: string[] = []
    const a = best as Action | null
    if (a) lines.push(a.msg ? `<kbd>E</kbd> ${a.label}` : a.label)
    for (const p of this.preds.values()) {
      if (p.snap.s !== 'flee' && dist(me, p) < shooRadius(snap.upgrades) + (p.snap.kind === 'hawk' ? HAWK_SHOO_EXTRA : 0)) {
        lines.unshift(`<kbd>F</kbd> <b class="shoo">SHOO the ${p.snap.kind}!</b>`)
        break
      }
    }
    this.hud.setPrompt(lines.join('<br>') || null)
    this.touch?.set(!!a?.msg, lines.length > (a ? 1 : 0))
  }

  /** What there is to do in the show car or at the show: the judging table, then back to your spot. */
  private showAction(holding: number | null): Action | null {
    const mine = this.mySnap()
    const show = this.snap!.show
    if (mine?.aboard) return { label: `Get out of the show car 🚗 (it leaves in ${Math.ceil((show?.left ?? 0) / 1000)}s)`, msg: { t: 'board' }, d: 0 }
    if (!show) return null
    if (show.phase === 'results') return { label: '🏆 The results are in! The car home leaves in a moment', msg: null, d: 0 }
    const e = show.entrants.find((x) => x.farmer === this.myId)
    if (!e || e.pig === null) return { label: '👀 Enjoy the show! (Next time, carry a piggy to the car to enter it)', msg: null, d: 0 }
    const name = this.looks[e.pig]?.name ?? 'your piggy'
    const t = show.table
    const nearTable = dist(this.me, TABLE_SPOT) < TABLE_REACH
    if (t?.pig === e.pig) {
      if (!t.scores) return { label: `🔍 The judge is looking <b>${name}</b> over…`, msg: null, d: 0 }
      return nearTable ? { label: `Pick <b>${name}</b> up off the table`, msg: { t: 'fetch' }, d: 0 } : { label: `Go and get <b>${name}</b> from the judging table`, msg: null, d: 0 }
    }
    if (e.total === null) {
      if (holding !== e.pig) return { label: `Where’s ${name}?`, msg: null, d: 0 }
      if (!nearTable) return { label: `Take <b>${name}</b> to the judging table 🏆 (at the top of the hall)`, msg: null, d: 0 }
      if (t) return { label: `Wait your turn: the judge is looking at ${this.looks[t.pig]?.name ?? 'another piggy'}`, msg: null, d: 0 }
      return { label: `<b>Put ${name} on the judging table 🏆</b>`, msg: { t: 'judge' }, d: 0 }
    }
    if (!e.back) return { label: `${name} scored <b>${e.total}</b>! Now take ${name} back to your spot (number ${e.spot + 1})`, msg: null, d: 0 }
    const waiting = show.entrants.filter((x) => x.pig !== null && !x.back).map((x) => x.name)
    return { label: waiting.length ? `Back at your spot. Waiting for ${waiting.join(', ')}… then the results!` : 'Here come the results!', msg: null, d: 0 }
  }

  /** The show barn and car, the judge's bubbles, and the judging card for whoever's on the table. */
  private updateShow(dt: number) {
    const show = this.snap!.show
    const here = !!this.mySnap()?.atShow
    // Light up where to go next: the table when it's free and my piggy's still to be judged, my spot once it has been.
    const e = here ? show?.entrants.find((x) => x.farmer === this.myId) : undefined
    const go =
      !e || e.pig === null || show?.phase !== 'on'
        ? null
        : e.total === null
          ? show.table
            ? null
            : 'table'
          : !e.back && show.table?.pig !== e.pig
            ? { spot: e.spot }
            : null
    this.hall.update(dt, this.clock, show, here, go)
    const t = here ? show?.table : null
    const key = t ? `${t.pig}|${t.scores ? 'done' : 'looking'}` : ''
    if (key !== this.judging) {
      this.judging = key
      if (t && !t.scores) this.bubbles.say(this.hall.judge.root, pickOne(['Hmm…', 'Let’s see…', 'Ooh, now then…']), 'plain', 1.9)
      if (t?.scores) this.bubbles.say(this.hall.judge.root, pickOne(['Splendid!', 'Very nice!', 'Well now!', 'Lovely piggy!']), 'love', 1.9)
    }
    const owner = t ? this.snap!.farmers.find((f) => f.id === t.farmer)?.name : undefined
    this.hud.showJudging(t ? { pig: this.looks[t.pig]?.name ?? 'A piggy', owner: owner ?? '', scores: t.scores } : null)
  }

  private updateArrowsAndTooltip() {
    const w = innerWidth
    const h = innerHeight
    const v3 = new THREE.Vector3()
    const arrows: { x: number; y: number; angle: number; icon: string }[] = []
    for (const p of this.preds.values()) {
      if (p.snap.s === 'flee') continue
      v3.set(p.x, p.y + 0.5, p.z).project(this.camera)
      const behind = v3.z > 1
      let sx = ((v3.x + 1) / 2) * w
      let sy = ((1 - v3.y) / 2) * h
      if (!behind && sx > 0 && sx < w && sy > 0 && sy < h) continue
      if (behind) {
        sx = w - sx
        sy = h - sy
      }
      const cx = w / 2
      const cy = h / 2
      const angle = Math.atan2(sy - cy, sx - cx)
      const m = 84 // room for the pointer and the pulse
      const k = Math.min((w / 2 - m) / Math.abs(Math.cos(angle) || 1e-6), (h / 2 - m) / Math.abs(Math.sin(angle) || 1e-6))
      arrows.push({ x: cx + Math.cos(angle) * k, y: cy + Math.sin(angle) * k, angle, icon: p.snap.kind === 'fox' ? '🦊' : '🦅' })
    }
    this.hud.setArrows(arrows)

    // Hover a pig to see who it is and how it's doing.
    let tip: string | null = null
    let tx = 0
    let ty = 0
    this.pointedPig = null
    if (this.input.mouse.over) {
      const mx = ((this.input.mouse.x + 1) / 2) * w
      const my = ((1 - this.input.mouse.y) / 2) * h
      let bestD = 36
      for (const v of this.pigs) {
        if (v.snap.s === 'lost' || !v.model.root.visible) continue
        v3.set(v.x, v.model.root.position.y + 0.3 * v.model.root.scale.y, v.z).project(this.camera)
        const sx = ((v3.x + 1) / 2) * w
        const sy = ((1 - v3.y) / 2) * h
        const d = Math.hypot(sx - mx, sy - my)
        if (d < bestD) {
          bestD = d
          const extra = [
            v.look.adopter ? `⭐ ${v.look.adopter}’s` : '',
            v.look.rosettes ? `🏆×${v.look.rosettes}` : '',
            v.look.age === 0 ? '🐣 baby' : '',
            v.look.due !== undefined ? '🤰 expecting' : '',
          ]
            .filter(Boolean)
            .join(' ')
          tip = `<b>${v.look.name}</b> · ${mood(v.snap)}${extra ? `<br><small>${extra}</small>` : ''}`
          this.pointedPig = v.look.id
          tx = sx
          ty = sy
        }
      }
    }
    this.hud.setTooltip(tx, ty, tip)
  }
}

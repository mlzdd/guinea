import * as THREE from 'three'
import { BEDS, BED_D, BED_W, BOWLS, DOOR_MID, DOOR_OUT, FEED_BIN, HAY_RACKS, HOPPERS, SALAD_TABLE, dist, groundAt, hayPatchAt, inRect, isInside, setLand } from '../core/map.ts'
import type { PigLook } from '../core/pigs.ts'
import type { ClientMsg, FarmerSnap, PigSnap, PigState, PredSnap, ServerMsg } from '../core/protocol.ts'
import {
  BOWL_MAX,
  EMOTES,
  FARMER_COLORS,
  HAY_RACK_MAX,
  LAND,
  PUP_DAYS,
  REACH,
  SALAD_FROM,
  SALAD_KINDS,
  SALAD_MAX,
  SALAD_MIN,
  RUN_SPEED,
  SHOO_RADIUS,
  THROW_RANGE,
  VEG_BITES,
  VEGGIES,
  WALK_SPEED,
  type Veg,
  basketMax,
  daysToShow,
  hopperMax,
} from '../core/rules.ts'
import { moveFarmer } from '../core/move.ts'
import { facing, yawTowards } from '../core/vec.ts'
import { Bubbles, type BubbleStyle } from './bubbles.ts'
import { FarmerModel, FoxModel, HawkModel } from './critters.ts'
import { Hud, mood } from './hud.ts'
import { Input } from './input.ts'
import type { Net } from './net.ts'
import { PigModel } from './pig.ts'
import { VEG_ICON, VEG_LABEL, makeVeg } from './veg.ts'
import { World } from './world.ts'

type Snap = Extract<ServerMsg, { t: 'snap' }>

const SEND_MS = 50
const CAM_PITCH = 0.95
const THROW_COOLDOWN = 0.2
/** Pigs further than this from you keep quiet, so the screen isn't all bubbles. */
const CHATTER_RANGE = 30
/** Emote keys, in EMOTES order, and how each bubble looks. */
const EMOTE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV']
const EMOTE_STYLE: BubbleStyle[] = ['plain', 'love', 'eek', 'wheek']

const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const WHEEK = ['WHEEK!', 'wheek wheek!', 'WHEEEEK!', 'wheeek!', 'WHEEK WHEEK!']
const MONCH = ['monch monch', 'monch', 'nom nom', 'crunch', 'munch munch', 'monchmonch', 'nomnomnom']
const CHUTT = ['chutt chutt', 'purrr', 'chut?', 'mrrr']
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

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 300)
  private readonly world = new World()
  private readonly bubbles: Bubbles
  private readonly hud = new Hud()
  private readonly input: Input
  private net!: Net
  private myId = -1
  private looks: PigLook[] = []

  private readonly me = { x: 0, y: 0, z: -5, vx: 0, vy: 0, vz: 0, yaw: 0, speed: 0, model: null as FarmerModel | null }
  private jumpQueued = false
  private camYaw = 0
  private camDist = 22
  private readonly camTarget = new THREE.Vector3()

  private pigs: PigView[] = []
  private readonly farmers = new Map<number, FarmerView>()
  private readonly foods = new Map<number, THREE.Object3D>()
  private readonly preds = new Map<number, PredView>()
  private flying: Flying[] = []
  private snap: Snap | null = null
  private selected = 0
  private lastSend = 0
  private lastThrow = 0
  private clock = 0
  private action: Action | null = null
  private myName = ''
  private lastDiary = 0

  private readonly aim = new THREE.Vector3()
  private readonly cursor: THREE.Mesh
  private readonly rangeRing: THREE.Mesh
  private readonly raycaster = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.bubbles = new Bubbles(this.world.scene)
    this.input = new Input(canvas)
    this.input.onClick = () => this.throwVeg()
    this.input.onKey = (code) => this.key(code)

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

  start(net: Net, id: number, looks: PigLook[]) {
    this.net = net
    this.myId = id
    this.looks = []
    for (const look of looks) this.setLook(look)
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

  private hasHay(): boolean {
    return this.mySnap()?.hay ?? false
  }

  private carrying(f: { sack: boolean; hay: boolean } | undefined) {
    return f?.sack ? 'sack' : f?.hay ? 'hay' : null
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
        const obj = makeVeg(msg.kind)
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
      case 'report':
        this.hud.showReport(msg, () => this.hud.toggleShop(true))
        this.hud.alert('day', `🪙 Day ${msg.day} earned the farm ${msg.total} coins`)
        return
      case 'alert':
        this.hud.alert(msg.kind, msg.text)
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
        obj = makeVeg(f.kind)
        obj.position.set(f.x, 0, f.z)
        obj.rotation.y = f.id * 1.7
        this.world.scene.add(obj)
        this.foods.set(f.id, obj)
      }
      obj.scale.setScalar(0.55 + (0.45 * f.bites) / VEG_BITES[f.kind])
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
    this.world.setHoppers(snap.hoppers, hopperMax(snap.upgrades))
    this.world.setRacks(snap.racks)
    this.world.setHayField(snap.hayField)
    this.world.setSacks(snap.sacks)
    // The map's fences and solids follow the farm's land, for walking about here too.
    setLand(snap.land)
    this.world.setLand(snap.land)
    this.world.setUpgrades(snap.upgrades)
    this.world.setDoor(snap.door)
    this.world.setRain(snap.rain)
    this.hud.setCoins(snap.coins)
    this.hud.setFarmers(snap.farmers, this.myId, this.looks)
    this.hud.setToday(snap.craving, daysToShow(snap.day), snap.rain, snap.zoom)
    this.hud.setJobs(snap.jobs)
    this.hud.setClock(snap.day, snap.time)
    this.hud.setStats(snap.pigs, snap.pigs.filter((p) => p.s !== 'lost' && isInside(p)).length, snap.pigs.length)
    this.hud.setBasket(this.basket(), this.selected, this.basketMax())
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
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(5)) - 1
      if (i >= 0 && i < VEGGIES.length) {
        this.selected = i
        this.hud.setBasket(this.basket(), this.selected, this.basketMax())
      }
    } else if (code === 'KeyE') {
      if (this.action?.msg) this.send(this.action.msg)
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

  private throwVeg() {
    if (!this.snap || this.clock - this.lastThrow < THROW_COOLDOWN) return
    if (this.holding() !== null) {
      this.hud.toast('Put the piggy down first (E)')
      return
    }
    if (this.hasSack()) {
      this.hud.toast('Pour that sack into a hopper first (E)')
      return
    }
    if (this.hasHay()) {
      this.hud.toast('Put that hay in a rack in the barn first (E)')
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
    this.me.yaw = yawTowards(this.me, { x: this.aim.x, z: this.aim.z })
    this.send({ t: 'throw', veg: VEGGIES[this.selected], x: this.aim.x, z: this.aim.z })
  }

  // ---------------------------------------------------------------- the frame

  private frame(dt: number) {
    this.clock += dt
    if (!this.snap || !this.me.model) {
      this.renderer.render(this.world.scene, this.camera)
      return
    }
    const holding = this.holding()

    // Camera turn and zoom
    this.camYaw += this.input.takeTurn()
    this.camDist = Math.max(10, Math.min(38, this.camDist + this.input.takeZoom() * 2))

    // Walk relative to the camera.
    const mv = this.input.move()
    const fwd = facing(this.camYaw)
    const right = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) }
    const dx = right.x * mv.x + fwd.x * mv.y
    const dz = right.z * mv.x + fwd.z * mv.y
    const len = Math.hypot(dx, dz)
    const run = this.input.down('ShiftLeft', 'ShiftRight') && holding === null
    const speed = len > 0 ? (run ? RUN_SPEED : WALK_SPEED) / len : 0

    // Momentum, jumping and falling: anything lower than your feet doesn't get in the way, and you land on whatever's under you.
    const { airborne } = moveFarmer(this.me, { x: dx * speed, z: dz * speed }, this.jumpQueued, dt)
    this.jumpQueued = false
    this.me.speed = Math.hypot(this.me.vx, this.me.vz)
    // Face where you're going (where you're steering, in the air).
    const face = airborne && len > 0 ? { x: dx, z: dz } : { x: this.me.vx, z: this.me.vz }
    if (Math.hypot(face.x, face.z) > 0.3) this.me.yaw = lerpAngle(this.me.yaw, yawTowards({ x: 0, z: 0 }, face), Math.min(1, dt * 12))
    const mine = this.me.model
    mine.root.position.set(this.me.x, 0, this.me.z)
    mine.root.rotation.y = this.me.yaw
    const basket = this.basket()
    const top = basket.findLastIndex((n) => n > 0)
    const carry = this.carrying(this.mySnap())
    mine.pose(dt, airborne ? 0 : this.me.speed, holding !== null || carry !== null, basket.reduce((a, b) => a + b, 0) / this.basketMax(), top < 0 ? 0 : VEG_COLOR[VEGGIES[top]], carry, airborne)
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
    this.world.setTime(this.snap.time, this.camTarget)
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
      const top = s.basket.findLastIndex((n) => n > 0)
      const airborne = v.y > groundAt(v) + 0.05
      const carry = this.carrying(s)
      v.model.pose(dt, airborne ? 0 : v.speed, s.holding !== null || carry !== null, s.basket.reduce((a, b) => a + b, 0) / this.basketMax(), top < 0 ? 0 : VEG_COLOR[VEGGIES[top]], carry, airborne)
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
        const k = Math.min(1, dt * 10)
        v.x += (s.x - v.x) * k
        v.z += (s.z - v.z) * k
        v.yaw = lerpAngle(v.yaw, s.yaw, Math.min(1, dt * 8))
        m.root.position.set(v.x, 0, v.z)
      }
      v.speed = v.speed * 0.7 + (Math.hypot(v.x - ox, v.z - oz) / dt) * 0.3
      m.root.rotation.y = v.yaw
      m.pose(s.s, holder || carrier ? 0 : v.speed, this.clock, v.phase)
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
    switch (s) {
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
    const offer = (a: Action) => {
      if (!best || a.d < best.d) best = a
    }

    const sack = this.hasSack()
    const hay = this.hasHay()
    const max = this.basketMax()
    if (holding !== null) {
      best = { label: `Put <b>${this.looks[holding].name}</b> down`, msg: { t: 'putdown' }, d: 0 }
    } else {
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
        else if (ready && snap.time >= SALAD_FROM) offer({ label: '<b>Serve the salad platter 🥗 Supper time!</b>', msg: { t: 'serve' }, d })
        else if (ready) offer({ label: `🥗 Salad’s ready (${total} veg, ${kinds} kinds): serve it at dusk`, msg: null, d })
        else offer({ label: `🥗 Salad: ${total}/${SALAD_MIN} veg, ${kinds}/${SALAD_KINDS} kinds. Bring veg from the garden!`, msg: null, d })
      }
      const bin = dist(me, FEED_BIN)
      if (bin < reach) {
        if (sack) offer({ label: 'Put the sack back', msg: { t: 'sack' }, d: bin - 1 })
        else if (hay) offer({ label: 'Feed bin: put the hay in a rack at the back of the barn first', msg: null, d: bin - 1 })
        else if (snap.sacks > 0) offer({ label: `Pick up a sack of pellets (${snap.sacks} left today)`, msg: { t: 'sack' }, d: bin - 1 })
        else
          offer({
            label: 'Feed bin’s empty: pellets are rationed, <b>one sack per hopper a day</b> (more at dawn). Hay’s the main food: fetch it from the 🌾 hay meadow',
            msg: null,
            d: bin - 1,
          })
      }
      // Hay: cut an armful from a patch of the hay meadow, put it in the racks in the barn.
      const patch = snap.land.includes('meadow') ? hayPatchAt(me) : -1
      if (patch >= 0) {
        const grown = snap.hayField[patch]
        if (hay) offer({ label: 'Put the hay back (or take it to the racks in the barn)', msg: { t: 'hay', patch }, d: 0.5 })
        else if (sack) offer({ label: 'Hands full (pellet sack)', msg: null, d: 0.5 })
        else if (grown >= 1) offer({ label: 'Cut an armful of hay 🌾', msg: { t: 'hay', patch }, d: 0.5 })
        else offer({ label: `This hay’s still growing (${Math.round(grown * 100)}%): try another patch`, msg: null, d: 0.5 })
      }
      HAY_RACKS.forEach((r, i) => {
        const d = dist(me, r)
        if (d > reach) return
        const level = `${Math.round((snap.racks[i] / HAY_RACK_MAX) * 100)}% full`
        if (hay) offer(snap.racks[i] >= HAY_RACK_MAX ? { label: 'This hay rack is full', msg: null, d: d - 1 } : { label: `Put the hay in the rack (${level})`, msg: { t: 'rack', rack: i }, d: d - 1.5 })
        else if (!snap.land.includes('meadow')) offer({ label: `Hay rack ${level}: hay comes from the 🌾 hay meadow (buy it in the shop, B)`, msg: null, d: d - 1 })
        else offer({ label: `Hay rack ${level}: grab an armful from the 🌾 hay meadow`, msg: null, d: d - 1 })
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
        else offer({ label: `Fill the bowl with ${VEG_ICON[VEGGIES[basket[this.selected] > 0 ? this.selected : basket.findIndex((n) => n > 0)]]}`, msg: { t: 'fill', bowl: i, veg: VEGGIES[this.selected] }, d: d - 1 })
      })
      BEDS.forEach((b, i) => {
        const rect = { x0: b.x - BED_W / 2, x1: b.x + BED_W / 2, z0: b.z - BED_D / 2, z1: b.z + BED_D / 2 }
        if (!inRect(me, rect, REACH * 0.55)) return
        const d = dist(me, b) - 2
        if (!snap.land.includes(b.square)) return offer({ label: `🔒 ${LAND[b.square].icon} ${LAND[b.square].name}: buy it in the shop (B)`, msg: null, d })
        const stage = snap.beds[i].stage
        const name = `${VEG_ICON[b.kind]} ${VEG_LABEL[b.kind].toLowerCase()}s`
        if (stage === 'ripe')
          offer(count >= max ? { label: 'Basket full!', msg: null, d } : { label: `Harvest ${name}`, msg: { t: 'harvest', bed: i }, d })
        else if (stage === 'empty') offer({ label: `Plant ${name}`, msg: { t: 'plant', bed: i }, d })
        else offer({ label: `${name} growing… ${Math.round(snap.beds[i].grow * 100)}%`, msg: null, d })
      })
      for (const f of snap.foods) {
        const d = dist(me, f)
        if (d < reach && count < max) offer({ label: `Pick up the ${VEG_LABEL[f.kind].toLowerCase()}`, msg: { t: 'gather', food: f.id }, d: d + 0.3 })
      }
      for (const v of this.pigs) {
        const s = v.snap.s
        if (sack || hay || s === 'held' || s === 'carried' || s === 'lost') continue
        const d = Math.hypot(v.x - me.x, v.z - me.z)
        if (d < reach) offer({ label: `Pick up <b>${v.look.name}</b> for a health check`, msg: { t: 'pickup', pig: v.look.id }, d })
      }
    }
    this.action = best
    const lines: string[] = []
    const a = best as Action | null
    if (a) lines.push(a.msg ? `<kbd>E</kbd> ${a.label}` : a.label)
    for (const p of this.preds.values()) {
      if (p.snap.s !== 'flee' && dist(me, p) < SHOO_RADIUS + (p.snap.kind === 'hawk' ? 3 : 0)) {
        lines.unshift(`<kbd>F</kbd> <b class="shoo">SHOO the ${p.snap.kind}!</b>`)
        break
      }
    }
    this.hud.setPrompt(lines.join('<br>') || null)
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
      const m = 48
      const k = Math.min((w / 2 - m) / Math.abs(Math.cos(angle) || 1e-6), (h / 2 - m) / Math.abs(Math.sin(angle) || 1e-6))
      arrows.push({ x: cx + Math.cos(angle) * k, y: cy + Math.sin(angle) * k, angle, icon: p.snap.kind === 'fox' ? '🦊' : '🦅' })
    }
    this.hud.setArrows(arrows)

    // Hover a pig to see who it is and how it's doing.
    let tip: string | null = null
    let tx = 0
    let ty = 0
    if (this.input.mouse.over) {
      const mx = ((this.input.mouse.x + 1) / 2) * w
      const my = ((1 - this.input.mouse.y) / 2) * h
      let bestD = 36
      for (const v of this.pigs) {
        if (v.snap.s === 'lost' || !v.model.root.visible) continue
        v3.set(v.x, v.model.root.position.y + 0.3, v.z).project(this.camera)
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
          tx = sx
          ty = sy
        }
      }
    }
    this.hud.setTooltip(tx, ty, tip)
  }
}

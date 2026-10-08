import * as THREE from 'three'
import { makePigLooks, type PigLook } from '../core/pigs.ts'
import type { ShowSnap } from '../core/protocol.ts'
import { CAR_FARM, CAR_HALL, HALL, HALL_WALLS, JUDGE, RIVALS, SPOTS, TABLE, TABLE_H } from '../core/show.ts'
import { facing, yawTowards } from '../core/vec.ts'
import { FarmerModel, textSprite } from './critters.ts'
import { PigModel } from './pig.ts'
import { mat } from './veg.ts'
import { barnTex, grassTex, plankTex, strawTex } from './world.ts'

/** A seeded random, so the rivals' and onlookers' piggies look the same every show. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A breeder's piggy: the same looks every time (from the seed), with its own name. */
export function rivalLook(i: number): PigLook {
  const look = makePigLooks(1, seeded(RIVALS[i].seed))[0]
  return { ...look, id: 1000 + i, name: RIVALS[i].pig, age: 1 }
}

/** The show car: a little red estate with a rosette on the roof. */
function makeCar() {
  const g = new THREE.Group()
  const red = mat(0xd8483a)
  const glass = mat(0xbfe3f2)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 3.6), red)
  body.position.y = 0.6
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.1), glass)
  cabin.position.set(0, 1.25, 0.25)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 2.2), red)
  roof.position.set(0, 1.6, 0.25)
  g.add(body, cabin, roof)
  for (const [x, z] of [
    [-1, -1.15],
    [1, -1.15],
    [-1, 1.15],
    [1, 1.15],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 16), mat(0x2a2a2a))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.34, z)
    g.add(wheel)
  }
  const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), mat(0x3c7ee8))
  rosette.position.set(0, 1.7, 0.25)
  g.add(rosette)
  const sign = textSprite('🏆 PIG SHOW', '#ffffff', 0.4)
  sign.position.set(0, 2.2, 0.25)
  g.add(sign)
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })
  return g
}

/** Someone standing about, maybe holding a piggy. */
interface Person {
  model: FarmerModel
  pig: PigModel | null
  x: number
  z: number
  yaw: number
}

/**
 * The pig show: the show barn (far off down the road, hidden from the farm by the fog) with its judging table and
 * judge, the rival breeders round the walls holding their piggies (with their rosettes), onlookers, the farmers' spots
 * with their names, and the show car: in the yard while it waits, outside the show barn during the show.
 */
export class ShowHall {
  readonly group = new THREE.Group()
  readonly judge: FarmerModel
  private readonly farmCar = makeCar()
  private readonly hallCar = makeCar()
  private readonly people: Person[] = []
  private readonly rivalPigs: PigModel[] = []
  /** Name tags over the spots, and what's on them now. */
  private readonly spotTags: (THREE.Sprite | null)[] = SPOTS.map(() => null)
  private spotKey = ''
  private winsKey = ''
  /** Where to go next: a glowing ring (and a bobbing sign) on your spot, or by the judging table. */
  private readonly beacon = new THREE.Group()
  private readonly beaconSign: THREE.Sprite
  private readonly tableSign: THREE.Sprite

  constructor(scene: THREE.Scene) {
    const g = this.group
    const cx = (HALL.x0 + HALL.x1) / 2
    const cz = (HALL.z0 + HALL.z1) / 2
    const w = HALL.x1 - HALL.x0
    const d = HALL.z1 - HALL.z0

    // Grass round about, a gravel drive from the door, and a straw floor inside.
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(w + 60, d + 60), new THREE.MeshLambertMaterial({ map: grassTex }))
    grass.rotation.x = -Math.PI / 2
    grass.position.set(cx, -0.01, cz)
    grass.receiveShadow = true
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(5, 8), mat(0xb9ab8f))
    drive.rotation.x = -Math.PI / 2
    drive.position.set(cx, 0.005, HALL.z1 + 4)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: strawTex }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(cx, 0.01, cz)
    floor.receiveShadow = true
    g.add(grass, drive, floor)

    // Walls (low enough to see in over), posts, and bunting strung across.
    const wallMat = new THREE.MeshLambertMaterial({ map: barnTex })
    for (const b of HALL_WALLS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 2.2, b.z1 - b.z0), wallMat)
      m.position.set((b.x0 + b.x1) / 2, 1.1, (b.z0 + b.z1) / 2)
      m.castShadow = m.receiveShadow = true
      g.add(m)
    }
    const flags = [0xe8453c, 0xf2c230, 0x3c7ee8, 0x3cc45a, 0xffffff]
    const flagGeo = new THREE.ConeGeometry(0.18, 0.35, 3)
    for (let k = 0; k < 4; k++) {
      const z = HALL.z0 + ((k + 0.5) * d) / 4
      for (let i = 0; i <= 30; i++) {
        const x = HALL.x0 + (i * w) / 30
        const sag = Math.sin((i / 30) * Math.PI) * 0.7
        const flag = new THREE.Mesh(flagGeo, mat(flags[(i + k) % flags.length]))
        flag.rotation.x = Math.PI
        flag.position.set(x, 3.6 - sag, z)
        g.add(flag)
      }
    }
    for (const [x, z] of [
      [HALL.x0, HALL.z0],
      [HALL.x1, HALL.z0],
      [HALL.x0, HALL.z1],
      [HALL.x1, HALL.z1],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), new THREE.MeshLambertMaterial({ map: plankTex }))
      post.position.set(x, 2, z)
      g.add(post)
    }

    // The judging table: a white cloth over it, a blue rosette pinned on the front, and a banner above.
    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE.x1 - TABLE.x0, TABLE_H, TABLE.z1 - TABLE.z0), mat(0xf6f2ea))
    table.position.set((TABLE.x0 + TABLE.x1) / 2, TABLE_H / 2, (TABLE.z0 + TABLE.z1) / 2)
    table.castShadow = table.receiveShadow = true
    const rosette = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat(0x3c7ee8))
    rosette.position.set(table.position.x, TABLE_H * 0.6, TABLE.z1 + 0.01)
    g.add(table, rosette)
    const banner = textSprite('🏆 GUINEA PIG SHOW 🏆', '#ffe27a', 0.9)
    banner.position.set(cx, 4.4, HALL.z0 + 0.5)
    g.add(banner)
    this.judge = new FarmerModel(0x6b4c9a, 'The Judge')
    this.judge.root.position.set(JUDGE.x, 0, JUDGE.z)
    g.add(this.judge.root)

    // The rival breeders round the walls, each holding their piggy, facing into the hall.
    const colours = [0x2f6db5, 0x8a5a2b, 0xc2417a, 0x3a8f5c, 0xd08a2c, 0x5c5c8a, 0x9b3a3a, 0x2c8a8a]
    RIVALS.forEach((rv, i) => {
      const pig = new PigModel(rivalLook(i))
      this.rivalPigs.push(pig)
      this.addPerson(new FarmerModel(colours[i % colours.length], rv.name), pig, rv.x, rv.z, yawTowards(rv, { x: (HALL.x0 + HALL.x1) / 2, z: rv.z }))
    })
    // Onlookers along the top wall either side of the table, some with piggies of their own.
    const rand = seeded(5)
    for (let i = 0; i < 10; i++) {
      const left = i < 5
      const x = left ? HALL.x0 + 3 + (i % 5) * 1.6 : HALL.x1 - 3 - (i % 5) * 1.6
      const z = HALL.z0 + 1.2 + (i % 2) * 0.6
      const pig = rand() < 0.5 ? new PigModel({ ...makePigLooks(1, seeded(300 + i))[0], id: 1100 + i, age: 1 }) : null
      this.addPerson(new FarmerModel(colours[(i * 3) % colours.length], null), pig, x, z, yawTowards({ x, z }, { x: cx, z: cz }) + (rand() - 0.5) * 0.6)
    }

    // The farmers' spots: a straw mat each, numbered.
    SPOTS.forEach((s, i) => {
      const mat_ = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshLambertMaterial({ color: 0xf0d27a }))
      mat_.rotation.x = -Math.PI / 2
      mat_.position.set(s.x, 0.02, s.z)
      const num = textSprite(`${i + 1}`, '#5a3a1a', 0.45)
      num.position.set(s.x, 0.35, s.z + 0.7)
      g.add(mat_, num)
    })

    // The beacon: where you need to go next.
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthWrite: false })
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 40), glow)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05
    ring.renderOrder = 4
    this.beacon.add(ring)
    this.beaconSign = textSprite('⬇ Your spot', '#ffe27a', 0.55)
    this.tableSign = textSprite('⬇ Judging table', '#ffe27a', 0.55)
    this.beacon.add(this.beaconSign, this.tableSign)
    this.beacon.visible = false
    g.add(this.beacon)

    this.hallCar.position.set(CAR_HALL.x, 0, CAR_HALL.z)
    this.farmCar.position.set(CAR_FARM.x, 0, CAR_FARM.z)
    this.farmCar.rotation.y = Math.PI / 2
    this.farmCar.visible = this.hallCar.visible = false
    scene.add(g, this.farmCar)
    g.add(this.hallCar)
  }

  private addPerson(model: FarmerModel, pig: PigModel | null, x: number, z: number, yaw: number) {
    model.root.position.set(x, 0, z)
    model.root.rotation.y = yaw
    this.group.add(model.root)
    if (pig) this.group.add(pig.root)
    this.people.push({ model, pig, x, z, yaw })
  }

  /**
   * `here`: I'm at the show (otherwise the hall needn't be drawn or animated). `go`: where I should head next (my spot,
   * or the judging table), to light it up.
   */
  update(dt: number, clock: number, show: ShowSnap | null, here: boolean, go: { spot: number } | 'table' | null = null) {
    this.farmCar.visible = show?.phase === 'boarding'
    this.hallCar.visible = !!show && show.phase !== 'boarding'
    this.group.visible = here
    if (!here) return
    this.judge.pose(dt, 0, false, 0, 0)
    this.people.forEach((p, i) => {
      p.model.pose(dt, 0, !!p.pig, 0, 0)
      if (!p.pig) return
      const f = facing(p.yaw)
      p.pig.root.position.set(p.x + f.x * 0.45, 1.0, p.z + f.z * 0.45)
      p.pig.root.rotation.y = p.yaw + Math.PI / 2
      p.pig.pose('held', 0, clock, i * 0.7)
    })
    this.beacon.visible = !!go
    if (go) {
      const at = go === 'table' ? { x: TABLE.x0 + (TABLE.x1 - TABLE.x0) / 2, z: TABLE.z1 + 1.2 } : SPOTS[go.spot]
      this.beacon.position.set(at.x, 0, at.z)
      this.beacon.children[0].scale.setScalar(1 + Math.sin(clock * 5) * 0.1)
      this.beaconSign.visible = go !== 'table'
      this.tableSign.visible = go === 'table'
      const bob = 3.2 + Math.abs(Math.sin(clock * 3)) * 0.35
      this.beaconSign.position.y = bob
      this.tableSign.position.y = bob
    }
    if (!show) return
    // Rosettes on the rivals' piggies for every show they've won.
    const wins = show.rivalWins.join()
    if (wins !== this.winsKey) {
      this.winsKey = wins
      show.rivalWins.forEach((n, i) => this.rivalPigs[i]?.setRosettes(n))
    }
    // Who's on which spot.
    const key = show.entrants.map((e) => `${e.spot}:${e.name}`).join()
    if (key !== this.spotKey) {
      this.spotKey = key
      this.spotTags.forEach((t, i) => {
        if (t) this.group.remove(t)
        this.spotTags[i] = null
      })
      for (const e of show.entrants) {
        const s = SPOTS[e.spot]
        const tag = textSprite(e.name, '#ffffff', 0.4)
        tag.position.set(s.x, 2.6, s.z)
        this.group.add(tag)
        this.spotTags[e.spot] = tag
      }
    }
  }
}

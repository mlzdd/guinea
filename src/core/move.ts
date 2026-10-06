import { groundAt, settleFarmer, type P } from './map.ts'
import { AIR_ACCEL, FARMER_ACCEL, FARMER_STOP, GRAVITY, JUMP_V } from './rules.ts'

/** A farmer's body: where their feet are and how fast they're going. */
export interface Body {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

/**
 * One step of a farmer's movement (the browser runs this for its own farmer). `want` is the velocity the keys are
 * asking for. On the ground you get up to speed (and stop) quickly but not instantly; in the air you keep your
 * momentum and can only steer a little. Walls and things take away the speed going into them.
 */
export function moveFarmer(b: Body, want: P, jump: boolean, dt: number): { airborne: boolean } {
  const grounded = b.vy <= 0 && b.y <= groundAt(b) + 0.01
  if (jump && grounded) b.vy = JUMP_V
  const asking = want.x !== 0 || want.z !== 0
  const accel = grounded && !jump ? (asking ? FARMER_ACCEL : FARMER_STOP) : asking ? AIR_ACCEL : 0
  const ex = want.x - b.vx
  const ez = want.z - b.vz
  const e = Math.hypot(ex, ez)
  if (e > 1e-6) {
    const k = Math.min(1, (accel * dt) / e)
    b.vx += ex * k
    b.vz += ez * k
  }
  b.vy -= GRAVITY * dt
  b.y += b.vy * dt

  const p = { x: b.x + b.vx * dt, z: b.z + b.vz * dt }
  settleFarmer(p, b.y)
  if (dt > 0) {
    b.vx = (p.x - b.x) / dt
    b.vz = (p.z - b.z) / dt
  }
  b.x = p.x
  b.z = p.z
  const ground = groundAt(b)
  if (b.y <= ground) {
    b.y = ground
    b.vy = 0
  }
  return { airborne: b.y > ground + 0.01 }
}

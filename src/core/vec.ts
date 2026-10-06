export interface Vec3 {
  x: number
  y: number
  z: number
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

/** Unit vector you are looking along (ignoring pitch). yaw = 0 looks down -Z, like a three.js camera. */
export function facing(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

/** Yaw that looks from `from` towards `to`. */
export function yawTowards(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

export function isVec3(v: unknown): v is Vec3 {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return [o.x, o.y, o.z].every((n) => typeof n === 'number' && Number.isFinite(n))
}

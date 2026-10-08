import * as THREE from 'three'

/**
 * The shape of a guinea pig: a body like a loaf (flat bottom, squarish, wider at the hips, a blunt
 * rump) and a big blunt head with a Roman nose. Each is a sphere pushed about by a `warp`, used for
 * the mesh, its fur shells (fur.ts) and where hair grows (hair.ts), so they all agree.
 */

/** A body or head: its centre and radii in the parent group, and how the unit sphere is pushed into shape. */
export interface Ellipsoid {
  c: [number, number, number]
  r: [number, number, number]
  warp?: (d: THREE.Vector3) => THREE.Vector3
}

/** Pushes a unit direction out towards a rounded box (`p` = 2 is a sphere, higher is boxier). */
function boxy(d: THREE.Vector3, p: number, k: number) {
  const n = (Math.abs(d.x) ** p + Math.abs(d.y) ** p + Math.abs(d.z) ** p) ** (1 / p)
  return d.clone().multiplyScalar(1 + (1 / n - 1) * k)
}

/** The body: a loaf. */
export function loaf(d: THREE.Vector3) {
  const v = boxy(d, 3, 0.5)
  if (v.y < 0) v.y *= 0.78 // sits flat on the ground
  v.x *= 1 + 0.2 * v.z // narrow shoulders, wide hips
  if (v.z > 0) v.z *= 0.95 // a blunt rump, no tail
  return v
}

/** The head: broad at the back, narrowing to a rounded muzzle with a flattish end. */
export function headShape(d: THREE.Vector3) {
  const v = d.clone()
  if (v.y < 0) v.y *= 0.85 // a flatter chin
  if (v.z < 0) {
    const front = -v.z
    v.x *= 1 - 0.32 * front * front
    v.y *= 1 - 0.24 * front * front
    v.y -= 0.06 * front * front
    // The end of the face is flattened off a little rather than coming to a sharp point.
    v.z = -front * (1.12 - 0.1 * front * front)
  }
  return v
}

/** A point on (or `out` times out from) the surface, in the parent group. */
export function surface(e: Ellipsoid, d: THREE.Vector3, out = 1) {
  const w = e.warp ? e.warp(d) : d
  return new THREE.Vector3(e.c[0] + w.x * e.r[0] * out, e.c[1] + w.y * e.r[1] * out, e.c[2] + w.z * e.r[2] * out)
}

/** A unit sphere (same UVs, so the painted coat still lines up) pushed into shape, with matching normals. */
export function shapedSphere(warp: (d: THREE.Vector3) => THREE.Vector3, w = 32, h = 22) {
  const g = new THREE.SphereGeometry(1, w, h)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const d = new THREE.Vector3()
  const t1 = new THREE.Vector3()
  const t2 = new THREE.Vector3()
  const eps = 0.01
  const at = (v: THREE.Vector3) => warp(v.clone().normalize())
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize()
    const p = warp(d)
    // The normal from the warped surface either side of the point.
    t1.set(0, 1, 0).cross(d)
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0)
    t1.normalize()
    t2.crossVectors(d, t1)
    const a = at(d.clone().addScaledVector(t1, eps)).sub(at(d.clone().addScaledVector(t1, -eps)))
    const b = at(d.clone().addScaledVector(t2, eps)).sub(at(d.clone().addScaledVector(t2, -eps)))
    const n = new THREE.Vector3().crossVectors(a, b).normalize()
    if (n.dot(p) < 0) n.negate()
    pos.setXYZ(i, p.x, p.y, p.z)
    nor.setXYZ(i, n.x, n.y, n.z)
  }
  return g
}

/**
 * An ear: one oval sheet `w` wide and `h` tall, its base at the origin, its inside facing −Z. It's
 * cupped (the edges curl forwards) and the top half folds forwards over a soft crease by `fold`
 * radians, like a petal too soft to stand up.
 */
export function foldedOval(w: number, h: number, fold: number, cup = 0.3) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 16)
  const pos = g.attributes.position
  const crease = h * 0.5
  const bend = h * 0.16 // radius of the crease
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) // −0.5..0.5 across
    const v = pos.getY(i) + 0.5 // 0..1 up
    // Oval outline, a little wider below the middle, still some width at the base where it joins the head.
    const t = 2 * (0.12 + 0.88 * v) - 1
    const width = w * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + 0.12 * (0.5 - v))
    const x = u * width
    const z = -cup * (2 * u) ** 2 * width * 0.5
    let y = v * h
    let zz = z
    if (y > crease) {
      const s = y - crease
      const a = Math.min(s / bend, fold)
      const rest = Math.max(0, s - fold * bend)
      y = crease + bend * Math.sin(a) + rest * Math.cos(fold)
      zz = z - bend * (1 - Math.cos(a)) - rest * Math.sin(fold)
    }
    pos.setXYZ(i, x, y, zz)
  }
  g.computeVertexNormals()
  return g
}

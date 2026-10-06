import * as THREE from 'three'
import type { Veg } from '../core/rules.ts'

export const VEG_ICON: Record<Veg, string> = { carrot: '🥕', lettuce: '🥬', cucumber: '🥒', pepper: '🫑', apple: '🍎' }
export const VEG_LABEL: Record<Veg, string> = { carrot: 'Carrot', lettuce: 'Lettuce', cucumber: 'Cucumber', pepper: 'Pepper', apple: 'Apple' }

const mats = new Map<number, THREE.MeshLambertMaterial>()
export function mat(color: number | string): THREE.MeshLambertMaterial {
  const c = new THREE.Color(color).getHex()
  let m = mats.get(c)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c })
    mats.set(c, m)
  }
  return m
}

const sphere = new THREE.SphereGeometry(1, 12, 9)
const cone = new THREE.ConeGeometry(1, 1, 10)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8)
const capsule = new THREE.CapsuleGeometry(1, 3, 4, 10)
const leaf = new THREE.SphereGeometry(1, 6, 4)

function mesh(geo: THREE.BufferGeometry, color: number, s: [number, number, number], p: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat(color))
  m.scale.set(...s)
  m.position.set(...p)
  m.castShadow = true
  return m
}

/** A veg lying on the ground, roughly 0.35 m long (cartoon sized so you can see it from up high). */
export function makeVeg(kind: Veg): THREE.Group {
  const g = new THREE.Group()
  switch (kind) {
    case 'carrot': {
      const body = mesh(cone, 0xf07b1d, [0.08, 0.38, 0.08], [0, 0.08, 0])
      body.rotation.z = Math.PI / 2
      g.add(body)
      for (const a of [-0.5, 0, 0.5]) {
        const top = mesh(leaf, 0x3fae3a, [0.11, 0.025, 0.035], [0.27, 0.1, a * 0.05])
        top.rotation.y = a
        g.add(top)
      }
      break
    }
    case 'lettuce':
      g.add(mesh(sphere, 0x86c94a, [0.17, 0.13, 0.17], [0, 0.11, 0]))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const l = mesh(leaf, 0x5fae3a, [0.13, 0.05, 0.09], [Math.cos(a) * 0.1, 0.09, Math.sin(a) * 0.1])
        l.rotation.y = -a
        l.rotation.z = 0.5
        g.add(l)
      }
      break
    case 'cucumber': {
      const c = mesh(capsule, 0x2f7a2a, [0.065, 0.06, 0.065], [0, 0.065, 0])
      c.rotation.z = Math.PI / 2
      g.add(c)
      break
    }
    case 'pepper':
      g.add(mesh(sphere, 0x4fae32, [0.11, 0.12, 0.11], [0, 0.12, 0]))
      g.add(mesh(cyl, 0x2e6b1f, [0.02, 0.06, 0.02], [0, 0.25, 0]))
      break
    case 'apple':
      g.add(mesh(sphere, 0xd8322b, [0.1, 0.095, 0.1], [0, 0.095, 0]))
      g.add(mesh(cyl, 0x5a3a1c, [0.012, 0.05, 0.012], [0, 0.2, 0]))
      g.add(mesh(leaf, 0x4caf3a, [0.04, 0.012, 0.02], [0.03, 0.2, 0]))
      break
  }
  return g
}

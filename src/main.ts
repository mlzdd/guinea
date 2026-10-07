import * as THREE from 'three'
import { Game } from './client/game.ts'
import { connect, type Net } from './client/net.ts'
import { PigModel } from './client/pig.ts'
import { makePigLooks } from './core/pigs.ts'
import type { ServerMsg } from './core/protocol.ts'
import { FARMER_COLORS } from './core/rules.ts'
import { startMusic } from './client/music.ts'
import './style.css'

const NAME_KEY = 'guinea.name'
const COLOR_KEY = 'guinea.color'

// Day music from the lobby on (it starts on the first click or key press if the browser waits for one).
startMusic()

const form = document.getElementById('join') as HTMLFormElement
const button = form.querySelector('button')!
const nameInput = document.getElementById('name') as HTMLInputElement
const error = document.getElementById('error')!
const note = document.getElementById('note')!
const canvas = document.getElementById('view') as HTMLCanvasElement

let color = 0
try {
  nameInput.value = localStorage.getItem(NAME_KEY) ?? ''
  color = Math.max(0, Math.min(FARMER_COLORS.length - 1, Number(localStorage.getItem(COLOR_KEY)) || 0))
} catch {
  // Storage blocked: start with an empty name and the first colour.
}
nameInput.focus()

// Overalls colour picker
const swatches = document.getElementById('colors')!
FARMER_COLORS.forEach((c, i) => {
  const b = document.createElement('button')
  b.type = 'button'
  b.style.background = `#${c.toString(16).padStart(6, '0')}`
  b.title = 'Overalls colour'
  b.addEventListener('click', () => {
    color = i
    swatches.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i))
    nameInput.focus()
  })
  swatches.append(b)
})
swatches.children[color]?.classList.add('on')

/** A random piggy turning round in the lobby; click it for another. */
function lobbyPig() {
  const el = document.getElementById('preview') as HTMLCanvasElement
  const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(el.clientWidth, el.clientHeight, false)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(2, 3, 2)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.1, 10)
  camera.position.set(0, 0.7, 1.6)
  camera.lookAt(0, 0.15, 0)
  let pig: PigModel | null = null
  const another = () => {
    pig?.root.removeFromParent()
    pig = new PigModel(makePigLooks(1, Math.random)[0])
    scene.add(pig.root)
  }
  another()
  el.addEventListener('click', another)
  let running = true
  const t0 = performance.now()
  const spin = (now: number) => {
    if (!running) return
    const t = (now - t0) / 1000
    if (pig) {
      pig.root.rotation.y = t * 0.8
      pig.pose(Math.floor(t / 3) % 4 === 3 ? 'popcorn' : 'idle', 0, t, 0)
    }
    renderer.render(scene, camera)
    requestAnimationFrame(spin)
  }
  requestAnimationFrame(spin)
  return () => {
    running = false
    renderer.dispose()
  }
}
let stopPreview: (() => void) | null = lobbyPig()

let net: Net | null = null
let game: Game | null = null
let joined = false

/** Connects while still in the lobby, to hear how many are on. Reconnects if the server drops us before we join. */
async function open() {
  try {
    net = await connect(onMessage, onClose)
  } catch {
    note.textContent = 'Looking for the farm server…'
    setTimeout(open, 2000)
  }
}

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'info':
      if (!joined)
        note.textContent =
          msg.farmers === 0 ? 'Nobody on the farm yet: the piggies are waiting!' : `${msg.farmers} farmer${msg.farmers > 1 ? 's' : ''} on the farm right now`
      return
    case 'full':
      error.textContent = 'The farm is full. Try again when someone goes home.'
      button.disabled = false
      return // the server closes the socket; onClose reconnects for the next try
    case 'welcome':
      joined = true
      stopPreview?.()
      stopPreview = null
      document.getElementById('lobby')!.hidden = true
      game = new Game(canvas)
      game.start(net!, msg.id, msg.pigs)
      return
  }
  game?.onMessage(msg)
}

function onClose() {
  net = null
  if (!joined) {
    setTimeout(open, 1000)
    return
  }
  const t = document.getElementById('toast')!
  t.textContent = 'Lost touch with the farm. Refresh the page to rejoin.'
  t.className = 'danger show stuck'
}

void open()

form.addEventListener('submit', (e) => {
  e.preventDefault()
  if (!net) {
    error.textContent = 'Still connecting to the farm…'
    return
  }
  const name = nameInput.value.trim() || 'Farmer'
  try {
    localStorage.setItem(NAME_KEY, name)
    localStorage.setItem(COLOR_KEY, String(color))
  } catch {
    // Not important.
  }
  button.disabled = true
  error.textContent = ''
  // Play during the join gesture so browsers can allow audible playback.
  startMusic()
  net.send({ t: 'join', name, color })
})

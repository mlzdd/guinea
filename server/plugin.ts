import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Server as HttpServer } from 'node:http'
import { dirname } from 'node:path'
import type { Plugin } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'
import { Farm } from '../src/core/farm.ts'
import { parseClientMsg, type ServerMsg } from '../src/core/protocol.ts'
import { TICK_MS } from '../src/core/rules.ts'

export const WS_PATH = '/ws'
const SAVE_EVERY_MS = 20_000

export interface ServerOptions {
  /** Where the farm is kept between runs. Leave out to start fresh every time (tests do). */
  saveFile?: string
}

function loadSave(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function writeSave(file: string, farm: Farm) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(farm.save()))
    renameSync(`${file}.tmp`, file)
  } catch (e) {
    console.warn('[guinea] could not save the farm:', e)
  }
}

/** Runs one shared farm over WebSockets on the same port as the web page. */
export function attachGameServer(http: HttpServer, opts: ServerOptions = {}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })
  const farm = new Farm(Math.random, opts.saveFile ? loadSave(opts.saveFile) : undefined)
  const sockets = new Map<number, WebSocket>()
  /** Pages sitting in the lobby: they're told how many farmers are on. */
  const lobby = new Set<WebSocket>()

  const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }
  const flush = () => {
    for (const { to, msg } of farm.out) {
      if (to === 'all') for (const ws of sockets.values()) send(ws, msg)
      else {
        const ws = sockets.get(to)
        if (ws) send(ws, msg)
      }
    }
    farm.out = []
  }
  const tellLobby = () => {
    for (const ws of lobby) send(ws, { t: 'info', farmers: farm.farmers.size })
  }
  const save = () => {
    if (opts.saveFile) writeSave(opts.saveFile, farm)
  }

  http.on('upgrade', (req, socket, head) => {
    // Leave Vite's own hot-reload socket alone.
    if (req.url?.split('?')[0] !== WS_PATH) return
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws) => {
    let id: number | null = null
    lobby.add(ws)
    send(ws, { t: 'info', farmers: farm.farmers.size })
    ws.on('message', (data) => {
      const msg = parseClientMsg(data.toString())
      if (!msg) return
      if (msg.t === 'join') {
        if (id !== null) return
        id = farm.join(msg.name, msg.color)
        if (id === null) {
          send(ws, { t: 'full' })
          ws.close()
          return
        }
        lobby.delete(ws)
        sockets.set(id, ws)
        send(ws, { t: 'welcome', id, pigs: farm.looks() })
        tellLobby()
        console.log(`[guinea] ${msg.name} joined`)
      } else if (id !== null) {
        farm.handle(id, msg)
      }
      flush()
    })
    ws.on('close', () => {
      lobby.delete(ws)
      if (id === null) return
      sockets.delete(id)
      farm.leave(id)
      flush()
      tellLobby()
      if (farm.farmers.size === 0) save()
    })
  })

  let last = Date.now()
  const timer = setInterval(() => {
    const now = Date.now()
    // Cap the step so a stalled server doesn't teleport every pig.
    farm.tick(Math.min(now - last, 250))
    last = now
    flush()
    if (sockets.size === 0) return
    const snap = JSON.stringify(farm.snapshot())
    for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(snap)
  }, TICK_MS)
  const saver = setInterval(() => {
    if (farm.farmers.size > 0) save()
  }, SAVE_EVERY_MS)

  http.on('close', () => {
    clearInterval(timer)
    clearInterval(saver)
    save()
    wss.close()
  })
  return wss
}

export function gamePlugin(): Plugin {
  const opts = { saveFile: 'data/farm.json' }
  return {
    name: 'guinea-farm-server',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as HttpServer, opts)
    },
    configurePreviewServer(server) {
      attachGameServer(server.httpServer as HttpServer, opts)
    },
  }
}

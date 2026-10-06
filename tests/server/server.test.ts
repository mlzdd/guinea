import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { attachGameServer } from '../../server/plugin.ts'
import type { ClientMsg, ServerMsg } from '../../src/core/protocol.ts'
import { MAX_FARMERS, PIG_COUNT } from '../../src/core/rules.ts'

let http: Server

afterEach(() => new Promise<void>((done) => http.close(() => done())))

function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  const got: ServerMsg[] = []
  ws.on('message', (d) => got.push(JSON.parse(d.toString())))
  const open = new Promise((r) => ws.on('open', r))
  return {
    ws,
    got,
    open,
    send: (m: ClientMsg) => ws.send(JSON.stringify(m)),
    waitFor: async (pred: (m: ServerMsg) => boolean, ms = 2000) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        const hit = got.find(pred)
        if (hit) return hit
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error('timed out')
    },
  }
}

describe('game server', () => {
  it('farmers join the same farm, see each other and the pigs, and a full farm turns people away', async () => {
    http = createServer()
    attachGameServer(http)
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    const { port } = http.address() as AddressInfo

    const a = client(port)
    const b = client(port)
    await Promise.all([a.open, b.open])
    await a.waitFor((m) => m.t === 'info' && m.farmers === 0)
    a.send({ t: 'join', name: 'Ann', color: 2 })
    const welcome = await a.waitFor((m) => m.t === 'welcome')
    if (welcome.t !== 'welcome') throw new Error()
    expect(welcome.pigs).toHaveLength(PIG_COUNT)
    // Bob, still in the lobby, hears that someone is on.
    await b.waitFor((m) => m.t === 'info' && m.farmers === 1)
    b.send({ t: 'join', name: 'Bob<script>', color: 99 })
    await b.waitFor((m) => m.t === 'welcome')
    await a.waitFor((m) => m.t === 'alert' && m.text.includes('Bobscript'))

    const snap = await a.waitFor((m) => m.t === 'snap' && m.farmers.length === 2)
    if (snap.t !== 'snap') throw new Error()
    expect(snap.farmers.map((f) => [f.name, f.color])).toEqual([
      ['Ann', 2],
      ['Bobscript', 0], // a bad colour falls back to the first
    ])
    expect(snap.pigs).toHaveLength(PIG_COUNT)

    // Junk is ignored, real moves show up for everyone.
    a.ws.send('{"t":"state","x":"far"}')
    a.send({ t: 'state', x: 3, y: 0, z: 4, yaw: 1 })
    await b.waitFor((m) => m.t === 'snap' && m.farmers.some((f) => f.name === 'Ann' && f.x === 3 && f.z === 4))

    const more = Array.from({ length: MAX_FARMERS - 2 }, () => client(port))
    for (const [i, x] of more.entries()) {
      await x.open
      x.send({ t: 'join', name: `F${i}`, color: 1 })
      await x.waitFor((m) => m.t === 'welcome')
    }
    const extra = client(port)
    await extra.open
    extra.send({ t: 'join', name: 'Late', color: 0 })
    await extra.waitFor((m) => m.t === 'full')

    for (const x of [a, b, extra, ...more]) x.ws.close()
  })
})

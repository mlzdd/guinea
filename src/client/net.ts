import type { ClientMsg, ServerMsg } from '../core/protocol.ts'

export interface Net {
  send(msg: ClientMsg): void
  close(): void
}

/** Connects to the game server on the same host and port that served the page. */
export function connect(onMessage: (msg: ServerMsg) => void, onClose: () => void): Promise<Net> {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () =>
      resolve({
        send: (msg) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
        },
        close: () => ws.close(),
      }),
    )
    ws.addEventListener('error', () => reject(new Error('Could not reach the game server')))
    ws.addEventListener('message', (e) => onMessage(JSON.parse(e.data as string) as ServerMsg))
    ws.addEventListener('close', onClose)
  })
}

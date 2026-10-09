# Tech assessment (October 2026)

A snapshot of how Guinea Orchard is built, what's solid, and what would need work before it goes beyond "a farm on the office LAN". For the day-to-day design see `CLAUDE.md`; this is the "what would we change" companion.

## Where it stands

About 15k lines of TypeScript (Vite 8, TS 6, three.js, `ws`, Vitest 5, oxlint). No asset files; everything is three.js primitives and canvas textures.

```
 browser(s) ──ws──► Vite plugin (server/plugin.ts) ──► Farm (src/core/farm.ts)
 three.js           50 ms tick, JSON snapshots         pure TS: tick(dt) + handle(msg) → out[]
 renders snapshots  saves every 20 s, checkpoints      no DOM, no network
```

- **One authoritative simulation.** `Farm` owns pigs, crops, food, predators, money and the clock. Clients own only their own movement (20 Hz, server pushes them out of solids) and send requests the server validates (distance, room, state).
- **Shared core.** `src/core/` runs in both browser and server (movement, collision, rules). This is the best decision in the codebase: tests drive the whole game with a seeded `Farm` and no browser.
- **Tuning in one place.** Every gameplay number is in `rules.ts`; upgrades are data with small level helpers.
- **Tests are behavioural** (~140): big-herd bedtime, no pig stuck in a wall, pathfinding soaks, real HTTP + WebSocket tests filled to the player limit.
- **Safety nets:** versioned saves (`FarmSave.v`), 10-minute checkpoints, wire input validated in `parseClientMsg`.

## Debt (the "vibe-coded" part)

| Area | Problem | Risk |
|---|---|---|
| `farm.ts` (~3.4k lines) | One class holds pig brain, crops, breeding, show, salad, vet, gardener, shop, saving | Every feature touches it; hard to reason about, easy to conflict |
| `world.ts` (~1.8k), `game.ts` (~1.4k) | Same shape on the client | Same |
| Pig state machine | ~25 string states; behaviour split across `decide`, `updatePig`, `moveTo`, plus lists (`CALM`, `AWAY`, `SETTLED`) | A new state means remembering every list. Most recent bugs came from here (bedtime pacing) |
| Ids and ordering | Food ids come from list positions (`HOPPER_ID`, `SALAD_ID`, `RACK_ID`); saves store racks, beds, hoppers by index | Adding or reordering things can silently shift ids |
| Global map state | `map.ts` keeps the current land in module variables; `Farm` calls `setLand` every tick so tests can make many farms | Fragile; blocks running two farms in one process safely |
| Tests reach into internals | `farm['bedSpot']`, poking `farm.pigs` | Brittle if `Farm` is split |
| Helpers share `Farmer` | The gardener is a `Farmer` that isn't in `farmers`; `act()` is the shared entry | Easy to forget it when adding a farmer-wide rule |

## Before it can grow up

### Hosting and networking
- **One farm per server process, one world.** `attachGameServer` makes a single `Farm`; the WebSocket is on the Vite HTTP server. Fine for LAN; for the internet it needs a real server entry point (not a Vite plugin) and a reverse proxy with TLS (`wss://`).
- **No identity.** Joining is just a name. Baskets are kept *by name*, so anyone typing your name gets your basket. Needs accounts or at least a per-player token.
- **No auth or rate limits** beyond input validation. A hostile client can spam any message type at 20+ Hz.
- **Snapshots are full JSON at 20 Hz** to every client (stringified once, which is good). Fine for 12 players and ~48 pigs; wasteful over the internet. Options: deltas, binary encoding, lower send rate for far-away entities, and client interpolation tuned for jitter (today it assumes a LAN).
- **No reconnect story.** A dropped socket is a `leave`; rejoining by name gets the basket back but nothing else.
- **Latency:** movement is client-authoritative with server push-out. OK for a cosy farm; would need review before anything competitive.

### Lobbies and multiple farms
- Today "the lobby" is just the join screen showing a count. There is no concept of rooms, farm lists, passwords or invites.
- To support many farms: a `FarmHost` that owns many `Farm`s (one per room id), routes sockets by room, saves each separately, and ticks them. `Farm` is already network-free, so this is mostly plumbing, **but** the global map state above must go first (make the land per-`Farm`/per-instance, or isolate farms per worker).
- Ticking many farms in one Node process will starve eventually (the A* pathing and pig loops are CPU heavy); plan on a worker per farm or a process per farm behind a small router.
- Storage: `data/farm.json` + checkpoint files are fine locally; many farms want a DB or object store, plus clean-up of idle farms.

### Local and offline play
- Because the core is DOM-free and network-free, a **single-player/local mode** is feasible: run `Farm` in the browser (or a worker) and feed it messages directly instead of via `ws`.
- That needs a small transport interface (`send(msg)` / `onMessage`) with two implementations (WebSocket, in-process). Today the client talks to `Net` directly and the server flushes `farm.out` itself, so the seam is easy to cut.
- Saves would go to IndexedDB/localStorage; the checkpoint/restore tool is Node-only.
- Local co-op on one machine (several browsers) already works via `npm run dev`.

### Performance and scale
- 12 farmers and a herd up to 48 is the design point. More pigs means `separatePigs` (O(n²)), `excite`, and A* per pig get heavier. Profile before raising `herdMax`.
- Client: one draw-call-heavy scene; `FAST` quality mode exists for phones. Fine for now.

## Suggested order (when it's time)

1. **Make the map per-farm instead of global** (unblocks everything else, including tests that run many farms).
2. **Split `farm.ts` by domain** (pigs, crops, show, shop, helpers) behind the same public surface; the existing tests are the safety net.
3. **Make the pig state machine table-driven** (each state declares calm/away/settled/speed).
4. **Introduce a transport interface** and an in-process implementation (local mode and easier server tests).
5. **Real server entry point**, room manager, and persistence per room.
6. **Identity and basic abuse limits**, then snapshot deltas/binary if bandwidth matters.

Don't rewrite: it's coherent and well tested. Keep adding to `CLAUDE.md` and the test suite with every feature; that's what is holding the vibe-coded parts together.

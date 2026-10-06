# Guinea Orchard

A cosy, office-friendly co-op farm for everyone on the LAN: up to 12 farmers share one farm with 36 guinea pigs. Feed them by throwing veg (they come running, wheeking), harvest and replant the veggie garden, gather apples in the orchard, fill the bowls in the barn, pick piggies up for a health check (weigh, nails, mites, sniffles, teeth: find problems and fix them), and shoo foxes and hawks before they carry anyone off. There's a barn (inside: walls drop and the roof comes off when you walk in) and the outside lawn/orchard/garden. Day turns to night; at night the pigs go in and sleep and foxes come more often. **No sound** (office PCs have none): pigs "say" everything in comic bubbles ("WHEEEK!", "monch monch", "zzz", "EEK!"). Sister project to `~/countersmack` (same toolchain and server pattern; that one is a brawler, this one is deliberately non-violent: carried-off pigs come back to the gate later, shaken).

Stack: Vite 8 + TypeScript 6 + three.js + `ws`, tested with Vitest 5, linted with oxlint. No React. All art is three.js primitives and canvas textures; no asset files.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server + farm server on port 5173, reachable on the LAN |
| `npm run build && npm run preview` | Production build on port 4173 (farm server runs there too) |
| `npx vitest run` | Tests (`npm test` = watch mode) |
| `npx tsc -b` | Type-check app, server and tests |
| `npm run lint` | oxlint |

Find the LAN address with `hostname -I` (ignore `169.254.*`). If another computer can't connect: `sudo ufw allow 5173/tcp`. Delete `data/farm.json` for a fresh farm.

## Working with this user

- **The user does the visual checking.** Don't install Playwright/Chromium for screenshots. Verify with tests, `tsc` and lint, then say what to look at in the browser.
- Ask before `git init` / committing.
- Something reformats files on save (long lines get wrapped): re-read before editing.

## How it works

- **Server** (`server/plugin.ts`): a Vite plugin that attaches a WebSocket server at `/ws` to Vite's HTTP server (dev and preview); Vite's hot-reload socket is untouched. One farm per server. Ticks every 50 ms: `farm.tick(dt)`, sends queued messages, broadcasts a snapshot. The farm is saved to `data/farm.json` every 20 s while anyone's on, when the last farmer leaves, and on close; it's loaded on start (a broken save is ignored).
- **Farm clock:** `Farm.t` only advances while at least one farmer is on, so the pigs don't starve overnight. A day is `DAY_MS` (8 min); night is the last quarter (`NIGHT_START`). Predators wait `FIRST_PREDATOR_MS` after the farm wakes.
- **Authority:** farmers own their own movement (sent 20×/s, pushed out of solids by the server). The server owns everything else: pigs, food, crops, bowls, baskets, predators. Interactions (`plant`, `harvest`, `fill`, `gather`, `pickup`, `treat`…) are requests the server checks (distance, basket room, state).
- **Pig brain** (`Farm.updatePig` / `decide`): hunger falls over time (slower asleep); grazing outside slows it. Danger first (flee to the nearest hidey hut or the barn), then begging near a farmer with veg, then the current state. Food landing excites every peckish pig within `EXCITE_RADIUS` → `seek` (client shows WHEEK) → `eat` (bites every `BITE_MS`, client shows monch). Bowls are foods with ids 0–3 that never go away. Pigs path between inside and outside only through the barn door (`nextStep` in map.ts, with per-pig lanes so they don't jam); anything stuck for 1.5 s rethinks. Pigs overlapping get pushed apart (eating/sleeping/hiding ones stay put).
- **Health:** problems are bit flags (`ISSUE_BIT`) that start at random (`ISSUE_RATE`; sniffles only from being outside at night). Mites make pigs scratch, sniffles make them sneeze; nails and teeth only show up in a health check. The check card (`hud.ts`) reveals each result after a short "checking…", then offers the fix.
- **Predators:** foxes sneak in from the west/east/south fence (slowly under the fence), go for the nearest exposed pig (outside, not in a hidey hut), pounce in the last few metres, then carry it slowly back under the fence. Pigs only notice a fox up close (closer still when eating). Hawks circle for a while (scaring pigs within `HAWK_FEAR`), then swoop. `F` shoos anything within `SHOO_RADIUS` (hawks a bit further) and makes it drop its pig. A pig that's carried off turns up at the south gate `LOST_MS` later, unhappy.
- **Client** has no pointer lock: the mouse aims at the ground (throws land there, capped at `THROW_RANGE`), right-drag turns the camera, the wheel zooms. Bubbles are client-side, driven by pig state changes plus periodic chatter (`Game.chatter`), only for pigs within `CHATTER_RANGE` of you.

## Code map

```
src/core/            Shared by browser and server (no DOM). Imports use .ts extensions so Node can load them.
  rules.ts           ALL gameplay numbers (speeds, hunger, bites, basket size, grow time, issue rates, predator timings, day length)
  map.ts             The layout (BOUNDS, barn + door, veggie garden + beds, orchard trees, hidey huts, bowls, pig houses, hay bales), solids lists per kind (farmer/pig/fox), pushOut collision, nextStep door routing
  pigs.ts            PigLook (name, breed: smooth/abyssinian/peruvian/teddy, coat pattern + colours, sex, age, weight) and makePigLooks
  farm.ts            Farm: the whole simulation, no networking. Feed it messages + tick(dt); read `out`. save()/load
  protocol.ts        ClientMsg / ServerMsg types, parseClientMsg (validates everything from the wire), cleanName
  vec.ts             facing(yaw), yawTowards (yaw 0 looks down −Z)
src/client/
  game.ts            Main loop: walking, camera, aiming, E-action picking + prompt, throwing, syncing pigs/farmers/food/predators from snapshots, bubbles, predator edge arrows, hover tooltip
  world.ts           The static scene from map.ts (barn with removable roof, garden beds with growing crops, orchard, hidey huts, fences, trees beyond) + bowls' food piles + day/night lighting and lamps
  pig.ts             PigModel: built from the look; pose() animates walking, eating, grazing, sleeping, popcorning, begging, being held/carried
  critters.ts        FarmerModel (straw hat, overalls in their colour, wellies, basket), FoxModel, HawkModel (+ ground shadow), textSprite
  veg.ts             makeVeg (carrot, lettuce, cucumber, pepper, apple), icons, shared materials
  bubbles.ts         Comic speech bubbles as sprites (cached canvas textures, one per thing at a time)
  hud.ts             DOM overlay: clock, farm stats, farmer list, alert feed, toasts, basket slots, action prompt, health check card, predator arrows, tooltip
  input.ts           Keyboard (WASD/arrows, Shift, E, F, 1–5, Space, H, Q/R) and mouse (aim, click, right-drag, wheel)
  net.ts             WebSocket to ws://<same host>/ws
src/main.ts          Lobby (name + overalls colour remembered in localStorage `guinea.name` / `.color`, a spinning random piggy), connects on load for `info`, starts Game on `welcome`
tests/core/          farm rules: feeding, garden, health checks, foxes and hawks, night, saving, a 5-minute soak that no pig gets stuck in a wall
tests/server/        Real HTTP + ws server filled to MAX_FARMERS + 1
```

## Ideas not built yet

- A barn door you can shut at night (pigs and foxes blocked)
- Water bottles to refill, hay to restock, cleaning out the hutches
- Baby pigs, pig friendships (pairs that follow each other), names you can change
- A farm diary / leaderboard of who fed and saved the most pigs
- Weather (rain sends pigs inside)

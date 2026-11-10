# Galaxy

An original 8-bit style fixed shooter for the browser, written in TypeScript.

## Getting started

```bash
npm install
npm run dev
```

Controls: arrows / WASD to move, Space / Z to fire, Enter to start.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck and production build to `dist/`
- `npm test` — unit tests (Vitest)
- `npm run lint`, `npm run typecheck`, `npm run format:check`

## Layout

- `src/engine/` — game-agnostic engine: fixed-step loop, input, screen scaling, seeded RNG, scenes
- `src/game/` — game logic and scenes
- `second-brain/` — design notes and task pipeline (Russian)

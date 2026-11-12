# План реализации: Тестовые хуки для браузерного QA-агента

Dev-инструмент для агента `tester` (`/qa`): параметры `?seed=N`, `?paused=1`, `?lives=N`
и объект `window.__galaxy` (`step`, `press/release`, `pause/resume`, `state`), через который
игра управляется детерминированно и читается как JSON. Всё — только при
`import.meta.env.DEV`; модуль хуков подключается динамическим `import()` внутри DEV-ветки и в
прод-бандл не попадает. Движок получает только общую паузу цикла и список действий ввода;
снимок состояния и знание о сценах — в `src/game/`.

## Решения (владелец и план)

Ответы владельца на вопросы analyze:

1. **`?lives=N` входит в задачу** (вариант а). Целое 1…`MAX_LIVES` (5), иначе параметр
   игнорируется (`START_LIVES`). Протягивается `TitleScene` → `PlayScene` → `Battle`
   (`BattleOptions.lives` уже есть) и сохраняется при возврате на титул после game over.
   Цель — проверка логики жизней (гибель, возрождение, бонус `L`, максимум 5, +500 на
   пределе, game over).
2. **`step(n)` без паузы разрешён**, режим не меняется (вариант а): тики `step` идут
   синхронно между кадрами rAF и смешиваются с ними. Описано в документации хуков.

Решено на plan (делегировано):

3. **Сценарии (`?scenario=…`) и сеттеры состояния** (`setLives`, «поставить астероид») — вне
   задачи; кандидат на отдельную задачу по итогам первых прогонов `/qa`.
4. **`blur`**: клавиши, зажатые через `press`, переживают потерю фокуса **в `step`** — хук
   хранит свой набор зажатых действий и перед каждым тиком `step` восстанавливает их через
   `input.press(action, true)` (`repeat = true` ставит `held`, но не `justPressed`, т.е.
   лишнего «нажатия» и выстрела не будет). В режиме без паузы (тики от rAF) восстановления
   нет — это задокументировано: после `blur` нужно повторить `press`.
5. **Имена клавиш** — только игровые действия `Action`: `left / right / up / down / fire /
start`; неизвестное имя → `TypeError` со списком допустимых. `KeyboardEvent.code` не
   принимаем (меньше кода, одна таблица имён).
6. **`paused`** — включено только при значении ровно `1`.
7. **`seed`** — только десятичные цифры, целое `0 … 2^32 − 1` (иначе разные seed давали бы один
   и тот же поток из-за `seed >>> 0` в `createRng`); иначе `null` → `Date.now()`.
8. **`step(n)`**: `n` по умолчанию 1; не целое или `< 1` → `RangeError` (не молчаливый no-op,
   чтобы ошибка агента была видна). Возвращает снимок `state()` после тиков — агент получает
   результат одним вызовом. Рисует кадр один раз в конце.
9. **Враги в снимке**: `dead` исключены из `list`; `exploding` — в списке (видно взрыв);
   `alive` — число врагов с `isAlive` (строй + полёт, без взрывающихся).
10. **Счётчик `tick`** в снимке — число тиков симуляции с загрузки страницы (и от rAF, и от
    `step`), ведёт `main.ts`.

## 1. Список действий ввода

**Файл (изменить):** `src/engine/input.ts`

Нужен рантайм-список действий для проверки имени в `press/release`. Выводим тип из массива,
чтобы список и тип не разошлись. Остальное в `Input` не меняется.

```typescript
/** All game actions; the order is for messages only. */
export const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'start'] as const;
export type Action = (typeof ACTIONS)[number];
```

## 2. Пауза игрового цикла

**Файл (изменить):** `src/engine/loop.ts`

Общий механизм движка «кадры идут, тики — нет». В паузе кадр только рисует, накопитель
сбрасывается; после `resume()` первый кадр считается с нуля (`lastTime = null`) — рывка
накопленного времени нет. Стартовать сразу в паузе — через опцию конструктора, чтобы с
`?paused=1` ни один кадр не дал тиков.

```typescript
export interface LoopOptions {
  /** Start paused: frames render, no ticks until resume(). */
  readonly paused?: boolean;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;
  private isPaused: boolean;

  constructor(
    private readonly tickSeconds: number,
    private readonly callbacks: LoopCallbacks,
    opts: LoopOptions = {},
  ) {
    this.isPaused = opts.paused ?? false;
  }

  /** Paused: frames keep rendering, the simulation does not advance by itself. */
  get paused(): boolean {
    return this.isPaused;
  }

  pause(): void {
    this.isPaused = true;
    this.accumulator = 0;
  }

  /** Time spent paused is dropped: the first frame after resume() runs no ticks. */
  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.accumulator = 0;
    this.lastTime = null;
  }

  private readonly frame = (time: number): void => {
    if (this.isPaused) {
      this.lastTime = time;
      this.callbacks.render();
      this.rafId = requestAnimationFrame(this.frame);
      return;
    }
    // ... as before
  };
}
```

## 3. Разбор dev-параметров

**Файл (создать):** `src/game/dev-params.ts`

Чистая функция от строки `location.search`. `?level` — существующий `parseStartLevel`
(без изменений). `MAX_LIVES` — из `player.ts`.

```typescript
import { parseStartLevel } from './levels';
import { MAX_LIVES } from './player';

/** Dev-only URL parameters (see second-brain/architecture/dev-hooks.md). */
export interface DevParams {
  /** ?seed=N: integer 0..2^32-1; null = Date.now(). */
  readonly seed: number | null;
  /** ?paused=1: the loop starts paused, ticks only via __galaxy.step(). */
  readonly paused: boolean;
  /** ?level=N, parseStartLevel; undefined in production. */
  readonly startLevel: number | undefined;
  /** ?lives=N: integer 1..MAX_LIVES; undefined = START_LIVES. */
  readonly lives: number | undefined;
}

/** What production uses: no parameters are read. */
export const NO_DEV_PARAMS: DevParams = {
  seed: null,
  paused: false,
  startLevel: undefined,
  lives: undefined,
};

const MAX_SEED = 2 ** 32 - 1;

/** Plain decimal integer in min..max, otherwise null. */
function parseIntIn(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function parseDevParams(search: string): DevParams {
  const q = new URLSearchParams(search);
  return {
    seed: parseIntIn(q.get('seed'), 0, MAX_SEED),
    paused: q.get('paused') === '1',
    startLevel: parseStartLevel(q.get('level')),
    lives: parseIntIn(q.get('lives'), 1, MAX_LIVES) ?? undefined,
  };
}
```

## 4. Протянуть стартовые жизни через титул

**Файл (изменить):** `src/game/scenes/title-scene.ts`

Второй параметр `startLevel?: number` заменить на объект параметров партии — он же
передаётся в `PlayScene` и в фабрику `exit` (сохраняется после game over).

```typescript
import type { BattleOptions } from '../battle';

/** How a new game starts: level and lives (dev builds pass ?level / ?lives). */
export type GameStart = Pick<BattleOptions, 'startLevel' | 'lives'>;

constructor(
  private readonly rng: Rng,
  /** undefined fields = level 1, START_LIVES. */
  private readonly start: GameStart = {},
  starfield?: Starfield,
) { ... }

// in update():
const exit = (): Scene => new TitleScene(this.rng, this.start, this.starfield);
return new PlayScene(this.rng, this.starfield, { ...this.start }, exit);
```

**Файл (изменить):** `src/game/scenes/title-scene.test.ts` — вызовы
`new TitleScene(createRng(1), 2)` (2 места) → `new TitleScene(createRng(1), { startLevel: 2 })`;
`new TitleScene(createRng(1), undefined, sf)` остаётся как есть. Новый тест — см. шаг 8.

`PlayScene` и `Battle` не меняются (`{ ...opts, bonuses }` уже пробрасывает `lives`).

## 5. Снимок состояния

**Файл (создать):** `src/game/dev-snapshot.ts`

Чистые функции `Scene → plain-объект` (только примитивы, массивы, объекты; координаты —
сырые, дробные бывают). Читает только публичные геттеры, код фичи 006 не меняется.

```typescript
import type { Scene } from '../engine/scene';
import type { BattlePhase } from './battle';
import type { Battle } from './battle';
// ... import type для EnemyKind, EnemyState, ShipState, BonusKind, AsteroidState
import { PlayScene } from './scenes/play-scene';
import { TitleScene } from './scenes/title-scene';

export type SnapshotSceneName = 'title' | 'play' | 'over' | 'unknown';

export interface GalaxySnapshot {
  /** Simulation ticks since page load (rAF and step). */
  readonly tick: number;
  readonly paused: boolean;
  /** 'over' = PlayScene with battle.phase === 'over' (game over is not a scene). */
  readonly scene: SnapshotSceneName;
  /** null on the title. */
  readonly battle: BattleSnapshot | null;
}

export interface BattleSnapshot {
  readonly level: number;
  readonly phase: BattlePhase;
  readonly phaseTicks: number;
  readonly score: number;
  readonly lives: number;
  readonly player: {
    x: number;
    y: number;
    state: ShipState;
    stateTicks: number;
    canBeHit: boolean;
    isLost: boolean;
    maxShots: number;
    powerUps: { fastShot: boolean; doubleShot: boolean };
    shots: { x: number; y: number; speed: number }[];
  };
  readonly enemies: {
    /** formation + diving + returning (exploding is not alive). */
    alive: number;
    /** Every enemy except 'dead'. */
    list: {
      kind: EnemyKind;
      row: number;
      col: number;
      state: EnemyState;
      stateTicks: number;
      x: number;
      y: number;
    }[];
    shots: { x: number; y: number }[];
  };
  /** null when the battle has no bonus field (never in PlayScene). */
  readonly bonuses: {
    asteroid: {
      x: number;
      y: number;
      dir: -1 | 1;
      bonus: BonusKind;
      state: AsteroidState;
      stateTicks: number;
    } | null;
    capsule: { kind: BonusKind; x: number; y: number } | null;
    spawnTick: number | null;
    levelTicks: number;
  } | null;
}

export function snapshotBattle(battle: Battle): BattleSnapshot {
  /* map getters */
}

export function snapshotScene(
  scene: Scene,
  meta: { readonly tick: number; readonly paused: boolean },
): GalaxySnapshot {
  if (scene instanceof PlayScene) {
    const battle = snapshotBattle(scene.battle);
    return { ...meta, scene: battle.phase === 'over' ? 'over' : 'play', battle };
  }
  return { ...meta, scene: scene instanceof TitleScene ? 'title' : 'unknown', battle: null };
}
```

`powerUps` копируется (`{ ...player.powerUps }`), массивы — новые (`map`), чтобы снимок не
держал ссылок на живые объекты.

## 6. Объект `__galaxy`

**Файл (создать):** `src/game/dev-hooks.ts`

Собирается из зависимостей, которые даёт `main.ts`; `window` не трогает — тестируется в node.
Глобальный тип `window.__galaxy` объявлен здесь.

```typescript
import type { Action, Input } from '../engine/input';
import { ACTIONS } from '../engine/input';
import type { Scene } from '../engine/scene';
import type { GalaxySnapshot } from './dev-snapshot';
import { snapshotScene } from './dev-snapshot';

/** What the loop exposes; GameLoop fits it structurally. */
export interface LoopControl {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
}

export interface DevHookDeps {
  /** One simulation tick exactly as the loop runs it (update -> scene switch -> endTick). */
  tick(): void;
  render(): void;
  readonly input: Input;
  readonly loop: LoopControl;
  getScene(): Scene;
  getTicks(): number;
}

export interface GalaxyDevHooks {
  /** Runs n >= 1 ticks synchronously, renders once, returns state(). */
  step(n?: number): GalaxySnapshot;
  /** Holds an action (left/right/up/down/fire/start) until release(). */
  press(action: string): void;
  release(action: string): void;
  pause(): void;
  resume(): void;
  state(): GalaxySnapshot;
  /** Accepted action names. */
  readonly actions: readonly Action[];
}

declare global {
  interface Window {
    /** Dev builds only (import.meta.env.DEV). */
    __galaxy?: GalaxyDevHooks;
  }
}

function toAction(name: string): Action {
  if ((ACTIONS as readonly string[]).includes(name)) return name as Action;
  throw new TypeError(`Unknown action "${name}", expected one of: ${ACTIONS.join(', ')}`);
}

export function createDevHooks(deps: DevHookDeps): GalaxyDevHooks {
  /** Actions held through press(): restored before every step tick (window blur clears input). */
  const held = new Set<Action>();
  const state = (): GalaxySnapshot =>
    snapshotScene(deps.getScene(), { tick: deps.getTicks(), paused: deps.loop.paused });
  return {
    step(n = 1) {
      if (!Number.isInteger(n) || n < 1)
        throw new RangeError(`step(n): n must be an integer >= 1, got ${n}`);
      for (let i = 0; i < n; i++) {
        // repeat = true: back to held without a new "pressed" (no extra shot after a blur).
        for (const action of held) deps.input.press(action, true);
        deps.tick();
      }
      deps.render();
      return state();
    },
    press(name) {
      const action = toAction(name);
      held.add(action);
      deps.input.press(action);
    },
    release(name) {
      const action = toAction(name);
      held.delete(action);
      deps.input.release(action);
    },
    pause: () => deps.loop.pause(),
    resume: () => deps.loop.resume(),
    state,
    actions: ACTIONS,
  };
}
```

## 7. Точка входа

**Файл (изменить):** `src/main.ts`

- Параметры: `const params = import.meta.env.DEV ? parseDevParams(window.location.search) : NO_DEV_PARAMS;`
  (заменяет текущий разбор `?level`; `parseStartLevel` теперь зовёт `dev-params`).
- `createRng(params.seed ?? Date.now())`.
- `new TitleScene(rng, { startLevel: params.startLevel, lives: params.lives })`.
- Тело тика — в функцию `tick()`, её зовут и цикл, и `step`; счётчик `ticks`.
- `GameLoop` — с `{ paused: params.paused }`.
- В DEV — динамический импорт хуков (Vite подставляет `false` в прод-сборке, ветка и чанк
  вырезаются).

```typescript
const params = import.meta.env.DEV ? parseDevParams(window.location.search) : NO_DEV_PARAMS;
const rng = createRng(params.seed ?? Date.now());
let scene: Scene = new TitleScene(rng, { startLevel: params.startLevel, lives: params.lives });
let ticks = 0;

/** One fixed tick: update -> switch scene -> endTick (the order matters for `pressed`). */
function tick(): void {
  const next = scene.update(TICK_SECONDS, input);
  if (next) scene = next;
  input.endTick();
  ticks++;
}

function render(): void {
  scene.render(ctx);
}

const loop = new GameLoop(TICK_SECONDS, { update: tick, render }, { paused: params.paused });
loop.start();

// Dev only: window.__galaxy for the QA agent (second-brain/architecture/dev-hooks.md).
if (import.meta.env.DEV) {
  import('./game/dev-hooks')
    .then(({ createDevHooks }) => {
      window.__galaxy = createDevHooks({
        tick,
        render,
        input,
        loop,
        getScene: () => scene,
        getTicks: () => ticks,
      });
    })
    .catch((err: unknown) => console.error('dev hooks failed to load', err));
}
```

`update: tick` — `LoopCallbacks.update(tickSeconds)` принимает аргумент, функция без
параметров ему совместима; `tick` использует `TICK_SECONDS` — то же значение. `NO_DEV_PARAMS`
в прод-бандле — один объект-константа, кода снимка/хуков там нет. Хуки появляются
асинхронно (после загрузки модуля), но цикл уже стоит в паузе — тиков до них нет.

## 8. Тесты

Vitest, environment `node`.

**Файл (создать):** `src/game/dev-params.test.ts`

- Пустая строка → `{ seed: null, paused: false, startLevel: 1, lives: undefined }`.
- `seed`: `1` → 1, `0` → 0, `4294967295` → 4294967295; `4294967296`, `-1`, `1.5`, `abc`,
  `0x10`, `''`, `99999999999999999999` → `null`.
- `paused`: `1` → true; нет / `0` / `true` / `''` → false.
- `lives`: `1`, `5` → число; `0`, `6`, `-1`, `2.5`, `x` → undefined.
- Комбинация `?seed=7&paused=1&level=3&lives=5` → все четыре поля; `level` — по
  `parseStartLevel` (`?level=0` → 1).
- `NO_DEV_PARAMS` — `seed: null`, `paused: false`, `startLevel`/`lives` undefined.

**Файл (создать):** `src/game/dev-snapshot.test.ts`

- `TitleScene` → `scene: 'title'`, `battle: null`, `tick`/`paused` из `meta`.
- `new PlayScene(createRng(1))` → `scene: 'play'`, `level 1`, `phase 'playing'`, `score 0`,
  `lives 3`, `enemies.alive 28`, `list.length 28`, `player.state 'active'`, `player.y 208`,
  `powerUps` оба false, `shots []`, `bonuses` не `null`, `asteroid`/`capsule` `null`,
  `spawnTick` в окне 300…900.
- После `scene.battle.player.hit()` + тик → `lives 2`, `player.state 'down'`.
- `lives: 1` + `hit()` + `GAME_OVER_DELAY_TICKS` тиков → `scene: 'over'`, `phase 'over'`.
- Выстрел игрока (`press('fire')` + тик) → `player.shots` длины 1 с `x/y/speed`.
- Убитый враг (через `test-levels` с одним врагом или прогон взрыва) — после `dead` не в `list`,
  `alive` уменьшился.
- Астероид: на `PlayScene` (окно появления в ней фиксированное) прогнать тики до
  `bonuses.spawnTick` (корабль не трогать; при необходимости `ONE_CORNER_ENEMY` из
  `test-levels`, чтобы враги не мешали) → `asteroid` с `bonus` из `BONUS_KINDS`,
  `state 'flying'`, `dir` ±1.
- `JSON.parse(JSON.stringify(s))` равен `s` (на title и на play с астероидом).
- Снимок не меняется после следующих тиков (копии, не ссылки) — сравнить сохранённый
  `JSON.stringify` со снимком после `step`.

**Файл (создать):** `src/game/dev-hooks.test.ts`

- На фейках (`tick`/`render` — `vi.fn()`, `loop` — объект с флагом): `step(5)` → `tick` 5 раз,
  `render` 1 раз; `step()` → 1 тик; `step(0)`, `step(-1)`, `step(1.5)`, `step(NaN)` →
  `RangeError`, `tick` не вызван.
- `press('jump')` / `release('Space')` → `TypeError`; `actions` равен `ACTIONS`.
- `pause()` / `resume()` проксируются в `loop`; `state().paused` отражает `loop.paused`.
- На настоящих объектах (вспомогательная сборка: `Input`, `scene` в замыкании, `tick` как в
  `main.ts`): `press('start')`, `step(1)` на `TitleScene` → `state().scene === 'play'`;
  `step` возвращает тот же снимок, что `state()`.
- `press('fire')`, `step(1)` → 1 выстрел; ещё `step(1)` при зажатом `fire` → всё ещё 1
  (нет автоогня); `release('fire')`, `press('fire')`, `step(1)` → 2 выстрела.
- **blur**: `press('right')`, затем `input.release('right')` (имитация очистки `held` по
  `blur`), `step(10)` → корабль сдвинулся вправо на 10 шагов; `press('fire')`, «blur»,
  `step(5)` → выстрел один (повторного нажатия нет).
- **Детерминизм**: две независимые сборки с `createRng(42)` и одинаковой последовательностью
  (`step(30)`, `press('start')`, `step(1)`, `release('start')`, `press('left')`, `step(300)`)
  → равные `state()`; сборка с `step(31)` перед Enter → в общем случае другой бой (не
  проверять неравенство строго — только равенство одинаковых последовательностей).
- `tick` в снимке растёт на `n` после `step(n)`.

Вспомогательная сборка «как main.ts» — локальная функция в `dev-hooks.test.ts` (не новый
общий модуль).

**Файл (изменить):** `src/engine/loop.test.ts` — тесты `GameLoop` с подменой
`requestAnimationFrame`/`cancelAnimationFrame` через `vi.stubGlobal` (в `afterEach` —
`vi.unstubAllGlobals()`); вызывать сохранённый колбэк кадра вручную со временем:

- без паузы: кадры 0, 1000/60, 2000/60 → `update` 2 раза, `render` 3 раза;
- `{ paused: true }`: много кадров (в т.ч. с большим шагом времени) → `update` 0, `render`
  на каждый кадр; `paused === true`;
- `resume()` после паузы в 10 с: следующий кадр — 0 тиков, кадр через 1/60 с — 1 тик;
- `pause()` посреди работы с остатком в накопителе → после `resume()` остаток не даёт тик;
- `resume()` без паузы — без эффекта.

**Файл (изменить):** `src/game/scenes/title-scene.test.ts`

- `new TitleScene(createRng(1), { lives: 1 })` + Enter → `battle.player.lives === 1`;
  после game over и возврата на титул новая игра — снова 1 жизнь.
- `{ startLevel: 2, lives: 5 }` → уровень 2, 5 жизней.

## 9. Ручная проверка

`npm run dev`, открыть `http://localhost:5173/?seed=1&paused=1`:

- титул стоит («PRESS ENTER» не мигает), в консоли `__galaxy.state()` → `scene: 'title'`,
  `tick: 0`;
- `__galaxy.step(60)` → `tick: 60`, надпись сменила фазу мигания; `press('start'); step(1);
release('start')` → бой на экране, `scene: 'play'`;
- перезагрузить страницу, повторить те же команды → `JSON.stringify(state())` совпадает;
- `__galaxy.resume()` → игра пошла в реальном времени без рывка; `pause()` → встала;
- `?seed=1&paused=1&lives=1&level=3` → в бою 1 жизнь, уровень 3;
- `press('right')`, переключиться на другую вкладку и вернуться, `step(30)` → корабль едет;
- `npm run build`, затем `grep -l "__galaxy\|createDevHooks\|snapshotScene" dist/assets/*.js` —
  пусто; `npm run preview` — игра работает, `window.__galaxy` нет, `?seed`/`?paused`
  игнорируются.

## 10. Обновление документации

**Файл (создать):** `second-brain/architecture/dev-hooks.md` (на русском) — инструкция для
тестировщика:

- параметры URL (`seed`, `paused`, `level`, `lives`): формат, допустимые значения, что при
  некорректном; комбинируются;
- API `window.__galaxy`: `step(n = 1)` (синхронно, рисует один кадр, возвращает снимок,
  `RangeError` на некорректном `n`), `press/release` (имена действий, `TypeError` на
  неизвестное; `pressed` срабатывает только в тик нажатия — для повторного выстрела
  `release` + `press`; если клавиша уже зажата, `press` нового нажатия не даёт),
  `pause/resume`, `state()`, `actions`;
- хуки появляются асинхронно после загрузки страницы — ждать `window.__galaxy`;
- состав снимка с описанием полей; `scene: 'over'` — это `PlayScene` с `phase === 'over'`;
  координаты сырые, бывают дробные (покачивание строя, дрейф астероида, пике по 1/2 px),
  на экране — `Math.floor`; `dead`-враги не в списке;
- **детерминизм**: seed воспроизводим только вместе с `paused=1` и той же
  последовательностью `step`/`press`/`release` — звёзды титула тратят общий `rng`, а seed
  боя берётся из него в момент Enter, поэтому число тиков до Enter влияет на бой; без
  паузы rAF добавляет тики между командами;
- **`step` без паузы** разрешён: тики `step` смешиваются с тиками rAF, `tick` в снимке
  считает оба; для воспроизводимых кейсов — только с паузой;
- **`blur`**: в `step` зажатые через `press` клавиши восстанавливаются перед каждым тиком; в
  режиме `resume()` потеря фокуса вкладки отпускает их — повторить `press`;
- полезные константы (`DOWN_TICKS 60`, `INVULNERABLE_TICKS 120`, `GAME_OVER_DELAY_TICKS 60`,
  `LEVEL_PAUSE_TICKS 90`, `MAX_LIVES 5`, `BONUS_FALLBACK_POINTS 500`, окно астероида 300…900
  тиков уровня, `EXTRA_LIFE_FIRST 5000`) и типовой рецепт кейса «жизни» (`?lives=5`, поймать
  `L` → +500; `?lives=1` → быстрый game over);
- в прод-сборке ничего этого нет.

**Файл (изменить):** `second-brain/architecture/overview.md`

- Движок: `loop.ts` — `GameLoop(tickSeconds, callbacks, { paused? })`, `pause()/resume()`,
  `paused`; `input.ts` — `ACTIONS`.
- Игра: `TitleScene(rng, start?: GameStart, starfield?)` вместо `startLevel?`, передача
  `{ startLevel, lives }` в `PlayScene` и в `exit`.
- Точка входа: `parseDevParams` (`seed/paused/level/lives`), функция `tick()`, счётчик тиков,
  динамический импорт `dev-hooks` в DEV; ссылка на `dev-hooks.md`.
- Новые модули `dev-params.ts`, `dev-snapshot.ts`, `dev-hooks.ts`; граф зависимостей
  (`main → … game/dev-params`; `dev-hooks → {engine/input, dev-snapshot}`;
  `dev-snapshot → {scenes/play-scene, scenes/title-scene}` + type-импорты).

**Файл (изменить):** `.claude/agents/tester.md` — в «Как управлять игрой» добавить ссылку на
`second-brain/architecture/dev-hooks.md`, имена действий (`left/right/up/down/fire/start`),
параметр `lives`, оговорку про детерминизм (`paused=1` + та же последовательность `step`).

## Сводка по файлам

| Действие | Файл                                     |
| -------- | ---------------------------------------- |
| Изменить | `src/engine/input.ts`                    |
| Изменить | `src/engine/loop.ts`                     |
| Изменить | `src/engine/loop.test.ts`                |
| Создать  | `src/game/dev-params.ts`                 |
| Создать  | `src/game/dev-params.test.ts`            |
| Создать  | `src/game/dev-snapshot.ts`               |
| Создать  | `src/game/dev-snapshot.test.ts`          |
| Создать  | `src/game/dev-hooks.ts`                  |
| Создать  | `src/game/dev-hooks.test.ts`             |
| Изменить | `src/game/scenes/title-scene.ts`         |
| Изменить | `src/game/scenes/title-scene.test.ts`    |
| Изменить | `src/main.ts`                            |
| Создать  | `second-brain/architecture/dev-hooks.md` |
| Изменить | `second-brain/architecture/overview.md`  |
| Изменить | `.claude/agents/tester.md`               |

Код фичи 006 (`battle.ts`, `player.ts`, `bonus-field.ts`, `asteroid.ts`, `capsule.ts` и др.)
не меняется — снимок только читает публичные геттеры.

## Архитектура и паттерны

- **Граница engine/game**: движок получает только общие механизмы — паузу цикла и список
  `ACTIONS`; знание о сценах, `Battle` и формат снимка — в `src/game/`.
- **Один путь тика**: `tick()` в `main.ts` используют и `GameLoop`, и `step` — порядок
  `update → смена сцены → endTick` не расходится (как `scene-test-utils.step`).
- **Чистая логика отдельно от DOM**: `parseDevParams(search)`, `snapshotScene(scene, meta)`,
  `createDevHooks(deps)` — без `window`, тестируются в node; на `window` ставит только
  `main.ts`.
- **Детерминизм**: seed снаружи, время — только тики; пауза без рывка после `resume()`.
- **Прод-сборка**: DEV-ветка с динамическим `import()` вырезается Vite; проверка grep по
  `dist/`.
- `import type` для типов; ошибки агента (имя действия, `n`) — исключения, не молчание.

## Открытые вопросы

Вопросы analyze закрыты (см. «Решения»). Остаётся вне задачи — предложить отдельную задачу
после первых прогонов `/qa`:

- готовые сценарии (`?scenario=…`) и сеттеры состояния (`setLives`, «поставить астероид»,
  `setScore`);
- восстановление зажатых `press`-клавиш после `blur` в режиме `resume()` (сейчас только
  задокументировано).

## Ссылки

- `second-brain/tasks/tasks/029-dev-test-hooks/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/003-slow-speeds-tick-timers.md`, `004-half-pixel-dive.md`
- `.claude/agents/tester.md`, `.claude/skills/qa/SKILL.md`
- `src/main.ts`, `src/engine/loop.ts`, `src/engine/input.ts`, `src/game/scenes/title-scene.ts`,
  `src/game/scenes/play-scene.ts`, `src/game/battle.ts`, `src/game/levels.ts`

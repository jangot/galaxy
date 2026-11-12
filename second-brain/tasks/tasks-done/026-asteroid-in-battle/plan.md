# План реализации: Астероид в бою

Подключить готовую модель астероида (`BonusField`, `Asteroid`, задача 025) к бою: раз за
уровень астероид падает наискосок, выстрел игрока его сбивает, к счёту добавляется
`asteroidPoints(level)`. Капсулы нет (027): `collected` всегда `null`. Бой без
`opts.bonuses` работает как раньше, `rng` боя и сцены не получает новых вызовов.

Рамка — `analyze.md` этой задачи и `design.md` фичи 006 (пункт 2б, «Поток тика»,
«Рендер», «Интерфейсы»); вопрос В1 из analyze закрыт архитектором (`discussion.md`,
«Реализация: задача 026-asteroid-in-battle», вариант (а)) — правки `overview.md` вошли
в шаг 10.

## 1. Спрайт астероида

**Файл (создать):** `src/game/bonus-art.ts`

Новый модуль арта бонусов (по образцу `enemy-art.ts`); в 027 сюда же лягут
`CAPSULE_SPRITES`. Рисунок оригинальный: неровный каменный ком 12×12, свет слева сверху,
тень и кратеры справа снизу. Цвета — серо-коричневые, не белые (`SHOT_COLOR = '#ffffff'`)
и не `ENEMY_SHOT_COLOR`, чтобы выстрелы поверх читались.

```typescript
import { parseSprite, type Sprite } from './sprite';

/**
 * Asteroid, 12×12: a lumpy grey-brown rock, lit from the top left, craters at the bottom right.
 * Its size is the asteroid hitbox (ASTEROID_SIZE), see bonus-art.test.ts.
 */
export const ASTEROID_SPRITE: Sprite = parseSprite(
  [
    '....LLLR....',
    '..LLRRRRRR..',
    '.LRRRRDDRRR.',
    '.LRRRDDDRRD.',
    'LRRRRRDRRRRD',
    'LRDDRRRRRRRD',
    'RRDDDRRRRRDD',
    'RRRDRRRRDDRD',
    '.RRRRRRRDDD.',
    '.DRRRRRRRRD.',
    '..DDRRRRDD..',
    '....DDDD....',
  ],
  {
    L: '#c9b59a', // lit edge
    R: '#8a7560', // rock
    D: '#5a4a3c', // shade, craters
  },
);
```

Вид — на глаз в `/do` (можно подправить рисунок/палитру, не меняя размер 12×12).

**Файл (изменить):** `src/game/asteroid.ts` — комментарий `ASTEROID_SIZE`:

```typescript
/** Hitbox side, px. Equals the sprite size (ASTEROID_SPRITE, checked in bonus-art.test.ts). */
```

## 2. Бонусные коллизии

**Файл (изменить):** `src/game/collisions.ts`

Импорты — только типы (цикла нет: `bonus-field` не импортирует `collisions`):

```typescript
import type { BonusKind } from './bonus';
import type { BonusField } from './bonus-field';
```

Новый интерфейс и функция (после `resolveCollisions`, соседний код не трогать):

```typescript
/** What resolveBonusCollisions did this tick. */
export interface BonusEvents {
  /** A player shot broke the flying asteroid. */
  readonly asteroidBroken: boolean;
  /** The bonus caught by the ship; always null until capsules exist (task 027). */
  readonly collected: BonusKind | null;
}

/**
 * Bonus things vs the player, after resolveCollisions in the same tick (enemies first: a shot
 * that killed an enemy is already removed). Runs in 'playing' and 'cleared'.
 * While the asteroid is flying, the first shot in player.shots order that overlaps it is
 * removed and the asteroid is hit; at most one hit a tick (it is exploding afterwards, a later
 * shot flies on). The ship, enemies and enemy shots never interact with the asteroid.
 */
export function resolveBonusCollisions(player: Player, field: BonusField): BonusEvents {
  return { asteroidBroken: hitAsteroid(player, field), collected: null };
}

function hitAsteroid(player: Player, field: BonusField): boolean {
  const { asteroid } = field;
  if (asteroid === null || asteroid.state !== 'flying') return false;
  for (const shot of player.shots) {
    const shotRect: Rect = { x: shot.x, y: shot.y, width: SHOT_WIDTH, height: SHOT_HEIGHT };
    if (!overlaps(shotRect, asteroid)) continue;
    player.removeShot(shot);
    return field.hitAsteroid();
  }
  return false;
}
```

`Asteroid` подходит под `Rect` структурно (`x`, `y`, `width`, `height`) — импорт
`asteroid.ts` не нужен.

## 3. Поле бонусов в бою

**Файл (изменить):** `src/game/battle.ts`

Импорты:

```typescript
import { BonusField } from './bonus-field';
import { resolveBonusCollisions, resolveCollisions } from './collisions';
import { asteroidPoints, extraLivesEarned, killPoints } from './score';
```

Опции:

```typescript
export interface BonusOptions {
  /** The bonus field's own generator: never shifts the wave's dive choices. */
  readonly rng: Rng;
}

export interface BattleOptions {
  // ...startLevel, levels, lives as now
  /** Asteroids and bonuses; absent = none (old tests, test tables). PlayScene always passes it. */
  readonly bonuses?: BonusOptions;
}
```

Поле, конструктор, геттер (окно появления — всегда умолчание `ASTEROID_SPAWN_WINDOW`):

```typescript
private readonly bonusField: BonusField | null;

constructor(private readonly rng: Rng, opts: BattleOptions = {}) {
  this.player = new Player(undefined, opts.lives ?? START_LIVES);
  this.levels = opts.levels;
  this.currentLevel = opts.startLevel ?? 1;
  this.currentWave = this.createWave();
  // Only the bonus rng is called here: the battle rng sees the same calls as without bonuses.
  this.bonusField = opts.bonuses ? new BonusField(opts.bonuses.rng) : null;
  this.bonusField?.startLevel();
}

/** The asteroid field; null when opts.bonuses is absent. For the renderer and tests. */
get bonuses(): BonusField | null {
  return this.bonusField;
}
```

`update` — шаги 3 и 5 по «Потоку тика» дизайна; фаза для шагов 3–5 — на начало тика
(до `updatePhase` она не меняется):

```typescript
/**
 * Tick order: player -> wave (aims at the ship's center of this tick, null while the ship
 * is down) -> bonus field (moves; counts the level tick and spawns only in playing) ->
 * enemy collisions and scoring (playing only) -> bonus collisions and asteroid points
 * (playing and cleared; enemies go first, so a shot that killed an enemy cannot hit the
 * asteroid) -> phase. In over nothing collides; points use the level of this tick.
 */
update(dt: number, intent: PlayerIntent): void {
  this.player.update(dt, intent);
  // ...targetX, wave.update as now
  this.bonusField?.update(dt, this.currentPhase === 'playing');
  if (this.currentPhase === 'playing') {
    for (const kill of resolveCollisions(this.player, this.currentWave)) {
      this.addScore(killPoints(kill, this.currentLevel));
    }
  }
  if (this.bonusField && this.currentPhase !== 'over') {
    // collected is always null until capsules exist (task 027).
    const { asteroidBroken } = resolveBonusCollisions(this.player, this.bonusField);
    if (asteroidBroken) this.addScore(asteroidPoints(this.currentLevel));
  }
  this.updatePhase();
}
```

`updatePhase`, переход `cleared → playing` — новый уровень поля после новой волны:

```typescript
if (this.ticksInPhase === LEVEL_PAUSE_TICKS) {
  this.currentLevel++;
  this.currentWave = this.createWave();
  this.bonusField?.startLevel();
  this.enterPhase('playing');
}
```

Комментарии-контракты:

- `score`: `/** Integer >= 0, starts at 0; grows by kills during 'playing' and by a shot-down
asteroid (asteroidPoints) during 'playing' or 'cleared'. */`
- класс-док `Battle`: добавить строку «Optional bonus field (opts.bonuses, own rng): one
  asteroid per level, worth asteroidPoints when shot down; a new level draws its spawn
  tick.»; в формулу фаз — без изменений.
- `addScore`: «Runs after resolveCollisions» → «Runs after resolveCollisions (asteroid
  points after the kills of the tick)»; правило «extra life in down at 0 lives cancels
  over» действует и для очков за астероид в `cleared` — отдельной оговорки не нужно, это
  то же правило.
- док `updatePhase`, пункт 3: «cleared -> playing with the next level's wave (and the
  bonus field's next level) …».

## 4. Рендер астероида

**Файл (изменить):** `src/game/battle-render.ts`

```typescript
import type { Asteroid } from './asteroid';
import { ASTEROID_SPRITE } from './bonus-art';

/**
 * Draws the battle entities, back to front: the asteroid, enemy shots, player shots (in
 * shots order), enemies, ship. The asteroid is the back layer: every shot, enemy and the
 * ship are drawn over it (it is harmless and passes behind them).
 * ...rest as now
 */
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const asteroid = battle.bonuses?.asteroid;
  if (asteroid) drawAsteroid(ctx, asteroid);
  // ...enemy shots, player shots, enemies, ship as now
}

/** flying: sprite; exploding: the frame for stateTicks, centered in it; gone: nothing. */
function drawAsteroid(ctx: CanvasRenderingContext2D, asteroid: Asteroid): void {
  const x = Math.floor(asteroid.x);
  const y = Math.floor(asteroid.y);
  if (asteroid.state === 'flying') {
    drawSprite(ctx, ASTEROID_SPRITE, x, y);
  } else if (asteroid.state === 'exploding') {
    drawExplosion(ctx, asteroid.stateTicks, x, y, asteroid.width, asteroid.height);
  }
}
```

Кадр 0 взрыва (11×9) центрируется в 12×12, кадр 1 (13×9) выступает на пиксель влево —
как у узких врагов («May stick out by a pixel»).

## 5. Seed бонусов в сцене

**Файл (изменить):** `src/game/scenes/play-scene.ts`

```typescript
/** Mixed into the battle seed for the bonus field's generator; the scene rng is not touched. */
const BONUS_SEED_SALT = 0x9e3779b9;

/**
 * Pass the title's starfield to keep the stars continuous. opts go to the Battle; bonuses
 * default to a generator derived from the battle seed (a passed opts.bonuses is kept).
 * exit: where Enter leads after game over; without it the scene stays on the caption.
 */
constructor(rng: Rng, starfield?: Starfield, opts?: BattleOptions, private readonly exit?: () => Scene) {
  // Stars first, then the battle seed: the star layout for a given seed stays as before.
  this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  // The battle gets its own generator so background changes never shift enemy behavior;
  // the bonus seed is derived from it, so the scene rng makes exactly the calls it made
  // before bonuses (the stars' restarts keep their x).
  const battleSeed = Math.floor(rng() * 2 ** 32);
  this.battle = new Battle(createRng(battleSeed), {
    ...opts,
    bonuses: opts?.bonuses ?? { rng: createRng((battleSeed ^ BONUS_SEED_SALT) >>> 0) },
  });
}
```

`BONUS_SEED_SALT` не экспортируется (модульная константа по дизайну). `TitleScene`
создаёт `PlayScene` тем же конструктором — бонусы в игре включаются сами.

## 6. Тесты: спрайт

**Файл (создать):** `src/game/bonus-art.test.ts` (Vitest, environment `node`)

- `ASTEROID_SPRITE` 12×12, `width === height === ASTEROID_SIZE`;
- есть непрозрачные пиксели;
- в палитре нет `SHOT_COLOR` и `ENEMY_SHOT_COLOR` (выстрелы поверх видны).

## 7. Тесты: `resolveBonusCollisions`

**Файл (изменить):** `src/game/collisions.test.ts` — новый `describe('resolveBonusCollisions')`.

Помощник: поле с только что выпущенным астероидом (окно 1…1, заглушка `rng = 0`),
поставленным в заданную точку:

```typescript
/** A field whose asteroid has just spawned (window 1...1, rng 0), moved to (x, y). */
function fieldWithAsteroid(x: number, y: number): BonusField {
  const field = new BonusField(() => 0, { minTicks: 1, maxTicks: 1 });
  field.startLevel();
  field.update(TICK_SECONDS, true);
  const asteroid = field.asteroid!;
  asteroid.x = x;
  asteroid.y = y;
  return field;
}
```

Сценарии (выстрел из `playerWithShot(y)` — столбец 127; астероид 12×12 в `x = 122`
его накрывает, в `x = 128` — нет):

- попадание: `fieldWithAsteroid(122, 100)`, выстрел `y = 104` → `{ asteroidBroken: true,
collected: null }`, `player.shots` пуст, `asteroid.state === 'exploding'`;
- промах (астероид `x = 128`) → `{ false, null }`, выстрел на месте, астероид `flying`;
- нет астероида (`new BonusField(() => 0)` после `startLevel`, без `update`) → `{ false,
null }`, выстрел на месте;
- астероид уже `exploding` (`asteroid.hit()` заранее) → `false`, выстрел летит;
- два выстрела поверх (doubleShot, оба из столбца 127, как в «two shots over one enemy»):
  снимается только старший, младший остаётся, `asteroidBroken = true`;
- **враг в приоритете**: `wave(['D'])`, враг `x = 122, y = 98`, астероид там же, выстрел
  `y = 100`; `resolveCollisions` → одно убийство, затем `resolveBonusCollisions` →
  `asteroidBroken = false`, астероид `flying`;
- **корабль не взаимодействует**: `new Player()`, астероид на корабле (`x = ship.x`,
  `y = SHIP_Y`) → `{ false, null }`, `player.state === 'active'`, `lives === START_LIVES`.

Импорты: `BonusField` (значение), `SHIP_Y`, `START_LIVES` — при необходимости.

## 8. Тесты: бой

**Файл (изменить):** `src/game/battle.test.ts` — новый `describe('Battle asteroid')`;
существующие тесты не трогать.

Помощники:

```typescript
/** Battle with the bonus field on a stub rng: spawn tick 300, dir -1 (x = 244), BONUS_KINDS[0]. */
function bonusBattle(opts: BattleOptions = {}): Battle {
  return new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, bonuses: { rng: () => 0 }, ...opts });
}

/** Runs the passive level up to the asteroid's spawn tick; returns the asteroid. */
function spawnAsteroid(battle: Battle): Asteroid {
  run(battle, ASTEROID_SPAWN_MIN_TICKS);
  const asteroid = battle.bonuses!.asteroid;
  expect(asteroid).not.toBeNull();
  return asteroid!;
}

/** Puts the asteroid over the shot with a margin for this tick's moves (shot -4 y, asteroid +1 y, -1/2 x). */
function asteroidOverShot(asteroid: Asteroid, shot: Shot): void {
  asteroid.x = shot.x - 5;
  asteroid.y = shot.y - 10;
}
```

Сценарии:

- без `bonuses` — `battle.bonuses === null`;
- с `bonuses` — после конструктора `spawnTick === 300`, `levelTicks === 0`;
- появление: после 299 `update` астероида нет, после 300-го — есть: `x = 244`,
  `y = -ASTEROID_SIZE`, `dir = -1`, `bonus = BONUS_KINDS[0]`, `flying`;
- **`rng` боя не затронут**: `new Battle(createRng(7))` и `new Battle(createRng(7),
{ bonuses: { rng: createRng(99) } })` (таблица `LEVELS`, вылеты идут), 1200 тиков
  `IDLE` → одинаковые `[x, y, state]` врагов, `wave.shots.length`, `player.state`,
  `player.lives`, `phase`;
- **попадание через `update`**: `spawnAsteroid`, `update(FIRE)`, `asteroidOverShot`,
  `update(IDLE)` → `score === asteroidPoints(1)` (100), выстрела нет, астероид
  `exploding`;
- очки по уровню: `startLevel: 5` → `asteroidPoints(5)` (140);
- **враг в приоритете при общем тике**: после `spawnAsteroid` — `ship.x = floor(enemy.x)
  - 2`(столбец выстрела`floor(enemy.x) + 5`), `update(FIRE)`, `shot.y = enemy.y + 8`,
астероид поверх выстрела (`asteroidOverShot`), `update(IDLE)`→ враг`exploding`,
астероид `flying`, `score === killPoints({ kind: 'drone', inFlight: false }, 1)` (30);
- **корабль цел**: астероид ставится на корабль (`x = ship.x`, `y = SHIP_Y - 2`), 10 тиков
  `IDLE` → `player.state === 'active'`, жизни те же, `score === 0`, астероид `flying`;
- **в `cleared` не появляется**: `TWO_LEVELS`, враг убит в первом тике (`e.kill()`),
  `run(EXPLOSION_TICKS)` → `cleared`; `levelTicks` запомнить; `run(LEVEL_PAUSE_TICKS - 1)`
  → всё ещё `cleared`, `levelTicks` тот же, астероида нет; ещё 1 тик → уровень 2,
  `spawnTick === 300`, `levelTicks === 0`; заглушка `rng`, считающая вызовы, — ровно 2
  вызова (конструктор + новый уровень);
- **летящий переживает смену уровня**: `spawnAsteroid`, убить врага, `run(EXPLOSION_TICKS
  - LEVEL_PAUSE_TICKS)`→ уровень 2,`battle.bonuses.asteroid`— тот же объект,`flying`;
- **сбивается в `cleared` с очками**: `spawnAsteroid`, убить врага, `run(EXPLOSION_TICKS)`
  → `cleared`; `update(FIRE)`, `asteroidOverShot`, `update(IDLE)` → `score === 100`,
  фаза `cleared`;
- **в `over` попаданий нет**: `bonusBattle({ lives: 1 })`, `spawnAsteroid`, `update(FIRE)`,
  `player.hit()`, затем `GAME_OVER_DELAY_TICKS` тиков по одному с `onlyShot(...)!.y = 200`
  перед каждым (выстрел не уходит за экран) → `over`; `asteroidOverShot`, `update(IDLE)`
  → астероид `flying`, выстрел на месте, `score === 0`;
- **доп. жизнь от очков за астероид**: константа `ASTEROID_5000_LEVEL = 491`
  (`asteroidPoints(491) === 5000`, `asteroidPoints(490) === 4990` — отдельный тест, как
  `DRONE_5000_LEVEL`); `bonusBattle({ startLevel: ASTEROID_5000_LEVEL })`, сбить астероид
  → `score === 5000`, `lives === START_LIVES + 1`.

Импорты: `BattleOptions` (type), `Asteroid` (type), `ASTEROID_SIZE`,
`ASTEROID_SPAWN_MIN_TICKS`, `BONUS_KINDS`, `asteroidPoints`, `Shot` (type).

## 9. Тесты: рендер и сцена

**Файл (изменить):** `src/game/battle-render.test.ts` — новый `describe('drawBattle asteroid')`.

- Помощник `explosionCalls` расширить с `Enemy` до прямоугольника (`Rect` из
  `collisions.ts`, type) — существующие вызовы не меняются.
- Бой с бонусами (`ONE_CORNER_ENEMY`, `bonuses: { rng: () => 0 }`), 300 тиков → астероид;
  `x = 100.5, y = 50.75` → вызовы = `spriteCalls(ASTEROID_SPRITE, 100, 50)`, затем
  враги, корабль;
- до появления (бой с бонусами, 0 тиков) — вызовы как у боя без бонусов;
- `exploding` (`asteroid.hit()`) — кадр 0 по центру его прямоугольника; после
  `EXPLOSION_FRAME_TICKS` `update` — кадр 1;
- порядок: астероид раньше вражеских выстрелов, выстрела игрока, врагов, корабля —
  `battleWithEnemyShot` принимает бой параметром (`battle = newBattle()` по умолчанию);
  для боя с бонусами после появления астероида: вызовы = астероид → вражеский выстрел →
  выстрел игрока → враги → корабль.

**Файл (изменить):** `src/game/scenes/play-scene.test.ts`

- бой сцены получает поле: `scene.battle.bonuses` не `null`, `spawnTick` в
  `[ASTEROID_SPAWN_MIN_TICKS, ASTEROID_SPAWN_MAX_TICKS]`; две сцены из одного seed — один
  `spawnTick`;
- переданный `opts.bonuses` не затирается: `{ levels: ONE_CORNER_ENEMY, bonuses: { rng:
() => 0 } }` → `step` 299 — астероида нет, ещё 1 — есть, `x = 244`, `bonus =
BONUS_KINDS[0]`;
- **«как до фичи»**: `const rng = createRng(1)`, `scene = new PlayScene(rng)`; эталон по
  старой схеме — `ref = createRng(1)`, `refStars = new Starfield(SCREEN_WIDTH,
SCREEN_HEIGHT, ref)`, `refBattle = new Battle(createRng(Math.floor(ref() * 2 ** 32)))`
  без бонусов; 1200 тиков (`step` с пустым `Input` против `refStars.update` +
  `refBattle.update(TICK_SECONDS, { move: 0, fire: false })`) → `scene.starfield.stars`
  равен `refStars.stars` (за 1200 тиков при 0,4 px/тик звёзды перезапускаются), враги
  `[x, y, state]` и `player.state`/`lives` совпадают; отдельный тест — сразу после
  конструктора `rng()` равен `ref()` после тех же шагов (сцена сделала ровно те же вызовы).

Существующие тесты сцен и титула не меняются: ни один не стреляет дольше 300 тиков, а
астероид кораблю безопасен (проверено в analyze).

## 10. Обновление документации

**Файл (изменить):** `second-brain/decisions/003-slow-speeds-tick-timers.md` — в раздел
«Решение» строка:

```markdown
- Применение: покачивание строя (фича 002); снос астероида по X — `ASTEROID_DRIFT_SPEED = 30`
  px/с, ½ px/тик (фича 006).
```

ADR 004 не трогать.

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском; решение В1 —
`discussion.md`). Абзацы-описания `asteroid.ts`, `bonus-field.ts`, `bonus-art.ts`,
`bonus.ts` и устаревшие абзацы `player.ts`/`shot.ts`/`ship.ts` (задача 024) — **не
здесь**, в 027.

- `battle.ts`: `BattleOptions { startLevel?, levels?, lives?, bonuses? }`; `bonuses?:
BonusOptions { rng }` — свой генератор поля бонусов (без него поля нет, геттер
  `bonuses === null`; с ним `new BonusField(rng)` и `startLevel()` в конструкторе, `rng`
  боя не трогается); `score` — очки за убийства в `playing` и `asteroidPoints(level)` за
  сбитый астероид в `playing` и `cleared` (через тот же `addScore`, с доп. жизнями);
  порядок `update`: игрок → волна → `bonuses?.update(dt, phase === 'playing')` →
  коллизии и очки (`playing`) → `resolveBonusCollisions` и очки за астероид (`playing` и
  `cleared`, после врагов) → фазы; переход `cleared → playing` — новая волна и
  `bonuses?.startLevel()`; в `over` бонусных коллизий нет (астероид долетает).
- `battle-render.ts`: слои — астероид (`battle.bonuses?.asteroid`: `flying` —
  `ASTEROID_SPRITE` по `Math.floor`, `exploding` — `drawExplosion` по центру 12×12,
  `gone` — ничего; самый задний слой) → вражеские выстрелы → выстрелы игрока (все, в
  порядке `shots`) → враги → корабль.
- `collisions.ts`: правило 1 — каждый выстрел в порядке `player.shots`, убийств до трёх за
  тик (два выстрела и таран; было «не больше двух» — расходилось с кодом после 024, абзац
  всё равно переписывается); новая `resolveBonusCollisions(player, field)` →
  `BonusEvents { asteroidBroken, collected }`: первый по порядку выстрел, пересекающий
  `flying`-астероид, снимается, `field.hitAsteroid()`, не больше одного попадания за
  тик; корабль, враги и вражеские выстрелы с астероидом не взаимодействуют; `collected`
  пока всегда `null` (капсула — 027); вызывается из `Battle` после `resolveCollisions` —
  враги в приоритете.
- `scenes/play-scene.ts`: вместо «opts передаются в `Battle` как есть» — `opts`
  передаются в `Battle`, `bonuses` по умолчанию `{ rng: createRng((battleSeed ^
BONUS_SEED_SALT) >>> 0) }` (`BONUS_SEED_SALT = 0x9e3779b9`), переданный `opts.bonuses`
  не затирается (`??`); `battleSeed = Math.floor(rng() * 2 ** 32)` — единственный вызов
  `rng` сцены после звёзд, поэтому звёзды (с перезапусками) и бой для данного seed — как
  до фичи 006.
- **Граф импортов переписать целиком по фактическому коду** (перед записью сверить
  `grep -n "^import\|^} from" src/main.ts src/game/*.ts src/game/scenes/*.ts`, тесты не
  считать). Ожидаемый вид после 026:
  - `title-scene → {config, starfield, play-scene}` (`Input`, `Rng`, `Scene` — type);
  - `play-scene → {config, engine/rng, battle, battle-render, game-over-render, hud,
hud-render, player, starfield}` (`Input`, `Scene`, `BattleOptions` — type);
  - `game-over-render → {config, art, font}`; `hud → {config, font}` (`Battle` — type);
    `hud-render → {art, font, hud, sprite}` (`HudView`, `HudZone` — type);
  - `battle → {bonus-field, collisions, levels, player, score, ship, wave}` (`Rng`,
    `LevelConfig`, `PlayerIntent` — type);
  - `collisions → {enemy-shot, ship, shot}` (`Player`, `Wave`, `Enemy`, `EnemyKind`,
    `BonusField`, `BonusKind` — type); `score` (`Kill`, `EnemyKind` — type);
  - `battle-render → {art, bonus-art, enemy, enemy-art, enemy-shot, ship, shot, sprite}`
    (`Battle`, `Asteroid`, `Enemy`, `Player` — type);
  - `bonus-field → {engine/rng, asteroid, bonus}` (`Rng` — type); `asteroid → {config,
enemy}` (`BonusKind` — type); `bonus-art → sprite`; `bonus` — без импортов;
  - `player → {bonus, ship, shot}` (`Input`, `PowerUpKind`, `PowerUps`, `MoveDir`, `Shot`
    — type);
  - `main → {config, engine/*, game/levels, game/scenes/title-scene}`;
  - `wave → {attack-director, enemy, enemy-shot, formation, levels}` (`Rng`, `EnemyEnv`,
    `LevelConfig` — type); `attack-director → {engine/rng, formation}` (`Rng`,
    `DiveOrder`, `Enemy`, `LevelConfig` — type); `enemy → {config, enemy-art, ship,
steering}` (`Formation`, `EnemyKind`, `Slot`, `Sprite`, `SteerSpec` — type);
  - `steering`, `shot`, `sprite`, `font-art`, `bonus` — без импортов; `formation → config`,
    `levels → config`, `enemy-shot → config`, `enemy-art → sprite`, `art → sprite`,
    `ship → {config, art, shot}`, `font → {sprite, font-art}`, `starfield → engine/rng`;
  - только из `*.test.ts`: `scene-test-utils → config` (`Scene`/`Input` — type),
    `canvas-test-utils` — без импортов, `test-levels` (`LevelConfig`, `DiveOrder` — type),
    `test-evasion → {config, collisions, ship}` (`Rect` — type), `test-shots` (`Player`,
    `Shot` — type).
  - «Циклов нет; `engine` ничего не знает о `game`» — оставить (рёбра к `bonus-field` из
    `collisions` — только type).

`README.md` в `src/game/` и `src/game/scenes/` нет. `game-design.md` — в 027. Запись
фичи в `second-brain/features/` не трогать. После правок — `npx prettier --write` по
изменённым `.md`.

## 11. Ручная проверка

`npm run dev`, начать игру:

- через 5–15 с после начала уровня у одного из верхних углов появляется каменный астероид
  и идёт по диагонали вниз (1 px вниз, ½ px вбок за тик), не выходя за боковые края;
- выстрел его сбивает: взрыв как у врагов, счёт +100 на 1-м уровне;
- астероид проходит сквозь корабль и строй без последствий; свои и вражеские выстрелы
  видны поверх него; над строем проходит под HUD;
- на следующем уровне — снова один астероид; летящий астероид переживает паузу между
  уровнями.

## 12. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

`analyze.md` этой задачи сейчас не проходит `prettier --check` (стадия plan его не
меняет) — в `/do` прогнать `npx prettier --write` по нему (только переносы и пробелы).

## Сводка по файлам

| Действие | Файл                                                    |
| -------- | ------------------------------------------------------- |
| Создать  | `src/game/bonus-art.ts`                                 |
| Создать  | `src/game/bonus-art.test.ts`                            |
| Изменить | `src/game/asteroid.ts` (комментарий `ASTEROID_SIZE`)    |
| Изменить | `src/game/collisions.ts`                                |
| Изменить | `src/game/collisions.test.ts`                           |
| Изменить | `src/game/battle.ts`                                    |
| Изменить | `src/game/battle.test.ts`                               |
| Изменить | `src/game/battle-render.ts`                             |
| Изменить | `src/game/battle-render.test.ts`                        |
| Изменить | `src/game/scenes/play-scene.ts`                         |
| Изменить | `src/game/scenes/play-scene.test.ts`                    |
| Изменить | `second-brain/decisions/003-slow-speeds-tick-timers.md` |
| Изменить | `second-brain/architecture/overview.md`                 |

## Архитектура и паттерны

- Детерминизм: поле бонусов — только свой `Rng`; `rng` боя и сцены не получают новых
  вызовов (seed бонусов производный), что закреплено тестами «`rng` боя не затронут» и
  «как до фичи».
- Логика отдельно от рендера: коллизии и очки — в `collisions.ts`/`battle.ts`, рисование —
  только в `battle-render.ts`; всё, кроме вида спрайта, — юнит-тесты без canvas.
- `import type` для `BonusField`, `BonusKind`, `Asteroid` там, где нужны только типы;
  циклов импорта нет.
- Время — тиками `dt` (ADR 002/003), позиции — `Math.floor` в коллизиях и рендере.
- Одна точка изменения счёта — `addScore` (пороги доп. жизни работают и для астероида).

## Открытые вопросы

- В1 (из analyze, к архитектору) — **закрыт**: вариант (а), правки `overview.md` в шаге
  10 (`discussion.md`, «Реализация: задача 026-asteroid-in-battle»). К владельцу — ничего.
- Попутно: абзацы `player.ts`/`shot.ts`/`ship.ts` в `overview.md` описывают
  `get shot()` (до 024) — по решению 024 обновляются в 027, здесь не трогаются.

## Ссылки

- `second-brain/tasks/tasks/026-asteroid-in-battle/analyze.md`
- `CLAUDE.md`
- `second-brain/features/006-asteroid-bonuses/design.md` (2б, «Поток тика», «Рендер», «Интерфейсы»)
- `second-brain/features/006-asteroid-bonuses/discussion.md` («Реализация: задача 026-asteroid-in-battle»)
- `second-brain/architecture/overview.md`
- `second-brain/decisions/003-slow-speeds-tick-timers.md`

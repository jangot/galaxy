# План реализации: Несколько выстрелов и скорость пули

У `Player` вместо одного выстрела появляется список `shots` (до `maxShots`), у каждого
`Shot` — своя скорость; добавляются типы бонусов (`bonus.ts`), `powerUps` и
`grantPowerUp`. Правило 1 коллизий и `drawBattle` переходят на все выстрелы. Улучшений в
игре взять пока негде, поэтому внешне ничего не меняется — новое поведение проверяется
тестами.

Код: ветка `feature/006-asteroid-bonuses`, коммит `b9f6535`. Рамка —
`second-brain/features/006-asteroid-bonuses/design.md`, пункт 1 нарезки; уточнения
`analyze.md` приняты: инвариант пробоя быстрой пулей — тем же выражением `maxDown`, что
в `levels.test.ts` (плюс `Math.ceil` для дробного `diveSpeed·TICK`); `grantPowerUp`
заменяет объект `powerUps`, а не мутирует.

Порядок шагов: 1–3 (типы, `Shot`, `Ship`) не ломают сборку; шаг 4 (`Player`) ломает
компиляцию `collisions.ts`, `battle-render.ts` и тестов — шаги 5–8 чинят её. Проверки
гонять после шага 8.

## 1. Типы бонусов

**Файл (создать):** `src/game/bonus.ts`

Модуль без импортов. `BonusKind`/`BONUS_KINDS` в этой задаче использует только
`bonus.test.ts`; заводятся по дизайну для задачи 025.

```typescript
/** Power-ups that stay with the player until the game ends (owner decision В6). */
export type PowerUpKind = 'fastShot' | 'doubleShot';
/** What a capsule can carry: an extra life or a power-up. */
export type BonusKind = 'life' | PowerUpKind;

/** Fixed order for picking a bonus with the rng (index randomInt(rng, 0, BONUS_KINDS.length)). */
export const BONUS_KINDS: readonly BonusKind[] = ['life', 'fastShot', 'doubleShot'];

/** Snapshot of the enabled power-ups: on/off, not levels (speeds do not stack, В6). */
export interface PowerUps {
  readonly fastShot: boolean;
  readonly doubleShot: boolean;
}

export const NO_POWER_UPS: PowerUps = { fastShot: false, doubleShot: false };
```

## 2. Скорость в выстреле

**Файл (изменить):** `src/game/shot.ts`

- `FAST_SHOT_SPEED = 360` рядом с `SHOT_SPEED`, док с ADR 002 и ссылкой на тест пробоя.
- Третий параметр конструктора `readonly speed: number = SHOT_SPEED` — существующие
  `new Shot(x, y)` не меняются.
- `update` — по `this.speed`.

```typescript
/** Upward speed in px/s. Must be a whole number of px per tick (ADR 002): 4 px/tick. */
export const SHOT_SPEED = 240;
/**
 * fastShot power-up speed in px/s (owner decision В7): 6 px/tick (ADR 002).
 * shot.test.ts checks it cannot tunnel through an enemy.
 */
export const FAST_SHOT_SPEED = 360;

/** Player shot. Position is the top-left corner in logical pixels. Flies straight up. */
export class Shot {
  /** `x` is fixed at launch: the shot does not follow the ship. `speed` is fixed at launch too. */
  constructor(
    readonly x: number,
    public y: number,
    readonly speed: number = SHOT_SPEED,
  ) {}

  update(dt: number): void {
    this.y -= this.speed * dt;
  }
  // isOffscreen - unchanged
}
```

## 3. Скорость при создании выстрела

**Файл (изменить):** `src/game/ship.ts`

```typescript
import { SHOT_HEIGHT, SHOT_SPEED, SHOT_WIDTH, Shot } from './shot';

  /**
   * Creates a shot centered on the nose, its bottom touching the top of the ship.
   * `speed` defaults to SHOT_SPEED.
   */
  spawnShot(speed: number = SHOT_SPEED): Shot {
    const x = this.x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2);
    return new Shot(x, this.y - SHOT_HEIGHT, speed);
  }
```

## 4. Список выстрелов и улучшения в `Player`

**Файл (изменить):** `src/game/player.ts`

Импорты: `import type { PowerUpKind, PowerUps } from './bonus';`,
`import { NO_POWER_UPS } from './bonus';`, `import { FAST_SHOT_SPEED, SHOT_SPEED } from './shot';`
(значения), `import type { Shot } from './shot';` остаётся.

Поля и члены:

```typescript
  private activeShots: readonly Shot[] = [];
  private currentPowerUps: PowerUps = NO_POWER_UPS;

  /**
   * Shots in flight, oldest first; length <= maxShots. The array is never mutated: every
   * change (fire, offscreen, removeShot) replaces it, so a loop over a previously read
   * `shots` stays valid while shots are removed inside it.
   */
  get shots(): readonly Shot[] {
    return this.activeShots;
  }

  /** How many shots may be in flight at once: 1, or 2 with doubleShot. */
  get maxShots(): number {
    return this.currentPowerUps.doubleShot ? 2 : 1;
  }

  /** Enabled power-ups; a new object on every change, never mutated. */
  get powerUps(): PowerUps {
    return this.currentPowerUps;
  }

  /**
   * Turns a power-up on in any ship state (down included); it stays until the game ends.
   * Returns true if it was off, false if it was already on (no-op).
   */
  grantPowerUp(kind: PowerUpKind): boolean {
    if (this.currentPowerUps[kind]) return false;
    this.currentPowerUps = { ...this.currentPowerUps, [kind]: true };
    return true;
  }

  /**
   * Drops this shot (it hit something); unknown shots are ignored. Replaces the array.
   * The freed slot is used from the next update (collisions run after Player.update).
   */
  removeShot(shot: Shot): void {
    this.activeShots = this.activeShots.filter((s) => s !== shot);
  }
```

Геттер `shot` и поле `activeShot` удалить (без совместимости).

`update` — порядок прежний, меняется блок выстрелов:

```typescript
const controllable = this.currentState !== 'down';
if (controllable) this.ship.update(dt, intent.move);
for (const shot of this.activeShots) shot.update(dt);
if (this.activeShots.some((s) => s.isOffscreen)) {
  this.activeShots = this.activeShots.filter((s) => !s.isOffscreen);
}
if (controllable && intent.fire && this.activeShots.length < this.maxShots) {
  const speed = this.currentPowerUps.fastShot ? FAST_SHOT_SPEED : SHOT_SPEED;
  this.activeShots = [...this.activeShots, this.ship.spawnShot(speed)];
}
```

(Проверка `some` — чтобы не создавать массив каждый тик; контракт «замена» соблюдён в
обоих случаях. Новый выстрел добавляется копией, не `push`.)

Комментарии-контракты:

- Класс-док: «Player aggregate: the ship, its state, its shots and power-ups.» Автомат
  выстрела Ready/InFlight заменить на: «Shots: a list of 0..maxShots shots in flight,
  oldest first. Fire launches a shot when fewer than maxShots are in flight; otherwise it is
  ignored, not buffered. A shot leaves the list when it goes offscreen or hits something
  (removeShot).» Строку про `down`: «only the shots in flight keep flying».
  Добавить: «Power-ups (grantPowerUp) stay until the game ends: hit() keeps them.»
- Док `hit()`: «The shots in flight and the power-ups are kept.»
- Док `update`: «down: only the shots fly (intent ignored). active/invulnerable: move -> fly
  and drop offscreen shots -> fire (speed by fastShot, limit maxShots). A slot freed by a
  shot leaving the screen this tick is free at once…»

## 5. Правило 1 по всем выстрелам

**Файл (изменить):** `src/game/collisions.ts`

```typescript
function hitByPlayerShot(player: Player, wave: Wave, kills: Kill[]): void {
  // Safe to remove inside the loop: removeShot replaces player.shots, never mutates it.
  for (const shot of player.shots) {
    const shotRect: Rect = { x: shot.x, y: shot.y, width: SHOT_WIDTH, height: SHOT_HEIGHT };
    let target: Enemy | null = null;
    for (const enemy of wave.enemies) {
      if (!enemy.isAlive || !overlaps(shotRect, enemy)) continue;
      // Strict '>' keeps the earlier enemy on a tie.
      if (target === null || enemy.y + enemy.height > target.y + target.height) target = enemy;
    }
    if (target) {
      // Record before kill(): afterwards the enemy is exploding and isOut is false.
      kills.push({ kind: target.kind, inFlight: target.isOut });
      target.kill();
      player.removeShot(shot);
    }
  }
}
```

Док `resolveCollisions`: правило 1 — «Each player shot, in player.shots order, kills one
alive enemy it overlaps - the lowest one (…) - and is removed. An enemy killed by an
earlier shot is already exploding, so a later shot over it flies on.» Итог: «(rule 1
before rule 3, at most three: two shots and a ram)».

## 6. Отрисовка всех выстрелов

**Файл (изменить):** `src/game/battle-render.ts`

```typescript
for (const shot of battle.player.shots) {
  ctx.fillStyle = SHOT_COLOR;
  ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
}
```

Док `drawBattle`: «back to front: enemy shots, player shots (in shots order), enemies,
ship.» и «The player's shots are drawn in any ship state.»

## 7. Тестовый помощник

**Файл (создать):** `src/game/test-shots.ts`

```typescript
import type { Player } from './player';
import type { Shot } from './shot';

/**
 * Test-only. Import from *.test.ts only. The player's single shot in flight, or null.
 * Throws on two or more: also checks that without doubleShot there is at most one shot.
 */
export function onlyShot(player: Player): Shot | null {
  const { shots } = player;
  if (shots.length > 1) throw new Error(`expected at most one shot, got ${shots.length}`);
  return shots[0] ?? null;
}
```

## 8. Перевод существующих тестов `shot → shots`

Механически, без переписывания по смыслу (риск дрейфа поведения):
`X.player.shot` → `onlyShot(X.player)`, `player.removeShot()` → `player.removeShot(shot)`;
в каждый файл — `import { onlyShot } from './test-shots';` (в `play-scene.test.ts` —
`'../test-shots'`).

| Файл                                 | Места                                   | Особенности                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/player.test.ts`            | 107–203, 228–242, 269–280, 426–443      | `requireShot` — поверх `onlyShot` (`const shot = onlyShot(player); if (!shot) throw …`). Тест 187: `player.removeShot(first)`. Тест 199 «removeShot() without a shot does nothing» → «removeShot() ignores an unknown shot»: без выстрелов и с одним выстрелом `removeShot(new Shot(0, 0))` ничего не меняет (тот же выстрел в `shots`). |
| `src/game/collisions.test.ts`        | 24 (`playerWithShot`), 64–183, 356, 491 | В `playerWithShot`: `const shot = onlyShot(player);`                                                                                                                                                                                                                                                                                     |
| `src/game/battle.test.ts`            | 50, 89, 178–204, 412, 511               | `battle.player.shot!.y = 42` → `onlyShot(battle.player)!.y = 42`                                                                                                                                                                                                                                                                         |
| `src/game/battle-render.test.ts`     | 75, 99, 267, 337                        | —                                                                                                                                                                                                                                                                                                                                        |
| `src/game/hud.test.ts`               | 64                                      | как в `battle.test.ts`                                                                                                                                                                                                                                                                                                                   |
| `src/game/scenes/play-scene.test.ts` | 113–183                                 | `onlyShot(scene.battle.player)`                                                                                                                                                                                                                                                                                                          |

Контроль: после перевода `grep -rnE "\.shot\b" src` не находит обращений к `Player`
(остаются только `wave.shots`, `shots`), `grep -rn "removeShot()" src` пуст.

## 9. Новые тесты

### `src/game/bonus.test.ts` (создать, Vitest, `node`)

- `BONUS_KINDS` равен `['life', 'fastShot', 'doubleShot']` (порядок — контракт для `rng`).
- `NO_POWER_UPS` — оба `false`.

### `src/game/shot.test.ts` (изменить)

- Скорость по умолчанию — `SHOT_SPEED`; `new Shot(10, 100, FAST_SHOT_SPEED)` за тик —
  `y = 100 - FAST_SHOT_SPEED * TICK_SECONDS` (6 px), `x` не меняется.
- `FAST_SHOT_SPEED * TICK_SECONDS` — целое (ADR 002).
- Инвариант пробоя врагов быстрой пулей, тем же выражением, что в `levels.test.ts`:

```typescript
const LEVELS_1_TO_20 = Array.from({ length: 20 }, (_, i) => [i + 1, levelConfig(i + 1)] as const);

it.each(LEVELS_1_TO_20)('level %i: a fast shot cannot tunnel through an enemy', (_n, config) => {
  // ceil: a fractional dive step (2.5 px/tick) moves the floored enemy by up to 3 px.
  const maxDown = Math.max(
    Math.ceil(config.diveSpeed * TICK_SECONDS),
    ...PEEL_SEGMENTS.map((s) => s.vy),
    RETURN_SPEED * TICK_SECONDS,
  );
  const minEnemyHeight = Math.min(...Object.values(ENEMY_KINDS).map((k) => k.sprite.height));
  expect(FAST_SHOT_SPEED * TICK_SECONDS + maxDown).toBeLessThan(SHOT_HEIGHT + minEnemyHeight);
});
```

Импорты: `levelConfig` из `./levels`, `ENEMY_KINDS`, `PEEL_SEGMENTS`, `RETURN_SPEED` из
`./enemy`. (Сейчас 6 + 3 = 9 < 12.) Существующий тест в `levels.test.ts` не трогать.

### `src/game/ship.test.ts` (изменить)

- `new Ship().spawnShot().speed === SHOT_SPEED`;
  `spawnShot(FAST_SHOT_SPEED).speed === FAST_SHOT_SPEED`, позиция та же, что без аргумента.

### `src/game/player.test.ts` (изменить) — новый `describe('Player power-ups')`

Используют `player.shots` напрямую (не `onlyShot`, он бросит при двух):

- Старт: `powerUps` равен `NO_POWER_UPS`, `maxShots === 1`, `shots` пуст.
- `grantPowerUp('doubleShot')` → `true`, `maxShots === 2`, `powerUps.doubleShot`.
- С `doubleShot`: `FIRE` два тика подряд — два выстрела, `shots[0]` — первый (старший,
  выше), третий `FIRE` — по-прежнему два.
- С `doubleShot`: старший ставится на `LAST_ON_SCREEN_Y`; в тике, где он уходит за верх,
  `FIRE` выпускает новый — в `shots` второй (бывший младший) и новый, в этом порядке.
- `grantPowerUp('fastShot')` при летящем выстреле: летящий идёт на `SHOT_STEP` за тик,
  следующий выпущенный (после ухода/`removeShot`) — на `FAST_SHOT_SPEED * TICK_SECONDS`,
  `speed === FAST_SHOT_SPEED`.
- Повторный `grantPowerUp` → `false`, `powerUps` — тот же объект (`toBe`).
- `grantPowerUp` заменяет объект: снимок, полученный до вызова, не изменился
  (`fastShot === false`), новый — `true`.
- `grantPowerUp` в `down` (`downPlayer()`) → `true`, улучшение включено.
- `hit()` улучшения не снимает: с обоими улучшениями `hit()`, `run(player, DOWN_TICKS)` —
  `invulnerable`, `powerUps` прежние, два `FIRE` → два выстрела со `speed === FAST_SHOT_SPEED`.
- `removeShot(shot)` при двух выстрелах снимает именно его — второй остаётся; неизвестный
  выстрел — `shots` не меняется.
- Контракт замены: `const before = player.shots;` затем `removeShot(before[0]!)` —
  `before` по-прежнему длины 2, `player.shots` — новый массив длины 1; то же для
  `update` с `FIRE` (массив до выстрела не вырос) и для ухода за верх.
- В `down` летят все выстрелы, новых нет: два выстрела, `hit()`, `FIRE` — оба сдвинулись,
  длина 2.

### `src/game/collisions.test.ts` (изменить)

Помощник `playerWithTwoShots(y)`: `new Player()`, `grantPowerUp('doubleShot')`, `FIRE`
(колонка 127), `ship.x = 60`, `FIRE` (колонка 67); обоим `y`. Сценарии:

- **Оба выстрела в одном тике поражают две цели:** `wave(['DD'])`, враги на `x = 122` и
  `x = 62`, `y = 100`, выстрелы `y = 104` — оба `exploding`, `shots` пуст, `kills` — два
  `Kill` в порядке выстрелов (первым — враг под старшим выстрелом; для различимости враги
  разных видов, либо проверка порядка через `inFlight`: один в строю, другой в пикировании
  через `divingAt`).
- Два выстрела над одним врагом (вторая колонка совпадает с первой: `ship.x` не менять,
  второй выстрел сдвинуть по `y`, оба внутри врага) — убит один враг, старший выстрел снят,
  младший остаётся в `shots`.
- До трёх `Kill` за тик: два выстрела убивают двух врагов, третий пикирующий таранит
  корабль (`divingAt(w, 2, 122, 205)` по образцу «only the first of two overlapping divers
  rams») — `kills.length === 3`, последний — таран (`inFlight: true`), `player.state === 'down'`.

### `src/game/battle-render.test.ts` (изменить)

- С `doubleShot` (`battle.player.grantPowerUp('doubleShot')`), два `FIRE`-тика с
  разными `ship.x`: два `fillRect` цвета `SHOT_COLOR` в порядке `battle.player.shots`,
  затем враги, затем корабль. Вариант с вражеским выстрелом (`battleWithEnemyShot`) —
  вражеские до обоих выстрелов игрока — по желанию, если помощник позволяет без правок.

## 10. Проверки

`npm run format` (затем `format:check`), `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

## 11. Ручная проверка

`npm run dev`, начать игру: стреляет как раньше — один выстрел на экране, повторное
нажатие во время полёта игнорируется, скорость пули прежняя, враги сбиваются,
очки/жизни/HUD без изменений. Улучшения в игре не получить — их проверяют только тесты.

## 12. Обновление документации

- `README.md` в `src/game/` и `src/game/scenes/` нет — обновлять нечего.
- `second-brain/architecture/overview.md` («`get shot()`», автомат Ready/InFlight) и
  `game-design.md` («не больше одного своего выстрела») по нарезке дизайна обновляются в
  задаче 027 — здесь **не трогать** (осознанное решение дизайна; между задачами
  `overview.md` описывает устаревший `get shot()`).
- Запись фичи в `second-brain/features/` не менять.
- Комментарии-контракты в коде — шаги 4–6.

## Сводка по файлам

| Действие  | Файл                                                                     |
| --------- | ------------------------------------------------------------------------ |
| Создать   | `src/game/bonus.ts`                                                      |
| Создать   | `src/game/bonus.test.ts`                                                 |
| Создать   | `src/game/test-shots.ts`                                                 |
| Изменить  | `src/game/shot.ts`                                                       |
| Изменить  | `src/game/shot.test.ts`                                                  |
| Изменить  | `src/game/ship.ts`                                                       |
| Изменить  | `src/game/ship.test.ts`                                                  |
| Изменить  | `src/game/player.ts`                                                     |
| Изменить  | `src/game/player.test.ts`                                                |
| Изменить  | `src/game/collisions.ts`                                                 |
| Изменить  | `src/game/collisions.test.ts`                                            |
| Изменить  | `src/game/battle-render.ts`                                              |
| Изменить  | `src/game/battle-render.test.ts`                                         |
| Изменить  | `src/game/battle.test.ts`                                                |
| Изменить  | `src/game/hud.test.ts`                                                   |
| Изменить  | `src/game/scenes/play-scene.test.ts`                                     |
| Не менять | `src/game/battle.ts`, `hud.ts`, `scenes/play-scene.ts`, `levels.test.ts` |

## Архитектура и паттерны

- Логика отдельно от рендера: лимит и скорость читаются внутри `Player.update` из
  `powerUps`; `battle.ts` и сигнатура `update` не меняются.
- Детерминизм: `Rng` не участвует; время только через `dt`; скорости — целые px/тик
  (ADR 002), закреплено тестами от констант.
- Один владелец массива: `Player.shots` и `powerUps` заменяются, не мутируются — цикл по
  `shots` в правиле 1 (и в бонусных коллизиях задачи 026) безопасен без копий.
- Тестовый помощник `test-shots.ts` — по образцу `test-levels.ts`/`test-evasion.ts`:
  импорт только из `*.test.ts`, в сборку не попадает.
- `import type` для типов (`PowerUpKind`, `PowerUps`, `Shot` в `player.ts`/`test-shots.ts`).

## Открытые вопросы

Нет. Вопросов из `analyze.md` не осталось; оба уточнения по коду приняты (см. вступление).

## Ссылки

- `second-brain/tasks/tasks/024-multi-shot/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/006-asteroid-bonuses/design.md` — «Player — выстрелы и
  улучшения», «Интерфейсы», «Тестирование», «Нарезка на задачи» п. 1
- `second-brain/features/006-asteroid-bonuses/discussion.md`
- `second-brain/decisions/002-integer-speeds.md`
- `src/game/levels.test.ts` — существующий инвариант пробоя обычной пулей

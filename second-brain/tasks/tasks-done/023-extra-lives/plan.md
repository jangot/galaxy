# План реализации: Доп. жизни за очки

Игрок получает дополнительную жизнь, когда счёт пересекает 5000, 15000, 25000, … (В4);
запас не больше `MAX_LIVES = 5`, сверх предела жизнь пропадает, порог считается
пройденным. Пороги — чистые функции в `score.ts`, предел — в `Player.addLife()`, хук —
в private `Battle.addScore`. Доп. жизнь, пришедшая в `down` при 0 жизнях, возвращает
корабль по обычному таймеру `DOWN_TICKS` — без особого случая в коде.

Технические решения стадии plan (из `analyze.md`):

- **`thresholdsReached` не экспортируется.** Она проверяется через
  `extraLivesEarned(0, s)` (это ровно `thresholdsReached(s)`), публичный API модуля —
  как в `design.md` («Интерфейсы»).
- **Порог в `battle.test.ts` набирается высоким `startLevel` на пассивной таблице**, без
  изменения API `Battle`. Уровни зашиваются константами с комментарием и проверкой через
  `killPoints` в самом тесте (сторож на случай смены формулы):
  - `drone` в строю (`ONE_CORNER_ENEMY`) на уровне **1656** даёт ровно 5000
    (`floor((30·1665 + 50)/100)·10 = 5000`; на 1655 — 4990);
  - `striker` в полёте (таран, `passiveLevel(['S..........'])`) на уровне **616** даёт
    ровно 5000 (`floor((80·625 + 50)/100)·10 = 5000`; на 615 — 4990). _Исправлено на
    стадии do: в исходном плане было 6241 — это даёт 50000._
    Эскалация `levelConfig` за концом таблицы считает таймеры как
    `min(last, max(floor, last − 6k))` от `1_000_000` — на этих уровнях вылетов всё равно
    нет, раскладка та же.
- **Несколько порогов за одно начисление** — проверяются таблицей в `score.test.ts`
  (0 → 25000: 3); в `Battle` это одно и то же `for`-повторение `addLife()`, отдельного
  теста боя не нужно (уровень ≈ 8325 ничего нового не проверит).

## 1. `MAX_LIVES`, верхняя граница в конструкторе, `addLife()`

**Файл (изменить):** `src/game/player.ts`

- Константа рядом с `START_LIVES`:

```typescript
/** Cap for addLife (owner decision В4); LIVES_ICON_SLOTS >= MAX_LIVES is checked by a test. */
export const MAX_LIVES = 5;
```

- Конструктор: проверка и текст ошибки, JSDoc:

```typescript
  /**
   * lives: total including the ship on the field; an integer in 1..MAX_LIVES,
   * throws RangeError otherwise.
   */
  constructor(ship: Ship = new Ship(), lives: number = START_LIVES) {
    if (!Number.isInteger(lives) || lives < 1 || lives > MAX_LIVES) {
      throw new RangeError(`lives must be an integer in 1..${MAX_LIVES}, got ${lives}`);
    }
    ...
  }
```

- Метод после `hit()`:

```typescript
  /**
   * lives + 1 up to MAX_LIVES (an extra life over the cap is lost), in any state; does not
   * touch the state or stateTicks. In down with 0 lives it brings the respawn back: the ship
   * returns on the usual DOWN_TICKS tick counted from the hit. Only Battle calls it (from
   * addScore, never in over).
   */
  addLife(): void {
    if (this.livesLeft < MAX_LIVES) this.livesLeft++;
  }
```

- Комментарии автомата: в JSDoc `ShipState` и класса `Player` заменить «down with 0
  lives stays down for good» на «down with 0 lives (isLost) stays down until addLife()
  brings a life back; otherwise for good, the battle ends the game». Геттер `isLost` —
  «No lives left: the ship stays down (until addLife)». Логику `update` не менять:
  условие `livesLeft > 0 && ticksInState >= DOWN_TICKS` уже покрывает возврат.

## 2. Пороги доп. жизней

**Файл (изменить):** `src/game/score.ts`

```typescript
/** First extra-life threshold, points (owner decision В4). */
export const EXTRA_LIFE_FIRST = 5000;
/** Step between the next thresholds: 15000, 25000, ... (В4). */
export const EXTRA_LIFE_EVERY = 10000;

/** Thresholds at or below the score: 0 below 5000, 1 for 5000..14999, 2 for 15000..24999, ... */
function thresholdsReached(score: number): number {
  return score < EXTRA_LIFE_FIRST
    ? 0
    : Math.floor((score - EXTRA_LIFE_FIRST) / EXTRA_LIFE_EVERY) + 1;
}

/**
 * How many extra-life thresholds (5000, 15000, 25000, ...) the score crossed from `before` to
 * `after`; reaching a threshold exactly counts. Pure, no lives cap (that is Player.addLife).
 * The score only grows, so the result is >= 0 on every real call.
 */
export function extraLivesEarned(before: number, after: number): number {
  return thresholdsReached(after) - thresholdsReached(before);
}
```

## 3. Хук в `addScore`

**Файл (изменить):** `src/game/battle.ts`

- Импорт: `import { extraLivesEarned, killPoints } from './score';`
- Метод:

```typescript
  /**
   * The only place the score changes. Each extra-life threshold crossed by these points gives
   * player.addLife() (over MAX_LIVES it is lost, the threshold still counts). Runs after
   * resolveCollisions, so a ship lost this tick is charged first: at MAX_LIVES a ram that
   * crosses a threshold goes 5 -> 4 -> 5.
   */
  private addScore(points: number): void {
    const before = this.currentScore;
    this.currentScore += points;
    for (let i = extraLivesEarned(before, this.currentScore); i > 0; i--) this.player.addLife();
  }
```

- JSDoc класса: после «the score (killPoints per kill, see score.ts)» дописать
  «and extra lives for score thresholds (extraLivesEarned, capped by MAX_LIVES)»; в схеме
  фаз к строке `over` — «an extra life won while the last ship is down cancels it (the ship
  respawns)». Строку 1 JSDoc `updatePhase` не менять по смыслу: `isLost` после `addLife`
  ложно, проверка остаётся той же.

## 4. Тесты

Все — Vitest, environment `node`, без canvas.

**Файл (изменить):** `src/game/score.test.ts`

- Импорт `EXTRA_LIFE_EVERY, EXTRA_LIFE_FIRST, extraLivesEarned`.
- `describe('extra lives')`:
  - константы: `EXTRA_LIFE_FIRST === 5000`, `EXTRA_LIFE_EVERY === 10000`;
  - `it.each` таблица `[before, after, expected]` из `design.md`: `0→4990: 0`,
    `4990→5000: 1` (ровно на пороге), `5000→5040: 0` (тот же порог повторно),
    `14990→15000: 1`, `24990→25010: 1`, `0→25000: 3` (несколько порогов за раз);
    дополнительно `0→0: 0`;
  - пороги через `extraLivesEarned(0, s)`: 4999 → 0, 5000 → 1, 14999 → 1, 15000 → 2,
    25000 → 3 (заменяет экспорт `thresholdsReached`).

**Файл (изменить):** `src/game/player.test.ts`

- Импорт `MAX_LIVES`.
- В `describe('Player lives')`:
  - «accepts the starting lives» — заменить литерал `5` на `MAX_LIVES` (и принимает 1);
  - «rejects» — добавить `MAX_LIVES + 1` в `it.each([0, -1, 1.5, NaN, MAX_LIVES + 1])`;
  - `addLife` растит запас до `MAX_LIVES` и не выше: `new Player(new Ship(), MAX_LIVES - 1)`,
    `addLife()` → `MAX_LIVES`, ещё `addLife()` → `MAX_LIVES`;
  - `addLife` в `active` и `invulnerable` не меняет `state` и `stateTicks`;
  - `addLife` в `down` при 0 жизнях возвращает корабль в тик `DOWN_TICKS` от попадания:

```typescript
it('brings the respawn back with addLife in down at 0 lives, on the usual tick', () => {
  const player = new Player(new Ship(), 1);
  player.hit();
  run(player, 10); // the extra life comes later than the hit, the timer is not restarted
  player.addLife();
  expect(player.lives).toBe(1);
  expect(player.isLost).toBe(false);
  expect(player.state).toBe('down');
  expect(player.stateTicks).toBe(10);
  run(player, DOWN_TICKS - 11);
  expect(player.state).toBe('down');
  run(player, 1);
  expect(player.state).toBe('invulnerable');
  expect(player.ship.x).toBe(SHIP_START_X);
});
```

(`run(player, n)` — существующий хелпер `player.test.ts`.)

**Файл (изменить):** `src/game/battle.test.ts`

- Импорт `MAX_LIVES` из `./player`, `killPoints` из `./score`.
- Константы уровня с комментарием:

```typescript
// Extra-life tests reach 5000 with one kill: past the end of a passive table levelConfig
// only shrinks the 1_000_000-tick dive timers (still passive) and killPoints has no cap (В2),
// so a high startLevel gives exactly EXTRA_LIFE_FIRST in one kill without widening Battle's API.
/** A drone in formation is worth exactly 5000 here (1655 gives 4990). */
const DRONE_5000_LEVEL = 1656;
/** A rammed striker (in flight) is worth exactly 5000 here (615 gives 4990). */
const STRIKER_RAM_5000_LEVEL = 616;
```

- `describe('Battle extra lives')`:
  - сторож: `killPoints({ kind: 'drone', inFlight: false }, DRONE_5000_LEVEL) === 5000`,
    на `DRONE_5000_LEVEL - 1` — `4990`; то же для `striker`/`inFlight: true` и
    `STRIKER_RAM_5000_LEVEL`;
  - «gives a life when the score crosses 5000»: `{ levels: ONE_CORNER_ENEMY, startLevel:
DRONE_5000_LEVEL }`, `shootCornerEnemy` → `score === 5000`,
    `player.lives === START_LIVES + 1` (в тик попадания);
  - «does not go over MAX_LIVES»: то же с `lives: MAX_LIVES` → `lives === MAX_LIVES`;
  - «charges a lost ship before the extra life» (порядок в одном тике):
    `{ levels: [passiveLevel(['S..........'])], startLevel: STRIKER_RAM_5000_LEVEL, lives:
MAX_LIVES }`, `ramShip`, `update` → `player.state === 'down'`, `score === 5000`,
    `lives === MAX_LIVES` (5 → 4 → 5);
  - «an extra life in down at 0 lives cancels game over»:

```typescript
const battle = new Battle(createRng(1), {
  levels: ONE_CORNER_ENEMY,
  startLevel: DRONE_5000_LEVEL,
  lives: 1,
});
battle.player.ship.x = 40; // shot column x = 47
battle.update(TICK_SECONDS, FIRE); // the shot leaves the live ship
battle.player.hit(); // the last ship is lost with the shot in flight
expect(battle.player.isLost).toBe(true);
battle.player.shot!.y = 42;
battle.update(TICK_SECONDS, IDLE); // stateTicks = 1: the shot hits, 5000 points
expect(battle.wave.enemies[0]!.state).toBe('exploding');
expect(battle.score).toBe(5000);
expect(battle.player.lives).toBe(1);
expect(battle.player.isLost).toBe(false);
run(battle, GAME_OVER_DELAY_TICKS - 2);
expect(battle.player.state).toBe('down');
run(battle, 1); // DOWN_TICKS since the hit
expect(battle.player.state).toBe('invulnerable');
expect(battle.phase).not.toBe('over');
run(battle, GAME_OVER_DELAY_TICKS);
expect(battle.phase).not.toBe('over');
```

    (строй из одного врага станет `cleared` после взрыва — это нормально, проверяется
    только «не `over`»; `GAME_OVER_DELAY_TICKS === DOWN_TICKS`.)

**Файл (изменить):** `src/game/hud.test.ts`

- Импорт `MAX_LIVES` из `./player` (рядом с `START_LIVES`).
- В `describe('capacity')`:

```typescript
it('has an icon slot for every life up to MAX_LIVES', () => {
  expect(LIVES_ICON_SLOTS).toBeGreaterThanOrEqual(MAX_LIVES);
});
```

Существующие тесты остаются валидными: ни один не передаёт `lives > 5`.

## 5. Ручная проверка

`npm run dev`, открыть с `?level=50` (строй 5-го уровня с надбавкой: 20 `drone` × 180 +
8 `striker` × 240 ≈ 5520 очков без `raider`). Сбивать врагов: в момент, когда счёт
пересекает 5000, справа в панели появляется четвёртая иконка корабля в том же кадре.
Отдельной приёмки нет (по `description.md`).

## 6. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` (на русском)

- «Очки»: заменить «Доп. жизни за очки — задача 023.» на «Доп. жизнь — на 5000, затем
  каждые 10000 (15000, 25000, …) (фича 005, В4).»
- «Жизни»: заменить вторую строку на: «Доп. жизнь — при пересечении счётом 5000, 15000,
  25000, …; запас не больше 5, сверх предела доп. жизнь пропадает (порог пройден). Доп.
  жизнь, полученная, пока сбит последний корабль (его выстрел ещё летел), возвращает
  корабль по обычному таймеру — конца игры нет. Рекорд — позже (В5).»

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `player.ts`: «`MAX_LIVES = 5`; конструктор — `lives` целое 1…`MAX_LIVES`, иначе
  `RangeError`; `addLife()` — `lives + 1` до `MAX_LIVES` в любом состоянии, состояние и
  `stateTicks` не трогает; в `down` при 0 жизнях возвращает возрождение в тик
  `DOWN_TICKS` от попадания». В описании автомата «остаётся `down` навсегда» → «остаётся
  `down`, пока `addLife()` не вернёт жизнь».
- `score.ts`: «`EXTRA_LIFE_FIRST = 5000`, `EXTRA_LIFE_EVERY = 10000`,
  `extraLivesEarned(before, after)` — число порогов 5000/15000/25000/…, пройденных за
  начисление (ровно на пороге — считается), без предела по жизням; внутренняя
  `thresholdsReached`».
- `battle.ts`: «`addScore` — за каждый пройденный порог `player.addLife()` (после
  `resolveCollisions`: гибель этого тика списывается раньше); доп. жизнь в `down` при 0
  жизнях отменяет `over`».

README в `src/game/` нет — обновлять нечего. Запись фичи в `second-brain/features/` не
трогать.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/player.ts`                    |
| Изменить | `src/game/score.ts`                     |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/player.test.ts`               |
| Изменить | `src/game/score.test.ts`                |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/hud.test.ts`                  |
| Изменить | `second-brain/game-design.md`           |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `hud.ts`, `hud-render.ts`, `collisions.ts`, сцены, `src/engine/`.

Проверки: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

## Архитектура и паттерны

- Логика отдельно от рендера: пороги — чистые функции, предел — в агрегате `Player`,
  HUD читает `player.lives` и не меняется.
- Без нового состояния: пройденные пороги выводятся из счёта до/после начисления.
- Одна точка изменения счёта (`addScore`) — и одна точка начисления доп. жизней.
- Детерминизм: только целочисленная арифметика, ни `Rng`, ни времени не нужно.
- API `Battle` не расширяется ради тестов: порог набирается высоким `startLevel` на
  пассивной таблице.
- `import type` для типов, тесты рядом с кодом.

## Открытые вопросы

Нет (из `analyze.md` вопросов не перенесено; оба технических решения приняты выше).

## Ссылки

- `second-brain/tasks/tasks/023-extra-lives/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/005-lives-score-game-over/design.md` («Доп. жизни (В4)»,
  «Крайние случаи», «Интерфейсы», «Тестирование», «Нарезка» п. 4)
- `second-brain/game-design.md`, `second-brain/architecture/overview.md`

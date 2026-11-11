# План реализации: Счёт

Ввести настоящий счёт: `resolveCollisions` сообщает о сбитых за тик врагах (`Kill[]`),
`Battle` переводит каждое убийство в очки через чистую `killPoints(kill, level)` из нового
`score.ts` и копит их в `score`, а `hudView` показывает `battle.score` вместо заглушки.
Рамка — `features/005-lives-score-game-over/design.md` (пункт 3 нарезки, раздел
«Интерфейсы»); отступлений от дизайна нет.

Решения на усмотрение плана (по `analyze.md` и указанию оркестратора):

- `addScore` — `private` (в интерфейсе дизайна публичен только геттер `score`); задача 023
  добавит в него хук доп. жизней.
- Ненулевой счёт в `hud.test.ts` и `battle.test.ts` получаем **настоящим убийством**
  через `battle.update` (паттерн `shoots down an enemy through update()`), без расширения
  публичного API.
- `resolveCollisions` возвращает новый массив на каждый вызов (≤ 2 элемента; общий
  frozen-массив не нужен — аллокация пустого массива 60 раз/с несущественна).

## 1. Модуль очков

**Файл (создать):** `src/game/score.ts`

```typescript
import type { Kill } from './collisions';
import type { EnemyKind } from './levels';

/** Base points for one enemy kind: shot in the formation / out of it (diving or returning). */
export interface KindPoints {
  readonly formation: number;
  readonly flying: number;
}

/** Owner decision В1; every value is a positive multiple of 10 (so level 1 returns the base). */
export const ENEMY_POINTS: Readonly<Record<EnemyKind, KindPoints>> = {
  drone: { formation: 30, flying: 60 },
  striker: { formation: 40, flying: 80 },
  raider: { formation: 50, flying: 100 },
};

/**
 * Base points scaled by +10% per level above 1, rounded half up to a multiple of 10, no cap
 * (owner decision В2). Integer-only: floor((base * (9 + level) + 50) / 100) * 10, so there is
 * no float trap like 30 * 1.4 = 41.999...
 * Throws RangeError on a level that is not an integer >= 1.
 */
export function killPoints(kill: Kill, level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`Level must be an integer >= 1, got ${level}`);
  }
  const points = ENEMY_POINTS[kill.kind];
  const base = kill.inFlight ? points.flying : points.formation;
  return Math.floor((base * (9 + level) + 50) / 100) * 10;
}
```

Без `extraLivesEarned` и констант доп. жизней — это задача 023.

## 2. События убийств из коллизий

**Файл (изменить):** `src/game/collisions.ts`

- Новый type-импорт: `import type { EnemyKind } from './levels';`.
- Интерфейс `Kill` (как в дизайне):

```typescript
/** An enemy killed this tick; captured before kill() changes its state. */
export interface Kill {
  readonly kind: EnemyKind;
  /** enemy.isOut at the moment of the hit (diving or returning); always true for a ram. */
  readonly inFlight: boolean;
}
```

- `resolveCollisions` возвращает `readonly Kill[]`; правила и порядок прежние. В
  doc-комментарий добавить строку: «Returns this tick's kills in the order they happened
  (rule 1 before rule 3, at most two); enemy shots kill no enemies.»

```typescript
export function resolveCollisions(player: Player, wave: Wave): readonly Kill[] {
  const kills: Kill[] = [];
  hitByPlayerShot(player, wave, kills);
  hitByEnemyShot(player, wave);
  ram(player, wave, kills);
  return kills;
}
```

- `hitByPlayerShot(player, wave, kills: Kill[])`: перед `target.kill()` —
  `kills.push({ kind: target.kind, inFlight: target.isOut });` (после `kill()` враг уже
  `exploding`, `isOut === false` — порядок важен, комментарий в одну строку).
- `ram(player, wave, kills: Kill[])`: перед `enemy.kill()` —
  `kills.push({ kind: enemy.kind, inFlight: true });` (цикл уже отфильтровал `isOut`;
  комментарий: «a ram is always in flight: only isOut enemies ram»).
- `hitByEnemyShot` не меняется.

Существующие вызовы `resolveCollisions(...)` без использования результата остаются
корректными.

## 3. Счёт в `Battle`

**Файл (изменить):** `src/game/battle.ts`

- Импорт: `import { killPoints } from './score';`.
- Поле и геттер:

```typescript
  private currentScore = 0;

  /** Integer >= 0, starts at 0; grows only by kills during 'playing'. */
  get score(): number {
    return this.currentScore;
  }
```

- `update`: разбор убийств до `updatePhase()` — уровень тот, на котором враг сбит:

```typescript
if (this.currentPhase === 'playing') {
  for (const kill of resolveCollisions(this.player, this.currentWave)) {
    this.addScore(killPoints(kill, this.currentLevel));
  }
}
this.updatePhase();
```

- Приватный метод:

```typescript
  /** The only place the score changes (task 023 hooks extra lives in here). */
  private addScore(points: number): void {
    this.currentScore += points;
  }
```

- Doc-комментарии: у `update` — «Tick order: player -> wave (...) -> collisions and
  scoring (playing only: none in cleared and over; points use the level of this tick) ->
  phase.»; у класса — добавить «and the score (killPoints per kill, see score.ts)» в
  перечень того, что держит агрегат.

## 4. Счёт на панели

**Файл (изменить):** `src/game/hud.ts`

- Удалить `PLACEHOLDER_SCORE` вместе с комментарием.
- `hudView`:

```typescript
/** Builds the HUD snapshot from the battle: level, score and lives. */
export function hudView(battle: Battle): HudView {
  return { level: battle.level, score: battle.score, lives: battle.player.lives };
}
```

Проверить, что `PLACEHOLDER_SCORE` больше нигде не используется
(`grep -rn PLACEHOLDER_SCORE src`): по анализу — только `hud.ts` и `hud.test.ts`.
`hud-render.ts`, сцены, `enemy.ts`, `levels.ts`, `src/engine/` не меняются.

## 5. Тесты

Все — Vitest, environment `node`, без canvas.

### 5.1 `src/game/score.test.ts` (создать)

Хелпер: `const kill = (kind: EnemyKind, inFlight: boolean): Kill => ({ kind, inFlight });`.

- **Таблица В1:** `ENEMY_POINTS` равна `{ drone: {30, 60}, striker: {40, 80},
raider: {50, 100} }` (`toEqual`).
- **Свойства таблицы:** для каждого вида оба значения — положительные целые кратные 10,
  `flying >= formation`.
- **Уровень 1 = база:** для каждого вида и обоих `inFlight` `killPoints(..., 1)` равен
  значению из `ENEMY_POINTS`.
- **Контрольные значения** (`it.each`, вид × уровень → `[formation, flying]`):

| вид       | 2        | 3        | 5        | 6        | 11        |
| --------- | -------- | -------- | -------- | -------- | --------- |
| `drone`   | 30 / 70  | 40 / 70  | 40 / 80  | 50 / 90  | 60 / 120  |
| `striker` | 40 / 90  | 50 / 100 | 60 / 110 | 60 / 120 | 80 / 160  |
| `raider`  | 60 / 110 | 60 / 120 | 70 / 140 | 80 / 150 | 100 / 200 |

- **Пример владельца** (отдельный `it`, для читаемости): `drone` на уровне 5 — 40 / 80,
  на уровне 11 — 60 / 120.
- **Половина вверх:** `drone` в строю, уровень 6 → 50 (база × 1,5 = 45).
- **Ловушка float:** `raider` в строю, уровень 14 → 120 (комментарий: `Math.round(50 *
2.3 / 10) * 10` даёт 110).
- **Кратность и монотонность:** для каждого вида и `inFlight`, уровни 1…30 — результат
  кратен 10 и не меньше результата предыдущего уровня.
- **Уровень 1 целиком из строя — 920:** сумма `killPoints({ kind, inFlight: false }, 1)`
  по `parseLayout(LEVELS[0].layout).slots` равна 920 (8 `striker` + 20 `drone`). (`Layout.slots`, `Slot.kind` — `levels.ts:39`).
- **Ошибки:** `killPoints(kill('drone', false), 0)` и `(…, 1.5)` бросают `RangeError`.

### 5.2 `src/game/collisions.test.ts` (изменить)

Существующие тесты не трогать. Добавить (рядом с соответствующими группами):

- В `describe('resolveCollisions')`:
  - `returns no kills without a hit` — `resolveCollisions(new Player(), wave(['D']))`
    → `[]`; и промах (`playerWithShot(100)`) → `[]`.
  - `reports a formation kill` — как `kills the enemy it hits`, результат
    `toEqual([{ kind: 'drone', inFlight: false }])`.
  - `reports the kind of the enemy` — `it.each(['S', 'R'])`: `wave([c])`, врагу в строю
    поставить `x = 122`, `y = 100`, `playerWithShot(104)` → `[{ kind: 'striker' |
'raider', inFlight: false }]`.
  - `reports a diving kill as in flight` — как `kills a diving enemy` (или `divingAt`) →
    `[{ kind: 'drone', inFlight: true }]`.
  - `reports a returning kill as in flight` — через `returningAt(w, 0, 122, 100)` и
    `playerWithShot(104)` → `inFlight: true`. (`divingAt`/`returningAt` объявлены ниже
    первого `describe` — функции поднимаются, использовать можно; либо положить новые
    тесты в отдельный `describe('resolveCollisions kills')` после хелперов — так
    читабельнее, выбрать его.)
- В `describe('resolveCollisions ram')`:
  - `reports a ram as an in-flight kill` — `wave(['S'])`, `divingAt(w, 0, 122, 205)`,
    `new Player()` → `[{ kind: 'striker', inFlight: true }]`.
  - `reports a shot kill and a ram in one tick, shot first` — `wave(['RD'])`: враг 0
    (`raider`) в строю на `x = 122, y = 100`, `playerWithShot(104)`; враг 1 (`drone`)
    `divingAt(w, 1, 122, 205)` → `[{ kind: 'raider', inFlight: false }, { kind: 'drone',
inFlight: true }]`, корабль `down`. Проверить, что выстрел (y 104…108) не задевает
    таранщика (y 205…) — да, правило 1 убивает только врага 0.
  - `an enemy shot down this tick does not ram` (существующий, `:309`) — дописать
    `expect(resolveCollisions(...)).toEqual([{ kind: 'drone', inFlight: true }])`
    (одно событие, не два): сохранить результат вызова в переменную.
- В `describe('resolveCollisions enemy shots')`: `an enemy shot hits the ship` —
  результат вызова `toEqual([])` (вражеский выстрел врагов не убивает). Дописать в
  существующий тест или отдельный `it` с `waveWithShots(1)`.

### 5.3 `src/game/battle.test.ts` (изменить)

Хелпер в файле (рядом с `run`/`clearWave`):

```typescript
/**
 * Shoots down the ONE_CORNER_ENEMY drone in formation through update() (two ticks), as in
 * 'shoots down an enemy through update()'.
 */
function shootCornerEnemy(battle: Battle): void {
  battle.player.ship.x = 40; // shot column x = 47
  battle.update(TICK_SECONDS, FIRE);
  battle.player.shot!.y = 42;
  battle.update(TICK_SECONDS, FIRE);
  expect(battle.wave.enemies[0]!.state).toBe('exploding');
}
```

Новый `describe('Battle score')`:

- `starts at 0` — `new Battle(createRng(1)).score === 0`.
- `adds formation points on the tick of the hit` — `ONE_CORNER_ENEMY`; первый `update`
  (выстрел) счёт не меняет, после второго (попадание) — `30`.
- `adds in-flight points for a ram` — уровень `[passiveLevel(['S..........'])]`, враг
  `startDive(diveOrder())`, `x = ship.x + 2`, `y = SHIP_Y + 2` (как `ramShip`), один
  `update` → `score === 80`, корабль `down`. `ramShip` объявлен внутри `describe('Battle
lives and game over')` — вынести его на уровень файла (без изменения поведения) и
  использовать в обоих местах.
- `scales the points by the level` — `ONE_CORNER_ENEMY`, `startLevel: 5` (эскалация
  оставляет уровень пассивным, раскладка та же) → после `shootCornerEnemy` `score === 40`.
  Опционально `startLevel: 11` → 60.
- `keeps the score through cleared and the next level` — `TWO_LEVELS`: `shootCornerEnemy`
  → 30; `run(battle, EXPLOSION_TICKS)` → `phase === 'cleared'`, `score === 30`;
  `run(battle, LEVEL_PAUSE_TICKS)` → `level === 2`, `phase === 'playing'`, `score === 30`.
- `does not score in over` — `overBattle()` (вынести на уровень файла вместе с `ramShip`
  или повторить локально), `ramShip`, `run(battle, 1)` → `score === 0` (враг продолжает
  лететь, коллизий нет).

### 5.4 `src/game/hud.test.ts` (изменить)

- Убрать `PLACEHOLDER_SCORE` из импорта и тест `uses score 0 as a placeholder`.
- Тест `it.each([1, 3])`: название — `"shows the battle level %i, score 0 and the
player's lives"`, `score: 0`.
- Новый тест `follows the battle score`: `new Battle(createRng(1), { levels:
TWO_LEVELS })` (уровень 1 — тот же угловой `drone`), сбить его через `update` (те же два
  тика, что в 5.3: `ship.x = 40`, `FIRE`, `shot.y = 42`, `FIRE`), затем
  `expect(hudView(battle).score).toBe(battle.score)` и `toBe(30)`. Понадобятся импорты
  `TICK_SECONDS` из `../config` и `PlayerIntent` (`import type`) или литерал
  `{ move: 0, fire: true }`.

### 5.5 `src/game/scenes/title-scene.test.ts` (изменить)

В `runs a full cycle: start -> game over -> title -> new game` после проверок `next`
добавить `expect(next.battle.score).toBe(0);`. Старую игру не накручиваем: свежесть счёта
гарантирована тем, что `Battle` создаётся заново (это и проверяет `next).not.toBe(game)`);
дополнительное содержание дают тесты `Battle score`.

## 6. Ручная проверка

`npm run dev`:

- Сбить `drone` в строю на 1-м уровне — на панели `000030`; `striker` в строю — +40;
  врага в пике — вдвое больше (`drone` +60).
- Таран — очки начисляются (как за сбитого в полёте), корабль теряется.
- `?level=5`: `drone` в строю +40, в пике +80.
- Game Over → Enter → титул → Enter: новая игра с `000000`.

`acceptance.md` не нужен (анализ: глазами без отдельной приёмки).

## 7. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` — строку «**Очки:**» (`:55`) заменить:

> - **Очки** (решено, фича 005, В1, В2): за каждого сбитого врага, в строю / в полёте
>   (`diving` и `returning` — полёт; таран засчитывается как сбитый в полёте): `drone`
>   30/60, `striker` 40/80, `raider` 50/100. Надбавка +10 % за каждый уровень выше первого,
>   округление к ближайшим 10 (половина вверх), без потолка (`drone` на 5-м уровне —
>   40/80). Бонуса за уничтожение строя нет. Доп. жизни за очки — задача 023.

**Файл (изменить):** `second-brain/architecture/overview.md`:

- `collisions.ts`: `resolveCollisions` возвращает `readonly Kill[]` (`Kill { kind,
inFlight }`) в порядке событий; событие записывается до `kill()`; `inFlight` =
  `enemy.isOut`, у тарана всегда `true`; ≤ 2 за тик, правило 1 раньше 3; вражеский выстрел
  событий не даёт.
- Новый пункт `score.ts`: `KindPoints`, `ENEMY_POINTS` (В1), `killPoints(kill, level)` —
  целочисленная формула `floor((base × (9 + level) + 50) / 100) × 10`, `RangeError` на
  уровне не целом ≥ 1.
- `battle.ts`: геттер `score` (целое ≥ 0, с 0), private `addScore`; в тике после коллизий
  — начисление `killPoints(kill, level)` за каждое убийство (только `playing`, уровень
  этого тика), затем фазы.
- `hud.ts`: счёт — `battle.score`, заглушки `PLACEHOLDER_SCORE` больше нет.
- Граф импортов: `battle → {…, collisions, score}`, `score` (`Kill`, `EnemyKind` — type),
  `collisions` — добавить `EnemyKind` в type-импорты.

`README.md` в `src/game/` нет — обновлять нечего. Запись фичи в `second-brain/features/`
не трогаем.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/score.ts`                     |
| Создать  | `src/game/score.test.ts`                |
| Изменить | `src/game/collisions.ts`                |
| Изменить | `src/game/collisions.test.ts`           |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/hud.ts`                       |
| Изменить | `src/game/hud.test.ts`                  |
| Изменить | `src/game/scenes/title-scene.test.ts`   |
| Изменить | `second-brain/game-design.md`           |
| Изменить | `second-brain/architecture/overview.md` |

Финальная проверка: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Логика отдельно от рендера: очки — чистые функции (`score.ts`), состояние — одно поле в
  агрегате `Battle`; рендер (`hud-render.ts`) уже рисует `view.score` и не меняется.
- Одна точка изменения счёта — `addScore` в `Battle.update`; коллизии лишь сообщают факты
  (`Kill`), не зная об очках. Это и место для хука доп. жизней (023).
- Детерминизм: только целочисленная арифметика, ни `Rng`, ни времени не требуется.
- `Record<EnemyKind, KindPoints>` — typecheck ловит неполную таблицу при новом виде врага.
- `import type` для `Kill` и `EnemyKind`; циклов нет (`collisions` не импортирует
  `score`/`battle`); `src/engine/` не затронут.

## Открытые вопросы

Нет (в `analyze.md` открытых вопросов нет; мелочи решены выше).

## Ссылки

- `second-brain/tasks/tasks/022-score/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/005-lives-score-game-over/design.md`, `discussion.md`
- `second-brain/architecture/overview.md`, `second-brain/game-design.md`

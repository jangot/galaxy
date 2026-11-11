# План реализации: Плавный рост скорости по уровням

Скорость пике по уровням 1–5 становится ровной: 60 / 90 / 120 / 150 / 180 px/с.
Половинный шаг px/тик разрешается только для вертикали пике (ADR 004). За концом таблицы
`levelConfig` берёт последнюю строку и на каждом уровне уменьшает `diveIntervalTicks` и
`firstDiveDelayTicks` на 6 тиков, пока они не дойдут до пола 30 / 60.

Код: `main`, `d68f8f5`. Источник: `analyze.md`, `description.md` и ответ владельца на
открытый вопрос 1 из `analyze.md`.

**Решение по подставным таблицам (ответ владельца, вариант «а»).** Эскалация считается от
последней строки переданной таблицы: `k = N − levels.length`,
`тайминг = min(последний, max(ПОЛ, последний − 6·k))`. Для `LEVELS` (60/90) это ровно
формула из description (`k = N − 5`). У пассивных тестовых таблиц тайминги порядка 1 000 000
тиков, поэтому они остаются пассивными. Если последнее значение уже ниже пола, оно не
меняется. `turnY` для `EVASION_CASES` берём из замера в analyze: 90 → 141, 150 → 128.

## 1. Таблица уровней, правило скорости пике и эскалация

**Файл (изменить):** `src/game/levels.ts`

1. JSDoc поля `diveSpeed` в `LevelConfig`:

```typescript
  /**
   * Dive (descend) speed, px/s; px/tick must be >= 1 and a multiple of 1/2 (ADR 004,
   * extends ADR 002). Checked by isAllowedDiveSpeed.
   */
  readonly diveSpeed: number;
```

2. В `LEVELS` уровень 2 получает `diveSpeed: 90`, уровень 4 — `diveSpeed: 150`. Остальные поля
   остаются как есть.

3. Правило скорости пике ставим сразу после `isAllowedSpeed`. Сам `isAllowedSpeed` не трогаем:

```typescript
/**
 * Dive speed rule (ADR 004): px/tick >= 1 and a whole number of half pixels
 * (60, 90, 120, 150, 180 px/s). Only for the dive's Y; sway still uses isAllowedSpeed.
 */
export function isAllowedDiveSpeed(pxPerSecond: number): boolean {
  const perTick = pxPerSecond * TICK_SECONDS;
  return perTick >= 1 && Number.isInteger(perTick * 2);
}
```

`NaN >= 1` даёт false, а `Infinity * 2` не целое. Поэтому NaN и Infinity отсекаются без
отдельных проверок.

4. Константы эскалации и сама эскалация в `levelConfig`:

```typescript
/** Past the end of the table: dive timers shrink by this many ticks per level (0.1 s). */
export const ESCALATION_STEP_TICKS = 6;
/** Floor of diveIntervalTicks past the end of the table (0.5 s). */
export const ESCALATION_MIN_INTERVAL_TICKS = 30;
/** Floor of firstDiveDelayTicks past the end of the table (1 s). */
export const ESCALATION_MIN_FIRST_DELAY_TICKS = 60;

/** Shrinks a timer by k steps down to the floor; never raises a value already below it. */
function escalate(last: number, floor: number, k: number): number {
  return Math.min(last, Math.max(floor, last - ESCALATION_STEP_TICKS * k));
}

/**
 * 1-based. Levels inside the table return their row as is. Past the end, k = level - length:
 * the last row with diveIntervalTicks and firstDiveDelayTicks shrunk by ESCALATION_STEP_TICKS
 * per level down to their floors (relative to the last row, so passive test tables stay
 * passive). Pure: depends only on level and the table.
 * Throws if !Number.isInteger(level) || level < 1, or if the table is empty.
 */
export function levelConfig(level: number, levels: readonly LevelConfig[] = LEVELS): LevelConfig {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Level must be an integer >= 1, got ${level}`);
  }
  const last = levels[levels.length - 1];
  if (last === undefined) throw new Error('Level table is empty');
  if (level <= levels.length) return levels[level - 1]!;
  const k = level - levels.length;
  return {
    ...last,
    firstDiveDelayTicks: escalate(last.firstDiveDelayTicks, ESCALATION_MIN_FIRST_DELAY_TICKS, k),
    diveIntervalTicks: escalate(last.diveIntervalTicks, ESCALATION_MIN_INTERVAL_TICKS, k),
  };
}
```

Если `noUncheckedIndexedAccess` или линтер не пропустят `!`, используем ту же схему, что
сейчас: `const config = levels[level - 1]; if (config === undefined) throw …`. Внутри таблицы
`levelConfig` по-прежнему возвращает тот же объект, поэтому `toBe` в тестах уровней 1..length
продолжают работать.

5. JSDoc `parseStartLevel`: «levelConfig repeats the last one» заменить на «levelConfig
   escalates the last one (faster dive timers)».

## 2. Комментарии в соседних модулях (поведение не меняется)

**Файл (изменить):** `src/game/battle.ts`, строка 26. «Past the end of the level table the last
level repeats.» заменить на «Past the end of the level table levelConfig escalates the last level
(shorter dive timers, see levels.ts).»

**Файл (изменить):** `src/game/enemy-shot.ts`, строки 6–9:

```typescript
/**
 * Downward speed in px/s: 4 px/tick, a whole number (ADR 002).
 * Must exceed the dive speed of every level (the cap is 180 px/s; levels.test checks
 * levelConfig(1..20)), so a shot always pulls away from the enemy's nose.
 */
```

**Файл (изменить):** `src/game/test-levels.ts`, JSDoc `TWO_LEVELS`. «Level 3+ repeats level 2»
заменить на «Level 3+ is level 2 with dive timers shrunk by levelConfig's escalation (still
passive)».

## 3. Сценарий уходимости

**Файл (изменить):** `src/game/test-evasion.ts`

```typescript
/**
 * Test-only evasion scenario of a striker (feature 003, tasks 016-017). Import from *.test.ts only.
 * turnY - the diver's y at which the feinting ship reverses: about the middle of the window
 * "T = 8 escapes, T = 0 rams", measured with step 1 in task 017: 180 px/s 111..131,
 * 150 px/s 120..137, 120 px/s 128..141, 90 px/s 136..146. No single height fits all speeds.
 */
export const EVASION_CASES = [
  { diveSpeed: 180, turnY: 125 },
  { diveSpeed: 150, turnY: 128 },
  { diveSpeed: 120, turnY: 135 },
  { diveSpeed: 90, turnY: 141 },
] as const;
```

`enemy.test.ts` (`it.each(EVASION_CASES)`, строка 785) и `steering.test.ts` (строка 153)
подхватят новые случаи сами, править их не нужно.

## 4. Тесты

**Файл (изменить):** `src/game/levels.test.ts` (Vitest, environment `node`)

- Импорт: добавить `isAllowedDiveSpeed`, `ESCALATION_MIN_FIRST_DELAY_TICKS`,
  `ESCALATION_MIN_INTERVAL_TICKS`, `ESCALATION_STEP_TICKS`.
- Общий набор уровней 1..20:

```typescript
const LEVELS_1_TO_20 = Array.from({ length: 20 }, (_, i) => [i + 1, levelConfig(i + 1)] as const);
```

- `describe('levelConfig')`:
  - «returns the last level past the end of the table» (строка 73) заменить на «escalates the
    last level past the end of the table». Для `N = LEVELS.length + 1` ожидать `toEqual`
    `{ ...LEVELS[4], firstDiveDelayTicks: 84, diveIntervalTicks: 54 }`.
  - `it.each` по точкам формулы для `LEVELS`: `[6, 84, 54]`, `[7, 78, 48]`, `[8, 72, 42]`,
    `[9, 66, 36]`, `[10, 60, 30]`, `[20, 60, 30]` → `firstDiveDelayTicks` / `diveIntervalTicks`.
  - За концом таблицы `layout`, `swaySpeed`, `diveSpeed`, `maxSorties`, `diverShots` и
    `raiderShots` совпадают с последней строкой (для N = 6..20).
  - Уровни 1..5 возвращают `toBe(LEVELS[N − 1])`.
  - Чистота: `levelConfig(12)` два раза дают равные значения (`toEqual`), а `LEVELS[4]` не
    мутирован (сравнить со снимком до вызова).
  - Монотонность на 1..20: `diveSpeed` не убывает, оба тайминга не растут. На N ≥ 10 значения
    равны полу (`ESCALATION_MIN_*`), ниже пола не опускаются.
  - «uses an injected table» (строка 84): `levelConfig(3, [a, b])` ожидать `toEqual`
    `{ ...b, firstDiveDelayTicks: 1_000_000 − 6, diveIntervalTicks: 1_000_000 − 6 }`
    (стала пассивной таблицей, осталась пассивной).
  - Подставная активная таблица `passiveLevel(['D'], { firstDiveDelayTicks: 100,
diveIntervalTicks: 40 })`: N = 2 → 94/34; N = 3 → 88/30 (пол интервала); N = 8 → 64/30;
    N = 9 → 60/30.
  - Значение ниже пола не поднимается: при `diveIntervalTicks: 20, firstDiveDelayTicks: 50`
    N = 2 и N = 10 дают 50/20.
  - Шаг через константы: разница между N = 6 и N = 7 равна `ESCALATION_STEP_TICKS`.
- Новый `describe('isAllowedDiveSpeed')`:
  - разрешает `60, 90, 120, 150, 180`;
  - отвергает `0, -60, -90, 30, 45, 75, NaN, Infinity`.
- `describe('isAllowedSpeed')` не меняется: 90 там по-прежнему отвергается.
- `describe('LEVELS')`. В правилах заменить `LEVELS.map((c, i) => [i + 1, c] as const)` на
  `LEVELS_1_TO_20`: «layout is valid», «dive fields follow the speed and timer rules»,
  «cannot tunnel», «an enemy shot outruns the dive», «raider rules». В «dive fields…» строки
  114–115 заменить одной `expect(isAllowedDiveSpeed(config.diveSpeed)).toBe(true);`, остальные
  проверки (целые ≥ 1, `swaySpeed < STEER_SPEED`) оставить.
  Отдельно добавить: `levelConfig(N).diveSpeed <= 180` для 1..20 (потолок).
- «has the agreed rows»: у уровня 2 `diveSpeed: 90`, у уровня 4 — `diveSpeed: 150`.

**Файл (изменить):** `src/game/battle.test.ts`

- «starts past the end of the table on the last level» (строки 76–80) переименовать в «starts
  past the end of the table on the escalated last level». Для `startLevel: 5` (`k = 3`):

```typescript
expect(battle.wave.config).toEqual({
  ...TWO_LEVELS[1]!,
  firstDiveDelayTicks: 1_000_000 - 18,
  diveIntervalTicks: 1_000_000 - 18,
});
```

- «repeats the last level past the end of the table» (строки 117–126) переименовать в
  «escalates the last level past the end of the table». Для уровня 3 (`k = 1`) — `toEqual` с
  `1_000_000 - 6` в обоих таймингах. Проверку `not.toBe(second)` оставить.
- Остальные `toBe` в этом файле (строки 27, 39, 67, 73, 107) относятся к уровням внутри
  таблицы. Они не меняются.

**Файл (изменить):** `src/game/enemy.test.ts`

- Строки 278 и 601: `it.each([60, 120])` → `it.each([60, 90, 120])`. Ожидания
  `y + diveSpeed * TICK_SECONDS` и `y + diveSpeed / 60` при 90 точны (1,5 — двоичная дробь).

**Без правок:** `steering.test.ts`, `wave.test.ts`, `play-scene.test.ts`. Сцена использует
`ONE_CORNER_ENEMY`/`TWO_LEVELS`. За концом таблицы тайминги остаются около 10⁶, поэтому
враги не вылетают.

Прогон: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run build`.

## 5. Ручная проверка

`npm run dev`, затем:

- `?level=2` и `?level=4`: пике идёт со скоростью 1,5 и 2,5 px/тик. Заметна ли дрожь
  спрайта 1-2-1-2 / 2-3-2-3. Если заметна — запасной вариант из `description.md`, решает
  владелец.
- `?level=1` … `?level=5` подряд: рост скорости пике ощущается ровным.
- `?level=6`, `?level=10`: вылеты заметно чаще, чем на 5-м (на 10-м первый вылет через 1 с,
  интервал 0,5 с); одновременно в полёте не больше 3.
- Вражеские выстрелы на уровнях 2 и 4 стартуют без визуальных артефактов (дробный `y`
  выстрела).

## 6. Обновление документации

**Файл (создать):** `second-brain/decisions/004-half-pixel-dive.md`

```markdown
# ADR 004: Пике — половинные px/тик по вертикали

**Дата:** 2026-11-11 · **Статус:** принято · **Источник:** задача 017 ·
**Расширяет:** ADR 002

## Решение

- Вертикальная скорость пике (`diveSpeed`, `Enemy.descend`: `y += diveSpeed · dt`) — целое
  число половин пикселя за тик, не меньше 1 px/тик: 60, 90, 120, 150, 180 px/с
  (1; 1,5; 2; 2,5; 3 px/тик). Потолок — 180 (`ENEMY_SHOT_SPEED = 240` быстрее, уходимость
  `striker` проверена).
- Проверка — `isAllowedDiveSpeed(pxPerSecond)` в `src/game/levels.ts`; тест для
  `levelConfig(1..20)`.
- Всё остальное — по ADR 002/003: X пике, дуга вылета, возврат, корабль, выстрелы — целые
  px/тик; покачивание строя — `isAllowedSpeed`.

## Почему

- 60 → 120 → 180 даёт рывок сложности (удвоение на 2-м уровне). Половинный шаг даёт ровный
  рост на 0,5 px/тик за уровень.
- 1/2 точна в double: ошибка не копится (как в ADR 003).
- Цена — шаг 1-2-1-2 / 2-3-2-3 px после `Math.floor`. Для быстрого объекта по вертикали это
  принято на приёмке глазами. Запасной вариант: целые 60/60/120/120/180, рост только темпом.

## Ограничения

Опирается на фиксированный `dt = TICK_SECONDS`. Коллизии и рендер работают по `Math.floor`,
дробный `y` им не мешает.
```

**Файл (изменить):** `second-brain/decisions/002-integer-speeds.md`. В строке «Расширено»
добавить: «ADR 004 — половинные px/тик для вертикали пике».

**Файл (изменить):** `second-brain/game-design.md`

- «Пикирование» (строка 30 и далее): добавить, что скорость пике по уровням 1–5 —
  60/90/120/150/180 px/с, ровный рост (задача 017, ADR 004).
- «Уровни» (строки 45–48): «После конца таблицы повторяется последний уровень» заменить на
  «После конца таблицы — последний уровень, но интервал вылетов и первая задержка уменьшаются
  на 0,1 с за уровень до 0,5 с / 1 с (пол — на 10-м уровне); скорость пике, раскладка и
  стрельба — как у 5-го».

**Файл (изменить):** `second-brain/architecture/overview.md`

- `levels.ts` (строки 74–93): у `diveSpeed` написать «px/с, целые или половинные px/тик ≥ 1,
  ADR 004» вместо «целые px/тик, ADR 002». Уровень 2 — «пике 90», уровень 4 — «пике 150».
  Добавить `isAllowedDiveSpeed` и константы `ESCALATION_STEP_TICKS = 6`,
  `ESCALATION_MIN_INTERVAL_TICKS = 30`, `ESCALATION_MIN_FIRST_DELAY_TICKS = 60`.
  `levelConfig`: «за концом таблицы — последний уровень с таймингами
  `min(последний, max(пол, последний − 6·k))`, `k = n − длина таблицы`; внутри таблицы — та же
  строка».
- `test-levels.ts` (строка 193): «уровень 3+ повторяет второй» заменить на «уровень 3+ —
  второй с эскалацией таймингов (остаётся пассивным)».
- `test-evasion.ts` (строки 194–197): `EVASION_CASES` — 180/125, 150/128, 120/135, 90/141.
- `battle.ts` (строка 206): «За концом таблицы повторяется последний уровень» заменить на «За
  концом таблицы — эскалация последнего уровня (`levelConfig`)».
- «Принципы» (строки 250–255): добавить ссылку на ADR 004 (половинные px/тик для вертикали
  пике).

README в `src/game/` нет. Обновлять нечего.

## Сводка по файлам

| Действие | Файл                                            |
| -------- | ----------------------------------------------- |
| Изменить | `src/game/levels.ts`                            |
| Изменить | `src/game/levels.test.ts`                       |
| Изменить | `src/game/battle.test.ts`                       |
| Изменить | `src/game/enemy.test.ts`                        |
| Изменить | `src/game/test-evasion.ts`                      |
| Изменить | `src/game/test-levels.ts` (комментарий)         |
| Изменить | `src/game/battle.ts` (комментарий)              |
| Изменить | `src/game/enemy-shot.ts` (комментарий)          |
| Создать  | `second-brain/decisions/004-half-pixel-dive.md` |
| Изменить | `second-brain/decisions/002-integer-speeds.md`  |
| Изменить | `second-brain/game-design.md`                   |
| Изменить | `second-brain/architecture/overview.md`         |

Не меняются: `enemy.ts`, `wave.ts`, `collisions.ts`, `battle-render.ts`,
`attack-director.ts`, `steering.test.ts`.

## Архитектура и паттерны

- Всё изменение — в данных и в чистой функции `levelConfig`: она зависит только от `N` и
  таблицы, без `Rng` и состояния. `Battle.createWave()` уже вызывает её на каждый уровень.
- Таймеры — целые тики (ADR 003): шаг 6 и полы 30/60 целые, `escalate` даёт целые значения
  для целого входа.
- Половинный шаг — только вертикаль пике (ADR 004). Правило `isAllowedSpeed` для покачивания
  не ослабляется: отдельная функция `isAllowedDiveSpeed`.
- Тестовые таблицы остаются пассивными, потому что эскалация считается от последней строки.
- Логика отдельно от рендера: всё покрывается тестами без canvas; глазами проверяется только
  дрожь и ощущение темпа.
- `import type` — для `LevelConfig` в тестах (уже так).

## Открытые вопросы

1. ~~Эскалация для подставных таблиц~~ — **решено владельцем:** вариант «а» (от последней
   строки таблицы, не выше последнего значения). Учтено в шаге 1.
2. `battle.test.ts` не упомянут в description. Правка двух тестов — в рамках задачи (шаг 4).
3. Запасной вариант при заметной дрожи (60/60/120/120/180 без ADR 004) решается на приёмке
   глазами и на план не влияет.

## Ссылки

- `second-brain/tasks/tasks/017-level-speed-curve/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- `second-brain/game-design.md` — «Пикирование», «Уровни»
- `second-brain/architecture/overview.md` — `levels.ts`, `test-levels.ts`, `test-evasion.ts`,
  `battle.ts`
- `second-brain/tasks/tasks/016-striker-inertia/` — как мерили окна уходимости

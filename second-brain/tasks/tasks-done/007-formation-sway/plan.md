# План реализации: Покачивание строя и ADR 003

Строй врагов начинает покачиваться по X: старт `offset = 0`, вправо, видимый (по
`Math.floor`) размах ровно `±SWAY_RANGE = 16` px с симметричным разворотом (правило
архитектора: `maxOffset = SWAY_RANGE + max(0, 1 - step)`). Скорость — поле
`swaySpeed` уровня (15 px/с = 1/4 px/тик), что требует нового ADR 003 (двоичные дроби
px/тик, таймеры в тиках) и проверки `isAllowedSpeed` для каждой строки `LEVELS`.

Источник правил: `design.md` фичи 002 — «Formation», «Интерфейсы», «Тестирование»,
«Уточнения для реализации → Точные правила → Разворот покачивания», строка 007 в
«Появление API по задачам»; `discussion.md` — «Реализация: задача 007-formation-sway».
Числа ниже проверены прогоном скрипта по правилу (Node, double).

## 1. ADR 003 и ссылка из ADR 002

**Файл (создать):** `second-brain/decisions/003-slow-speeds-tick-timers.md` (на русском,
формат ADR 002)

```markdown
# ADR 003: Медленные скорости — двоичные дроби px/тик; таймеры — в тиках

**Дата:** 2026-11-11 · **Статус:** принято · **Источник:** фича 002, `design.md` ·
**Расширяет:** ADR 002

## Решение

- Быстрые движения (корабль, выстрелы, пикирование) — по-прежнему целые px/тик (ADR 002).
- Медленным движениям (покачивание строя) разрешены скорости, у которых
  `SPEED * TICK_SECONDS` — ровно `1/2`, `1/4` или `1/8` px/тик (30, 15, 7,5 px/с).
  Механизм тот же: `x += speed * dt`.
- Проверка — `isAllowedSpeed(pxPerSecond)` в `src/game/levels.ts`: целое ≥ 1 или одна
  из трёх дробей; тест для каждой строки `LEVELS`.
- Таймеры (паузы, интервалы, взрыв, неуязвимость, сегменты маршрута) — целые числа
  тиков, суффикс `Ticks` в имени поля, счётчик −1 за `update`.

## Почему

- Двоичные дроби точны в double: сумма шагов не копит ошибку, после `Math.floor`
  спрайт сдвигается ровно на 1 px каждые 2/4/8 тиков — равномерно.
- `1/3` (20 px/с) неточна в double (сбой каденции), `3/4` (45 px/с) даёт неравномерный
  шаг 0-1-1-1 — запрещены.
- «Секунды и `timer -= dt`» отвергнуты: сумма `1/60` неточна, событие «0,5 с»
  срабатывало бы то на 30-м, то на 31-м тике.

## Ограничения

Опирается на фиксированный шаг `dt = TICK_SECONDS` (ADR 001/цикл). При переменном `dt`
правило перестаёт работать.
```

**Файл (изменить):** `second-brain/decisions/002-integer-speeds.md` — одна строка после
шапки (статус «принято» не меняется):

```markdown
**Расширено:** ADR 003 — двоичные дроби px/тик для медленных движений, таймеры в тиках.
```

## 2. `swaySpeed` и `isAllowedSpeed` в таблице уровней

**Файл (изменить):** `src/game/levels.ts`

- Импорт `import { TICK_SECONDS } from '../config';` (граф `levels → config`, `config` —
  лист, циклов нет).
- `LevelConfig` — обязательное поле:

```typescript
export interface LevelConfig {
  /** Rows top to bottom; 'D' drone, 'S' striker, '.' empty. */
  readonly layout: readonly string[];
  /** Formation sway speed, px/s; px/tick must be 1/8, 1/4, 1/2 or a whole number (ADR 003). */
  readonly swaySpeed: number;
}
```

- `LEVELS[0]`: `{ layout: ['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'], swaySpeed: 15 }`.
- Функция:

```typescript
/** Binary fractions of a pixel per tick allowed for slow motion (ADR 003). */
const FRACTIONAL_STEPS: readonly number[] = [1 / 2, 1 / 4, 1 / 8];

/** Speed rule shared by tests: whole px/tick >= 1 or exactly 1/2, 1/4, 1/8 px/tick. */
export function isAllowedSpeed(pxPerSecond: number): boolean {
  const perTick = pxPerSecond * TICK_SECONDS;
  return (Number.isInteger(perTick) && perTick >= 1) || FRACTIONAL_STEPS.includes(perTick);
}
```

(`15 * (1/60) === 0.25`, `30 → 0.5`, `7.5 → 0.125`, `60 → 1`, `120 → 2`;
`20 → 0.333…`, `45 → 0.75`, `90 → 1.5`, `Infinity`/`NaN` — не целые и не в списке.)

## 3. Покачивание в `Formation`

**Файл (изменить):** `src/game/formation.ts`

```typescript
/** Visible sway amplitude, px (decision В9). Offset ∈ [-16, 16 + max(0, 1 - step)]. */
export const SWAY_RANGE = 16;

/**
 * Formation geometry: a grid of cells centered horizontally on screen,
 * swaying left and right by SWAY_RANGE as a whole.
 */
export class Formation {
  private readonly baseX: number;
  private currentOffset = 0;
  private dir: -1 | 1 = 1;

  constructor(
    readonly cols: number,
    readonly rows: number,
    private readonly swaySpeed: number,
  ) {
    this.baseX = Math.floor((SCREEN_WIDTH - cols * CELL_WIDTH) / 2);
  }

  /** Current sway offset along X, px; fractional (binary fractions, ADR 003). */
  get offset(): number {
    return this.currentOffset;
  }

  /**
   * Moves the sway one tick and turns around at the edges.
   * The right edge is pushed by 1 - step so that, after Math.floor, both visible edges
   * (+SWAY_RANGE and -SWAY_RANGE) are held for the same number of ticks.
   */
  update(dt: number): void {
    const step = this.swaySpeed * dt;
    const maxOffset = SWAY_RANGE + Math.max(0, 1 - step);
    const minOffset = -SWAY_RANGE;
    this.currentOffset += this.dir * step;
    if (this.currentOffset >= maxOffset) {
      this.currentOffset = maxOffset;
      this.dir = -1;
    } else if (this.currentOffset <= minOffset) {
      this.currentOffset = minOffset;
      this.dir = 1;
    }
  }

  /** Left edge of a sprite of the given width, centered in its column's cell, plus sway. */
  slotX(col: number, width: number): number {
    return (
      this.baseX + col * CELL_WIDTH + Math.floor((CELL_WIDTH - width) / 2) + this.currentOffset
    );
  }

  /** Top edge of a sprite of the given height, centered in its row's cell. Sway is X only. */
  slotY(row: number, height: number): number {
    /* без изменений */
  }
}
```

`maxOffset` — приватная деталь (`SWAY_RANGE` в API — видимый размах). Для целых px/тик
`maxOffset = SWAY_RANGE`, правило совпадает с простой обрезкой.

## 4. Волна вызывает строй

**Файл (изменить):** `src/game/wave.ts`

- Конструктор: `this.formation = new Formation(layout.cols, layout.rows, config.swaySpeed);`
- `update(dt)` (было `_dt`) — порядок «строй, потом враги» («Поток тика», 2.1 → 2.3):

```typescript
/** Sways the formation, then moves every enemy (enemies read this tick's slots). */
update(dt: number): void {
  this.formation.update(dt);
  for (const enemy of this.enemies) enemy.update();
}
```

- Doc-комментарий класса: убрать «a static formation … Sway (007)», оставить
  «attack director (009) and enemy shots (012) join later».

`enemy.ts`, `battle.ts`, `battle-render.ts`, сцены, `main.ts`, `src/engine/*` — не
меняются: `Enemy.update()` уже пересчитывает `x/y` из слота, рендер делает `Math.floor`.

## 5. Тестовые таблицы

**Файл (изменить):** `src/game/test-levels.ts`

```typescript
/**
 * ...
 * (FORMATION_MAX_COLS) layout, so baseX = 40 and the enemy starts at x = 42
 * (then x = 42 + formation.offset, within ±SWAY_RANGE), far from the ship's shot column
 * (x = 127). ...
 * Passive fields (dive timers, shots) are added by the tasks that introduce them.
 */
export const ONE_CORNER_ENEMY: readonly LevelConfig[] = [
  { layout: ['D..........'], swaySpeed: 15 },
];
```

## 6. Тесты

Все — Vitest, environment `node`, `dt = TICK_SECONDS`, `toBe` (двоичные дроби точны).

### 6.1 `src/game/formation.test.ts` (изменить)

- Существующие конструкторы — третий аргумент `15`.
- Хелпер: `function run(f: Formation, ticks: number): void { for (let i = 0; i < ticks; i++) f.update(TICK_SECONDS); }`
- Сценарии:
  - **Старт:** `offset === 0`, `slotX` совпадает с прежней геометрией.
  - **Шаг за тик:** `new Formation(10, 3, 15)`, 1 тик → `offset === 15 * TICK_SECONDS`
    (`0.25`); `slotX(0, CELL_WIDTH) === 48.25`; `slotY(0, 8) === 34` (без изменений).
  - **Разворот, 15 px/с** (`it.each` по таблице тик → смещение, каждый — новый строй и
    `run` до тика): 63 → `15.75`; 64 → `16`; 67 → `16.75` (разворот); 68 → `16.5`;
    198 → `-16` (разворот); 199 → `-15.75`; 262 → `0`; 263 → `0.25` (снова вправо).
  - **Целая скорость обрезается ровно до границы:** `swaySpeed = 180` (3 px/тик,
    `maxOffset = 16`): 5 → `15`; 6 → `16` (а не 18); 7 → `13`; 17 → `-16`; 18 → `-13`.
  - **Симметрия краёв** (`it.each`):

    | `swaySpeed` | px/тик | период | край `±16` | середина (за период) |
    | ----------- | ------ | ------ | ---------- | -------------------- |
    | 7.5         | 1/8    | 526    | 15         | 16                   |
    | 15          | 1/4    | 262    | 7          | 8                    |
    | 30          | 1/2    | 130    | 3          | 4                    |

    За `период` тиков собрать гистограмму `Math.floor(offset)` после каждого `update`;
    ожидать: `counts[16] === counts[-16] === край`; для каждого `v` из `-15..15` —
    `counts[v] === середина`; ключей вне `[-16, 16]` нет; после периода `offset === 0`.

    ```typescript
    it.each([
      [7.5, 526, 15, 16],
      [15, 262, 7, 8],
      [30, 130, 3, 4],
    ])('sway at %s px/s shows both edges equally long', (speed, period, edge, middle) => {
      const f = new Formation(10, 1, speed);
      const counts = new Map<number, number>();
      for (let i = 0; i < period; i++) {
        f.update(TICK_SECONDS);
        const px = Math.floor(f.offset);
        counts.set(px, (counts.get(px) ?? 0) + 1);
      }
      expect(counts.get(SWAY_RANGE)).toBe(edge);
      expect(counts.get(-SWAY_RANGE)).toBe(edge);
      for (let v = -SWAY_RANGE + 1; v < SWAY_RANGE; v++) expect(counts.get(v)).toBe(middle);
      expect([...counts.keys()].every((v) => Math.abs(v) <= SWAY_RANGE)).toBe(true);
      expect(f.offset).toBe(0);
    });
    ```

  - **`slotX` включает `offset`, `slotY` — нет:** после N тиков
    `slotX(c, w) === slotX0 + offset`, `slotY` равен значению до `update`.
  - **Строй максимальной ширины внутри экрана при крайних смещениях** (заменяет
    «fits the widest formation on screen»): `new Formation(FORMATION_MAX_COLS, 1, 15)`;
    `run(f, 67)` → `offset === 16.75`, правый край
    `slotX(FORMATION_MAX_COLS - 1, CELL_WIDTH) + CELL_WIDTH === 232.75` и `≤ SCREEN_WIDTH`;
    `run(f, 198 - 67)` → `offset === -16`, `slotX(0, CELL_WIDTH) === 24` и `≥ 0`.

### 6.2 `src/game/levels.test.ts` (изменить)

- `isAllowedSpeed`: `it.each([7.5, 15, 30, 60, 120])` → `true`;
  `it.each([0, -15, -60, 20, 45, 90, NaN, Infinity])` → `false`.
- `describe('LEVELS')`, `it.each` по строкам: добавить
  `expect(isAllowedSpeed(config.swaySpeed)).toBe(true)`.
- `level 1 has the agreed layout` — дополнить `expect(LEVELS[0]!.swaySpeed).toBe(15)`.
- Литералы в «uses an injected table» (`{ layout: ['D'] }`, `{ layout: ['S'] }`) —
  добавить `swaySpeed: 15` (иначе `typecheck` упадёт).

### 6.3 `src/game/wave.test.ts` (изменить)

- Литералы конфигов (`['.S.', 'D.D']`, `['D']`, `['X']`) — добавить `swaySpeed: 15`.
- Тест «stays still on update (static formation)» заменить на:
  «sways: enemies follow their slots on X, Y stays» — `LEVELS[0]`, запомнить `[x, y]`,
  `4` тика → `wave.formation.offset === 1`; для каждого врага `e.x === x0 + 1`,
  `e.y === y0`, `e.x === wave.formation.slotX(e.slot.col, e.width)` (позиция — слот этого
  же тика: строй обновлён до врагов).

### 6.4 `src/game/enemy.test.ts` (изменить)

- `new Formation(10, 3)` (2 места) → `new Formation(10, 3, 15)`.
- Новый тест «in formation follows the sway»: `formation.update(TICK_SECONDS)` ×4,
  `enemy.update()` → `enemy.x === formation.slotX(4, enemy.width)` и равно стартовому
  `x + 1`; `y` не изменился.

### 6.5 `src/game/battle.test.ts` (изменить)

- «moves the player and keeps the static wave in place» →
  «moves the player and sways the wave»: после одного `update` корабль сдвинут на
  `SHIP_SPEED * TICK_SECONDS`; каждый враг — `x === x0 + LEVELS[0]!.swaySpeed * TICK_SECONDS`
  (`+0.25`), `y` прежний.
- Тест «x = 42» не меняется (проверка до `update`).

### 6.6 Без изменений (проверить прогоном)

`src/game/battle-render.test.ts` (ожидания строятся из текущих `e.x/e.y` с
`Math.floor`; тест дробных координат уже есть), `src/game/scenes/play-scene.test.ts`
(позиции врагов не проверяет).

## 7. Ручная проверка

`npm run dev` → титул → Enter:

- строй стартует в центре и плавно едет вправо (сдвиг на 1 px примерно каждые 4 кадра),
  у правого края стоит заметно дольше одного кадра, разворачивается, доходит до левого
  края, так же стоит, возвращается; без рывков и «выскока» на 1 px у краёв;
- крайние враги не выходят за экран; корабль и выстрел работают как раньше;
  полный цикл ~4,4 с.

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- `levels.ts`: `LevelConfig { layout, swaySpeed }` (px/с, ADR 003), уровень 1 —
  `swaySpeed = 15`; `isAllowedSpeed(pxPerSecond)`; «Без импортов» → «импортирует
  `config` (`TICK_SECONDS`)».
- `formation.ts`: `Formation(cols, rows, swaySpeed)`, `SWAY_RANGE = 16`, `offset`
  (getter, дробный), `update(dt)` с разворотом (`maxOffset = 16 + max(0, 1 - step)`,
  края видны одинаково долго), `slotX` включает `offset`; убрать «Покачивания пока нет
  (007)».
- `wave.ts`: `update(dt)` — `formation.update(dt)`, затем `enemy.update()` каждого;
  `rng` пока не используется (009).
- `test-levels.ts`: `ONE_CORNER_ENEMY` — `swaySpeed = 15`, стартовый `x = 42`.
- Граф импортов: `levels → config`.
- «Принципы → Скорости»: + двоичные дроби `1/2, 1/4, 1/8` px/тик для медленных движений
  и таймеры в целых тиках — ссылка на `second-brain/decisions/003-slow-speeds-tick-timers.md`.

`game-design.md` не меняется (числа В1/В9 не менялись). README в `src/game/` нет.
Запись фичи (`second-brain/features/`) — не трогать.

## 9. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Сводка по файлам

| Действие | Файл                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| Создать  | `second-brain/decisions/003-slow-speeds-tick-timers.md`                      |
| Изменить | `second-brain/decisions/002-integer-speeds.md` (строка «Расширено: ADR 003») |
| Изменить | `src/game/levels.ts`                                                         |
| Изменить | `src/game/levels.test.ts`                                                    |
| Изменить | `src/game/formation.ts`                                                      |
| Изменить | `src/game/formation.test.ts`                                                 |
| Изменить | `src/game/wave.ts`                                                           |
| Изменить | `src/game/wave.test.ts`                                                      |
| Изменить | `src/game/enemy.test.ts`                                                     |
| Изменить | `src/game/battle.test.ts`                                                    |
| Изменить | `src/game/test-levels.ts`                                                    |
| Изменить | `second-brain/architecture/overview.md`                                      |

## Архитектура и паттерны

- Детерминизм: покачивание — только `dt` тика, `Rng` не участвует; двоичные дроби дают
  точные сравнения `toBe` в тестах.
- Логика отдельно от рендера: `Formation` — чистая модель, рендер по-прежнему
  `Math.floor(e.x)`; поведение покрыто без canvas.
- Граница engine/game не затронута; `levels → config` — допустимый лист графа.
- API по дизайну («Интерфейсы», строка 007 «Появление API»): `SWAY_RANGE`, `offset`,
  `update(dt)`, конструктор с `swaySpeed`; `maxOffset` и `dir` — приватные.
- `import type` для типов; `_dt` → `dt` в `Wave.update`, т.к. параметр теперь используется.
- Инвариант `swaySpeed < STEER_SPEED` — не здесь (задача 009).

## Открытые вопросы

Нет. Оба вопроса анализа решены архитектором (`discussion.md`, «Реализация: задача
007-formation-sway»): симметричный разворот с `maxOffset = SWAY_RANGE + max(0, 1 - step)`;
строка «расширено ADR 003» в ADR 002 — добавить.

Расхождение в дизайне (для архитектора, на реализацию не влияет): в `design.md`
(«Интерфейсы», комментарий к `test-levels.ts`) — «x ≈ 41 ± SWAY_RANGE», в коде и тестах
006 — `x = 42` (спрайт `drone` 11 px в ячейке 16). План следует коду.

## Ссылки

- `second-brain/tasks/tasks/007-formation-sway/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/002-enemies-and-levels/design.md`, `discussion.md`
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/architecture/overview.md`

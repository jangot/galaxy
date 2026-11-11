# План реализации: Прицеливание врагов

Виды врагов начинают различаться в фазе `descend`: `drone` (`aim: 'fixed'`) в первом
тике `descend` запоминает X центра корабля и смещается к этой точке, `striker`
(`aim: 'track'`) каждый тик смещается к текущему центру корабля. Боковой шаг —
`STEER_SPEED * dt` = 1 px/тик, порог 1 px по центру врага (не дрожит). `Wave.update`
получает `targetX`, `Battle` передаёт центр корабля.

Код: ветка `feature/002-enemies-and-levels`, база `20da398` + рабочее дерево задач
005–009. Рамка — `design.md` фичи 002 (пункт 6 нарезки, «Интерфейсы», «Уточнения для
реализации» → «Точные правила», строка 010 таблицы «Появление API по задачам») и
`analyze.md` этой задачи.

**Решение по открытому техническому выбору (окружение на тик в `Wave`):** новый объект
`EnemyEnv` на каждый вызов `Wave.update` — `{ diveSpeed: this.config.diveSpeed, targetX }`.
Причины: `EnemyEnv` остаётся `readonly` (как в дизайне), нет изменяемого состояния,
которое можно забыть обновить; цена — один маленький объект за тик (не за врага), для
≤ 38 врагов несущественно. Поле `private readonly env` из `Wave` удаляется.

Порядок шагов: после шагов 1–3 `typecheck` ломается в тестах до шага 4 (новое
обязательное поле `EnemyEnv.targetX`, новый аргумент `Wave.update`).

## 1. `enemy.ts`: вид прицеливания, `targetX`, шаг по X в `descend`

**Файл (изменить):** `src/game/enemy.ts`

1. Тип `Aim` и поле `aim` в спеке вида; комментарий «Aim mode arrives in task 010» убрать:

```typescript
/** How a diver picks its X target in 'descend'. fixed: once, on the first tick; track: every tick. */
export type Aim = 'fixed' | 'track';

/** Per-kind data. */
export interface EnemyKindSpec {
  readonly sprite: Sprite;
  readonly aim: Aim;
}

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  drone: { sprite: DRONE_SPRITE, aim: 'fixed' },
  striker: { sprite: STRIKER_SPRITE, aim: 'track' },
};
```

2. Комментарий `STEER_SPEED`: «Horizontal steering speed, px/s (1 px/tick): the X step of
   'descend' aiming and of 'returning'. Slower than the ship (SHIP_SPEED), so a tracker can
   be dodged.»

3. `EnemyEnv` — поле `targetX`, комментарий «`targetX` - 010» убрать:

```typescript
/** Per-tick input from the wave. The formation is not here: the enemy keeps its own. */
export interface EnemyEnv {
  /** Descend speed, px/s. */
  readonly diveSpeed: number;
  /** Center X of the ship, or null when there is nothing to aim at. */
  readonly targetX: number | null;
}
```

4. В `Enemy` — приватные поля вида прицеливания и зафиксированной цели:

```typescript
  private readonly aim: Aim;
  /** 'fixed' only: target taken on the first 'descend' tick; null - no target for this descend. */
  private fixedAimX: number | null = null;
```

В конструкторе: `const { sprite, aim } = ENEMY_KINDS[slot.kind];` … `this.aim = aim;`.

5. `startDive` — сбросить цель прошлого вылета (`this.fixedAimX = null;`) рядом с
   `side`. Функционально цель и так переписывается в тике `PEEL_TICKS + 1` до первого
   чтения, сброс — явная гарантия «не протекает».

6. `updateDiving` — ветка `descend` (порядок: взять цель `fixed` → сдвиг по X и Y →
   общий зажим X → уход за низ; зажим и переход остаются на месте):

```typescript
  /**
   * Ticks 1..PEEL_TICKS: peel segment by stateTicks. Then descend at diveSpeed, steering on X
   * towards aimX (fixed: taken on tick PEEL_TICKS + 1; track: env.targetX of this tick).
   */
  private updateDiving(dt: number, env: EnemyEnv): void {
    if (this.ticksInState <= PEEL_TICKS) {
      const segment = peelSegmentAt(this.ticksInState);
      this.x += segment.vx * this.side;
      this.y += segment.vy;
    } else {
      if (this.ticksInState === PEEL_TICKS + 1) this.fixedAimX = env.targetX;
      const aimX = this.aim === 'fixed' ? this.fixedAimX : env.targetX;
      this.x += steerStep(this.x + Math.floor(this.width / 2), aimX, STEER_SPEED * dt);
      this.y += env.diveSpeed * dt;
    }
    this.x = clamp(this.x, 0, SCREEN_WIDTH - this.width);
    // ... returning transition unchanged
  }
```

7. Модульная функция рядом с `clamp`:

```typescript
/**
 * X move of one 'descend' tick: a whole step towards aimX, or 0 when there is no target or it
 * is closer than one step (no jitter over the target: the gap shrinks by exactly one step).
 */
function steerStep(centerX: number, aimX: number | null, step: number): number {
  if (aimX === null) return 0;
  const gap = aimX - centerX;
  return Math.abs(gap) >= step ? Math.sign(gap) * step : 0;
}
```

8. JSDoc класса `Enemy`: диаграмма состояний не меняется; добавить строку «In 'descend'
   the enemy steers on X towards its aim (see ENEMY_KINDS[kind].aim).» `aimOffsetX` (013)
   и `canBeTargeted` (011) не добавлять.

## 2. `wave.ts`: `update(dt, targetX)`

**Файл (изменить):** `src/game/wave.ts`

- Удалить поле `env` и его создание в конструкторе (`this.env = { diveSpeed: ... }`).
- `update` строит окружение на тик:

```typescript
  /**
   * Tick order: formation sway -> every enemy (reads this tick's slots and targetX) -> attack
   * director (a newly launched enemy stands in this tick's slot and takes its first peel step
   * next tick). targetX: center X of the ship, or null when there is nothing to aim at.
   */
  update(dt: number, targetX: number | null): void {
    this.formation.update(dt);
    const env: EnemyEnv = { diveSpeed: this.config.diveSpeed, targetX };
    for (const enemy of this.enemies) enemy.update(dt, env);
    this.director.update(this.enemies, this.formation.cols, this.rng);
  }
```

`import type { EnemyEnv }` остаётся (используется в аннотации).

## 3. `battle.ts`: источник `targetX`

**Файл (изменить):** `src/game/battle.ts`

- `import { SHIP_WIDTH } from './ship';`
- В `update` (в обеих фазах — волна обновляется всегда):

```typescript
  /** Tick order: player -> wave (aims at the ship's center of this tick) -> collisions (playing only) -> phase. */
  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
    // Always a target for now; null while the ship is down arrives in task 011 (canBeTargeted).
    const targetX = this.player.ship.x + Math.floor(SHIP_WIDTH / 2);
    this.currentWave.update(dt, targetX);
    if (this.currentPhase === 'playing') resolveCollisions(this.player, this.currentWave);
    this.updatePhase();
  }
```

## 4. Существующие тесты: новые сигнатуры

**Файлы (изменить):**

- `src/game/enemy.test.ts` — `const ENV: EnemyEnv = { diveSpeed: 60, targetX: null };`
  (прямое пике сохраняет счёт `14 + 192 + 54` в тесте полного вылета); в
  `descends straight down at %i px/s` — `const env: EnemyEnv = { diveSpeed, targetX: null };`.
- `src/game/collisions.test.ts` (стр. 129, 169, 171) — `{ diveSpeed: 60, targetX: null }`
  (лучше вынести в константу `ENV` в начале файла с `import type { EnemyEnv }`).
- `src/game/attack-director.test.ts` — стр. 55: `{ diveSpeed: 60, targetX: null }`;
  стр. 181: `wave.update(TICK_SECONDS, null)` (тест зависит только от числа вылетов и
  возвратов).
- `src/game/wave.test.ts` — все `wave.update(TICK_SECONDS)` / `a.update`, `b.update` →
  `(TICK_SECONDS, SHIP_CENTER_X)` с константой в файле:
  `const SHIP_CENTER_X = 127; // default ship: x = 120, width 15`. Тест детерминизма —
  одинаковый `targetX` у обеих волн (с прицеливанием — проверка детерминизма сильнее).

После шага: `npm run typecheck` чистый, `npm test` — все прежние тесты зелёные.

## 5. Тесты прицеливания

**Файл (изменить):** `src/game/enemy.test.ts` (Vitest, environment `node`)

Помощник (рядом с `newEnemy`):

```typescript
function newEnemyOf(kind: EnemyKind): { enemy: Enemy; formation: Formation } {
  const formation = new Formation(10, 3, 15);
  return { enemy: new Enemy({ row: 1, col: 4, kind }, formation), formation };
}

const aimAt = (targetX: number | null, diveSpeed = 60): EnemyEnv => ({ diveSpeed, targetX });
const centerX = (e: Enemy): number => e.x + Math.floor(e.width / 2);
```

Опорные числа (строй стоит, `formation.update` не вызывается, `side = 1`): `baseX = 48`;
дрон col 4 — `x = 114`, после peel `x = 128`, центр 133; страйкер col 4 — `x = 113`,
после peel `x = 127`, центр 133. Тесты считают от позиции после peel, константы
выше — только как ориентир (в тестах проверять `expect(centerX(enemy)).toBe(133)` как
предусловие).

Новый `describe('Enemy aim')`:

- **Виды:** `ENEMY_KINDS.drone.aim === 'fixed'`, `ENEMY_KINDS.striker.aim === 'track'`.
- **Peel не зависит от цели** (`it.each` по видам): две копии, peel `P` тиков с
  `aimAt(0)` и с `aimAt(null)` — одинаковые `x`, `y`.
- **`fixed` берёт цель в первом тике `descend`:** дрон, peel `P` с `aimAt(250)`; тик
  `P + 1` с `aimAt(100)` → `x = 127`; далее 10 тиков с `aimAt(250)` → `x` убывает на 1 за
  тик (`117`): смена `targetX` не меняет направление.
- **`fixed` доходит до цели и идёт прямо:** дрон, после peel 20 тиков с `aimAt(123)` →
  первые 10 тиков `x` убывает, затем `centerX = 123` и `x` постоянен; `y` растёт на 1
  каждый тик.
- **`fixed` без цели в первом тике `descend`:** дрон, после peel тик с `aimAt(null)`,
  затем 30 тиков с `aimAt(0)` → `x` всё время `128`.
- **`fixed` не берёт цель прошлого вылета:** дрон, первый вылет — `descend` с
  `aimAt(100)`, прогон до `formation` (цикл с ограничением 10 000 тиков, как в тесте
  полного вылета); второй вылет — тик `P + 1` с `aimAt(null)`, затем 10 тиков с
  `aimAt(100)` → `x` не меняется.
- **`track` преследует:** страйкер, после peel 5 тиков с `aimAt(0)` → `x` −1 за тик;
  3 тика с `aimAt(250)` → +1 за тик (разворот); 4 тика с `aimAt(null)` → `x` не
  меняется; снова `aimAt(0)` → −1 за тик.
- **Не дрожит (дробный центр):** страйкер после peel, `enemy.x = 127.25` (центр 133,25):
  20 тиков с `aimAt(133)` → `x === 127.25`; `enemy.x = 127.75` → 20 тиков с `aimAt(133)`
  (разница −0,75) → `x === 127.75`, затем с `aimAt(134)` (разница 0,25) → стоит.
  Разница ровно 1: `enemy.x = 127`, `aimAt(134)` → один шаг (`x = 128`), дальше стоит
  10 тиков.
- **Шаг по Y не зависит от бокового:** `it.each([60, 120])`, страйкер после peel с
  `aimAt(0, diveSpeed)` — каждый тик `y += diveSpeed / 60`, `x` −1.
- **Зажим при цели у края** (`it.each` `[0, 0]` / `[255, SCREEN_WIDTH - width]`): страйкер
  после peel, `enemy.x = 3` или `SCREEN_WIDTH - width - 3`, 10 тиков с `aimAt(target)` →
  `x` в `[0, SCREEN_WIDTH - width]` каждый тик, в конце — на краю.
- **Порог по центру своего спрайта:** дрон и страйкер после peel, у обоих `enemy.x = 100`,
  5 тиков с `aimAt(105)`: дрон (центр 105) стоит на `100`; страйкер (центр 106) делает
  один шаг на `99` и стоит.

`EnemyKind` — `import type { EnemyKind } from './levels'`.

**Файл (изменить):** `src/game/wave.test.ts` — в `describe('Wave dives')`:

- **Волна передаёт `targetX` врагам:** `new Wave(passiveLevel(['S'], { firstDiveDelayTicks: 1 }), createRng(1))`;
  `1 + P` тиков с `update(dt, 0)`, затем ещё тик — `x` уменьшился на 1; тик с
  `update(dt, null)` — `x` не изменился. `P` — сумма `PEEL_SEGMENTS[].ticks`.

**Файл (изменить):** `src/game/battle.test.ts`

- **Бой целится в центр корабля:** `new Battle(createRng(1), { levels: [passiveLevel(['S..........'], { firstDiveDelayTicks: 1 })] })`;
  `run(battle, 1 + P + 120)` (без ввода; корабль по умолчанию `x = 120`, центр 127):
  враг `diving`, `|enemy.x + Math.floor(enemy.width / 2) - (ship.x + Math.floor(SHIP_WIDTH / 2))| < 1`.
  Страйкер col 0: после peel центр ≈ 33,25, до цели ≈ 94 px — доходит за 94 тика,
  а до низа экрана ему ≈ 205 тиков. Центр экрана (128) условию не удовлетворяет
  (126,25 против 128), так что тест отличает «центр корабля» от других констант.
  Импорт `passiveLevel`, `PEEL_SEGMENTS`, `SHIP_WIDTH`.

## 6. Ручная проверка

`npm run dev`, уровень 1:

- дрон (нижние ряды) после дуги летит наискосок в точку, где был корабль в начале
  пике; если отъехать — пролетает мимо, туда, где корабль был;
- страйкер (верхний ряд) после дуги «ведёт» корабль; при движении корабль уходит от
  него (2 px/тик против 1 px/тик);
- над целью враги летят ровно вниз, без дрожания по X;
- у краёв экрана враги не выходят за край; после ухода за низ возвращаются в слот,
  как в 009.

## 7. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `enemy.ts`: `ENEMY_KINDS { sprite, aim }` (`Aim = 'fixed' | 'track'`: `drone` —
  `fixed`, `striker` — `track`); `EnemyEnv { diveSpeed, targetX }` — новый объект на
  тик от волны; `descend` — `vy = diveSpeed`, по X шаг `STEER_SPEED` (1 px/тик) к
  `aimX`, если до него по центру врага (`x + floor(width / 2)`) ≥ 1 px, иначе стоит;
  `fixed` — цель берётся в первом тике `descend` (`null` → весь `descend` прямо вниз),
  `track` — `targetX` каждого тика (`null` → `vx = 0`); `STEER_SPEED` — и в `descend`,
  и в `returning`.
- `wave.ts`: `update(dt, targetX)`; «`AttackDirector` — один на уровень, `EnemyEnv` —
  новый на тик (`diveSpeed` уровня + `targetX`)».
- `battle.ts`: в `update` волна получает `targetX` = центр корабля
  (`ship.x + floor(SHIP_WIDTH / 2)`), пока всегда (`null` при `down` — 011).
- Граф импортов: `battle → {player, ship, wave, levels, collisions}`.

`README.md` в `src/game/` нет. `game-design.md` не меняется (поведение видов уже
описано решением В4). Запись фичи в `second-brain/features/` не трогать.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/enemy.ts`                     |
| Изменить | `src/game/wave.ts`                      |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/enemy.test.ts`                |
| Изменить | `src/game/wave.test.ts`                 |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/collisions.test.ts`           |
| Изменить | `src/game/attack-director.test.ts`      |
| Изменить | `second-brain/architecture/overview.md` |

Проверка в конце: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Логика без рендера и canvas: всё поведение — в `Enemy.update(dt, env)`, рендер не
  меняется (`Math.floor(x)`).
- Детерминизм: без `Rng`, время — только `dt` (`STEER_SPEED * dt`, `diveSpeed * dt`);
  фаза — по `stateTicks` («Правило тиков переходов»).
- Целые скорости (ADR 002): шаг 1 px/тик; дробный `x` от покачивания (ADR 003) учтён
  порогом по дробному центру.
- `Enemy` не знает о корабле: цель приходит через `EnemyEnv`, источник — `Battle`.
- `import type` для `EnemyEnv`, `EnemyKind`; без неиспользуемых полей (`aimOffsetX`,
  `canBeTargeted` — задачи 013 и 011).

## Открытые вопросы

нет. Технический выбор из `analyze.md` (окружение на тик в `Wave`) решён выше: новый
объект за тик.

## Ссылки

- `second-brain/tasks/tasks/010-enemy-aim/analyze.md`, `description.md`
- CLAUDE.md
- `second-brain/features/002-enemies-and-levels/design.md` — «Сущности и состояния»,
  «Интерфейсы», «Уточнения для реализации» → «Точные правила», «Появление API по
  задачам» (010), решение В4, нарезка п. 6
- `second-brain/features/002-enemies-and-levels/discussion.md` — п. 7
- `second-brain/decisions/002-integer-speeds.md`, `second-brain/decisions/003-slow-speeds-tick-timers.md`
- `second-brain/architecture/overview.md`

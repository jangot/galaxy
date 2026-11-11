# Анализ: Модель руления пикирующих врагов

Код: ветка `feature/003-enemy-flight`, коммит `cfc9e12`; `npm test` — 385/385 зелёные.
Рамка — согласованный `second-brain/features/003-enemy-flight/design.md` (раунд 2), пункт 1
нарезки. Анализ уточняет дизайн по коду, не перепроектирует.

## Общее описание функциональности

Рефакторинг без изменения поведения: боковое движение врага в фазе `descend` переводится с
двухвариантного `Aim = 'fixed' | 'track'` на единую параметрическую модель
«переприцеливание → желаемая скорость → инерция → сдвиг». Модель живёт в новом чистом модуле
`src/game/steering.ts`, а у каждого вида в `ENEMY_KINDS` вместо `aim` появляется профиль
`steer: SteerSpec`. Профили в этой задаче подобраны так, чтобы повторить нынешнее поведение:

| Вид       | Было      | `retargetTicks` | `turnTicks` | `maxVx` |
| --------- | --------- | --------------- | ----------- | ------- |
| `drone`   | `'fixed'` | `null`          | `0`         | `1`     |
| `striker` | `'track'` | `1`             | `0`         | `1`     |
| `raider`  | `'fixed'` | `null`          | `0`         | `1`     |

Игрок ничего не замечает. Смысл задачи — подготовить механизм для 015 (`drone`
переприцеливается раз в 30 тиков) и 016 (`striker` с инерцией `T = 8`): там меняется только
число в профиле плюс тесты.

## Модели данных и состояние

**`SteerSpec`** (новый, `steering.ts`, readonly, в `ENEMY_KINDS[kind].steer`):

| Поле            | Тип              | Ограничение                                  | Смысл                                                              |
| --------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `retargetTicks` | `number \| null` | целое ≥ 1 или `null`                         | цель берётся в тики `descend` 1, 1+N, 1+2N…; `null` — только в 1-м |
| `turnTicks`     | `number`         | целое ≥ 0                                    | тиков на изменение `vx` на 1 px/тик; 0 — сразу                     |
| `maxVx`         | `number`         | целое ≥ 1, `< SHIP_SPEED·TICK_SECONDS` (= 2) | предел `                                                           | vx  | `, px **за тик**, без `dt` |

**`SteerState`** (новый, `steering.ts`): `{ vx, turnCounter }` — значение, которое возвращает
`turn`.

**Функции `steering.ts`** (сигнатуры — дизайн, «Интерфейсы»):

- `isRetargetTick(d, retargetTicks)` — `d` 1-based; `null` → только `d === 1`; иначе
  `(d − 1) % N === 0`.
- `desiredVx(centerX, aimX, maxVx)` — `aimX === null` → 0; `|aimX − centerX| ≥ 1` →
  `sign · maxVx`; иначе 0. Повторяет нынешний `steerStep` (`enemy.ts:309-313`) при шаге 1 —
  включая поведение с дробным центром.
- `turn(state, desired, turnTicks)` — правила п. 3 дизайна («Правила тика descend»):
  `turnTicks = 0` → `{desired, 0}`; `vx === desired` → счётчик 0; иначе `++` и при
  `≥ turnTicks` шаг `vx` на ±1 и счётчик 0; смена `desired` счётчик не сбрасывает.

**Состояние `Enemy` на вылет** (private; сброс **только** в `startDive`):

| Было (`enemy.ts`)                    | Станет                              | Примечание                               |
| ------------------------------------ | ----------------------------------- | ---------------------------------------- |
| `private readonly aim: Aim` (`:112`) | `private readonly steer: SteerSpec` | берётся в конструкторе из `ENEMY_KINDS`  |
| `fixedAimX: number \| null` (`:117`) | `aimX: number \| null`              | `null` до 1-го тика `descend` и без цели |
| —                                    | `steerVx: number`                   | целое px/тик                             |
| —                                    | `turnCounter: number`               | при `turnTicks = 0` всегда 0             |
| `fixedAim(targetX)` (`:239-245`)     | `aimFor(targetX)`                   | та же формула, вызывается для всех видов |

Публичный геттер `get vx(): number` — от состояния: `steerVx`, если `state === 'diving'` и
`stateTicks > PEEL_TICKS`, иначе 0 (готового `isDescending` нет — условие или private-хелпер).

**Тик `descend`** (`d = stateTicks − PEEL_TICKS`), заменяет строки `enemy.ts:217-220`:

1. `d === 1`: `steerVx = clamp(lastPeel.vx · side, −maxVx, maxVx)` (последний отрезок
   `PEEL_SEGMENTS` — `vx = 1`), `turnCounter = 0`.
2. `isRetargetTick(d, retargetTicks)` → `aimX = aimFor(env.targetX)`.
3. `desired = desiredVx(x + floor(width/2), aimX, maxVx)`; `turn(...)` → `steerVx`, `turnCounter`.
4. `x += steerVx` (без `dt`); `y += diveSpeed · dt` (как сейчас).
5. Зажим `x` в `[0, SCREEN_WIDTH − width]` (сейчас общий для peel и descend, `:222`); если в
   `descend` зажим сработал и `steerVx` направлен в стену — `steerVx = 0`, `turnCounter = 0`.
6. Уход за низ и `fires()` — без изменений (`:223-230`).

**Константы:** `STEER_SPEED = 60` остаётся (шаг `returning` и инвариант `swaySpeed < STEER_SPEED`
в `levels.test.ts:127`), меняется только комментарий. `PEEL_TICKS` — не экспортирован, остаётся
private-константой модуля. `DRONE_RETARGET_TICKS` / `STRIKER_TURN_TICKS` в 014 **не вводятся**
(появятся в 015/016).

**Почему поведение не меняется (проверено по коду):**

- Во всех тестах и в игре `dt = TICK_SECONDS`, `STEER_SPEED · dt = 1` ≡ `maxVx = 1`.
- При `turnTicks = 0` шаг 3 перезаписывает `vx` п. 1 и обнуление у стены п. 5 — эффект нулевой.
- `striker` через `aimFor` получает цель, зажатую в `[6, 249]` (ширина 13); центр корабля в игре
  ∈ [7, 248]. Тестовые цели 0 / 250 / 255 (`enemy.test.ts:516-591`) дают те же `x`: при цели 0
  враг упирается в `x = 0` (центр 6), при 255 — в `x = 243` (центр 249) — совпадает с нынешним
  зажимом `x`. У `drone` диапазон `[5, 250]`, тестовая цель 250 не меняется.
- Группа `raider` идёт через тот же `aimFor` в 1-м тике — без изменений.

## Связанные модули и сущности

| Модуль / сущность          | Назначение                                                  | Файлы                                                         |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Руление (новое)            | Чистые функции и типы модели `descend`                      | `src/game/steering.ts`, `steering.test.ts`                    |
| `Enemy`, `ENEMY_KINDS`     | Автомат врага, профили видов, `descend`                     | `src/game/enemy.ts`, `enemy.test.ts`                          |
| Инварианты уровней         | Правила скоростей/таймеров, туннелирование                  | `src/game/levels.test.ts`                                     |
| Корабль                    | `SHIP_SPEED = 120` (2 px/тик) — граница для `maxVx`         | `src/game/ship.ts`                                            |
| `DiveOrder`, `diveOrder()` | Сдвиги группы, `side`; фабрика для тестов                   | `src/game/enemy.ts`, `src/game/test-levels.ts`                |
| Потребители `ENEMY_KINDS`  | Берут только `sprite` — замена `aim → steer` их не задевает | `battle-render.ts`, `battle-render.test.ts`, `levels.test.ts` |
| Документация               | Описание `enemy.ts`, граф импортов, принципы                | `second-brain/architecture/overview.md`                       |

## Точки встраивания

- Единственная точка в логике — `Enemy.updateDiving` (`src/game/enemy.ts:211-231`), ветка
  `descend`. Peel, `returning`, `fires()`, `kill()` и порядок тика не трогаются.
- `startDive` (`:167-177`): вместо `fixedAimX = null` — сброс `aimX`, `steerVx`, `turnCounter`.
- Конструктор (`:128-131`): берёт `steer` вместо `aim`.
- Граф импортов: новое ребро `enemy → steering` (значения — функции, тип `SteerSpec` —
  `import type`); `steering` — без импортов. `Wave`, `AttackDirector`, `Battle`, `collisions`,
  рендер, сцены — без изменений. Ввод и HUD не затронуты.

## Файлы и места в коде

| Файл                                    | Что содержит                                                                  | Что изменить / создать                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/steering.ts`                  | —                                                                             | **Создать**: `SteerSpec` (комментарий «whole px PER TICK, no dt» у `maxVx`), `SteerState`, `isRetargetTick`, `desiredVx`, `turn`. Без импортов.                                                                                                                                                                                                                      |
| `src/game/steering.test.ts`             | —                                                                             | **Создать**: тесты функций на произвольных профилях (см. «Тестируемость»).                                                                                                                                                                                                                                                                                           |
| `src/game/enemy.ts`                     | `Aim`, `ENEMY_KINDS.aim`, `fixedAimX`, `fixedAim`, `steerStep`, `STEER_SPEED` | Удалить `Aim` и `steerStep`; `EnemyKindSpec.steer`; профили из таблицы выше; поля `aimX`/`steerVx`/`turnCounter`; `aimFor`; геттер `vx`; тик `descend` по правилам 1–6; комментарии класса (`:96-100`), `updateDiving` (`:205-210`), `fixedAim` → `aimFor` (`:233-238`), `STEER_SPEED` (`:31-34`, теперь только `returning`).                                        |
| `src/game/enemy.test.ts`                | «Enemy aim» (`:446-594`), «Enemy group aim» (`:784-843`)                      | Тест «drone and raider aim once, striker tracks» (`:447-451`) → тест профилей `ENEMY_KINDS.*.steer`. Тест «track does not read the group offsets» (`:820-832`) → заменить (см. «Открытые вопросы», п. 1). Добавить проверки геттера `vx`. Остальные — без изменений.                                                                                                 |
| `src/game/levels.test.ts`               | правила скоростей (`:110-145`)                                                | Новый тест по `Object.entries(ENEMY_KINDS)`: `maxVx` целое ≥ 1 и `< SHIP_SPEED · TICK_SECONDS`, `retargetTicks` — `null` или целое ≥ 1, `turnTicks` — целое ≥ 0. Добавить импорт `SHIP_SPEED` из `./ship` (уже импортируется `SHIP_HEIGHT`).                                                                                                                         |
| `second-brain/architecture/overview.md` | описание `enemy.ts`, граф импортов, «Принципы»                                | Описать `steering.ts`; в описании `enemy.ts` заменить `aim`/`fixed`/`track`/`STEER_SPEED в descend` на профили `steer`, `aimX`/`vx`/`turnCounter`, геттер `vx`; граф: `enemy → {config, enemy-art, ship, steering}`, `steering` — без импортов; в «Принципах» — «X в `descend` — целые px/тик без `dt` (как `PEEL_SEGMENTS`; допустимо, `dt` фиксирован — ADR 003)». |

Не меняются в 014: `wave.ts`/`wave.test.ts`, `battle.ts` (комментарий про `null`-цель — 015/016),
`battle.test.ts`, `attack-director.ts`, `levels.ts`, `collisions.ts`, рендер, `game-design.md`.

## Тестируемость

Всё — unit-тесты без canvas; `Rng` не нужен (модель от тиков), `dt = TICK_SECONDS`.

- **`steering.test.ts`** (произвольные профили, не зависят от чисел `ENEMY_KINDS`):
  - `isRetargetTick`: `null` — истина только на тике 1; `N = 1` — каждый тик; `N` (напр. 30) —
    тики 1, N+1, 2N+1 истинны, N и 2 — ложны.
  - `desiredVx`: `aimX = null` → 0; gap < 1 при дробном центре (напр. 132,75 → 133) → 0; ± при
    gap ≥ 1; `maxVx > 1` → `±maxVx`.
  - `turn`: `turnTicks = 0` → сразу `desired`, счётчик 0; раскладка разворота `+1 → −1` при
    `T > 0` (тики 1…T−1 — `+1`, T…2T−1 — `0`, с 2T — `−1`); смена `desired` посреди накопления
    не сбрасывает счётчик; `vx === desired` сбрасывает.
  - Сценарий уходимости с контролем `T = 0` — **не в 014**, это 016.
- **`enemy.test.ts`**: профили `ENEMY_KINDS` (заменяет тест `aim`); геттер `vx` — 0 в
  `formation`/peel/`returning`/`exploding`, в `descend` равен фактическому сдвигу `x` за тик
  (без зажима); сброс состояния вылета покрыт существующим «fixed does not reuse the target of
  the previous sortie». Все остальные тесты «Enemy aim» и «Enemy group aim» — проходят без правок
  (это и есть проверка «поведение не изменилось»).
- **`levels.test.ts`**: инварианты профилей (см. таблицу файлов).
- **Глазами** (`npm run dev`, `?level=1…5`): игра не меняется — `drone` летит в точку старта
  корабля, `striker` ведёт корабль без задержки, группы `raider` (уровни 4–5) как раньше.

## Зависимости и ограничения

- Разрешение 256×240, фиксированный шаг 60 тиков/с. `x += vx` без `dt` опирается на ADR 003
  (`dt` фиксирован) — так уже сделан `PEEL_SEGMENTS`. Вертикаль остаётся `diveSpeed · dt`.
- Целые `vx` (ADR 002); `x` в полёте остаётся дробным от слота и меняется на целые px — рендер по
  `Math.floor` не дёргается.
- Производительность: на врага за тик — несколько сравнений, аллокация `SteerState` из `turn`
  (≤ 34 врагов, только пикирующие) — пренебрежимо.
- Риск: тесты, которые вызывают `update` с `dt ≠ TICK_SECONDS` в `descend`, изменили бы
  поведение (X больше не зависит от `dt`) — поиском по `src/**/*.test.ts` таких нет.
- Ограничение модели, не влияющее на 014: `desiredVx` даёт `±maxVx` уже при gap ≥ 1, поэтому
  при `maxVx > 1` враг будет проскакивать цель на `maxVx − 1` px и дрожать. Сейчас и в 015/016
  `maxVx = 1`; правило записано в дизайне так осознанно, отмечаю как известное свойство.
- Зависимости: 013-raiders уже в коде; 015 и 016 зависят от этой задачи.

## Открытые вопросы

Вопросов к владельцу нет. Уточнения для плана (решаются в `/plan-implementation`, в рамках
дизайна):

1. **Чем заменить «track does not read the group offsets».** Дизайн говорит только, что тест
   заменяется (смещения теперь читает каждый вид). Предложение: заменить его тестом «every kind
   reads the group offsets» — `striker` с `aimOffsetX = 32` целится в `target + 32` (у одиночек
   сдвиги всегда 0, в игре поведение то же), либо просто удалить, т. к. формулу якоря уже
   покрывают тесты группы `raider`. Рекомендую первое — фиксирует новое единое правило.
2. **Правило стены (п. 5) в 014 не наблюдаемо** (при `turnTicks = 0` обнуление перезаписывается
   на следующем тике). Реализуется сейчас по дизайну; тест на `vx = 0` у стены — в 016. Можно
   проверить в 014 через геттер `vx` в тике упора — по желанию плана.

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md («Пикирование»)
- second-brain/features/003-enemy-flight/design.md, discussion.md, dev-review.md
- second-brain/architecture/overview.md
- second-brain/decisions/002-integer-speeds.md, 003-slow-speeds-tick-timers.md
- src/game/enemy.ts, src/game/enemy.test.ts, src/game/levels.test.ts, src/game/ship.ts

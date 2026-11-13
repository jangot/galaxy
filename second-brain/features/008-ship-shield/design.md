# Дизайн: Щит корабля вместо запаса жизней

**Статус:** согласовано · **Раунд:** 3

Опирается на фичи 005 (жизни, счёт, game over), 006 (капсулы, бонус `L`, бесполезный бонус)
и 007 (повтор астероида — не затрагивается). Код: `src/game/player.ts`, `battle.ts`,
`collisions.ts`, `score.ts`, `hud.ts`, `hud-render.ts`, `battle-render.ts`, `art.ts`,
`bonus.ts`, `bonus-art.ts`, `bonus-field.ts`, `dev-params.ts`, `dev-snapshot.ts`,
`scenes/title-scene.ts`. Все вопросы В1–В9 владелец закрыл рекомендуемыми вариантами
(см. «Решения владельца»); ответы на отзывы разработчика — `discussion.md`, «Раунд 2» и
«Раунд 3».

## Цель и сценарии

Сейчас у игрока запас кораблей (старт 3, предел 5): гибель → 1 с пусто → возрождение по
центру → 2 с мигания. Владелец меняет концепцию: **корабль один**, перед ним — **щит** с
уровнями прочности. Попадание по кораблю со щитом не убивает, а ослабляет щит на один
уровень; щит меняет цвет от зелёного к красному и исчезает. Попадание по кораблю **без
щита** — конец игры. Бонусы делают щит «зеленее».

### Модель: шкала щита (В1)

Щит — целое `shield` от `0` до `MAX_SHIELD = 5`. `0` — щита нет. Каждое попадание по кораблю
со щитом — `shield − 1`; попадание при `shield = 0` — гибель и конец игры.

**Ударов до конца игры = `shield + 1`** (последний удар приходится в голый корабль). Так
шкала однозначно переводится в «жизни» старой модели:

| `shield` | цвет           | ударов до конца игры | роль                    |
| -------- | -------------- | -------------------- | ----------------------- |
| 5        | зелёный        | 6                    | максимум («запас на 6») |
| 4        | светло-зелёный | 5                    |                         |
| 3        | жёлто-зелёный  | 4                    |                         |
| 2        | жёлтый         | 3                    | **старт** («с жёлтого») |
| 1        | красный        | 2                    |                         |
| 0        | щита нет       | 1                    | следующий удар — конец  |

- **Старт:** `START_SHIELD = 2` (жёлтый) — игрок переживает 2 удара и погибает на 3-м.
  По **числу ударов** это ровно старые `START_LIVES = 3`.
- **Максимум:** `MAX_SHIELD = 5` (зелёный) — переживает 5 ударов, погибает на 6-м: «запас
  на 6 жизней». Это на одну «жизнь» больше старого `MAX_LIVES = 5`.
- Последовательность владельца «зелёный → жёлтый → красный → нет» сохраняется: от старта
  жёлтый → красный → нет → конец; от максимума добавляются две зелёные градации сверху.

### Баланс: что меняется, кроме числа ударов

Число ударов до конца игры на старте прежнее, но **передышка после удара другая**:

|                  | сейчас (гибель и возрождение)                    | щит                                              |
| ---------------- | ------------------------------------------------ | ------------------------------------------------ |
| неуязвимость     | 3 с (`DOWN_TICKS` 60 + `INVULNERABLE_TICKS` 120) | 2 с (`INVULNERABLE_TICKS` 120)                   |
| в прицеле врагов | нет 1 с (`canBeTargeted` в `down`)               | да, всё время                                    |
| позиция          | перенос в центр                                  | остаётся на месте (часто под пикирующей группой) |

Поэтому удары, вероятно, пойдут чаще, чем гибели сейчас. Владелец решил оставить 2 с и
оценить на приёмке («не слишком ли быстро снимается щит»); точка подстройки —
`INVULNERABLE_TICKS` (одна константа в `player.ts`).

### Что видит игрок

1. **Старт игры:** корабль по центру, над ним — жёлтая дуга щита; в панели справа (где
   были иконки жизней) — шкала щита: 2 из 5 сегментов залиты жёлтым (В9).
2. **Попадание по щиту** (вражеский выстрел или таран, В2): в тик попадания щит теряет
   уровень (дуга и шкала сразу нового цвета; со `shield = 1` дуга исчезает); выстрел
   пропадает; таранивший враг взрывается и засчитывается как сбитый в полёте (В3). Корабль
   **не исчезает и не переносится в центр**: остаётся на месте, управляем, стреляет, но
   2 с мигает вместе со щитом и неуязвим (В4) — как сейчас после возрождения.
3. **Попадание без щита:** корабль взрывается (как сейчас при гибели), через 1 с — `GAME
OVER` (поведение фичи 005 для последнего корабля без изменений). Возрождения больше нет.
4. **Капсула `L`** (В5, В8): `shield + 1` (дуга и шкала «зеленеют»); на максимуме — 500 очков
   (как бесполезный бонус сейчас). Капсулы `S`/`D` — без изменений.
5. **Порог очков** 5000, 15000, 25000, … (В6): `shield + 1`; сверх максимума — пропадает
   (порог пройден), как сейчас доп. жизнь сверх 5.
6. Смена уровня щит не трогает. Новая игра — снова `START_SHIELD`.

### Крайние случаи (решения архитектора)

- **Одно попадание за тик** (правило `collisions.ts` сохраняется): выстрел и таран в одном
  тике снимают один уровень; таранщик, не успевший ударить, летит дальше.
- **Неуязвимость** — тот же `invulnerable`, что сейчас после возрождения: `canBeHit = false`,
  враги и выстрелы проходят сквозь корабль; повторное попадание таймер не продлевает.
  Капсулы ловятся (как сейчас в `invulnerable`).
- **Попадание при `shield = 1`** уводит в `0` и в `invulnerable` (а не в `down`): красный щит
  «сгорает», дав последние 2 с защиты. Только удар при `shield = 0` — `down`.
- **`down` — конечное состояние** (В7): одна жизнь, возрождения нет. Очки за выстрел,
  долетевший после гибели, начисляются (как сейчас), но порог очков в `down` щит не даёт и
  game over не отменяет (`addShield` в `down` — no-op). Капсула в `down` не ловится (как
  сейчас).
- **Таран при `shield = 0`, пересёкший порог очков** (сейчас 5 → 4 → 5): попадание
  обрабатывается первым → `down`; очки за таран начисляются, `addShield` уже no-op — конец
  игры. На `shield > 0` тот же случай: `shield − 1` → `+1` (как раньше 5 → 4 → 5).
- **Попадание и `L` в одном тике:** коллизии с врагами раньше бонусов, поэтому сначала
  `− 1` и `invulnerable`, затем `+ 1` (капсула ловится в `invulnerable`). При `shield = 0` —
  `down`, капсула не ловится.
- **Экран и края:** щит той же ширины, что корабль (15 px), — у краёв экрана не обрезается.
- **Хитбокс не меняется** — прямоугольник спрайта корабля 15×16. Щит — только картинка
  (см. «Альтернативы»). Выстрел (4 px/тик) пропадает, когда касается `y = 208`; в этот тик он
  нарисован примерно на уровне дуги щита — визуально «ударился в щит».
- **Свой выстрел рождается внутри дуги:** `ship.spawnShot` ставит его в `y = 204…207` по
  колонке носа, дуга — строки 203…206; корабль и щит рисуются после выстрелов, так что в тик
  выстрела он наполовину скрыт дугой. Логику не трогает — пункт приёмки 032.
- **`drone`, подхватывающий возродившийся корабль** (фича 003, В3), теперь не встречается:
  корабль `down` только перед game over. Код прицеливания не меняется (`canBeTargeted`).
- **Детерминизм:** `Player` не использует `rng`, порядок `BONUS_KINDS` тот же — розыгрыш не
  сдвигается. Поведение с тем же seed совпадает со старым только до первого попадания
  (дальше корабль не исчезает, прицел и позиция другие) — это ожидаемо.

## Модули и файлы

| Модуль / файл                                                        | Ответственность                                                                                                                                                                                                                                                                           | Новый / изменяемый      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/game/player.ts`                                                 | `lives` → `shield`; `START_SHIELD`, `MAX_SHIELD`; `hit()` со щитом → `invulnerable`, без щита → `down` (конечное); `addLife()` → `addShield(): boolean`; убрать возрождение (`down → invulnerable`, перенос в `SHIP_START_X`); **`DOWN_TICKS` удалить**                                   | изменяемый              |
| `src/game/battle.ts`                                                 | `BattleOptions.lives` → `shield`; `GAME_OVER_DELAY_TICKS = 60` задаётся здесь литералом (вместо `= DOWN_TICKS`); `addScore` → `addShield` по порогам; `applyBonus('shield')`: `if (!player.addShield()) addScore(BONUS_FALLBACK_POINTS)`; фаза `over` — без изменений (`isLost` = `down`) | изменяемый              |
| `src/game/score.ts`                                                  | переименование: `EXTRA_LIFE_FIRST/EVERY` → `EXTRA_SHIELD_FIRST/EVERY`, `extraLivesEarned` → `extraShieldsEarned` (значения и формула те же); комментарий `BONUS_FALLBACK_POINTS` («L at MAX_LIVES» → «L at MAX_SHIELD»)                                                                   | изменяемый              |
| `src/game/bonus.ts`                                                  | `BonusKind`: `'life'` → `'shield'` (порядок `BONUS_KINDS` тот же — розыгрыш `rng` не сдвигается); комментарий                                                                                                                                                                             | изменяемый              |
| `src/game/bonus-art.ts`                                              | ключ `CAPSULE_SPRITES.life` → `shield`; спрайт `L` без изменений (В8); комментарий «L - life» → «L - shield»                                                                                                                                                                              | изменяемый              |
| `src/game/collisions.ts`                                             | логика без изменений (зовёт `player.hit()`); правка комментариев («hit» = попадание по щиту или гибель)                                                                                                                                                                                   | изменяемый              |
| `src/game/ship.ts`                                                   | только комментарии («lives are shown…», «start and respawn x» → «start x»)                                                                                                                                                                                                                | изменяемый              |
| `src/game/art.ts`                                                    | `SHIELD_COLORS`, `SHIELD_SPRITES` (дуга 15×4 в цвете уровня), `SHIELD_OFFSET_Y`, `SHIELD_GAUGE_EMPTY_COLOR`; `LIFE_ICON_SPRITE` удалить (в 033). **Не импортирует логику** (`player.ts`, `ship.ts`, `battle.ts`) — см. ниже                                                               | изменяемый              |
| `src/game/battle-render.ts`                                          | `drawShip`: дуга щита над кораблём (в `active`/`invulnerable`, мигает вместе с кораблём)                                                                                                                                                                                                  | изменяемый              |
| `src/game/hud.ts`                                                    | 031: `HudView.lives` → `shield`. 033: `LIVES_ZONE` → `SHIELD_ZONE` (та же область 200…247 × 14…21), `SHIELD_SEGMENT_*`, `shieldSegmentX`; `LIFE_ICON_STEP/MAX_SIZE` → `HUD_ICON_STEP/HUD_ICON_SIZE` (их же используют значки улучшений); `LIVES_ICON_SLOTS` удалить                       | изменяемый              |
| `src/game/hud-render.ts`                                             | 031: `drawLives` временно рисует `shield` иконок. 033: `drawLives` → `drawShield`: `MAX_SHIELD` сегментов, залиты первые `shield` цветом уровня, остальные — пустые                                                                                                                       | изменяемый              |
| `src/game/dev-params.ts`                                             | `?lives=N` → `?shield=N` (`0 … MAX_SHIELD`)                                                                                                                                                                                                                                               | изменяемый              |
| `src/game/dev-snapshot.ts`                                           | `BattleSnapshot.lives` → `shield` (только верхний уровень, в `player` не дублировать); `bonus`/`kind` — `'shield'` вместо `'life'`                                                                                                                                                        | изменяемый              |
| `src/game/scenes/title-scene.ts`                                     | `GameStart = Pick<BattleOptions, 'startLevel' \| 'shield'>`; комментарии про `START_LIVES`                                                                                                                                                                                                | изменяемый              |
| `src/main.ts`                                                        | передать `shield` из dev-параметров                                                                                                                                                                                                                                                       | изменяемый              |
| тесты `*.test.ts` рядом с модулями                                   | см. «Затрагиваемые тесты по задачам»                                                                                                                                                                                                                                                      | изменяемые              |
| `second-brain/game-design.md`                                        | по разделу «Правка game-design.md» (031 — механика, 033 — HUD)                                                                                                                                                                                                                            | изменяемый (в задачах)  |
| `second-brain/architecture/overview.md`, `architecture/dev-hooks.md` | щит вместо жизней; в `dev-hooks.md` — **все** упоминания `lives` (см. «Нарезка», 031)                                                                                                                                                                                                     | изменяемые (в задачах)  |
| `.claude/agents/tester.md`                                           | `?lives=N (1…5)` → `?shield=N (0…5)`, «жизни» → «щит» в описании `state()`; **не** правит исполнитель `/do` — основная сессия с согласия владельца после 031                                                                                                                              | изменяемый (вне задачи) |

Нового модуля логики нет: щит — целое число в агрегате `Player`, как раньше `lives`.

Acceptance завершённых задач 020, 023, 027, 029 — исторические документы: их сценарии с
возрождением и `?lives` устарели, но не правятся.

### Импорты: `art.ts` не знает логику

Сейчас `ship.ts` импортирует `SHIP_SPRITE` из `art.ts`, а `player.ts` — `ship.ts`. Если
`art.ts` возьмёт `MAX_SHIELD` из `player.ts` (или `SHIP_WIDTH` из `ship.ts`), получится цикл
`art → player → ship → art`, и при загрузке через `art.ts` `ship.ts` вычислит
`SHIP_WIDTH = SHIP_SPRITE.width` до инициализации `SHIP_SPRITE` — `ReferenceError` (TDZ).

Правило: **`art.ts` импортирует только `sprite.ts`**. `SHIELD_COLORS` и `SHIELD_SPRITES` —
литералы из 6 элементов (индекс 0 — `null`), ширина дуги задана строками спрайта (15).
Связь с логикой проверяет `art.test.ts`: он импортирует `MAX_SHIELD` и `SHIP_WIDTH` и
сверяет длины и ширину. `hud.ts`, `hud-render.ts`, `battle-render.ts` могут импортировать
`MAX_SHIELD` из `player.ts` — цикла нет (`player` не зависит от HUD и рендера).

## Сущности и состояния

### `Player` (данные)

- `shield: number` — целое `0 … MAX_SHIELD`; конструктор бросает `RangeError` вне диапазона.
- `state: ShipState` — `'active' | 'down' | 'invulnerable'` (тип не меняется, меняются
  переходы), `stateTicks`.
- Константы: `START_SHIELD = 2`, `MAX_SHIELD = 5`, `INVULNERABLE_TICKS = 120` (как сейчас,
  В4). `START_LIVES`, `MAX_LIVES`, `DOWN_TICKS` удаляются.

### Автомат корабля

```
            hit(), shield > 0: shield − 1
  active ───────────────────────────────▶ invulnerable
    ▲                                         │
    └──────── INVULNERABLE_TICKS ─────────────┘
    │
    │ hit(), shield = 0
    ▼
   down   (конечное: таймеров выхода нет, stateTicks растёт)
```

- `hit()` действует только из `active` (как сейчас); в `invulnerable`/`down` — no-op.
- Вход в `invulnerable` по попаданию **не** переносит корабль в `SHIP_START_X` и не трогает
  выстрелы в полёте.
- `down`: ввод игнорируется, летят только выстрелы в полёте; `isLost = state === 'down'`.
  `Battle` переводит бой в `over` при `isLost && stateTicks >= GAME_OVER_DELAY_TICKS` — без
  изменений.
- `addShield()`: `shield + 1`, если `shield < MAX_SHIELD` и `state !== 'down'`; возвращает
  `true`, если щит вырос. Состояние и `stateTicks` не трогает (в `invulnerable` мигание
  продолжается).
- Улучшения (`powerUps`) — как сейчас, до конца игры.

### `Battle`

Фазы `playing | cleared | over` и их переходы не меняются. Меняется только источник роста
щита:

- `GAME_OVER_DELAY_TICKS = 60` — константа `battle.ts` (задержка фазы боя, а не состояние
  корабля; значение прежнее, 1 с).
- `addScore(points)`: для каждого пересечённого порога (`extraShieldsEarned`) —
  `player.addShield()`; сверх максимума или в `down` — пропадает.
- `applyBonus(kind)`: `'shield'` — `if (!this.player.addShield())
this.addScore(BONUS_FALLBACK_POINTS)`. Эквивалентно «до максимума `+1`, иначе 500»:
  капсула в `down` не ловится (`collisions.ts`, `catchCapsule`), значит `false` бывает только
  на максимуме. `S`/`D` — без изменений.

## Поток тика

Порядок `Battle.update` **не меняется**:

1. `player.update` — счёт тика; `invulnerable → active` по таймеру (перехода
   `down → invulnerable` больше нет); движение, выстрелы, огонь (в `down` — только полёт).
2. `wave.update` (цель — корабль, пока не `down`).
3. `bonusField.update`.
4. `resolveCollisions` (только `playing`): выстрелы игрока по врагам → вражеский выстрел по
   кораблю → таран; одно попадание за тик; `player.hit()` снимает уровень щита или
   переводит в `down`. Очки за сбитых → `addScore` (пороги → `addShield`).
5. `resolveBonusCollisions` (не в `over`): астероид → капсула → `applyBonus`.
6. `updatePhase`: `over` через `GAME_OVER_DELAY_TICKS` после гибели; `cleared`/следующий
   уровень — как сейчас.

Отрисовка (`PlayScene.render`, порядок тот же): фон → звёзды → `drawBattle` (…, выстрелы,
корабль **и щит над ним**) → `drawHud` (шкала щита вместо иконок) → `GAME OVER`.

`drawShip`:

- `down` — взрыв `EXPLOSION_TICKS`, потом ничего (щита нет: в `down` он всегда 0).
- `invulnerable` в «выключенной» фазе мигания (`BLINK_TICKS`) — ни корабля, ни щита.
- иначе — спрайт корабля и, если `shield > 0`, `SHIELD_SPRITES[shield]` в
  `(ship.x, ship.y + SHIELD_OFFSET_Y)`.

## Интерфейсы

```ts
// player.ts
export const START_SHIELD = 2;
export const MAX_SHIELD = 5;
export const INVULNERABLE_TICKS = 120; // unchanged value, now after a shield hit
// DOWN_TICKS removed: the ship never leaves `down`.

export class Player {
  /** shield: integer 0..MAX_SHIELD, RangeError otherwise. */
  constructor(ship?: Ship, shield?: number);
  /** 0..MAX_SHIELD; drops on the hit tick. Hits survivable = shield. */
  get shield(): number;
  /** state === 'down': the only ship is lost, terminal. */
  get isLost(): boolean;
  get canBeHit(): boolean; // active only (unchanged)
  get canBeTargeted(): boolean; // not down (unchanged)
  /** active only: shield > 0 -> shield - 1, invulnerable; shield = 0 -> down. Else no-op. */
  hit(): void;
  /** shield + 1 below MAX_SHIELD and not down; true if it grew. State/stateTicks untouched. */
  addShield(): boolean;
  // shots, maxShots, powerUps, grantPowerUp, removeShot, update — unchanged signatures
}

// battle.ts
/** Ticks from the fatal hit to `over` (1 s); longer than EXPLOSION_TICKS. */
export const GAME_OVER_DELAY_TICKS = 60;
export interface BattleOptions {
  readonly startLevel?: number;
  readonly levels?: readonly LevelConfig[];
  /** Starting shield, default START_SHIELD; tests use 0 for a quick game over. */
  readonly shield?: number;
  readonly bonuses?: BonusOptions;
}

// score.ts (renamed, same values and formula)
export const EXTRA_SHIELD_FIRST = 5000;
export const EXTRA_SHIELD_EVERY = 10000;
export function extraShieldsEarned(before: number, after: number): number;

// bonus.ts
export type BonusKind = 'shield' | PowerUpKind;
export const BONUS_KINDS: readonly BonusKind[] = ['shield', 'fastShot', 'doubleShot'];

// art.ts — imports only ./sprite (no player/ship: import cycle via ship.ts)
/** Shield arc color per level; index 0 is null (no shield). 6 literals = MAX_SHIELD + 1. */
export const SHIELD_COLORS: readonly (string | null)[];
/** The arc, 15×4 (ship width), in SHIELD_COLORS[level]; index 0 is null. */
export const SHIELD_SPRITES: readonly (Sprite | null)[];
/** Arc top relative to ship.y: -5 (rows 203..206, one empty row above the nose at 208). */
export const SHIELD_OFFSET_Y = -5;
export const SHIELD_GAUGE_EMPTY_COLOR: string;

// hud.ts (033; in 031 only HudView.lives -> shield)
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** 0..MAX_SHIELD. */
  readonly shield: number;
  readonly powerUps: PowerUps;
}
export const HUD_ICON_SIZE = 8; // was LIFE_ICON_MAX_SIZE
export const HUD_ICON_STEP = 10; // was LIFE_ICON_STEP
export const SHIELD_SEGMENT_WIDTH = 8;
export const SHIELD_SEGMENT_HEIGHT = 4;
/** x = 200..247, y = 14..21 (the former lives zone): MAX_SHIELD segments in HUD_ICON_STEP. */
export const SHIELD_ZONE: HudZone;
/** Segment i (0-based, left to right) is filled when i < shield. */
export function shieldSegmentX(i: number): number;

// dev-params.ts
export interface DevParams {
  readonly seed: number | null;
  readonly paused: boolean;
  readonly startLevel: number | undefined;
  /** ?shield=N: integer 0..MAX_SHIELD; undefined = START_SHIELD. */
  readonly shield: number | undefined;
}

// dev-snapshot.ts — BattleSnapshot: top-level `lives: number` -> `shield: number`
// (not duplicated in `player`); bonus kind 'life' -> 'shield'.
```

### Пиксель-арт и цвета (первый проход, утверждает владелец на приёмке)

Дуга щита 15×4, один цвет (палитра `{ '#': color }`), над кораблём:

```
....#######....
..##.......##..
.#...........#.
#.............#
```

`SHIELD_COLORS` — из цветов, уже используемых в проекте, плюс две промежуточные зелёные:

| уровень | цвет                  | источник                     |
| ------- | --------------------- | ---------------------------- |
| 5       | `#4fd16a` зелёный     | тело `drone` (`enemy-art`)   |
| 4       | `#8ee05a` светло-зел. | новый, между 5 и 3           |
| 3       | `#c8e84a` жёлто-зел.  | новый, между 4 и 2           |
| 2       | `#ffe14f` жёлтый      | вспышка взрыва (`enemy-art`) |
| 1       | `#ff3b3b` красный     | угли взрыва (`enemy-art`)    |

Шкала в панели: `MAX_SHIELD` сегментов 8×4 с шагом 10 в `SHIELD_ZONE` (5 × 10 − 2 = 48 —
ровно бывшая зона иконок), по вертикали по центру строки значений (y = 16…19). Залитые —
`SHIELD_COLORS[shield]` (вся шкала одного цвета — цвет текущего уровня, как дуга), пустые —
`SHIELD_GAUGE_EMPTY_COLOR` (тёмно-серый, напр. `#3c3c3c`; утверждается на приёмке). При
`shield = 0` все сегменты пустые. Подписи нет (В9).

## Тестирование

**Unit (Vitest, без canvas):**

- `player.test.ts`: конструктор — `0…MAX_SHIELD`, вне — `RangeError`; `hit()` при `shield > 0`
  — `shield − 1`, `invulnerable`, позиция корабля и выстрелы сохранены; при `shield = 0` —
  `down`; в `invulnerable`/`down` — no-op; `invulnerable → active` через
  `INVULNERABLE_TICKS`; `down` не выходит ни через какое число тиков; `addShield` — до
  максимума, `false` на максимуме и в `down`, состояние/`stateTicks` не трогает; полный
  сценарий: старт `START_SHIELD` — 2 попадания пережиты, 3-е — `down`; с `MAX_SHIELD` — 5 и
  6-е.
- `battle.test.ts`: game over через `GAME_OVER_DELAY_TICKS` после попадания при `shield = 0`;
  попадание со щитом — фаза остаётся `playing`; порог очков → `+1` щита; на максимуме —
  пропадает; таран при `shield = 0`, пересёкший порог, — всё равно `over`; таран при `shield`
  на максимуме, пересёкший порог, — `max → max−1 → max`; капсула `shield` — `+1`, на максимуме
  — `+500`; попадание и капсула в одном тике.
- `collisions.test.ts`: правила не меняются — фикстуры с жизней на щит (правило разбиения
  кейсов — ниже); таран в щит убивает врага и даёт `Kill { inFlight: true }`.
- `score.test.ts`: переименования (значения те же).
- `hud.test.ts`: `hudView` берёт `shield`; `SHIELD_ZONE` в пределах экрана, не пересекается с
  остальными зонами (`HUD_ZONES`); все `MAX_SHIELD` сегментов помещаются в зону
  (`shieldSegmentX(MAX_SHIELD − 1) + SHIELD_SEGMENT_WIDTH <= зона`).
- `hud-render.test.ts` (мок-контекст, как сейчас): при `shield = k` — `k` залитых сегментов
  цветом уровня и `MAX_SHIELD − k` пустых; всё внутри зоны.
- `art.test.ts` (нового файла пока нет — завести): `SHIELD_COLORS.length === SHIELD_SPRITES.length ===
MAX_SHIELD + 1`, индекс 0 — `null`, остальные заданы; ширина дуги = `SHIP_WIDTH`; дуга
  над кораблём не залезает в его спрайт (`SHIELD_OFFSET_Y + высота <= 0`).
- `battle-render.test.ts` (мок-контекст): щит рисуется в `active`, не рисуется при
  `shield = 0`, в `down` и в выключенной фазе мигания.
- `dev-params.test.ts`: `?shield=0…5`, вне — `undefined`; `?lives` больше не читается.
- `dev-snapshot.test.ts`: поле `shield` на верхнем уровне, капсула `'shield'`.
- Детерминизм: с тем же seed поведение врагов и астероидов прежнее до первого попадания
  (порядок `BONUS_KINDS` не меняется, `rng` щит не трогает).

### Затрагиваемые тесты по задачам

Задача не зелёная, пока не исправлены **все** перечисленные файлы. Исполнитель дополнительно
проверяет поиском, что в `src/` не осталось `'life'`, `lives`, `START_LIVES`, `MAX_LIVES`,
`DOWN_TICKS`, `addLife`, `EXTRA_LIFE`, `extraLives` (кроме имён, которые по плану уходят в
033: `LIVES_ZONE`, `LIVES_ICON_SLOTS`, `LIFE_ICON_*`, `drawLives`). **Исключение поиска:**
`scenes/title-scene.ts:32` («The factory lives here, …») — английский глагол, не жизни; не
править. Комментарий `battle-render.test.ts:503` («gives a 'life' asteroid») — про жизни,
правится в 031.

**Правило перевода значений (031).** Имя меняется вместе со значением, буквальная замена
`lives` → `shield` даёт красные тесты:

- `lives: k` → `shield: k − 1` (у `k` жизней и у щита `k − 1` одинаково ударов до конца
  игры); `lives: 1` → `shield: 0`;
- «на пределе» (кейсы «на максимуме», бесполезный `L`, порог сверх предела) → `MAX_SHIELD`
  — по смыслу кейса, а не арифметикой от `MAX_LIVES`;
- любой кейс, где после `hit()` с умолчаниями ждут `down` / взрыв / game over, — по
  «Правилу разбиения кейсов» (ниже): либо строить с `shield: 0`, либо переименовать в
  «удар по щиту» и ждать `invulnerable`.

Места, где правило применяется (сверено разработчиком по `33e77e7`):

| место                                                                         | было                                                     | стало                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `battle.test.ts:47,317,337,516,742,921`                                       | `lives: 1`                                               | `shield: 0`                                                                                                                                                                                                                                              |
| `battle.test.ts:328`                                                          | `lives: 2`                                               | `shield: 1`                                                                                                                                                                                                                                              |
| `battle.test.ts:492,503,828`                                                  | кейсы «на максимуме»                                     | `MAX_SHIELD` (не `MAX_LIVES − 1`)                                                                                                                                                                                                                        |
| `battle.test.ts:313`                                                          | `{ lives: 0 }` → `RangeError`                            | `shield: 0` допустим; `RangeError` — для `-1` и `MAX_SHIELD + 1`                                                                                                                                                                                         |
| `battle.test.ts:512–535` «an extra life in down at 0 lives cancels game over» | game over отменяется                                     | **кейс перевернуть по В7:** «a threshold crossed while down does not cancel game over» — `shield: 0`, `hit()`, выстрел в полёте даёт пересечение 5000 → очки начислены, `isLost` остаётся `true`, `shield === 0`, через `GAME_OVER_DELAY_TICKS` — `over` |
| `battle.test.ts:866–874` «power-ups survive the loss of a ship»               | `hit()` + `run(DOWN_TICKS)`                              | «power-ups survive a shield hit»: `hit()` с умолчаниями, без `DOWN_TICKS`, улучшения на месте                                                                                                                                                            |
| `battle.test.ts:887–903` «a ship lost on the touching tick does not take it»  | умолчания                                                | **только** `shield: 0` (иначе корабль в `invulnerable` поймает капсулу на следующем тике)                                                                                                                                                                |
| `scenes/play-scene.test.ts:34,206`                                            | `{ lives: 1 }` (быстрый game over)                       | `{ shield: 0 }`                                                                                                                                                                                                                                          |
| `dev-snapshot.test.ts:48`                                                     | `toBe(3)`                                                | `toBe(START_SHIELD)`                                                                                                                                                                                                                                     |
| `dev-snapshot.test.ts:65–72` «shows a hit: one life less, the ship down»      | умолчания + `hit()` → `down`                             | строить с `shield: 0` и ждать `down`, **или** переименовать в «удар по щиту» и ждать `invulnerable`, `shield === START_SHIELD − 1` — на выбор исполнителя                                                                                                |
| `dev-snapshot.test.ts:75`                                                     | `{ lives: 1 }`                                           | `{ shield: 0 }`                                                                                                                                                                                                                                          |
| `scenes/title-scene.test.ts:118–130`                                          | `{ lives: 1 }` / `{ lives: 5 }`                          | `{ shield: 0 }` / `{ shield: MAX_SHIELD }`                                                                                                                                                                                                               |
| `scenes/title-scene.test.ts:21` (комментарий `loseGame`)                      | «about 420 ticks: 2 × (down 60 + invulnerable 120) + 60» | «about 300 ticks: 2 × invulnerable 120 + 60»; цикл с лимитом 600 не меняется                                                                                                                                                                             |
| `hud.test.ts:66`                                                              | `lives: 5`                                               | `shield: 5` (годится любое допустимое)                                                                                                                                                                                                                   |

**031-shield-logic:**

| файл                         | что меняется                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player.test.ts`             | переписать под автомат щита (см. выше); `DOWN_TICKS` **убрать**, `battle.ts` не импортировать: «`down` не выходит ни через какое число тиков» (сейчас `:570–583`, `DOWN_TICKS + 1000`) — любым большим литералом                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `battle.test.ts`             | кейсы гибели/game over/прицеливания в `down` (напр. «no target while down») — с `shield: 0`; кейсы порогов и капсулы `L` — на `shield`; места из «Правила перевода значений», включая **переворот** `:512–535` по В7; новые кейсы из списка выше                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `collisions.test.ts`         | ≈20 кейсов ждут `state === 'down'` после попадания с умолчаниями; «неуязвимый» строится через `update × DOWN_TICKS`; `'life'` в кейсах капсул — `'shield'`; константа задержки — `GAME_OVER_DELAY_TICKS`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `score.test.ts`              | переименования                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `bonus.test.ts`              | `'life'` → `'shield'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `asteroid.test.ts`           | `new Asteroid(…, 'life')` → `'shield'` (8 мест)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `capsule.test.ts`            | `'life'` → `'shield'` (4 места)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `battle-render.test.ts`      | кейсы взрыва и выстрела при сбитом корабле (`:262–306`: «draws explosion frame 0 centered in the ship on the hit tick», «switches to frame 1 after EXPLOSION_FRAME_TICKS», «draws frame 1 on the last explosion tick, then no ship», «draws the player shot while the ship is down») — строить с `shield: 0`: помощнику `newBattle()` (`:51–53`) добавить параметр опций или завести рядом `lostBattle()`; иначе после `hit()` корабль `invulnerable` и рисуется вместо взрыва. Кейсы возрождения: «explosion ends before the respawn» → «взрыв заканчивается раньше game over» (`shield: 0`, `EXPLOSION_TICKS < GAME_OVER_DELAY_TICKS`); «blinks the invulnerable ship at SHIP_START_X» → «мигает на месте попадания» (`hit()` при `shield > 0`, без `run(DOWN_TICKS)`); «draws the ship again once active» — через `INVULNERABLE_TICKS` после удара по щиту. `drawShip` в 031 не меняется |
| `scenes/play-scene.test.ts`  | `lives` → `shield` в опциях и ожиданиях по «Правилу перевода значений» (`:34,206` — `shield: 0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `scenes/title-scene.test.ts` | `START_LIVES` → `START_SHIELD`, `GameStart.shield`; `:118–130` и комментарий `:21` — по «Правилу перевода значений»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `dev-snapshot.test.ts`       | `lives` → `shield`, вид капсулы `'shield'`; `:48`, `:65–72`, `:75` — по «Правилу перевода значений»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `dev-params.test.ts`         | `?lives` → `?shield` (`0…MAX_SHIELD`), `?lives` не читается                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `hud.test.ts`                | `HudView.shield`, `START_LIVES`/`MAX_LIVES` → `START_SHIELD`/`MAX_SHIELD`; `LIVES_ICON_SLOTS >= MAX_SHIELD`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `hud-render.test.ts`         | `drawLives` рисует `view.shield` иконок; поле `shield` в фикстурах `HudView`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Правило разбиения кейсов (031)** — для `collisions.test.ts`, `battle.test.ts`,
`battle-render.test.ts`, `dev-snapshot.test.ts` и любого другого теста, где после `hit()`
ждут исход. Не подставлять новые ожидания механически — у каждого кейса свой смысл:

- «попадание засчитано» (выстрел/таран попал) — умолчания (`START_SHIELD`), проверять
  `shield − 1` и `state === 'invulnerable'`;
- «гибель», «прицеливание и коллизии в `down`», «game over», «взрыв корабля и выстрел при
  сбитом корабле» (рендер) — строить с `shield: 0` (`new Player(undefined, 0)` /
  `new Battle({ shield: 0, … })`), проверять `down`;
- «неуязвимый игрок» (выстрелы и враги проходят сквозь, капсула ловится) — через `hit()`
  при `shield > 0`, а не через `update × DOWN_TICKS`.

**032-shield-on-ship:**

| файл                    | что меняется                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `art.test.ts` (новый)   | длины `SHIELD_COLORS`/`SHIELD_SPRITES` = `MAX_SHIELD + 1`, индекс 0 — `null`, ширина = `SHIP_WIDTH`, `SHIELD_OFFSET_Y + высота <= 0`                                                                                                                                                                                                                              |
| `battle-render.test.ts` | помощник `shipCalls(x, y)` дополняется пикселями дуги по `player.shield` (или рядом `shieldCalls`) — обновить **все** кейсы, где сравнивается полный список `fillRect` с кораблём (по умолчанию `START_SHIELD = 2` — дуга есть в каждом кадре); новые кейсы: щита нет при `shield = 0`, в `down`, в выключенной фазе мигания; цвет дуги = `SHIELD_COLORS[shield]` |

**033-hud-shield-gauge:**

| файл                 | что меняется                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hud.test.ts`        | `LIVES_ZONE` → `SHIELD_ZONE`, `LIFE_ICON_*` → `HUD_ICON_*`, `LIVES_ICON_SLOTS` удалён; сегменты помещаются в зону; `HUD_ZONES` не пересекаются; импорт `LIFE_ICON_SPRITE` убрать |
| `hud-render.test.ts` | `drawShield`: `k` залитых цветом `SHIELD_COLORS[k]`, `MAX_SHIELD − k` пустых, всё в зоне; значки улучшений — на `HUD_ICON_*`                                                     |

**Глазами (приёмка / `/qa`):**

- 031: щит снимается по ударам, третий удар — game over; ощущение передышки 2 с («не
  слишком ли быстро снимается щит», решение владельца — оценить здесь); временный HUD (см.
  ниже).
- 032: форма и отступ дуги, пять цветов и их различимость (особенно 3 и 4), мигание щита
  вместе с кораблём, «удар в щит», когда вражеский выстрел пропадает у дуги; **свой выстрел
  в тик выстрела наполовину скрыт дугой** («выстрел сквозь щит») — приемлемо ли.
- 033: шкала в панели, цвет пустых сегментов.

## Альтернативы

- **Оставить жизни и добавить щит сверху** — отвергнуто: владелец прямо хочет одну жизнь;
  два ресурса усложняют HUD и правила (что даёт `L`?).
- **Отдельная сущность `Shield` (класс, свой автомат, своё место в бою)** — отвергнуто:
  щит — одно целое число, его переходы привязаны к автомату корабля; отдельный класс
  дублировал бы состояние `Player`. Достаточно поля и двух методов.
- **Хитбокс щита (корабль + дуга)** — отвергнуто: попадания приходили бы на 5 px раньше,
  хитбокс менялся бы при `shield = 0`, а выигрыш — только визуальный; при скорости
  выстрела 4 px/тик и так видно, что выстрел гаснет у дуги. Вернуться можно, если на
  приёмке выглядит фальшиво.
- **Разрыв дуги в колонке носа** (верхняя строка `....###.###....`), чтобы свой выстрел
  выходил «в окно», — не делаем по умолчанию: дуга выглядит цельнее, а наложение длится
  один тик. Запасной вариант, если на приёмке 032 мешает; логику не трогает.
- **Попадание по щиту без неуязвимости** — отвергнуто (В4): до 4 вражеских выстрелов на
  экране и рои при пике снимали бы несколько уровней за полсекунды.
- **Перенос в центр после попадания по щиту** — отвергнуто: корабль не погиб, телепорт
  выглядел бы как смерть; владелец говорит про смену цвета, не про возрождение.
- **`DOWN_TICKS` оставить в `player.ts`** — отвергнуто: после удаления возрождения `Player`
  её не использует; это задержка фазы боя, ей место в `battle.ts` рядом с `updatePhase`.
- **`shield` в снимке `dev-snapshot` и на верхнем уровне, и в `player`** — отвергнуто:
  два места одного значения; верхний уровень повторяет прежний `lives` — QA-рецепты правятся
  заменой имени.
- **Временный HUD 031 как `shield + 1` иконок** («ударов до конца игры») — отвергнуто: 6
  значений не влезают в 5 мест зоны; вместо этого — пояснение в `acceptance.md`.
- **`SHIELD_COLORS` через `MAX_SHIELD` (`Array.from`)** — отвергнуто: цикл импортов
  `art → player → ship → art` (TDZ); литералы плюс проверка в `art.test.ts`.
- **Шкала как массив цветов, а `shield` — индекс** — так и сделано, но цвета — в `art.ts`
  (рендер), логика знает только число: тесты логики не зависят от палитры.
- **Хранить «жизни» = `shield + 1` вместо `shield`** — отвергнуто: игровые правила
  («щит есть / нет», цвет, `L` до максимума) формулируются через щит; «жизни» — только
  пояснение для баланса.
- Варианты владельца по В1–В9, не выбранные: симметричная шкала 0…6 или три цвета 0…3;
  таран −2 или безвредный выстрел; враг при таране без очков или выживает; неуязвимость 1 с
  или без неё; +1 щита от каждой капсулы или от повторных `S`/`D`; без порогов очков или
  500 очков на максимуме; возрождение после порога в `down`; новая буква капсулы; подпись
  `SHIELD` или щит только на корабле.

## Решения владельца

- **В1:** шкала 0…5, старт 2 (жёлтый), гибель на 3-м ударе, максимум 5 (гибель на 6-м).
- **В2:** вражеский выстрел и таран — по −1 уровню.
- **В3:** протаранивший щит враг гибнет, очки как за сбитого в полёте.
- **В4:** после удара по щиту — 2 с неуязвимости с миганием (`INVULNERABLE_TICKS = 120`).
- **В5:** щит повышает только капсула `L` (+1); `L` на максимуме и повторные `S`/`D` — 500
  очков.
- **В6:** пороги очков 5000, 15000, 25000, … — +1 к щиту, сверх максимума пропадает.
- **В7:** порог, пройденный после гибели (долетевшим выстрелом), — очки начисляются, игра
  окончена.
- **В8:** капсула щита внешне без изменений (`L`, красная плашка); в коде вид `'shield'`.
- **В9:** в панели — шкала из 5 сегментов без подписи.
- **Передышка после удара** (вопрос разработчика, раунд 1): оставить 2 с, оценить на
  приёмке 031.

Открытых вопросов к владельцу нет. Вкусовое (форма дуги, оттенки 3 и 4, цвет пустых
сегментов, «выстрел сквозь щит») — на приёмке.

## Правка game-design.md

Точные новые формулировки (вносит задача: механика — 031, HUD — 033; остальные разделы не
меняются). Раздел «Жизни» заменяется разделом «Щит».

**Экран → HUD** (033; заменить пункт целиком):

> - HUD сверху (решено, фича 004; щит — фича 008): две строки — красные подписи, белые
>   значения; слева `SCORE` (6 цифр с ведущими нулями), по центру `LEVEL` (номер уровня —
>   по центру под подписью), справа — шкала щита: 5 сегментов, залиты столько, каков
>   уровень щита, цветом текущего уровня, остальные — тёмно-серые; без подписи (фича 008,
>   В9). Между уровнем и щитом — значки полученных улучшений (`S`, `D` — копии капсул, у
>   каждого своё фиксированное место, без подписи). Панель поверх игры, без фона, поле не
>   сдвигается. Рекорд и счётчик волн (флажки) — позже.

**Механики → Поражение игрока** (031; заменить пункт целиком):

> - **Поражение игрока** (решено, фича 002, В5, В6; щит — фича 008, В2–В4, В7): от
>   вражеского выстрела или тарана. Корабль один. Попадание по кораблю со щитом снимает
>   один уровень щита в тик попадания; выстрел пропадает, протаранивший враг гибнет
>   (засчитывается как сбитый в полёте); корабль остаётся на месте, управляем и стреляет,
>   2 с мигает вместе со щитом и неуязвим. За тик — не больше одного попадания. Попадание
>   по кораблю без щита — гибель (при таране гибнут оба); возрождения нет: через 1 с бой
>   переходит в конец игры: враги летают дальше, коллизий нет; смены уровня после гибели не
>   бывает (фича 005, В3, В4). Очки за выстрел, долетевший после гибели, начисляются, но
>   щит не дают и игру не продолжают. В конце игры поверх летающих врагов и панели —
>   надпись `GAME OVER` (красная) и под ней мигающее `PRESS ENTER` (белое); Enter →
>   заставка, звёзды продолжаются без скачка; с заставки Enter — новая игра со стартовым
>   щитом с начального уровня (фича 005, В3).

**Механики → Очки** (031; заменить точный фрагмент, начало пункта — включая «Сбитый
астероид — 100 очков с той же надбавкой уровня; бесполезный бонус — ровно 500 очков без
надбавки,» — остаётся без изменений):

> - «они участвуют в порогах доп. жизни (фича 006, В7, В8). Доп. жизнь — на 5000, затем
>   каждые 10000 (15000, 25000, …) (фича 005, В4).» → «они участвуют в порогах щита (фича
>   006, В7, В8). Порог щита — на 5000, затем каждые 10000 (15000, 25000, …): +1 уровень
>   щита (фича 005, В4; фича 008, В6).»

**Механики → Щит** (031; заменяет пункт «Жизни» целиком):

> - **Щит** (решено, фича 008, В1, В5–В7; заменил жизни фичи 005): перед кораблём — дуга
>   щита, уровень 0…5: 5 — зелёный, 4 — светло-зелёный, 3 — жёлто-зелёный, 2 — жёлтый,
>   1 — красный, 0 — щита нет. Старт — 2 (жёлтый): игра кончается на 3-м попадании; максимум
>   — 5 (зелёный): на 6-м. Уровень растёт на 1 при пересечении счётом 5000, 15000, 25000, …
>   и от капсулы `L`; сверх 5 прирост от порога пропадает (порог пройден), `L` на максимуме
>   — 500 очков (фича 006). После гибели щит не растёт. Смена уровня щит не меняет; новая
>   игра — снова 2. Рекорд — позже (фича 005, В5).

**Механики → Астероиды и бонусы** (031; заменить три фрагмента, остальное без изменений):

> - «Капсулу ловит корабль (и мигающий после возрождения, но не сбитый)» → «Капсулу ловит
>   корабль (и мигающий после удара по щиту, но не сбитый)».
> - «`L` — доп. жизнь, `S` — быстрая пуля, `D` — две пули; улучшения — до конца игры,
>   переживают гибель и смену уровня, не складываются.» → «`L` — +1 уровень щита (фича 008,
>   В5, В8), `S` — быстрая пуля, `D` — две пули; улучшения — до конца игры, переживают удары
>   по щиту и смену уровня, не складываются.»
> - «Бесполезный бонус (`L` при 5 жизнях, уже полученное улучшение) — 500 очков.» →
>   «Бесполезный бонус (`L` при щите 5, уже полученное улучшение) — 500 очков.»

**Механики → Пикирование** (031; одна правка, не из списка владельца, но иначе пункт
противоречит щиту): «если в начале пике корабля нет, `drone` идёт прямо вниз и
подхватывает возродившийся корабль на ближайшем переприцеливании (В3)» → «если в начале
пике корабль сбит, `drone` идёт прямо вниз (В3)».

## Нарезка на задачи

Номера задач — с 031 (последняя завершённая — 030).

1. **031-shield-logic** — щит вместо жизней в логике, отрисовка временная.
   `Player` (`shield`, `START_SHIELD`, `MAX_SHIELD`, новый автомат, `addShield(): boolean`,
   без возрождения, `DOWN_TICKS` удалён), `Battle` (`BattleOptions.shield`,
   `GAME_OVER_DELAY_TICKS = 60` литералом, пороги → `addShield`, `applyBonus` через
   возвращаемое значение), `score.ts` и `bonus.ts`/`bonus-art.ts` (переименования),
   `collisions.ts`/`ship.ts` (комментарии), `dev-params` (`?shield`), `dev-snapshot`
   (`shield` на верхнем уровне), `title-scene`/`main.ts`. HUD: `HudView.shield`, `drawLives`
   временно рисует `shield` иконок кораблей (в зоне ровно 5 мест = `MAX_SHIELD`) — игра
   целиком работает и проверяема. Тесты — по таблице «031» и правилу разбиения кейсов.
   Документы: `game-design.md` — «Поражение игрока», «Очки», «Щит» (вместо «Жизни»),
   «Астероиды и бонусы», «Пикирование» по разделу «Правка game-design.md»; `overview.md`;
   `dev-hooks.md` — **все** упоминания `lives`: таблица параметров (`:14`, `:21` —
   `?shield=N`, `0…5`), «`level` и `lives` сохраняются» (`:25–26` → `shield`), поле снимка
   (`:62` → `shield`), идея `setLives` (`:124` → `setShield`), QA-рецепты «Жизни на пределе»
   и «Повтор астероида» (`lives=5` → `shield=5`), «быстрый game over: `?shield=0`», таблица
   констант (`DOWN_TICKS` → `GAME_OVER_DELAY_TICKS`, `INVULNERABLE_TICKS`, `MAX_LIVES` →
   `MAX_SHIELD`, `EXTRA_LIFE_FIRST` → `EXTRA_SHIELD_FIRST`); номера строк — по `33e77e7`,
   итог проверить поиском `lives` по файлу.
   **`acceptance.md` 031 обязательно говорит:** иконки кораблей справа в панели — это
   временно уровень щита (до 033), а не жизни: на старте 2 иконки, после двух ударов — 0 при
   живом корабле, третий удар — game over; это не баг. Приёмка: удар по кораблю не убивает,
   корабль мигает на месте; третий удар — game over; передышка 2 с — оценка владельца.
   **После задачи (не входит в `/do`):** `.claude/agents/tester.md` (строки 43, 52, 62, 73)
   описывает `?lives=N (1…5)`, который после 031 не читается. Правку (`?lives=N` →
   `?shield=N`, `0…5`; «жизни» → «щит» в описании `state()`) вносит **основная сессия с
   согласия владельца** — это конфигурация агента; исполнитель `/do` её не делает. Без неё
   `/qa` по 031 будет стартовать со `START_SHIELD` вместо быстрого game over.
2. **032-shield-on-ship** (зависит от 031) — дуга щита над кораблём: `SHIELD_COLORS`,
   `SHIELD_SPRITES`, `SHIELD_OFFSET_Y` в `art.ts` (**`art.ts` импортирует только
   `sprite.ts`**, литералы из 6 элементов), `drawShip` в `battle-render.ts` (мигает с
   кораблём), `art.test.ts`, обновление `shipCalls` во всех кейсах `battle-render.test.ts`.
   Приёмка глазами: цвет меняется по ударам и капсулам, различимость 3 и 4, «свой выстрел
   у дуги».
3. **033-hud-shield-gauge** (зависит от 031; от 032 — только `SHIELD_COLORS`) — шкала щита
   в панели вместо иконок: `SHIELD_ZONE`, сегменты, `SHIELD_GAUGE_EMPTY_COLOR`,
   `HUD_ICON_*` вместо `LIFE_ICON_*`, удалить `LIFE_ICON_SPRITE` и `LIVES_ICON_SLOTS`,
   `drawShield`, тесты по таблице «033»; раздел HUD в `game-design.md` (по «Правке
   game-design.md») и `overview.md`. Приёмка глазами: шкала, цвет пустых сегментов.

## История

- **Раунд 1:** первый вариант дизайна. Шкала 0…5 (старт 2, максимум 5, ударов до конца
  игры = `shield + 1`), щит — поле `Player`, без возрождения, `down` конечное; таран и
  выстрел снимают 1 уровень с 2 с неуязвимости; `L` и пороги очков — `+1`; дуга 15×4 над
  кораблём и шкала из 5 сегментов в панели. Вопросы В1–В9.
- **Раунд 2:** владелец закрыл В1–В9 рекомендуемыми вариантами и оставил передышку 2 с.
  Приняты все 10 рекомендаций разработчика: правило «`art.ts` без импортов логики»
  (цикл `art → player → ship → art`); явные списки затрагиваемых тестов по задачам и правило
  разбиения кейсов `collisions`/`battle`; `DOWN_TICKS` удалён, `GAME_OVER_DELAY_TICKS = 60`
  в `battle.ts`; уточнение баланса (передышка 3 с → 2 с, корабль в прицеле); пояснение
  временного HUD в acceptance 031; «свой выстрел у дуги» — в приёмку 032; комментарии и
  QA-рецепты — в 031; `applyBonus` через `addShield(): boolean`. `dev-snapshot` — `shield`
  только на верхнем уровне. Добавлен раздел «Правка game-design.md».
- **Раунд 3 (финальный):** приняты все 6 рекомендаций `dev-review-2.md`, блокеров и
  вопросов нет. В таблицу 031 добавлены кейсы взрыва `battle-render.test.ts` с `shield: 0`,
  правило разбиения распространено на рендер и снимок; добавлено «Правило перевода
  значений» (`lives: k` → `shield: k − 1`) с явным списком мест, в том числе переворот
  кейса `battle.test.ts:512–535` по В7 и `:887` только с `shield: 0`; исключение поиска
  `title-scene.ts:32`; `DOWN_TICKS` из `player.test.ts` убирается; точный старый фрагмент
  для «Очков»; полный список мест в `dev-hooks.md`; правка `tester.md` — пункт «после 031»
  для основной сессии с согласия владельца. Статус — согласовано.

# Дизайн: Жизни, счёт и Game Over

**Статус:** согласовано · **Раунд:** 3

## Цель и сценарии

Игра получает проигрыш и цель: у игрока конечный запас кораблей, за сбитых врагов
начисляются очки (разный вес у разных видов, вдвое больше в полёте, надбавка +10 % за
каждый уровень — решения владельца 2026-11-11), когда корабли кончаются — Game Over и
возврат на титул. Верхняя панель (фича 004) показывает настоящие счёт и жизни вместо
заглушек `PLACEHOLDER_SCORE` / `PLACEHOLDER_LIVES` (`src/game/hud.ts`).

### Что есть в коде сейчас (проверено)

- `Player` (`player.ts`): автомат
  `active → hit() → down → DOWN_TICKS (60) → invulnerable → INVULNERABLE_TICKS (120) → active`.
  Возрождение безусловное, ресурса жизней нет. `hit()` вызывают только `collisions.ts`
  (правила 2 и 3).
- `Battle` (`battle.ts`): фазы `playing | cleared`, private `phaseTicks`, переход на
  следующий уровень через `LEVEL_PAUSE_TICKS = 90`. Коллизии — только в `playing`.
  `phaseTicks` обнуляется только при входе в `cleared` и не растёт в `playing` — в
  `playing` после первой смены уровня он «застывает» на 90 (dev-review, рек. 1).
  `player` создаётся инициализатором поля — до конструктора, `opts` там недоступен.
- `resolveCollisions(player, wave)` возвращает `void`; враги гибнут в двух местах:
  выстрел игрока (правило 1) и таран (правило 3). Вид врага (`enemy.kind`) и «в полёте»
  (`enemy.isOut`) известны **до** `kill()`; после `kill()` враг уже `exploding`, и «был ли
  он в полёте» не восстановить. Значит, событие убийства надо фиксировать в момент
  `kill()`, внутри коллизий. Таран проверяет `enemy.isOut` — убитый тараном всегда «в
  полёте».
- `hudView(battle)` берёт только `battle.level`, счёт и жизни — константы.
  `drawLives` рисует `lives` иконок без ограничения: 6-я иконка вылезла бы из
  `LIVES_ZONE` (рассчитана на `LIVES_ICON_SLOTS = 5`).
- `TitleScene` → `PlayScene` (передаёт `rng`, `starfield`, `{ startLevel }`). Обратного
  перехода нет. `PlayScene.update` ничего не возвращает. `TitleScene` импортирует
  `PlayScene` — прямой импорт `TitleScene` из `PlayScene` дал бы цикл модулей.
- Ввод: `fire` — Space, `start` — Enter; `pressed()` — только тик нажатия;
  `input.endTick()` после каждого `update`, так что Enter, сменивший сцену, новая сцена
  не видит.
- Пиксельный шрифт (`font.ts`): `0–9`, `A–Z`, пробел — `GAME OVER` и `PRESS ENTER`
  набираются. `textWidth` включает хвостовой пробел ячейки (`n × 8`).

### Ключевые сценарии

1. **Старт:** счёт `000000`, `START_LIVES = 3` иконки (общее число, включая корабль на
   поле).
2. **Сбит враг** (выстрелом или тараном): к счёту сразу, в тик попадания, прибавляются
   очки `killPoints(kill, level)`: база по виду врага и по тому, был ли он в строю или в
   полёте (`diving`/`returning`; таран — всегда полёт), с надбавкой +10 % за уровень,
   округлённо до 10. Панель обновляется в том же кадре.
3. **Корабль сбит, жизни остались:** жизнь списывается **в тик попадания** — иконка
   пропадает сразу, вместе со взрывом. Дальше как сейчас: 1 с пусто → возрождение по
   центру → 2 с мигания. Причина: панель показывает «общее число, включая текущий
   корабль», а в `down` корабля на поле нет — после возрождения число не меняется,
   скачков нет.
4. **Строй уничтожен:** как сейчас — пауза `LEVEL_PAUSE_TICKS` без надписи, следующий
   уровень. Отдельного бонуса за строй **нет** (В2): уровень влияет на очки каждого
   врага.
5. **Сбит последний корабль:** жизни 0, иконок нет, корабль взрывается и больше не
   появляется. Враги продолжают летать (цели нет — `targetX = null`, как в `down`).
   Через `GAME_OVER_DELAY_TICKS` (= `DOWN_TICKS`, 1 с — момент, когда корабль появился
   бы) бой переходит в фазу `over`: поверх поля надпись `GAME OVER` и мигающее
   `PRESS ENTER`. Enter → титульный экран (В3), звёзды продолжаются без скачка. Новая
   игра — с титула, обычным Enter: счёт 0, 3 жизни, уровень `startLevel`.
6. **Порог доп. жизни** (В4): при пересечении счётом 5000, 15000, 25000, … жизнь
   прибавляется сразу (иконка появляется), но запас не больше `MAX_LIVES = 5`; сверх
   предела жизнь пропадает.

### Крайние случаи (решены дизайном)

- **Таран последним кораблём последнего врага.** В одном тике враг и корабль гибнут;
  очки за врага (как в полёте) начисляются, жизнь списывается. Строй станет `cleared`
  через 16 тиков (взрыв), но следующая волна (через 90 тиков паузы) не придёт: `over`
  наступает раньше (через 60 тиков после гибели) и останавливает переходы фаз. Правило:
  переход в `over` возможен из `playing` и из `cleared`; проверяется первым.
- **Выстрел в полёте после гибели последнего корабля.** По правилам фичи 001 выстрел
  продолжает лететь в `down`; до перехода в `over` коллизии работают, и такой выстрел
  может сбить врага и принести очки — это честно (выстрел сделан живым кораблём). К
  моменту `over` выстрела гарантированно нет: от `SHIP_Y − 4 = 204` до верха — 51 тик
  < 60 (подтверждено разработчиком). Поэтому в `over` коллизии просто выключены.
- **Доп. жизнь после гибели последнего корабля** (этот же выстрел пересёк порог). Жизнь
  есть жизнь: `lives` становится 1, и корабль возрождается по обычному таймеру
  `DOWN_TICKS`; Game Over не наступает. Особого случая в коде нет — следствие правила
  «возрождение, если `lives > 0`», проверяемого в тик таймера (разработчик подтвердил и
  граничный тик 60).
- **Порог при полном запасе.** `lives === MAX_LIVES` → `addLife()` ничего не делает,
  порог считается пройденным (следующая жизнь — на следующем пороге).
- **Одно убийство через несколько порогов.** Недостижимо при текущих очках (максимум за
  врага на высоких уровнях всё равно ≪ 10000), но `extraLivesEarned` возвращает число
  порогов, и `addLife()` вызывается столько раз — корректно и без особого случая.
- **Жизней больше, чем иконок.** `drawLives` рисует не больше `LIVES_ICON_SLOTS`
  иконок (защита раскладки), независимо от `MAX_LIVES`; тест
  `LIVES_ICON_SLOTS >= MAX_LIVES` следит, что предел помещается.
- **Счёт больше 999999.** `formatScore` уже оставляет число целиком (7 цифр залезут
  вправо на 8 px, в пустоту до `LEVEL_ZONE`). Без потолка надбавки (В2) на очень
  высоких уровнях это теоретически достижимо, но не в обозримой игре; не ограничиваем.
- **Dev-старт `?level=N`:** надбавка считается от реального номера уровня
  (`battle.level`).
- **Enter в фазе `playing`/`cleared`** ничего не делает (пауза — не в этой фиче).

## Модули и файлы

| Модуль / файл                                             | Ответственность                                                                                                                                                                                                         | Статус     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/game/score.ts`                                       | Таблица `ENEMY_POINTS` (вид × строй/полёт), `killPoints(kill, level)` с надбавкой за уровень в целых, `extraLivesEarned(before, after)` и пороги — чистые функции без состояния                                         | новый      |
| `src/game/player.ts`                                      | Запас жизней: `lives`, `hit()` списывает жизнь, возрождение только при `lives > 0`, `isLost`, `START_LIVES`; с задачи 4 — `addLife()`, `MAX_LIVES`, верхняя граница в конструкторе                                      | изменяемый |
| `src/game/collisions.ts`                                  | `resolveCollisions` возвращает список убийств `Kill[]` (вид, был ли в полёте), фиксируемых до `kill()`                                                                                                                  | изменяемый |
| `src/game/battle.ts`                                      | `player` создаётся в конструкторе с `opts.lives`; счёт `score` и `addScore`; фаза `over`, `GAME_OVER_DELAY_TICKS`; `phaseTicks` с правильной семантикой во всех фазах (private `ticksInPhase`); с задачи 4 — доп. жизни | изменяемый |
| `src/game/hud.ts`                                         | `hudView` берёт `battle.player.lives` (задача 1) и `battle.score` (задача 3); заглушки `PLACEHOLDER_*` удаляются                                                                                                        | изменяемый |
| `src/game/hud-render.ts`                                  | `drawLives` рисует `min(lives, LIVES_ICON_SLOTS)` иконок                                                                                                                                                                | изменяемый |
| `src/game/game-over-render.ts`                            | Надпись `GAME OVER` + мигающее `PRESS ENTER` пиксельным шрифтом по центру; выключаемая подложка; константы раскладки и мигания                                                                                          | новый      |
| `src/game/scenes/play-scene.ts`                           | В фазе `over` рисует надпись поверх HUD; по `start` возвращает сцену из фабрики `exit`; `readonly starfield` для тестов                                                                                                 | изменяемый |
| `src/game/scenes/title-scene.ts`                          | Принимает опциональный `starfield` (продолжение звёзд при возврате); передаёт в `PlayScene` фабрику выхода, создающую новый `TitleScene`; `readonly starfield` для тестов                                               | изменяемый |
| `second-brain/game-design.md`, `architecture/overview.md` | Решения владельца по очкам, жизням, Game Over; описание новых модулей                                                                                                                                                   | изменяемые |

`src/engine/` не меняется: смена сцен уже поддержана интерфейсом `Scene`
(`update(): Scene | void`). Новый тестовый уровень не нужен (тесты — через
`player.hit()` и ручную постановку тарана, см. «Тестирование»).

## Сущности и состояния

### Жизни — в `Player`

`lives` — **общее** число жизней, включая корабль на поле (как в панели). Живёт в
`Player`, потому что жизнь — ресурс возрождения, а возрождение — переход автомата
корабля, который принадлежит `Player`. Держать счётчик в `Battle` значило бы либо
вытаскивать возрождение из `Player`, либо дёргать `Player` «не возрождайся» снаружи.

Автомат корабля (изменения выделены):

```
active --hit()--> down   [lives -= 1]
down --(stateTicks >= DOWN_TICKS && lives > 0)--> invulnerable   (возрождение в SHIP_START_X)
down, lives == 0 --> остаётся down навсегда (stateTicks продолжает расти)   ← «потерян»
invulnerable --INVULNERABLE_TICKS--> active
```

- `hit()` по-прежнему действует только из `active`; в `down`/`invulnerable` — ни
  перехода, ни списания.
- `isLost` = `lives === 0`. Пока `active`/`invulnerable`, `lives ≥ 1` по построению
  (старт ≥ 1, списание только из `active`).
- Конструктор: `lives` — целое ≥ 1, иначе `RangeError`; с задачи 4 — ещё и
  `≤ MAX_LIVES` (иначе `BattleOptions.lives` обошёл бы предел, который соблюдает
  `addLife`).
- `addLife()` (задача 4) — `lives = min(lives + 1, MAX_LIVES)`, в любом состоянии. В
  `down` при `lives` 0 → 1 оживляет обычное возрождение (см. крайние случаи).
- Отдельного состояния `lost` в `ShipState` нет: для рендера и коллизий «потерянный»
  корабль — это `down` (взрыв 16 тиков, потом пусто; `canBeHit`/`canBeTargeted` — false;
  растущий `stateTicks` рендер не ломает — подтверждено).

### Счёт — в `Battle`

`score: number` — целое ≥ 0, начинается с 0. Меняется в одном месте тика `Battle`:
убийства из `resolveCollisions`, каждое через `addScore(killPoints(kill, level))`.

- Задача 3: `addScore(p)` — `score += p`.
- Задача 4: `addScore(p)` — `before = score; score += p;` затем
  `extraLivesEarned(before, score)` раз `player.addLife()`.

#### Таблица очков (В1)

```
ENEMY_POINTS = {
  drone:   { formation: 30, flying: 60 },
  striker: { formation: 40, flying: 80 },
  raider:  { formation: 50, flying: 100 },
}
```

«В полёте» = `enemy.isOut` (`diving | returning`) в момент попадания. Таран возможен
только по `isOut`, поэтому таран всегда даёт очки «в полёте» — так владелец и решил,
отдельного правила нет. Уровень 1 (8 `striker` + 20 `drone`) целиком из строя — 920.

#### Надбавка за уровень (В2)

Очки за врага = база × (1 + 0,1 · (уровень − 1)), округлённо до 10, без потолка.
Вычисление — **только в целых**:

```
killPoints(kill, level) = floor((base × (9 + level) + 50) / 100) × 10
  где base = ENEMY_POINTS[kill.kind][kill.inFlight ? 'flying' : 'formation']
```

- `base × (9 + level)` = база × множитель в десятых (`level 1 → 10`, `5 → 14`,
  `11 → 20`) × 10; деление целого на 100 с `+ 50` — округление к ближайшему кратному 10,
  половина вверх. Float не участвует, поэтому нет ловушки `30 * 1.4 = 41.999…`.
- **К ближайшему, а не вниз:** вниз «съедает» надбавку на ранних уровнях (`drone`
  уровни 2–3: 33, 36 → 30 — игрок прибавки не видит); к ближайшему — 30, 40.
- Половина — вверх (`drone` на уровне 6: 45 → 50).
- Требование к таблице: базы кратны 10 — тогда на уровне 1 формула возвращает базу
  (тест).
- `level` — целое ≥ 1, иначе `RangeError` (в `Battle` это гарантировано; проверка
  дешёвая и ловит ошибки в тестах).

Контрольные значения (закрепляются в `score.test.ts`):

| вид / уровень | 1        | 2        | 3        | 5        | 6        | 11        |
| ------------- | -------- | -------- | -------- | -------- | -------- | --------- |
| `drone`       | 30 / 60  | 30 / 70  | 40 / 70  | 40 / 80  | 50 / 90  | 60 / 120  |
| `striker`     | 40 / 80  | 40 / 90  | 50 / 100 | 60 / 110 | 60 / 120 | 80 / 160  |
| `raider`      | 50 / 100 | 60 / 110 | 60 / 120 | 70 / 140 | 80 / 150 | 100 / 200 |

(Пример владельца: `drone` уровень 5 — 40 / 80, уровень 11 — вдвое: 60 / 120.)

На уровнях 1–11 float-вариант (см. «Альтернативы») даёт те же числа, поэтому одна
таблица выбор формулы не закрепляет. Нужен случай-ловушка, где float ошибается:
`raider` в строю на уровне 14 — целые дают 120, float — 110 (`50 × 2.3 = 114.99999…`).
Разработчик нашёл перебором (уровни 1–100, базы 30…100) ещё два таких случая, все у
базы 50: уровень 32 (210 против 200) и 78 (440 против 430). В тест идёт уровень 14:
он достижим, `levelConfig` наращивает уровни дальше таблицы.

#### Доп. жизни (В4)

```
EXTRA_LIFE_FIRST = 5000
EXTRA_LIFE_EVERY = 10000
thresholdsReached(s) = s < EXTRA_LIFE_FIRST ? 0 : floor((s - EXTRA_LIFE_FIRST) / EXTRA_LIFE_EVERY) + 1
extraLivesEarned(before, after) = thresholdsReached(after) - thresholdsReached(before)
```

Пороги: 5000, 15000, 25000, … `thresholdsReached` — внутренняя функция модуля
(экспортировать только для теста, если удобнее разработчику). Предел `MAX_LIVES = 5` —
в `Player.addLife`, не в `score.ts`: пороги — про счёт, предел — про запас.

### Фазы `Battle`

```
playing --(wave.isCleared)--> cleared   [clearShots]
cleared --(phaseTicks == LEVEL_PAUSE_TICKS)--> playing (level + 1, новая волна)
playing | cleared --(player.isLost && player.stateTicks >= GAME_OVER_DELAY_TICKS)--> over
over — терминальная: phaseTicks растёт (для мигания надписи), волна обновляется,
       коллизий нет, переходов нет
```

- **`phaseTicks` — один общий счётчик всех фаз** (решение по вопросу разработчика, см.
  `discussion.md`). Значения:
  - 0 после конструктора (начало боя, `playing` уровня `startLevel`);
  - 0 после `update`, в котором произошёл переход в **любую** фазу (`→ cleared`,
    `→ playing`, `→ over`);
  - на 1 больше после каждого следующего `update`, в любой фазе.

  Реализация: `ticksInPhase++` в начале `updatePhase`, затем проверки (`over` первой),
  каждый переход ставит `ticksInPhase = 0`. Так `playing → cleared` и
  `cleared → playing` при `ticksInPhase === LEVEL_PAUSE_TICKS` срабатывают в те же тики,
  что сейчас (`battle.ts:93-106`), и тесты `battle.test.ts:96-107` не меняются. Условие
  `over` — через `>=`. Повторно переход в `over` не срабатывает: фаза терминальная, а
  проверка `over` идёт только из `playing | cleared`. Private-поле — `ticksInPhase`,
  публичный геттер — `phaseTicks`.

- Проверка `over` идёт **первой** в `updatePhase`: если в одном тике выполнились бы и
  `over`, и `cleared → playing`, побеждает `over` (уровень не меняется после проигрыша).
  Сейчас гонка недостижима. Корабль гибнет только от коллизий, а они идут только в
  `playing`, поэтому гибель последнего корабля — не позже входа в `cleared` (строй
  может опустеть раньше, а корабль погибнуть от ещё летящего вражеского выстрела, но
  уже в `cleared` гибели нет). Значит, `cleared → playing` наступает не раньше чем
  через `LEVEL_PAUSE_TICKS` = 90 тиков после гибели, а `over` — ровно через
  `GAME_OVER_DELAY_TICKS` = 60. Правило — страховка на случай смены этих чисел.
- В `over` волна продолжает жить (`targetX = null`) — поле за надписью не замирает.
  Вражеские выстрелы не снимаются: улетят за низ сами.
- `GAME_OVER_DELAY_TICKS = DOWN_TICKS` (60 = 1 с, В3): надпись появляется в тот момент,
  когда корабль появился бы.

### Сцена

Game Over — **фаза боя внутри `PlayScene`**, а не отдельная сцена (см. «Альтернативы»).
`PlayScene` получает фабрику `exit: () => Scene` — куда уйти по Enter после проигрыша.
`TitleScene` передаёт `() => new TitleScene(rng, startLevel, starfield)`. Так нет
цикла импортов `play-scene ↔ title-scene`.

Обе сцены выставляют `readonly starfield` с пометкой «Exposed for tests» (как
`PlayScene.battle`) — чтобы тест проверил, что звёзды переходят без пересоздания.

## Поток тика

`PlayScene.update(dt, input)`:

1. `starfield.update(dt)`.
2. `battle.update(dt, readIntent(input))`:
   1. `player.update(dt, intent)` — возрождение только при `lives > 0`.
   2. `wave.update(dt, targetX)` — `targetX = null`, пока корабль `down` (в т.ч.
      потерян).
   3. Если фаза `playing`: `kills = resolveCollisions(player, wave)` — внутри
      `player.hit()` списывает жизнь.
   4. Для каждого `kill`: `addScore(killPoints(kill, level))` (с задачи 4 — и доп.
      жизни).
   5. `updatePhase()`: сначала проверка `over`; затем `playing → cleared`; затем
      `cleared → playing`; счётчик фазы — как описано выше.
3. Если `battle.phase === 'over'` и `input.pressed('start')` и `exit` задан →
   `return exit()`.

Enter, нажатый в тик перехода в `over`, уже засчитывается (шаг 3 идёт после шага 2).
Это нормально: `start` — отдельная клавиша, случайно нажать её, отстреливаясь
пробелом, нельзя. Блокировки ввода нет (В3: «Enter → заставка», без оговорок). Новая
`TitleScene` этот Enter не видит (`endTick`), сразу новой игры не будет.

`PlayScene.render(ctx)`: фон → звёзды → `drawBattle` → `drawHud(hudView(battle))` →
если `over`: `drawGameOver(ctx, battle.phaseTicks)` (последним — поверх панели и
поля).

## Интерфейсы

```ts
// src/game/collisions.ts
/** An enemy killed this tick; captured before kill() changes its state. */
export interface Kill {
  readonly kind: EnemyKind;
  /** enemy.isOut at the moment of the hit (diving or returning); always true for a ram. */
  readonly inFlight: boolean;
}
/** Same rules and order as before; returns this tick's kills in the order they happened. */
export function resolveCollisions(player: Player, wave: Wave): readonly Kill[];

// src/game/score.ts
export interface KindPoints {
  readonly formation: number;
  readonly flying: number;
}
/** Owner decision В1; every value is a positive multiple of 10. */
export const ENEMY_POINTS: Readonly<Record<EnemyKind, KindPoints>>;
/**
 * Base points scaled by +10% per level above 1, rounded half up to a multiple of 10.
 * Integer-only: floor((base * (9 + level) + 50) / 100) * 10. Throws on level < 1 or non-integer.
 */
export function killPoints(kill: Kill, level: number): number;
// --- task 4 ---
export const EXTRA_LIFE_FIRST = 5000;
export const EXTRA_LIFE_EVERY = 10000;
/** How many extra-life thresholds (5000, 15000, 25000, ...) the score crossed from `before` to `after`. */
export function extraLivesEarned(before: number, after: number): number;

// src/game/player.ts
export const START_LIVES = 3;
export class Player {
  /** lives: total including the ship on the field; integer >= 1 (task 4: also <= MAX_LIVES); throws otherwise. */
  constructor(ship?: Ship, lives?: number);
  get lives(): number;
  /** No lives left: the ship stays down for good. */
  get isLost(): boolean;
  /** active -> down and lives - 1; ignored in other states. */
  hit(): void;
  // update(): down -> invulnerable only when lives > 0
  // --- task 4 ---
  /** lives + 1 up to MAX_LIVES, in any state; in down with 0 lives it brings the respawn back. */
  addLife(): void;
}
// --- task 4 ---
/** Cap for addLife; LIVES_ICON_SLOTS >= MAX_LIVES is checked by a test. */
export const MAX_LIVES = 5;

// src/game/battle.ts
export type BattlePhase = 'playing' | 'cleared' | 'over';
/** From the last ship's hit to the game over caption: the moment it would have respawned. */
export const GAME_OVER_DELAY_TICKS = DOWN_TICKS;
export interface BattleOptions {
  readonly startLevel?: number;
  readonly levels?: readonly LevelConfig[];
  /** Starting lives, default START_LIVES. Tests use 1 for a quick game over. */
  readonly lives?: number;
}
export class Battle {
  /** Created in the constructor: new Player(undefined, opts.lives ?? START_LIVES). */
  readonly player: Player;
  get score(): number;
  /** Ticks since entering the current phase, any phase (0 on the entry tick). */
  get phaseTicks(): number;
  // level, wave, phase - as before
}

// src/game/game-over-render.ts
export const GAME_OVER_TEXT = 'GAME OVER';
export const PRESS_ENTER_TEXT = 'PRESS ENTER';
/** Top of the caption row and of the prompt row, logical px. */
export const GAME_OVER_Y: number;
export const PRESS_ENTER_Y: number;
/** Prompt blinks: shown BLINK ticks, hidden BLINK ticks; shown on phaseTicks = 0. */
export const PRESS_ENTER_BLINK_TICKS = 30; // as the title's PRESS ENTER
/** Black box under each row; off by default, the owner decides on visual acceptance. */
export const GAME_OVER_BACKDROP = false;
export const GAME_OVER_BACKDROP_PAD = 2;
/** floor((SCREEN_WIDTH - textWidth(text)) / 2); textWidth includes the trailing cell gap. */
export function centeredX(text: string): number;
export function isPromptVisible(phaseTicks: number): boolean;
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  phaseTicks: number,
  backdrop?: boolean, // default GAME_OVER_BACKDROP
): void;

// src/game/scenes/play-scene.ts
export class PlayScene implements Scene {
  /** exit: where Enter leads after game over; without it the scene stays on the caption. */
  constructor(rng: Rng, starfield?: Starfield, opts?: BattleOptions, exit?: () => Scene);
  /** Exposed for tests. */
  readonly starfield: Starfield;
  update(dt: number, input: Input): Scene | void;
}

// src/game/scenes/title-scene.ts
export class TitleScene implements Scene {
  /** starfield: continue the stars when coming back from a game. */
  constructor(rng: Rng, startLevel?: number, starfield?: Starfield);
  /** Exposed for tests. */
  readonly starfield: Starfield;
}
```

Раскладка надписи (стартовая, проверяется глазами): `GAME OVER` цветом подписей панели
`HUD_LABEL_COLOR` (красный), `PRESS ENTER` — `HUD_VALUE_COLOR` (белый), обе по центру
экрана по X (`centeredX`); `GAME_OVER_Y` — около середины игрового поля,
`PRESS_ENTER_Y` — на 2 строки шрифта ниже. Точные y — на усмотрение разработчика; тест
— что обе строки (с полем подложки) внутри экрана и ниже `HUD_HEIGHT`. Подложка — при
`backdrop = true` чёрный `fillRect` под строкой, по ширине `textWidth` и высоте строки
плюс `GAME_OVER_BACKDROP_PAD` с каждой стороны; рисуется перед текстом строки. Мигает
только текст `PRESS ENTER`; подложка под ним (если включена) — постоянная, чтобы при
мигании не «прыгал» чёрный прямоугольник.

Титул пока рисует `PRESS ENTER` системным шрифтом (`fillText`) — не трогаем, это
отдельная задача меню.

## Тестирование

Юнит-тесты (без canvas, кроме render-тестов на `canvas-test-utils`):

- `score.test.ts` (задача 3): `ENEMY_POINTS` — для всех видов, значения по В1,
  `flying ≥ formation`, все — положительные кратные 10; `killPoints` на уровне 1 равен
  базе для каждого вида × строй/полёт; таблица контрольных значений из раздела
  «Надбавка за уровень» (уровни 2, 3, 5, 6, 11), в т.ч. пример владельца и случай
  «половина вверх» (`drone` уровень 6 → 50); случай-ловушка float: `raider` в строю,
  уровень 14 → 120; результат всегда кратен 10; монотонность по уровню (1…30); `RangeError` на
  уровне 0 и 1.5.
- `score.test.ts` (задача 4): `extraLivesEarned` — 0 → 4990: 0; 4990 → 5000: 1 (ровно на
  пороге); 5000 → 5040: 0 (повторно за тем же порогом); 14990 → 15000: 1; 24990 → 25010:
  1; 0 → 25000: 3 (прыжок через несколько порогов).
- `player.test.ts`: старт `lives = START_LIVES`; `hit()` из `active` списывает 1, из
  `down`/`invulnerable` — нет; последний `hit()` → `isLost`, после `DOWN_TICKS` и
  дальше (напр. 1000 тиков) остаётся `down`, `canBeTargeted = false`; конструктор
  бросает на `lives` < 1 и нецелом. Задача 4: `addLife()` до `MAX_LIVES` и не выше;
  `addLife()` в `down` при 0 → возрождение в тик `DOWN_TICKS`; конструктор бросает на
  `lives > MAX_LIVES`.
- `collisions.test.ts`: возврат `Kill[]` — выстрел по врагу в строю (`inFlight: false`),
  по пикирующему и по возвращающемуся (`true`), таран (`inFlight: true`); пустой список
  без попаданий; порядок — правило 1 раньше правила 3.
- `battle.test.ts`: задача 1 — `lives: 1` → `player.hit()` → через
  `GAME_OVER_DELAY_TICKS` фаза `over`, не раньше; таран последнего врага последним
  кораблём на `ONE_CORNER_ENEMY` (`enemy.startDive(diveOrder())`, `x/y` на корабль) →
  `over`, уровень не меняется; в `over` коллизий нет, `phaseTicks` растёт с 0;
  `phaseTicks` = 0 после конструктора и после `update` с переходом в `cleared`, в
  `playing` нового уровня и в `over`, затем +1 за `update`; `opts.lives` попадает в
  `player.lives`. Задача 3 — счёт растёт на `killPoints(kill, level)` в тик попадания;
  на уровне > 1 (через `startLevel`) — с надбавкой; переход `playing → cleared` счёт
  не меняет; в `over` счёт не меняется.
  Задача 4 — доп. жизнь при пересечении 5000; при `MAX_LIVES` не растёт; доп. жизнь в
  `down` при 0 жизней отменяет Game Over.
- `hud.test.ts`: `hudView` берёт `battle.player.lives` (задача 1) и `battle.score`
  (задача 3); `LIVES_ICON_SLOTS >= MAX_LIVES` (задача 4).
- `hud-render.test.ts`: при `lives > LIVES_ICON_SLOTS` рисуется `LIVES_ICON_SLOTS`
  иконок; при 0 — ни одной.
- `game-over-render.test.ts`: `centeredX` равен
  `floor((SCREEN_WIDTH − textWidth(text)) / 2)` и целый; обе строки (с полем подложки)
  внутри экрана и ниже `HUD_HEIGHT`; `isPromptVisible` — видно на 0, скрыто на 30,
  видно на 60; `drawGameOver` без подложки рисует только внутри прямоугольников строк,
  с `backdrop = true` — тоже (прямоугольник, расширенный на `GAME_OVER_BACKDROP_PAD`),
  и подложка рисуется и при скрытом `PRESS ENTER`.
- `play-scene.test.ts`: в `over` по `start` возвращается сцена из `exit`; без `over`
  `start` ничего не возвращает; без `exit` в `over` ничего не возвращает.
- `title-scene.test.ts` (задача 2): переданный `starfield` используется (тот же
  экземпляр уходит в `PlayScene.starfield`); полный цикл: `step` до `PlayScene` → в
  цикле `scene.battle.player.hit()`, когда `canBeHit`, и шаги до `phase === 'over'` →
  `start` → `TitleScene` с тем же `starfield` → `start` → новая `PlayScene` с тем же
  `starfield` и `player.lives === START_LIVES`. Предел в тесте — 600 тиков, чтобы
  зависание падало, а не висело; на деле `over` наступает примерно на 420-м тике: два
  цикла «`down` 60 + `invulnerable` 120», затем третье попадание и ещё 60 до `over`.
- `title-scene.test.ts` (задача 3): в тот же тест полного цикла добавить проверку
  `battle.score === 0` у новой `PlayScene` (в задаче 2 `Battle.score` ещё нет).

### Существующие тесты, которые меняются

- `hud.test.ts` (строки ~22-23, 44-56): импорт и проверки `PLACEHOLDER_LIVES` —
  переписать на `battle.player.lives` в задаче 1; `PLACEHOLDER_SCORE` — на
  `battle.score` в задаче 3.
- `collisions.test.ts` — не меняется: результат `resolveCollisions` не используется
  (`void → readonly Kill[]` совместимо).
- `battle.test.ts` — тесты на `cleared → playing` через `LEVEL_PAUSE_TICKS` должны
  остаться зелёными без правки (условие перехода то же); если какой-то тест опирался на
  «застывший» `phaseTicks` в `playing` — это был бы тест неверного поведения
  (сейчас поле private, таких нет).

Глазами (`npm run dev`, пункты — в `acceptance.md` задач):

- Иконка жизни пропадает в момент взрыва корабля; после трёх смертей корабль не
  появляется, через 1 с — `GAME OVER` и мигающий `PRESS ENTER` поверх летающих врагов.
- **Читаемость надписи без подложки** поверх врагов, взрывов и звёзд; если плохо —
  включить `GAME_OVER_BACKDROP` (решение владельца на приёмке).
- Enter → титул, звёзды без скачка; новый Enter → новая игра со счётом 0 и 3 жизнями.
- Счёт растёт на ожидаемые значения за врагов в строю и в полёте; на `?level=5`
  `drone` в строю — 40.
- С `?level=N` набрать 5000 — появляется иконка.

## Альтернативы

- **Отдельная `GameOverScene`.** Ей пришлось бы забрать живой `Battle` (чтобы враги
  летали за надписью и счёт остался на панели) и звёзды — то есть дублировать
  `PlayScene.update/render`. Фаза боя проще и сразу тестируется на `Battle`.
- **Жизни в `Battle`, а не в `Player`.** Возрождение — переход автомата `Player`;
  иначе пришлось бы либо выносить возрождение наружу, либо сообщать `Player` «не
  возрождайся» флагом. Ресурс там, где он тратится.
- **Новое состояние `ShipState = 'lost'`.** Ничем не отличается от `down` для рендера и
  коллизий; добавило бы ветки в `battle-render`, `canBeTargeted`, тестах. Хватает
  `isLost`.
- **Определять убийства в `Battle` по разнице состояний врагов до/после коллизий.**
  Хрупко и дублирует знание, которое есть в месте `kill()`.
- **Колбэк `onKill` в `resolveCollisions`.** Равносилен возврату массива, но массив
  проще проверять в тестах и не прячет порядок.
- **Поле `Kill.cause` (`'shot' | 'ram'`).** Было в раунде 1 под вариант «таран без
  очков»; владелец выбрал «таран — как в полёте», что уже выражает `inFlight`. Поле без
  потребителя — убрано.
- **Надбавка через float (`Math.round(base * (1 + 0.1 * (level - 1)) / 10) * 10`).**
  Множители вроде `1.4` непредставимы в двоичной плавающей точке; на границах
  половины результат зависит от погрешности (`raider` в строю на уровне 14: 110 вместо
  120). Целочисленная формула — та же математика без риска; разница закреплена тестом.
- **Округление вниз.** Прячет надбавку на уровнях 2–3 для `drone` (33, 36 → 30).
- **Отдельный `overTicks` для мигания** (вопрос разработчика). Второй счётчик с тем же
  смыслом «тиков в фазе», а общий `phaseTicks` остался бы неверным в `playing`. Один
  починенный счётчик проще.
- **Списывать жизнь в момент возрождения.** Тогда 1 с после взрыва панель показывала
  бы «лишнюю» иконку корабля, которого нет на поле.
- **Прямой импорт `TitleScene` в `PlayScene`.** Цикл модулей `title ↔ play`; фабрика
  `exit` его убирает.
- **Отдельный класс `ScoreKeeper` со состоянием.** Счёт — одно число и одна функция
  `addScore` в `Battle`; пороги — чистая `extraLivesEarned(before, after)`.
- **Подложка под надписью включена сразу.** Решение — на приёмке глазами (владелец);
  место заложено, включение — одна константа.

## Открытые вопросы к владельцу

Нет. В1–В5 закрыты ответами владельца 2026-11-11 (см. `discussion.md`, раунд 2).
Включение подложки под `GAME OVER` — пункт приёмки задачи 2, не вопрос проектирования.

Закрытые:

- **В1** — очки: `drone` 30 / 60, `striker` 40 / 80, `raider` 50 / 100; `returning` —
  полёт; таран — как сбитый в полёте.
- **В2** — надбавка +10 % за уровень к очкам каждого врага, округление до 10, без
  потолка; бонуса за строй нет. Способ округления — архитектор (к ближайшему, половина
  вверх, в целых).
- **В3** — через 1 с `GAME OVER` + мигающее `PRESS ENTER` поверх летающих врагов;
  Enter → титул; подложка — на приёмке.
- **В4** — старт 3; доп. жизнь на 5000, далее каждые 10000; не больше 5.
- **В5** — рекорд позже, отдельной фичей.

## Нарезка на задачи

Порядок важен: каждая следующая опирается на предыдущую; после каждой игра собирается и
играется.

1. **Жизни и конец игры в логике.** `Player`: `lives`, `START_LIVES`, списание в
   `hit()`, возрождение только при `lives > 0`, `isLost`, проверка конструктора (целое
   ≥ 1). `Battle`: создание `player` в конструкторе с `opts.lives ?? START_LIVES`,
   `BattleOptions.lives`; фаза `over`, `GAME_OVER_DELAY_TICKS`; `phaseTicks` — публичный
   геттер, общий счётчик с обнулением при входе в любую фазу (private `ticksInPhase`;
   `++` в начале `updatePhase`, переход ставит 0 — см. «Фазы `Battle`»).
   `hudView` берёт `player.lives`, `drawLives` ограничен `LIVES_ICON_SLOTS`,
   `PLACEHOLDER_LIVES` удалена, `hud.test.ts` переписан. Без `addLife`/`MAX_LIVES`, без
   нового тестового уровня. Проверка: тесты; глазами — иконки пропадают при гибели,
   после последней корабль не возвращается, враги летают дальше (надписи ещё нет —
   промежуточное состояние).
2. **Экран Game Over и рестарт.** `game-over-render.ts` (с выключенной подложкой
   `GAME_OVER_BACKDROP`), отрисовка в `PlayScene` в фазе `over`, фабрика `exit`,
   `TitleScene(rng, startLevel, starfield)`, `readonly starfield` в обеих сценах,
   Enter → титул. Тест полного цикла — без `score === 0` (счёта ещё нет). Проверка:
   тесты сцен и рендера; глазами (`acceptance.md`) — надпись, мигание, читаемость без
   подложки, рестарт, звёзды без скачка. После этой задачи игра — полный цикл «старт → проигрыш → старт».
3. **Счёт.** `score.ts` (`ENEMY_POINTS`, `killPoints` с целочисленной надбавкой за
   уровень и таблицей контрольных значений в тестах), `resolveCollisions` возвращает
   `Kill[]`, `Battle.score` и `addScore` (просто `score += p`), `hudView` берёт
   `battle.score`, `PLACEHOLDER_SCORE` удалена. В `score.test.ts` — случай-ловушка
   float (`raider` в строю, уровень 14 → 120); в тест полного цикла
   `title-scene.test.ts` — строка `battle.score === 0`. Проверка: тесты; глазами — счёт
   растёт по таблице, на `?level=5` с надбавкой.
4. **Доп. жизнь за очки.** `MAX_LIVES = 5`, `addLife()`, верхняя граница в
   конструкторе `Player`, `EXTRA_LIFE_FIRST`/`EXTRA_LIFE_EVERY`, `extraLivesEarned`,
   хук в `addScore`; тесты порогов, предела, `LIVES_ICON_SLOTS >= MAX_LIVES` и «доп.
   жизнь в `down` отменяет Game Over». Проверка: тесты; глазами — с `?level=N` набрать
   5000, увидеть новую иконку.

В каждой задаче — обновить `game-design.md` (разделы «Очки», «Жизни», «Поражение
игрока») и `architecture/overview.md` по сделанному.

Зависимости: 2 и 3 — только от 1, между собой независимы; 4 — от 1 и 3.

## История

- **Раунд 1** (2026-11-11): первый черновик. Жизни — в `Player`, списание в тик
  попадания; Game Over — фаза `over` боя внутри `PlayScene`, переход через фабрику
  `exit`; счёт — в `Battle`, убийства — событиями `Kill[]` из `resolveCollisions`;
  таблица очков и бонусы — чистые функции `score.ts`. 5 вопросов к владельцу.
- **Раунд 2** (2026-11-11): ответы владельца В1–В5 и отзыв разработчика (9 пунктов —
  все приняты, см. `discussion.md`). Модель счёта: вместо бонуса за строй
  (`levelClearBonus` удалён) — надбавка +10 % за уровень к каждому убийству,
  целочисленная формула с округлением к ближайшему 10 (половина вверх) и таблица
  контрольных значений. `Kill.cause` убран. `phaseTicks` — общий счётчик с обнулением
  при входе в любую фазу (private `ticksInPhase`). `player` создаётся в конструкторе
  `Battle`. Тестовый уровень не нужен. `addLife`/`MAX_LIVES` и верхняя граница
  конструктора — в задаче 4; заглушки `extraLivesEarned` в задаче 3 нет. Выключаемая
  подложка `GAME_OVER_BACKDROP` (по умолчанию выкл., решение на приёмке).
  `readonly starfield` в сценах для тестов. Перечислены меняющиеся существующие тесты.
  Открытых вопросов нет; нужен раунд разработчика по новой модели счёта.
- **Раунд 3** (2026-11-11): отзыв разработчика раунда 2 (блокеров 0, рекомендаций 5 —
  все приняты, см. `discussion.md`). Проверка `score === 0` в тесте полного цикла
  перенесена из задачи 2 в задачу 3. Исправлен испорченный Prettier пункт про
  `title-scene.test.ts` и число тиков до `over` (два цикла, ~420, предел 600).
  Добавлен случай-ловушка float в `score.test.ts` (`raider` в строю, уровень 14 → 120).
  Уточнена семантика `phaseTicks` (0 после конструктора и после `update` с переходом;
  `++` в начале `updatePhase`). Довод о недостижимости гонки `over` и
  `cleared → playing` переписан без ложной нижней границы 16 тиков. Статус —
  согласовано.

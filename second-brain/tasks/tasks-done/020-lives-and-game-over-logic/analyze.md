# Анализ: Жизни и конец игры в логике

Рамка — согласованный `second-brain/features/005-lives-score-game-over/design.md`
(раунд 3), пункт 1 нарезки. Анализ сверяет его с кодом (ветка после merge PR #3,
`9e7a20e`); расхождений, требующих решения, не найдено.

## Общее описание функциональности

Сейчас корабль после гибели возрождается бесконечно, а иконки жизней в верхней панели —
заглушка `PLACEHOLDER_LIVES = 3`. Задача вводит конечный запас кораблей и фазу конца
игры в логике боя:

- старт — **3 жизни** (`START_LIVES`), это общее число, включая корабль на поле
  (решение владельца В4);
- каждая гибель (вражеский выстрел или таран) списывает жизнь **в тик попадания** —
  иконка пропадает одновременно с началом взрыва;
- пока жизни есть — всё как сейчас: 1 с пусто → возрождение по центру → 2 с мигания;
- после последней жизни корабль взрывается и больше не появляется; враги продолжают
  летать без цели (`targetX = null`, как в `down`);
- через `GAME_OVER_DELAY_TICKS` = `DOWN_TICKS` (60 тиков, 1 с — момент, когда корабль
  появился бы) бой переходит в фазу `over`: коллизий нет, переходов фаз нет, волна живёт.

Надписи `GAME OVER` и возврата на титул в этой задаче нет (задача 021) — игрок видит
промежуточное состояние: пустое место корабля и летающих врагов.

## Модели данных и состояние

### `Player` (`src/game/player.ts`)

| Поле / член       | Сейчас                                            | После задачи                                                                        |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `START_LIVES`     | нет                                               | экспорт, `3`                                                                        |
| конструктор       | `(ship = new Ship())`                             | `(ship = new Ship(), lives = START_LIVES)`; `lives` — целое ≥ 1, иначе `RangeError` |
| `lives` (геттер)  | нет                                               | общее число жизней, включая корабль на поле                                         |
| `isLost` (геттер) | нет                                               | `lives === 0`                                                                       |
| `hit()`           | `active → down`, иначе игнор                      | то же + `lives -= 1` (только при переходе из `active`)                              |
| `update` в `down` | при `stateTicks >= DOWN_TICKS` всегда возрождение | возрождение только при `lives > 0`; иначе остаётся `down`, `stateTicks` растёт      |

Автомат корабля после задачи:

```
active --hit()--> down   [lives -= 1]
down --(stateTicks >= DOWN_TICKS && lives > 0)--> invulnerable (x = SHIP_START_X)
down, lives == 0 --> остаётся down навсегда («потерян»)
invulnerable --INVULNERABLE_TICKS--> active
```

Нового `ShipState` нет: «потерянный» корабль для рендера и коллизий — обычный `down`
(`canBeHit`/`canBeTargeted` — false). Инвариант: в `active`/`invulnerable` всегда
`lives ≥ 1`. `addLife`/`MAX_LIVES` — **не** в этой задаче (023).

### `Battle` (`src/game/battle.ts`)

| Член                    | Сейчас                                                                                                                             | После задачи                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `BattlePhase`           | `'playing' \| 'cleared'`                                                                                                           | `+ 'over'` (терминальная)                                                  |
| `GAME_OVER_DELAY_TICKS` | нет                                                                                                                                | экспорт, `= DOWN_TICKS` (60)                                               |
| `BattleOptions.lives`   | нет                                                                                                                                | опционально, по умолчанию `START_LIVES`                                    |
| `player`                | инициализатор поля `new Player()` (до конструктора, `opts` недоступен)                                                             | объявление поля + создание в конструкторе с `opts.lives ?? START_LIVES`    |
| счётчик фазы            | private `phaseTicks`; обнуляется только при входе в `cleared`, в `playing` не растёт (после первой смены уровня «застывает» на 90) | private `ticksInPhase` + публичный геттер `phaseTicks`; общий для всех фаз |

Семантика `phaseTicks` (design.md, «Фазы `Battle`»):

- 0 после конструктора;
- 0 после `update`, в котором произошёл переход в любую фазу (`→ cleared`,
  `→ playing`, `→ over`);
- +1 после каждого следующего `update`, в любой фазе (в т.ч. `over`).

Реализация по дизайну: `ticksInPhase++` в начале `updatePhase`, затем проверки, каждая
ветка перехода ставит 0. Проверено по коду: сейчас `cleared` ставит 0 в тике входа, далее
`++` в каждом тике `cleared` и переход при `=== LEVEL_PAUSE_TICKS` — новая схема даёт те
же тики переходов, тесты `battle.test.ts:86-125` («enters cleared…», «starts the next
level exactly LEVEL_PAUSE_TICKS later», «escalates…») остаются без правки.

Порядок проверок в `updatePhase`:

1. `phase ∈ {playing, cleared}` и `player.isLost && player.stateTicks >= GAME_OVER_DELAY_TICKS`
   → `over` (первой: уровень после проигрыша не меняется);
2. `playing` и `wave.isCleared` → `cleared` + `wave.clearShots()`;
3. `cleared` и `ticksInPhase === LEVEL_PAUSE_TICKS` → `level++`, новая волна, `playing`.

`over` — переходов нет, счётчик растёт.

Тайминг перехода в `over` (проверено по порядку тика): `hit()` вызывается в
`resolveCollisions` после `player.update` → в тике попадания `stateTicks = 0`; каждый
следующий `Battle.update` сначала делает `player.update` (`++`), поэтому в 60-м
`update` после попадания `stateTicks = 60` и `updatePhase` того же тика ставит `over`.
Это тот же тик, в котором при `lives > 0` случилось бы возрождение.

### Константы

| Константа               | Значение                                         | Где         |
| ----------------------- | ------------------------------------------------ | ----------- |
| `START_LIVES`           | 3                                                | `player.ts` |
| `GAME_OVER_DELAY_TICKS` | 60 (`DOWN_TICKS`)                                | `battle.ts` |
| `DOWN_TICKS`            | 60 (без изменений)                               | `player.ts` |
| `LEVEL_PAUSE_TICKS`     | 90 (без изменений)                               | `battle.ts` |
| `LIVES_ICON_SLOTS`      | 5 (без изменений, теперь ограничивает отрисовку) | `hud.ts`    |

## Связанные модули и сущности

| Модуль / сущность     | Назначение                                                                        | Файлы                                          |
| --------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `Player`              | корабль, выстрел, автомат состояний; теперь — жизни                               | `src/game/player.ts`, `player.test.ts`         |
| `Battle`              | агрегат боя, фазы, порядок тика                                                   | `src/game/battle.ts`, `battle.test.ts`         |
| коллизии              | единственные вызовы `player.hit()` (правила 2 и 3); вызываются только в `playing` | `src/game/collisions.ts` (не меняется)         |
| `hudView`             | снимок панели из боя                                                              | `src/game/hud.ts`, `hud.test.ts`               |
| `drawHud`/`drawLives` | отрисовка иконок жизней                                                           | `src/game/hud-render.ts`, `hud-render.test.ts` |
| `drawBattle`          | рисует `down` как взрыв `EXPLOSION_TICKS`, затем ничего                           | `src/game/battle-render.ts` (не меняется)      |
| `PlayScene`           | создаёт `Battle(rng, opts)`, рисует HUD                                           | `src/game/scenes/play-scene.ts` (не меняется)  |
| тестовые уровни       | `ONE_CORNER_ENEMY`, `TWO_LEVELS`, `diveOrder`, `passiveLevel`                     | `src/game/test-levels.ts` (не меняется)        |

## Точки встраивания

- **Логика тика `Battle.update`** — порядок не меняется: игрок → волна → коллизии
  (только `playing`; `cleared` и `over` их уже исключают условием
  `currentPhase === 'playing'`) → `updatePhase`. Меняется только `updatePhase`
  (общий счётчик, проверка `over` первой).
- **`Player.update`** — условие таймерного перехода `down → invulnerable` дополняется
  `lives > 0`. Порядок «посчитать тик → переход → действие» сохраняется; в
  «потерянном» `down` intent игнорируется, выстрел в полёте долетает (как сейчас).
- **`Player.hit()`** — списание жизни внутри существующей ветки `active → down`.
- **HUD** — `hudView` вместо `PLACEHOLDER_LIVES` берёт `battle.player.lives`;
  `drawLives` рисует `min(lives, LIVES_ICON_SLOTS)` иконок.
- **Сцена/ввод/рендер боя** — без изменений. `PlayScene` передаёт `opts` в `Battle` как
  есть, поэтому `BattleOptions.lives` доступен и сцене (используется в 021 для тестов).
- **Отрисовка корабля** — «потерянный» корабль = `down` со сколь угодно большим
  `stateTicks`: `drawShip` (`battle-render.ts:46-48`) рисует взрыв только при
  `ticks < EXPLOSION_TICKS`, дальше ничего — растущий счётчик не ломает рендер.

## Файлы и места в коде

| Файл                                    | Что содержит                                                                              | Что изменить                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/game/player.ts`                    | `Player`, `DOWN_TICKS`, автомат (стр. 37-115)                                             | `START_LIVES`; поле жизней; параметр конструктора + `RangeError`; геттеры `lives`, `isLost`; списание в `hit()` (стр. 77-80); условие возрождения в `update` (стр. 92-95); JSDoc автомата (стр. 6, 28-36)                            |
| `src/game/battle.ts`                    | `Battle`, фазы, `LEVEL_PAUSE_TICKS`                                                       | `BattlePhase + 'over'`; `GAME_OVER_DELAY_TICKS`; `BattleOptions.lives`; `player` — в конструкторе (стр. 31, 38-45); `phaseTicks` → private `ticksInPhase` + геттер; переписать `updatePhase` (стр. 79-97) и JSDoc класса/методов     |
| `src/game/hud.ts`                       | `hudView`, `PLACEHOLDER_*`, раскладка                                                     | удалить `PLACEHOLDER_LIVES` (стр. 23-24); `hudView` (стр. 80-83) — `lives: battle.player.lives`; поправить JSDoc (`PLACEHOLDER_SCORE` остаётся до 022)                                                                               |
| `src/game/hud-render.ts`                | `drawLives` (стр. 56-62)                                                                  | ограничить число иконок `LIVES_ICON_SLOTS` (импорт из `hud.ts`)                                                                                                                                                                      |
| `src/game/player.test.ts`               | тесты автомата                                                                            | новые тесты жизней (см. «Тестируемость»); существующие не меняются — 3 жизни хватает на каждый сценарий (максимум — «can be hit again once active», два `hit()`)                                                                     |
| `src/game/battle.test.ts`               | фазы, таран, выстрелы                                                                     | новые тесты `over`, `phaseTicks`, `opts.lives`; существующие не меняются                                                                                                                                                             |
| `src/game/hud.test.ts`                  | `hudView`, раскладка                                                                      | убрать импорт и проверки `PLACEHOLDER_LIVES` (стр. 22, 43-56); `hudView` — проверка `battle.player.lives` (старт 3, после `hit()` — 2, через `opts.lives`)                                                                           |
| `src/game/hud-render.test.ts`           | `drawLives` (стр. 120-133)                                                                | добавить: при `lives > LIVES_ICON_SLOTS` рисуется ровно `LIVES_ICON_SLOTS` иконок; 0 — уже покрыт                                                                                                                                    |
| `second-brain/game-design.md`           | «Экран» (HUD, стр. 17-21), «Поражение игрока» (стр. 45-47), «Жизни» (стр. 55)             | жизни теперь настоящие (заглушка — только счёт); 3 жизни, списание в тик попадания, после последней — без возрождения, через 1 с фаза конца игры (надпись — задача 021)                                                              |
| `second-brain/architecture/overview.md` | описание `player.ts` (стр. ~67-80), `battle.ts` (стр. ~215-223), `hud.ts` (стр. ~235-243) | `lives`, `START_LIVES`, `isLost`, условие возрождения; `BattleOptions.lives`, `over`, `GAME_OVER_DELAY_TICKS`, семантика `phaseTicks`, создание `player` в конструкторе; `hudView` берёт жизни из боя, `drawLives` ограничен слотами |

Не меняются: `collisions.ts` (вызов `hit()` тот же; `collisions.test.ts` создаёт
`new Player()` — по умолчанию 3 жизни, сценарии с одним-двумя попаданиями проходят),
`battle-render.ts`, `play-scene.ts`, `title-scene.ts`, `src/engine/`.

## Тестируемость

Вся логика детерминирована (тики, без `Rng` в `Player`), покрывается unit-тестами без
canvas; гибель — через `player.hit()`, таран — `enemy.startDive(diveOrder())` и ручная
установка `x/y` на корабль (как в `battle.test.ts` «Battle ram» и `collisions.test.ts`).
Новый тестовый уровень не нужен.

- `player.test.ts`:
  - старт: `lives === START_LIVES`, `START_LIVES === 3`, `isLost === false`;
  - `hit()` из `active` списывает 1 в тот же вызов; из `down` и `invulnerable` — нет;
  - конструктор принимает `lives`; бросает `RangeError` на 0, отрицательном, нецелом (1.5);
  - последний `hit()` (`new Player(ship, 1)`) → `lives 0`, `isLost`; после `DOWN_TICKS` и
    далее (например, 1000 тиков) — `down`, `canBeTargeted`/`canBeHit` false, `x` не
    сброшен в `SHIP_START_X`, intent игнорируется; выстрел в полёте долетает;
  - при `lives > 0` после `hit()` возрождение в тик `DOWN_TICKS` — как сейчас.
- `battle.test.ts`:
  - `opts.lives` попадает в `player.lives`, по умолчанию `START_LIVES`;
  - `lives: 1` → `player.hit()` → фаза `playing` до `GAME_OVER_DELAY_TICKS - 1`
    обновлений, `over` ровно на `GAME_OVER_DELAY_TICKS`-м;
  - таран последнего врага последним кораблём на `ONE_CORNER_ENEMY` → `cleared` (через
    `EXPLOSION_TICKS`) → `over` через 60 тиков после тарана; дальше прогон за
    `LEVEL_PAUSE_TICKS` и больше — уровень остаётся 1, фаза `over`, волна прежняя;
  - в `over` коллизий нет. Замечание по наблюдаемости: в `over` корабль — `down`
    (`canBeHit = false`), поэтому правила 2 и 3 и так ничего не делают, а выстрела
    игрока к `over` нет (стрелять в `down` нельзя, `activeShot` private). Через публичный
    API выключенные коллизии от включённых не отличить; тест — поведенческий: враг в
    полёте и вражеский выстрел, наложенные на место корабля, остаются (враг живой,
    выстрел в `wave.shots`), фаза `over`. Как именно закрепить — решить в плане;
    расширять API ради этого теста не нужно;
  - `phaseTicks`: 0 после конструктора; +1 за `update` в `playing`; 0 после `update`
    перехода в `cleared`, в `playing` нового уровня, в `over`; затем +1 за `update`
    (в `over` растёт с 0);
  - в `over` волна продолжает обновляться (например, `formation.offset` меняется).
- `hud.test.ts`: `hudView(battle).lives === battle.player.lives` — старт 3; после
  `player.hit()` — 2; с `opts.lives` — переданное число.
- `hud-render.test.ts`: `lives = LIVES_ICON_SLOTS + 2` → ровно `LIVES_ICON_SLOTS ×
ICON_PIXELS` закрасок, все внутри `LIVES_ZONE`.

Только глазами (`npm run dev`, промежуточное состояние, без `acceptance.md`): иконка
пропадает в момент взрыва; после третьей гибели корабль не возвращается; враги летают
дальше и пикируют без цели.

## Зависимости и ограничения

- Фиксированный шаг 60 тиков/с: все тайминги — в тиках (`GAME_OVER_DELAY_TICKS` = 60).
- Гонка `over` против `cleared → playing` сейчас недостижима (гибель возможна только в
  `playing`, поэтому `cleared → playing` наступает не раньше чем через 90 тиков после
  гибели, `over` — через 60); проверка `over` первой — страховка, тест «таран последнего
  врага» её фиксирует как «уровень не меняется».
- Выстрел игрока, выпущенный до последней гибели, к моменту `over` гарантированно
  улетел (от `SHIP_Y − 4 = 204` до верха — 51 тик < 60), поэтому выключение коллизий в
  `over` не съедает честных попаданий; до `over` такой выстрел может сбить врага.
- Граница engine/game не затрагивается. `import type` — для `BattleOptions`/`PlayerIntent`
  как сейчас; `START_LIVES` и `DOWN_TICKS` в `battle.ts` — значения, обычный импорт.
- Порядок создания в конструкторе `Battle`: `Player` не использует `rng`, поэтому
  перенос его создания в конструктор не сдвигает последовательность генератора.
- Риск для существующих тестов минимален: ни один тест не гоняет бой столько, чтобы
  корабль погиб 3 раза (сценовые тесты — до 200 тиков на `ONE_CORNER_ENEMY`, тесты
  тарана/выстрела — одно попадание).
- Без `MAX_LIVES` верхней границы у `lives` в конструкторе нет; `drawLives` уже
  защищает раскладку ограничением `LIVES_ICON_SLOTS`. Верхняя граница — задача 023.

## Открытые вопросы

Нет. Решения владельца (В3, В4) и разработчика закрыты в `design.md` / `discussion.md`;
код соответствует описанию «Что есть в коде сейчас» дизайна.

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md
- second-brain/architecture/overview.md
- second-brain/features/005-lives-score-game-over/design.md (рамка; «Сущности и состояния», «Фазы `Battle`», «Тестирование», нарезка п. 1)
- second-brain/features/005-lives-score-game-over/discussion.md, dev-review.md, dev-review-2.md
- second-brain/tasks/tasks/020-lives-and-game-over-logic/description.md

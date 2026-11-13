# Анализ: Повторный пролёт несбитого астероида

Код: ветка `main`, коммит `2d43b1d`. Рамка — согласованный
`second-brain/features/007-asteroid-retry/design.md` (раунд 3). Анализ уточняет его по коду
и не перепроектирует.

## Общее описание функциональности

Сейчас (фича 006) `BonusField` выпускает один астероид за уровень. Если игрок его не сбил
и астероид ушёл за нижний край, бонус пропадает до следующего уровня. Задача: астероид,
ушедший несбитым, возвращается через случайные 5–15 с фазы `playing` (300…900 тиков, то же
окно `spawnWindow`). Бонус у него тот же, а сторона (`dir`) и смещение старта (`offset`)
тянутся заново. Повторов сколько угодно, пока астероид не сбит или пока не сменился
уровень. При смене уровня ожидающий повтор отменяется (В4).

Для игрока повтор выглядит как обычный астероид: та же модель `Asteroid`, тот же спрайт,
то же движение. Отрисовка не меняется. Правило «на поле не больше одного бонусного
предмета» сохраняется: повтор, как и новый астероид, вылетает только на пустое поле.

## Модели данных и состояние

**Asteroid** (`src/game/asteroid.ts`) не меняется. Автомат:
`flying --hit()--> exploding --EXPLOSION_TICKS--> gone`; `flying --y >= SCREEN_HEIGHT--> gone`
(`asteroid.ts:21`, `:59`, `:64`). Значит, уход несбитым однозначно распознаётся в поле:
до `update` было `flying`, после стало `gone`. Сбитый астероид проходит через `exploding`,
и в момент `gone` до `update` у него `exploding`.

**BonusField** (`src/game/bonus-field.ts`): сейчас поля `current`, `dropped`,
`tick: number | null`, `ticks`. Поле `tick` заменяется одной записью ожидания:

| Поле                 | Тип                                                  | Смысл                                                                                                             |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pending`            | `{ tick: number; bonus: BonusKind \| null } \| null` | что ждёт вылета: `bonus === null` — новый астероид уровня (бонус тянется при вылете), иначе повтор с этим бонусом |
| `ticks`              | `number`                                             | без изменений: тики `playing` в текущем уровне                                                                    |
| `current`, `dropped` | —                                                    | без изменений                                                                                                     |

Неявный автомат ожидания (по design.md):

| Из               | Событие                                         | В                                                  | rng                                                        |
| ---------------- | ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| любое            | `startLevel`                                    | waitingNew `{ tick: d, bonus: null }`, `ticks = 0` | 1 (`d`)                                                    |
| waitingNew/Retry | `update(spawning)`, `ticks >= tick`, поле пусто | idle, на поле астероид                             | новый: `dir, offset, bonus` (3); повтор: `dir, offset` (2) |
| idle             | астероид ушёл несбитым                          | waitingRetry `{ tick: L + d, bonus }`              | 1 (`d`)                                                    |
| waitingNew/Retry | астероид ушёл несбитым                          | без изменений                                      | 0                                                          |

Константы — существующие, новых нет:

| Константа                              | Значение                                       | Где                      |
| -------------------------------------- | ---------------------------------------------- | ------------------------ |
| `ASTEROID_SPAWN_MIN_TICKS`             | 300                                            | `bonus-field.ts:9`       |
| `ASTEROID_SPAWN_MAX_TICKS`             | 900                                            | `bonus-field.ts:11`      |
| `ASTEROID_SPAWN_WINDOW`                | `{300, 900}`                                   | `bonus-field.ts:23`      |
| время полёта (в тестах `FLIGHT_TICKS`) | `SCREEN_HEIGHT + ASTEROID_SIZE` = 252 update'а | `bonus-field.test.ts:43` |

Контракт отсчёта: астероид ушёл в update E, после прироста `ticks` в E (если E —
`spawning`) `levelTicks = L`. Повтор назначается в E: `spawnTick = L + d`, где
`d ∈ [minTicks, maxTicks]`. Он вылетает в первом `spawning`-update, после которого
`levelTicks >= L + d` и поле пусто. `minTicks >= 1` проверяется в конструкторе
(`bonus-field.ts:49-58`), поэтому повтор не может вылететь в update ухода.

Новые геттеры: `retryBonus` (`pending?.bonus ?? null`). Смысл `spawnTick` расширяется до
`pending?.tick ?? null`: это тик следующего вылета, нового астероида или повтора.

## Связанные модули и сущности

| Модуль / сущность  | Назначение                                                                                                           | Файлы                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `BonusField`       | ожидание и вылет астероида, капсула, `startLevel`; здесь вся новая логика                                            | `src/game/bonus-field.ts`, `bonus-field.test.ts`                  |
| `Asteroid`         | модель астероида; не меняется                                                                                        | `src/game/asteroid.ts`                                            |
| `Battle`           | вызывает `bonusField.update(dt, phase === 'playing')` и `startLevel()`; логика не меняется, правятся doc-комментарии | `src/game/battle.ts`, `battle.test.ts`                            |
| dev-snapshot       | снимок `bonuses` для `window.__galaxy`; новое поле `retryBonus`                                                      | `src/game/dev-snapshot.ts`, `dev-snapshot.test.ts`                |
| dev-хуки           | `window.__galaxy.step/snapshot`; код не меняется, нужны для `acceptance.md`                                          | `src/game/dev-hooks.ts`, `second-brain/architecture/dev-hooks.md` |
| `Rng`, `randomInt` | случайность (`dir`, `offset`, `bonus`, задержки)                                                                     | `src/engine/rng.ts`                                               |

## Точки встраивания

- **Цикл обновления:** только внутри `BonusField.update(dt, spawning)`
  (`bonus-field.ts:95-110`). `Battle.update` (`battle.ts:117-…`, вызов на `:124`) не
  меняется: player → wave → `bonusField.update(dt, phase === 'playing')` → столкновения
  с врагами → бонусные столкновения → фаза (`startLevel` на `battle.ts:193`).
- **Новый порядок `update`** (из «Потока тика» design.md):
  1. астероид: запомнить `wasFlying`, `update(dt)`; если стал `gone`, сохранить
     `escaped = wasFlying ? current.bonus : null` и обнулить `current`;
  2. капсула — как сейчас;
  3. `if (spawning) ticks++` (поднимается выше `return`; сейчас стоит после, `:104-105`);
  4. `escaped !== null && pending === null` → назначить повтор (1 вызов `rng`);
  5. `if (!spawning) return`;
  6. вылет при `ticks >= pending.tick` и пустом поле: `spawn(pending.bonus)`,
     `pending = null`.

  Порядок 4 до 6 несущий. В update, где ушёл астероид прошлого уровня и вылетает новый,
  `pending` ещё занят новым, повтор не назначается. Если назначать после вылета, будет
  лишний вызов `rng` и второй астероид за уровень. Причину записать в doc-комментарий
  `update`. Тест-сторож — `bonus-field.test.ts:204`.

- **`startLevel`** (`:83-86`): `ticks = 0`, `pending = { tick: drawWindowTicks(), bonus: null }`.
  Ожидающий повтор затирается, это и есть отмена (В4).
- **`spawn`** (`:142-147`) получает параметр `bonus: BonusKind | null`. Порядок `rng`:
  `dir`, `offset`, затем `bonus` только при `null`.
- **Новый приватный `drawWindowTicks()`** — один вызов
  `randomInt(rng, minTicks, maxTicks + 1)`, общий для `startLevel` и назначения повтора.
- **Отрисовка, ввод, HUD:** не меняются (`battle-render.ts` рисует `bonuses.asteroid`
  как есть).
- **Dev-snapshot:** в `bonuses` добавить `retryBonus: bonuses.retryBonus`
  (`dev-snapshot.ts:66-78` — тип, `:117-133` — сборка).

## Файлы и места в коде

| Файл                                                        | Что содержит                                                                                                                             | Что изменить                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/bonus-field.ts`                                   | `BonusField`                                                                                                                             | `tick` → `pending`; `drawWindowTicks()`; `spawn(bonus)`; геттер `retryBonus`; `spawnTick` из `pending`; порядок `update`; doc-комментарии класса (`:28-33`: «one asteroid per level», порядок `rng` с задержкой повтора и `spawn` повтора `dir, offset`), `spawnTick` (`:69`), `startLevel` (`:79-82`), `update` (`:88-94`, с причиной порядка 4 → 6), `spawn` (`:141`) |
| `src/game/bonus-field.test.ts`                              | unit-тесты поля, хелперы `queued`, `counting`, `step`, `ONE_TICK`, `FLIGHT_TICKS`, `ALMOST_ONE`                                          | переписать `:101` (`spawns on the update where levelTicks reaches spawnTick, once per level`): сейчас на update 552 (уход) пятый вызов `rng` бросит в `queued(0, 0.75, 0, 0)`. Добавить тесты из раздела «Тестирование» design.md. `:126`, `:204`, `:250` не трогать                                                                                                    |
| `src/game/battle.ts`                                        | `Battle`                                                                                                                                 | только doc-комментарии: `:49` («one asteroid per level») и описание потока тика `:110-115` («counts the level tick and spawns only in playing» → добавить повтор)                                                                                                                                                                                                       |
| `src/game/battle.test.ts`                                   | тесты боя; `bonusBattle()` (`:539`, `rng: () => 0`), `spawnAsteroid` (`:543`), `run`, `TWO_LEVELS`, образец счётчика `rng` на `:657-661` | один интеграционный тест в `describe('Battle asteroid')`: уход → повтор ровно через 300 тиков `playing`, раньше нет; отмена при смене уровня (6 вызовов `rng`, `spawnTick === 300`, `levelTicks === 0`, `retryBonus === null`)                                                                                                                                          |
| `src/game/dev-snapshot.ts`                                  | `BattleSnapshot.bonuses`, `snapshotBattle`                                                                                               | поле `retryBonus: BonusKind \| null` в типе и сборке; doc поля `spawnTick` уточнить                                                                                                                                                                                                                                                                                     |
| `src/game/dev-snapshot.test.ts`                             | тесты снимка, `sceneWithAsteroid()`                                                                                                      | тест на `bonuses.retryBonus`: `null` у свежего боя / после вылета, вид бонуса после ухода несбитым                                                                                                                                                                                                                                                                      |
| `second-brain/architecture/overview.md`                     | абзац `bonus-field.ts` (`:289-302`)                                                                                                      | `pending`, повтор, `retryBonus`, порядок `rng`                                                                                                                                                                                                                                                                                                                          |
| `second-brain/architecture/dev-hooks.md`                    | схема снимка (`:69-71`), константы (`:96-104`), рецепты (`:106-`)                                                                        | смысл `spawnTick` (`:70`), поле `retryBonus`, строка констант «задержка повтора — 300 … 900 тиков от ухода», рецепт «не сбивать → ждать повтор»                                                                                                                                                                                                                         |
| `second-brain/game-design.md`                               | пункт «Астероиды и бонусы» (`:78-88`)                                                                                                    | заменить целиком формулировкой из «Правки game-design.md» design.md (без выделения)                                                                                                                                                                                                                                                                                     |
| `second-brain/tasks/tasks/030-asteroid-retry/acceptance.md` | нет                                                                                                                                      | создать на стадии do: кейс через `window.__galaxy` (дизайн, раздел «Глазами / `/qa`»)                                                                                                                                                                                                                                                                                   |

Не меняются: `asteroid.ts`, `capsule.ts`, `collisions.ts`, `battle-render.ts`,
`play-scene.ts`, `dev-hooks.ts`.

## Тестируемость

Вся логика детерминирована: `rng` поля инжектируется, окно `spawnWindow` тоже, время
задаётся числом update'ов. Тестовые инструменты уже есть в `bonus-field.test.ts`:
`queued(...)` бросает на лишнем вызове `rng` и считает вызовы, `counting(v)` даёт
константу. Вырожденное окно `{d, d}` фиксирует моменты.

Unit (`bonus-field.test.ts`) — по разделу «Тестирование» design.md:

- переписанный `:101`: вылет ровно на `spawnTick`; до ухода `calls() === 4`; в update
  ухода `calls() === 5`, `spawnTick !== null`. В `queued` добавить значение задержки;
- точный момент повтора при `{d, d}`: `spawnTick === levelTicks + d`, `retryBonus ===
asteroid.bonus`; в `E + d - 1` астероида нет, в `E + d` есть, `spawnTick` и
  `retryBonus` — `null`;
- порядок `rng` и сохранение бонуса через `queued`: бонус ≠ `BONUS_KINDS[0]`; в уходе +1
  вызов, при вылете повтора +2, третий бросает; `dir`/`offset` повтора отличаются от
  первого;
- задержка из игрового окна: `ALMOST_ONE` → `L + 900`, `0` → `L + 300`;
- неограниченность: минимум 2 повтора подряд с тем же бонусом;
- сбитый не повторяется: `spawnTick === null`, `retryBonus === null`, лишних вызовов нет;
- `spawning = false` во время ожидания не сдвигает вылет;
- уход при `spawning = false`: `spawnTick === levelTicks + d` без прироста; вылет на
  `d`-м `spawning`-update;
- `startLevel` в ожидании повтора: `retryBonus === null`, новый `spawnTick` (1 вызов),
  вылетает новый астероид с бонусом из `rng`.

Существующие тесты, которые остаются зелёными без правок (проверено по коду):
`:126` (порядок `dir, offset, bonus` для `spawn(null)`); `:204` и `:250` (ушедший
астероид застаёт `pending` занятым новым астероидом уровня, `rng` не тянется; концовка
`:204` `calls() === before + 3` сторожит порядок 4 → 6); `:297`, `:455` и прочие с
`counting()` (лишний вызов `rng` не бросает; в `:455` уход при `spawning = false`
назначает повтор, но цикл заканчивается на пустом поле); детерминизм `:309` (возвращает
на первом вылете). В `battle.test.ts` тест `:656` (`calls === 2`) не доходит до ухода:
враг убит до вылета. `play-scene.test.ts:265` и `dev-snapshot.test.ts` проверяют
`spawnTick` до вылета, смысл там не меняется.

Интеграционный (`battle.test.ts`): `rng = 0` со счётчиком. Вылет на 300, уход на update
552 (`levelTicks = 552`), повтор на 852. Затем убить врага в ожидании → `cleared` →
`LEVEL_PAUSE_TICKS` → уровень 2: повтора нет, 6 вызовов `rng`. Для смены уровня подходит
и `ONE_CORNER_ENEMY` (`levelConfig` продлевает таблицу), и `TWO_LEVELS`. Выбор — на
стадии plan.

Только глазами / `/qa`: ощущение частоты повтора (не слишком ли часто или редко) — вкусовое,
для владельца. Сама механика проверяется через `window.__galaxy` (`snapshot().battle.bonuses`:
`retryBonus`, `spawnTick`, `levelTicks`, `asteroid`).

## Зависимости и ограничения

- Зависит только от готовой фичи 006. Других задач не нужно.
- Производительность: на поле не больше одного астероида, плюс одна запись ожидания и
  одно сравнение за тик. Нагрузки нет.
- Детерминизм: сценарии без ухода несбитым дают ту же последовательность `rng`, что в 006. Сценарии с уходом — ровно +1 вызов в update ухода. Поэтому существующие
  seed-зависимые кейсы QA (`?seed=…`) до первого ухода воспроизводятся как раньше, а
  после ухода последовательность `rng` поля сдвигается. `rng` поля отдельный от `rng`
  волны и сцены (`battle.ts:73`), на врагов это не влияет.
- Риск порядка шагов: поднять `ticks++` выше `return` и назначать повтор до проверки
  вылета (см. «Точки встраивания»). Ошибку ловят `:204` и новый тест точного момента.
- Риск «потерять» бонус: `current` обнуляется в шаге 1, поэтому `escaped` надо снять
  до обнуления.
- Ветка: сейчас `main`. Создание ветки — вне `analyze` (оркестратор / `commit`).

## Открытые вопросы

Нет. Решения владельца В1–В4 зафиксированы в design.md. Расхождений дизайна с кодом не
найдено: ссылки на строки (`bonus-field.ts:28-33, :69, :79-82, :88-94`, тесты `:101`,
`:126`, `:204`, `:250`, `battle.ts:49`, `:110`, `battle.test.ts:657-661`,
`overview.md:290-302`, `dev-hooks.md:70`, `:109`) совпадают с текущим кодом. Выносить
в отдельные задачи нечего.

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md (пункт «Астероиды и бонусы»)
- second-brain/features/007-asteroid-retry/design.md, discussion.md, dev-review.md, dev-review-2.md
- second-brain/features/006-asteroid-bonuses/
- second-brain/architecture/overview.md (абзац `bonus-field.ts`)
- second-brain/architecture/dev-hooks.md
- .claude/skills/qa/SKILL.md, .claude/skills/feature-chain/SKILL.md (формат `acceptance.md`)

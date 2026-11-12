# Анализ: Тестовые хуки для браузерного QA-агента

## Общее описание функциональности

Dev-инструмент, не игровая механика: в `npm run dev` агент `tester`
(`.claude/agents/tester.md`, скил `/qa`) через Claude in Chrome управляет игрой
детерминированно и читает её состояние как JSON, не полагаясь на скриншоты canvas.

- `?seed=N` — фиксированный seed вместо `Date.now()`.
- `?paused=1` — симуляция стоит с первого кадра (ещё на титуле), тики идут только по
  `__galaxy.step(n)`; отрисовка продолжается.
- `window.__galaxy` — `step(n)`, `press/release`, `pause/resume`, `state()`.
- Всё — только при `import.meta.env.DEV`; в прод-бандле хуков и кода снимка нет.

Главный сценарий тестировщика для фичи 005/006 — логика жизней: сбить корабль
(таран/выстрел врага), дождаться возрождения (`down` 60 тиков → `invulnerable` 120 тиков →
`active`), поймать капсулу `L` (+1 жизнь, на пределе 5 — +500 очков), довести до game over
(через `GAME_OVER_DELAY_TICKS = 60` после последнего попадания `battle.phase === 'over'`),
Enter — возврат на титул. Всё это должно читаться из `state()`.

## Модели данных и состояние

### Что есть сейчас (источники снимка)

| Источник      | Поля, доступные публично                                                                                                                                                                                                        | Файл                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Текущая сцена | переменная `scene` в `main.ts` (`let scene: Scene`) — снаружи недоступна                                                                                                                                                        | `src/main.ts`                            |
| `TitleScene`  | `starfield`; `ticks`, `rng`, `startLevel` — private                                                                                                                                                                             | `src/game/scenes/title-scene.ts`         |
| `PlayScene`   | `battle`, `starfield` (readonly, «Exposed for tests»)                                                                                                                                                                           | `src/game/scenes/play-scene.ts`          |
| `Battle`      | `level`, `phase` (`playing / cleared / over`), `phaseTicks`, `score`, `player`, `wave`, `bonuses` (`BonusField \| null`)                                                                                                        | `src/game/battle.ts`                     |
| `Player`      | `lives`, `isLost`, `state` (`active / down / invulnerable`), `stateTicks`, `canBeHit`, `shots`, `maxShots`, `powerUps { fastShot, doubleShot }`, `ship` (`x`, `y = 208`)                                                        | `src/game/player.ts`, `src/game/ship.ts` |
| `Shot`        | `x`, `y` (дробный не бывает: 4 или 6 px/тик), `speed`                                                                                                                                                                           | `src/game/shot.ts`                       |
| `Wave`        | `enemies`, `shots` (`EnemyShot[]`: `x`, `y`), `isCleared`, `config`                                                                                                                                                             | `src/game/wave.ts`                       |
| `Enemy`       | `kind`, `slot { row, col, group }`, `state` (`formation / diving / returning / exploding / dead`), `stateTicks`, `sortieId`, `x`, `y` (x дробный в строю — покачивание; y дробный при пике 1/2 px/тик), `vx`, `width`, `height` | `src/game/enemy.ts`                      |
| `BonusField`  | `asteroid` (`Asteroid \| null`), `capsule` (`Capsule \| null`), `spawnTick` (`number \| null`), `levelTicks`                                                                                                                    | `src/game/bonus-field.ts`                |
| `Asteroid`    | `x`, `y` (x дробный: дрейф 1/2 px/тик), `dir`, `bonus` (`life / fastShot / doubleShot`), `state` (`flying / exploding / gone`), `stateTicks`                                                                                    | `src/game/asteroid.ts`                   |
| `Capsule`     | `kind`, `x`, `y`                                                                                                                                                                                                                | `src/game/capsule.ts`                    |

«Game over» — **не отдельная сцена**: это `PlayScene` с `battle.phase === 'over'`
(по Enter `PlayScene.update` возвращает новый `TitleScene` через фабрику `exit`). Значит,
поле «сцена» снимка — производное: `title` / `play` / `over` (по `phase`), а
`phase` (`playing / cleared / over`) стоит отдать отдельно — `cleared` (пауза 90 тиков
между уровнями) тестировщику тоже нужен.

### Что появится

- **Разобранные параметры запуска** (чистая функция от строки `location.search`):
  `seed: number | null` (null — `Date.now()` как сейчас), `paused: boolean`,
  `startLevel` (существующий `parseStartLevel`, без изменений).
- **Снимок** — plain-объект из примитивов, массивов и объектов (без классов и функций),
  `JSON.stringify` без потерь. Рекомендуемый состав (уточняется на plan):
  - верх: `tick` (сколько тиков симуляции выполнено с загрузки — полезно для
    воспроизведения), `scene` (`title / play / over`), `paused`;
  - для `play`/`over`: `level`, `phase`, `phaseTicks`, `score`, `lives`;
  - `player`: `x`, `y`, `state`, `stateTicks`, `canBeHit`, `maxShots`, `powerUps`, `shots[]`
    (`x`, `y`, `speed`);
  - `enemies`: `alive` (количество), `list[]` (`kind`, `row`, `col`, `state`, `x`, `y`;
    `dead` можно исключить или оставить с флагом — решить на plan), `shots[]`;
  - `bonuses`: `asteroid` (`x`, `y`, `state`, `bonus`, `dir`) или `null`, `capsule`
    (`kind`, `x`, `y`) или `null`, `spawnTick`, `levelTicks`; весь блок `null`, если
    `battle.bonuses === null` (в `PlayScene` он всегда есть).
- Наличие `asteroid.bonus` и `spawnTick` в снимке критично для кейса «бонус L»:
  тестировщик заранее видит, какой бонус несёт астероид и когда он появится, и подбирает
  seed перебором.

### Константы, полезные тестировщику (уже есть, менять не нужно)

`DOWN_TICKS = 60`, `INVULNERABLE_TICKS = 120`, `START_LIVES = 3`, `MAX_LIVES = 5`,
`GAME_OVER_DELAY_TICKS = 60`, `LEVEL_PAUSE_TICKS = 90`, `BONUS_FALLBACK_POINTS = 500`,
`EXTRA_LIFE_FIRST = 5000`, `EXTRA_LIFE_EVERY = 10000`, окно появления астероида
300…900 тиков уровня.

## Связанные модули и сущности

| Модуль/сущность          | Назначение                                                                                             | Файлы                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Точка входа              | экран, ввод, RNG, цикл, первая сцена; разбор `?level`                                                  | `src/main.ts`                                                                                                                                              |
| `GameLoop`, `accumulate` | rAF-цикл с фиксированным шагом                                                                         | `src/engine/loop.ts`                                                                                                                                       |
| `Input`, `Action`        | действия `left/right/up/down/fire/start`; `press(action)`/`release(action)` уже публичные; `endTick()` | `src/engine/input.ts`                                                                                                                                      |
| `createRng`              | mulberry32, `seed >>> 0`                                                                               | `src/engine/rng.ts`                                                                                                                                        |
| `Scene`                  | интерфейс `update(dt, input)` / `render(ctx)`                                                          | `src/engine/scene.ts`                                                                                                                                      |
| `parseStartLevel`        | разбор `?level=N` (образец для `?seed`)                                                                | `src/game/levels.ts`                                                                                                                                       |
| Сцены                    | титул, бой (+ game over как фаза боя)                                                                  | `src/game/scenes/title-scene.ts`, `play-scene.ts`                                                                                                          |
| `Battle` и сущности      | источник снимка                                                                                        | `src/game/battle.ts`, `player.ts`, `ship.ts`, `shot.ts`, `wave.ts`, `enemy.ts`, `enemy-shot.ts`, `bonus-field.ts`, `asteroid.ts`, `capsule.ts`, `bonus.ts` |
| Тестовый `step`          | прогон n тиков сцены «как main.ts»                                                                     | `src/game/scenes/scene-test-utils.ts`                                                                                                                      |

## Точки встраивания

1. **`main.ts`**: один раз читаем `window.location.search` → параметры; `createRng(seed ??
Date.now())`; `startLevel` — как сейчас. Тело `update` в колбэке цикла (`scene.update` →
   смена сцены → `input.endTick()`) нужно вынести в функцию «один тик», которую зовут и
   `GameLoop`, и `__galaxy.step` — иначе два пути тика разойдутся (порядок
   `endTick` важен для `pressed`). В DEV — установка `window.__galaxy`.
2. **Пауза цикла.** Сейчас `GameLoop` без паузы: каждый кадр `accumulate` → `steps` раз
   `update` → `render`. Нужен режим «кадры идут, тики — нет». Варианты:
   - (а) в движке: `GameLoop.paused` (или `pause()/resume()`), в паузе кадр только
     рисует, а `accumulator`/`lastTime` сбрасываются, чтобы после `resume()` не было
     рывка накопленного времени (сейчас `accumulate` и так режет >5 шагов, но лишние
     до 5 тиков остались бы). Движок при этом про игру не знает — это общий механизм.
   - (б) в `main.ts`: флаг в замыкании, `update` при паузе ничего не делает. Проще, но
     `accumulate` продолжает копить, и `resume()` даст до 5 тиков сразу.
     Рекомендация — (а), с unit-тестом. `step(n)` — **синхронный**: n раз «один тик» +
     один `render`, не через rAF (rAF во фоновой вкладке троттлится/стоит; ответ
     `javascript_tool` должен приходить уже с новым состоянием).
3. **Ввод.** `Input.press(action)`/`release(action)` уже есть и делают ровно то, что
   нужно: `press` ставит `held` и (если не было зажато) `justPressed` до ближайшего
   `endTick()`. Хуку достаточно проксировать их. Формат имён — см. «Решено на analyze».
4. **Снимок.** Отдельный игровой модуль строит снимок от текущей `Scene`
   (`instanceof TitleScene / PlayScene`); `main.ts` передаёт геттер текущей сцены.
   Движок не меняется ради снимка.
5. **Исключение из прод-сборки.** Установка хуков под `if (import.meta.env.DEV)`;
   надёжнее — динамический `import()` модуля хуков внутри условия, чтобы модуль
   снимка гарантированно не попал в бандл (Vite подставляет `false` и вырезает ветку).
   Проверка — `grep __galaxy dist/assets/*.js` после `npm run build` (пусто).
   `tsconfig` уже имеет `types: ["vite/client"]` — `import.meta.env.DEV` типизирован;
   объявление `window.__galaxy` — через `declare global` в dev-модуле.

### Решено на analyze (описание задачи делегировало сюда)

- **Имена клавиш для `press/release`**: игровые действия `Action` из `input.ts` —
  `'left' | 'right' | 'up' | 'down' | 'fire' | 'start'`. Это то, что читает игра;
  привязки клавиш (`ArrowLeft`/`KeyA`, `Space`/`KeyZ`, `Enter`) — деталь ввода. Неизвестное
  имя — ошибка (`throw`), чтобы опечатка агента не проходила молча. Дополнительно
  принимать `KeyboardEvent.code` (`'Space'`, `'Enter'`) через те же привязки — допустимое
  удобство, решить на plan.
- **Разбор `seed`**: по образцу `parseStartLevel` — только десятичные цифры, безопасное
  целое (0 допустим); иначе `null` → `Date.now()`. Отрицательные/дробные/hex — как
  «нет параметра».
- **Разбор `paused`**: включено только при значении `1` (рекомендация; `true`/пустое —
  решить на plan, главное — задокументировать в JSDoc и в `tester.md` не придётся менять).

## Файлы и места в коде

| Файл                                             | Что содержит                        | Что изменить/создать                                                                                                                              |
| ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                    | сборка игры, `Date.now()`, `?level` | разбор параметров через новый модуль; seed; функция «один тик»; пауза цикла с `?paused=1`; установка `__galaxy` в DEV                             |
| `src/engine/loop.ts`                             | `GameLoop`, `accumulate`            | (вариант а) режим паузы: кадр рисует без тиков, сброс накопителя                                                                                  |
| `src/engine/loop.test.ts`                        | тесты `accumulate`                  | тесты паузы, если логика вынесена в чистую функцию/тестируемый метод (в node нет rAF — либо чистая функция, либо подмена `requestAnimationFrame`) |
| `src/engine/input.ts`                            | `Input`                             | вероятно, без изменений (`press/release` уже публичны); при приёме `code` — нужен публичный доступ к привязкам или разбор в dev-модуле            |
| новый `src/game/dev-params.ts` (имя — на plan)   | —                                   | чистый разбор `search` → `{ seed, paused, startLevel }`                                                                                           |
| новый `src/game/dev-snapshot.ts` (имя — на plan) | —                                   | чистая функция `Scene` → снимок                                                                                                                   |
| новый `src/game/dev-hooks.ts` (имя — на plan)    | —                                   | объект `__galaxy` от `{ tick, render, input, getScene, loop }`; тестируется без `window`                                                          |
| `*.test.ts` к новым модулям                      | —                                   | см. «Тестируемость»                                                                                                                               |
| `src/game/levels.ts`                             | `parseStartLevel`                   | без изменений (переиспользуется)                                                                                                                  |
| `second-brain/architecture/overview.md`          | описание модулей                    | дописать новые модули и параметры (на do)                                                                                                         |
| `.claude/agents/tester.md`                       | инструкция тестировщика             | проверить, что описанный API совпадает с итоговым (имена действий)                                                                                |

Код фичи 006 (рабочее дерево, не закоммичен) не меняется — снимок только читает его
публичные геттеры.

## Тестируемость

Покрывается unit-тестами (node, без canvas/DOM):

- **Разбор параметров**: `seed` (нет, `1`, `0`, `-1`, `1.5`, `abc`, огромное число →
  `null`), `paused` (`1` / нет / `0`), комбинация с `level`
  (`?seed=1&paused=1&level=3`).
- **`step(n)`**: dev-объект собирается на фейковых `tick`/`render` или на настоящей
  сцене + `Input` — `step(5)` вызывает тик ровно 5 раз и `render` один раз; `step()` = 1;
  некорректное `n` (0, отрицательное, дробное) — решить на plan (ошибка или no-op).
- **`press` + `step`**: `press('start')`, `step(1)` на `TitleScene` → сцена `play`;
  `press('fire')`, `step(1)` → в снимке 1 выстрел, второй `step` при зажатом `fire` новый
  не даёт (это поведение игры — `pressed` только в тик нажатия, без автоогня; тестировщику
  для повторного выстрела нужно `release` + `press`).
- **Снимок**: `title` на `TitleScene`; на `PlayScene` (через `new PlayScene(createRng(1))`)
  — уровень 1, 3 жизни, счёт 0, 28 живых врагов, `player.state = 'active'`; после
  попадания (`player.hit()` через `scene.battle`) — `lives = 2`, `state = 'down'`;
  `phase = 'over'` → `scene = 'over'`; `JSON.parse(JSON.stringify(s))` равен `s`;
  астероид/капсула отражаются (через `BonusField` с узким окном или прогон до `spawnTick`).
- **Детерминизм**: два независимых запуска (`createRng(seed)` + одна последовательность
  команд) дают одинаковый снимок.
- **Пауза цикла** — если логика паузы в чистой функции или `GameLoop` тестируется с
  подменой rAF.

Только в браузере: что `?paused=1` действительно стоит, кадр отрисовывается после
`step`, `__galaxy` есть в dev и отсутствует в `dist/` (проверка grep по бандлу —
вне Vitest).

## Зависимости и ограничения

- **Детерминизм зависит от тиков на титуле.** `Starfield.update` тратит общий `rng` сцены
  при перезапуске звезды (`src/game/starfield.ts:43`), а `PlayScene` берёт `battleSeed`
  из того же `rng` в момент Enter. Значит, при одном seed бой одинаков, только если до
  Enter прошло одинаковое число тиков. С `?paused=1` это так (тики только по `step`); без
  паузы — нет (rAF успевает отработать тики до команд агента). Это надо явно
  задокументировать для тестировщика: seed воспроизводим **вместе с `paused=1`** и одной
  последовательностью `step`.
- **Первые тики до установки хуков.** При `?paused=1` цикл должен стартовать уже в паузе
  (не `start()` → потом `pause()`), иначе первый кадр может дать тики.
- **`blur` очищает зажатые клавиши** (`src/engine/input.ts`, `attach`): если вкладка
  тестировщика теряет фокус между вызовами, «зажатое» через `press` пропадёт. Риск для
  длинных `press` → много `step`; варианты — хук держит состояние сам и ставит его
  перед каждым тиком, или принять риск и описать в `tester.md`. Решить на plan.
- **rAF в фоновой вкладке** стоит — поэтому `step` синхронный и сам вызывает `render`.
- **Дробные координаты** (покачивание строя, дрейф астероида 1/2 px/тик, пике 1/2
  px/тик): в снимок — сырые значения (точнее для логики), отрисовка — `Math.floor`.
  Тестировщику для сравнения со скриншотом это надо знать.
- **Производительность**: `step(n)` с большим n (например 3600 тиков = минута) синхронно
  — сотни миллисекунд, приемлемо; рисовать один раз в конце, не каждый тик.
- **Граница engine/game**: движок может получить только общую паузу цикла; снимок,
  `instanceof` сцен и знание о `Battle` — в `src/game/`.
- `vitest` в `environment: 'node'`, `jsdom` есть в devDependencies, но не используется;
  для тестов хуков `window` не нужен, если установку на `window` держать в `main.ts`.

## Открытые вопросы

1. **`?lives=N` в этой задаче?** Для кейсов «максимум 5 / L на пределе даёт 500» и
   «быстрый game over» тестировщику иначе нужно реально заработать/потерять жизни
   (доп. жизнь — только на 5000 очков; L — только с нужным астероидом). `BattleOptions.lives`
   уже есть (`Player` проверяет 1…5), но `TitleScene` передаёт в `PlayScene` только
   `startLevel` — придётся протянуть параметр через `TitleScene` (и в фабрику `exit`).
   Варианты: (а) добавить dev-параметр `?lives=N` в эту задачу (рекомендация — мало кода,
   тот же паттерн, что `?level`); (б) отдельной задачей после первых прогонов `/qa`;
   (в) не делать — тестировщик доходит до состояния игрой и перебором seed.
2. **`step(n)` в режиме без паузы** — к архитектору: разрешить (тики смешиваются с rAF),
   автоматически включать паузу, или бросать ошибку. Рекомендация — разрешить, режим не
   менять, задокументировать.
3. **Готовые сценарии** (`?scenario=…`) и сеттеры состояния (`setLives`, «поставить
   астероид») — по описанию вне задачи; предлагается отдельная задача по итогам `/qa`.
4. **Защита от `blur`** — см. «Зависимости и ограничения»; решить на plan.

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md (жизни, бонусы, game over)
- second-brain/architecture/overview.md
- second-brain/decisions/003-slow-speeds-tick-timers.md, 004-half-pixel-dive.md (дробные координаты)
- second-brain/features/006-asteroid-bonuses/design.md (состав сущностей бонусов)
- .claude/agents/tester.md, .claude/skills/qa/SKILL.md (потребитель хуков)
- src/main.ts, src/engine/loop.ts, src/engine/input.ts, src/engine/rng.ts,
  src/game/scenes/*, src/game/battle.ts, src/game/bonus-field.ts, src/game/levels.ts

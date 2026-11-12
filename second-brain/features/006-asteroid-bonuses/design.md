# Дизайн: Астероиды с бонусами

**Статус:** согласовано · **Раунд:** 3

## Цель и сценарии

У игрока появляется вторая цель кроме строя: раз за уровень сверху наискосок через поле
падает астероид. Сбил его — из обломков выпадает капсула с бонусом, поймал её кораблём —
получил бонус: **дополнительную жизнь**, **быструю пулю** или **две пули** (до двух
своих выстрелов на экране вместо одного). Улучшения пули действуют до конца игры и
видны в верхней панели (место под `powerUps` оставила фича 004).

Дизайн написан под ответы владельца на В1–В9 (раунды 2–3, см. `discussion.md`) и
отзыв разработчика (раунд 3). Числа траектории и окна появления подтверждены владельцем
(В9 (а), 2026-11-12): 60 px/с вниз, 30 px/с вбок, окно 5–15 с.

### Что есть в коде сейчас (проверено)

- `Player` держит **один** выстрел: `get shot(): Shot | null`, `removeShot()`. Огонь —
  только при `shot === null`. На `player.shot` завязаны `collisions.ts` (правило 1),
  `battle-render.ts` и ~60 мест в тестах.
- `Shot` летит с константой `SHOT_SPEED = 240` (4 px/тик), скорость в объекте не
  хранится; `Ship.spawnShot()` ставит выстрел на `y = SHIP_Y - SHOT_HEIGHT`.
- `Battle.update`: игрок → волна → коллизии и очки (только `playing`) → фазы.
  Очки меняются только в `addScore`, там же доп. жизни за пороги (`player.addLife()`,
  предел `MAX_LIVES = 5`, сверх — пропадает; `addLife` ничего не возвращает).
  Фаза `playing` начинается с `phaseTicks = 0` в конструкторе и на переходе
  `cleared → playing` (там же создаётся новая волна).
- `overlaps` в `collisions.ts` округляет позиции вниз (как рендер) — дробные
  координаты (покачивание строя) уже поддержаны.
- `Wave` выбрасывается целиком при смене уровня; `rng` боя общий у `Battle` и
  директора атак — **любой новый вызов этого `rng` сдвигает выбор вылетов** во всех
  существующих тестах с фиксированным seed.
- `PlayScene` создаёт `rng` боя из `rng` сцены (`createRng(floor(rng() * 2**32))`)
  после звёзд; рисует `drawBattle` → `drawHud` → `drawGameOver`. `rng` сцены дальше
  живёт в `Starfield` (X звезды при каждом перезапуске) и общий с `TitleScene` —
  любой лишний вызов сдвигает все последующие перезапуски звёзд.
- `Wave.removeShot` делает `splice`, но единственный вызов внутри цикла
  (`hitByEnemyShot`) сразу выходит из цикла — прецедента «удалять и идти дальше» нет.
- Строй: верх y = 32, ячейка 16×12, 10 столбцов по центру (x 48…207) ±16 px
  покачивания; низ строя на уровнях 2–5 — y = 80. Корабль: верх y = 208.
- HUD (`hud.ts`): `SCORE_ZONE` x 8…55, `LEVEL_ZONE` x 108…147, `LIVES_ZONE` x 200…247
  (строка значений y 14…21). Свободно: x 56…107 и 148…199. Рецепт новой секции: поле
  `HudView` + зона в `HUD_ZONES` + `drawX` в `drawHud`.
- `drawExplosion` (private в `battle-render.ts`) рисует взрыв в любом прямоугольнике —
  годится для астероида.

### Ключевые сценарии

1. **Момент уровня (В2).** В начале каждого уровня (вход в `playing`, включая первый)
   поле бонусов вытягивает тик появления — случайно из 300…900 тиков фазы `playing`
   этого уровня (5–15 с, В9). Считаются только тики `playing`: пауза `cleared` и `over`
   не считаются.
2. **Появление (В1).** На этом тике (если поле пусто — см. крайние случаи) над верхним
   краем появляется астероид 12×12 и падает наискосок: вниз 60 px/с (1 px/тик), вбок
   30 px/с (½ px/тик, ADR 003) — влево или вправо случайно (В9). Стартовая X выбрана
   так, что астероид за весь полёт не выходит за боковые края: начав у левого края
   (x 0…118) летит вправо, у правого — влево, зеркально. Полёт до низа экрана — 252 тика
   (≈ 4,2 с), из них в полосе строя (y 32…80) ≈ 0,8 с, под строем до корабля
   ≈ 2,1 с.
   Траектория случайна, поэтому астероид то проходит сквозь строй, то рядом с ним.
3. **Безопасность.** Астероид ни с чем, кроме выстрелов игрока, не взаимодействует:
   враги, вражеские выстрелы и корабль проходят сквозь него (рисуется самым задним
   слоем боя — под всеми выстрелами, врагами и кораблём). Кораблю не опасен (В1).
4. **Промах.** Астероид ушёл за нижний край (`y >= SCREEN_HEIGHT`) — пропал. На этом
   уровне больше не появится.
5. **Попадание (В3).** Выстрел игрока, задевший астероид, снимается; астероид
   разбивается с одного попадания — взрыв на месте (тот же, что у врагов), к счёту
   `asteroidPoints(level)` = 100 с надбавкой уровня, как у врагов (В7; на 5-м уровне
   140). Из центра астероида выпадает капсула 8×8 с буквой вида бонуса: `L` — жизнь,
   `S` — быстрая пуля, `D` — две пули (В4). Вид выбран при появлении астероида,
   равновероятно, до разбития не виден (В5).
6. **Капсула (В4)** падает 60 px/с (1 px/тик) строго вниз. Выстрелы (свои и вражеские)
   сквозь неё пролетают. Пересекла корабль в `active` или `invulnerable` — бонус взят.
   Ушла за низ экрана — пропала.
7. **Бонусы:**
   - `life` — `player.addLife()`;
   - `fastShot` — новые выстрелы летят 360 px/с (6 px/тик) вместо 240 (В7); уже
     летящие сохраняют свою скорость;
   - `doubleShot` — на экране до двух своих выстрелов: второй можно выпустить, пока
     летит первый (по нажатию, без автоогня и буфера) (В7).
     Оба улучшения пули действуют вместе, скорость не складывается (В6).
8. **Бесполезный бонус (В8).** `L` при 5 жизнях или улучшение, которое уже есть, — вместо
   эффекта ровно **500 очков** (`BONUS_FALLBACK_POINTS`, без надбавки уровня — см.
   «Решения раунда 2»). Очки идут через `addScore` и участвуют в порогах доп. жизни.
9. **До конца игры (В6).** Улучшения не пропадают ни при гибели корабля, ни при смене
   уровня; сбрасываются только новой игрой (новый `Battle` — новый `Player`). Иконки в
   панели горят до конца игры.

### Крайние случаи (решения архитектора)

- **Уровень зачищен раньше тика появления** — астероид этого уровня **пропадает**: счёт
  тиков стоит в `cleared`, а на старте следующего уровня тик появления вытягивается
  заново. Не переносится и не выпускается «досрочно». Верхняя граница окна (15 с)
  выбрана так, чтобы обычно успеть: 1-й уровень — 28 врагов, при одном выстреле
  ≈ 0,5 с на убийство в лучшем случае ≥ 14 с; на следующих уровнях врагов больше.
  Очень быстрая зачистка с двумя быстрыми пулями может обогнать окно — это осознанно.
- **Не больше одного «бонусного предмета» на поле.** Если к тику появления на поле ещё
  есть астероид (в т.ч. взрывающийся) или капсула прошлого уровня — появление
  откладывается до тика, когда поле опустеет (в пределах `playing` этого уровня). При
  числах В9 этого не бывает: астероид с капсулой живут < 252 + `EXPLOSION_TICKS` тиков,
  а между последним возможным тиком уровня N и первым возможным тиком уровня N+1 ≥
  `LEVEL_PAUSE_TICKS` + 300 = 390 тиков. Закрепляется тестом-симуляцией (не формулой —
  см. «Тестирование»); проверка «поле пусто» — страховка на случай смены констант.
- **Смена уровня.** Летящие астероид и капсула принадлежат бою, а не волне: смена
  уровня их не трогает, они долетают. В `cleared` астероид можно сбить, капсулу —
  поймать. Новый астероид в `cleared` не появляется.
- **`over`:** астероид и капсула долетают и пропадают, коллизий нет, новых нет.
- **Приоритет выстрела:** если в одном тике выстрел задевает и врага, и астероид —
  попадает во врага (коллизии с врагами идут раньше); астероид его не видит. Пока
  астероид в строю, это главная сложность попадания — так и задумано вариантом В1 (в).
- **Две пули и астероид:** каждый выстрел поражает не больше одной цели; второй
  выстрел того же тика сквозь уже взрывающийся астероид пролетает.
- **Астероид сбит у самого корабля** (на высоте корабля капсула появляется уже
  пересекая его) — капсула берётся в том же тике: проверка капсулы идёт после попадания.
- **Гибель и капсула в одном тике:** коллизии с врагами идут первыми, корабль уже
  `down` — капсула в этом тике не берётся и падает дальше сквозь пустое место.
- **Корабль `down`:** капсулу не берёт (корабля нет на поле). При 0 жизнях капсулу `L`
  поймать некому — конец игры как обычно.
- **Капсула и разбитие в одном тике с доп. жизнью за очки:** порядок начислений —
  очки за убийства → очки за астероид → бонус капсулы. `L` при 4 жизнях, если очки за
  астероид этого же тика уже дали 5-ю жизнь, превращается в 500 очков (решение
  принимается по жизням на момент применения).
- **500 очков за `L` при 5 жизнях и порог.** Если эти очки пересекают порог, доп.
  жизнь за порог тоже пропадает (предел 5) — правило фичи 005 не меняется.
- **Пробой быстрой пулей** (6 px/тик, высота 4): самая низкая цель — `drone` 8 px, с
  встречным пике до 3 px/тик (2,5 px/тик с `Math.floor` в `overlaps` даёт сдвиг до
  3 px): 6 + 3 = 9 < 4 + 8 = 12 — пробоя нет. Астероид: 6 + 1 = 7 < 4 + 12 = 16.
  Закрепить тестом-инвариантом, вычисляемым от констант (см. «Тестирование»).

## Модули и файлы

| Модуль / файл                                             | Ответственность                                                                                                                                                 | Статус                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `src/game/bonus.ts`                                       | Типы `BonusKind`, `PowerUpKind`, `PowerUps`, `BONUS_KINDS` (порядок для `rng`), `NO_POWER_UPS`; без импортов                                                    | новый                     |
| `src/game/shot.ts`                                        | `Shot(x, y, speed = SHOT_SPEED)`: скорость хранится в выстреле; `FAST_SHOT_SPEED = 360`                                                                         | изменяемый                |
| `src/game/ship.ts`                                        | `spawnShot(speed?)` передаёт скорость в `Shot`                                                                                                                  | изменяемый                |
| `src/game/player.ts`                                      | Список выстрелов вместо одного (`shots`, `removeShot(shot)`), `powerUps`, `grantPowerUp`; `maxShots`/скорость пули — от улучшений; `hit()` улучшения не трогает | изменяемый                |
| `src/game/asteroid.ts`                                    | `Asteroid`: диагональное падение, попадание, взрыв, уход за низ; константы полёта и разброса старта                                                             | новый                     |
| `src/game/capsule.ts`                                     | `Capsule`: падение, вид бонуса, уход за низ                                                                                                                     | новый                     |
| `src/game/bonus-field.ts`                                 | `BonusField`: тик появления уровня, текущий астероид и капсула, свой `rng`, разбитие → капсула                                                                  | новый                     |
| `src/game/bonus-art.ts`                                   | `ASTEROID_SPRITE` (12×12), `CAPSULE_SPRITES: Record<BonusKind, Sprite>` (8×8, буква на цветной плашке)                                                          | новый                     |
| `src/game/collisions.ts`                                  | Правило 1 по всем выстрелам игрока; новая `resolveBonusCollisions(player, field)` — выстрел↔астероид, капсула↔корабль; `BonusField` — только `import type`      | изменяемый                |
| `src/game/score.ts`                                       | `levelPoints(base, level)` выделяется из `killPoints`; `ASTEROID_POINTS = 100`, `asteroidPoints(level)`, `BONUS_FALLBACK_POINTS = 500`                          | изменяемый                |
| `src/game/battle.ts`                                      | `BonusField` в бою, `BattleOptions.bonuses`, `startLevel()` на входе в уровень, порядок тика, применение бонуса (с заменой на 500 очков), очки за астероид      | изменяемый                |
| `src/game/battle-render.ts`                               | Все выстрелы игрока, астероид (спрайт / взрыв), капсула                                                                                                         | изменяемый                |
| `src/game/hud.ts`                                         | `HudView.powerUps`, `POWER_UPS_ZONE`, `POWER_UP_SLOT_X`                                                                                                         | изменяемый                |
| `src/game/hud-render.ts`                                  | `drawPowerUps`                                                                                                                                                  | изменяемый                |
| `src/game/scenes/play-scene.ts`                           | Создаёт `rng` бонусов из seed боя (`BONUS_SEED_SALT`), не трогая `rng` сцены; не затирает `opts.bonuses`                                                        | изменяемый                |
| `src/game/test-shots.ts`                                  | Тестовый помощник `onlyShot(player)` (по образцу `test-levels.ts`)                                                                                              | новый (только для тестов) |
| `second-brain/architecture/overview.md`, `game-design.md` | Описание модулей и механики                                                                                                                                     | изменяемый (по задачам)   |
| `second-brain/decisions/003-slow-speeds-tick-timers.md`   | Строка «Применение: снос астероида (фича 006)»; ADR 004 не трогается                                                                                            | изменяемый (задача 2б)    |

`src/engine/` не меняется.

## Сущности и состояния

### Типы бонусов (`bonus.ts`)

```
PowerUpKind = 'fastShot' | 'doubleShot'
BonusKind   = 'life' | PowerUpKind
BONUS_KINDS = ['life', 'fastShot', 'doubleShot']   // индекс randomInt(rng, 0, 3)
PowerUps    = { fastShot: boolean; doubleShot: boolean }
```

`PowerUps` — снимок «что включено», а не уровни: скорость не складывается (В6).

### Player — выстрелы и улучшения

Автомат корабля (`active → down → invulnerable → active`) **не меняется**. Меняется
автомат выстрела: вместо Ready/InFlight — список `shots` длиной `0…maxShots`.

- `maxShots = powerUps.doubleShot ? 2 : 1`.
- Огонь: `controllable && intent.fire && shots.length < maxShots` → новый выстрел со
  скоростью `powerUps.fastShot ? FAST_SHOT_SPEED : SHOT_SPEED`. Порядок `update`
  прежний: движение → полёт и удаление ушедших за верх → огонь (слот, освобождённый в
  этом тике, свободен сразу).
- Порядок `shots` — по времени вылета (старший первый); коллизии идут в этом порядке.
- `removeShot(shot)` — снимает конкретный выстрел; неизвестный игнорирует (как
  `Wave.removeShot`). **Контракт: массив не мутируется, а заменяется** (`filter`), и
  удаление ушедших за верх в `update` — тоже заменой. Поэтому цикл по ранее полученному
  `player.shots` безопасен при снятии выстрела внутри него (правило 1, бонусные
  коллизии): второй выстрел не пропускается. Тест «оба выстрела в одном тике поражают
  две разные цели» ловит ошибку. Почему не копия `[...shots]` в каждом цикле:
  безопасность держит один владелец массива, а не каждый вызывающий; у `Wave` вопрос
  не возникал — там после удаления цикл сразу выходит.
- `grantPowerUp(kind)` — включает улучшение в любом состоянии корабля; возвращает
  `true`, если оно было выключено, `false` — повтор (no-op). `Battle` по `false` не
  судит — он проверяет полезность до вызова (см. «Применение бонуса»), возврат нужен
  тестам и для однозначности контракта.
- `hit()` улучшения **не трогает** (В6 «до конца игры»). Сброса нет вовсе: новая игра —
  новый `Player`. Метод `clearPowerUps` из раунда 1 убран — вызывать его некому.

Почему улучшения в `Player`, а не в `Battle`: их читает `Player.update` (лимит и
скорость); держать их в бою значило бы прокидывать в `update` каждый тик. Причина из
раунда 1 «сброс в `hit()`» отпала, но первая остаётся.

### Asteroid (`asteroid.ts`)

Данные: `x`, `y`, `dir: -1 | 1` (направление сноса по X), `width/height` из спрайта
(хитбокс = картинка), `bonus: BonusKind`, `state`, `stateTicks` (правило тиков — как у
`Enemy`: 0 в тике входа, `update` — `++` → таймер → поведение).

```
flying --hit()--> exploding --EXPLOSION_TICKS--> gone
flying --y >= SCREEN_HEIGHT--> gone
```

- Константы: `ASTEROID_FALL_SPEED = 60` (1 px/тик, ADR 002), `ASTEROID_DRIFT_SPEED =
30` (½ px/тик, ADR 003 — медленное движение, двоичная дробь), `ASTEROID_SIZE = 12`
  (= спрайт; тест равенства).
- Появление: `y = -height` (над краем, въезжает плавно), `x` — из `startX(dir,
offset)`: `dir = 1` → `x = offset`, `dir = -1` → `x = SCREEN_WIDTH - width - offset`,
  `offset ∈ [0, ASTEROID_SPAWN_OFFSET_MAX]`.
- `ASTEROID_SPAWN_OFFSET_MAX = SCREEN_WIDTH - ASTEROID_SIZE - ASTEROID_DRIFT_TOTAL` =
  256 − 12 − 126 = 118, где `ASTEROID_DRIFT_TOTAL = (SCREEN_HEIGHT + ASTEROID_SIZE) ·
DRIFT / FALL` = 126 — снос за весь полёт. Поэтому астероид **никогда не выходит за
  боковые края** и уход один — за низ. Значения — выражения от констант, не
  захардкоженные числа; тест-инвариант: при крайних `offset` и обоих `dir` весь полёт
  `0 <= x` и `x + width <= SCREEN_WIDTH`.
- В тике появления не движется.
- `flying`: `x += dir * ASTEROID_DRIFT_SPEED * dt`, `y += ASTEROID_FALL_SPEED * dt`;
  `y >= SCREEN_HEIGHT` → `gone`. X дробная (шаг ½), рендер и `overlaps` округляют вниз.
- `hit()` — только из `flying`: → `exploding` на месте, возвращает `true`; вне `flying`
  — `false`, без эффекта. Одно попадание (В3) — счётчика попаданий нет.
- `exploding` не движется (как враг); `gone` — терминальное, `BonusField` убирает
  объект.

### Capsule (`capsule.ts`)

Данные: `kind: BonusKind`, `x`, `y`, размер `CAPSULE_SIZE = 8` (= `LIFE_ICON_MAX_SIZE`,
та же картинка — иконка в HUD). Без состояний: падает `CAPSULE_SPEED = 60` px/с
(1 px/тик) строго вниз, `isOffscreen` — `y >= SCREEN_HEIGHT`. Появляется
центрированной в прямоугольнике астероида в тик разбития (координаты целые: от
`Math.floor` позиции астероида), в этом тике не движется.

### BonusField (`bonus-field.ts`)

Агрегат «что бонусного есть на поле»: `asteroid: Asteroid | null`, `capsule: Capsule |
null`, `spawnTick: number | null` (тик появления текущего уровня; `null` — астероид
этого уровня уже вылетел или уровня ещё нет), `levelTicks` (тики `playing` текущего
уровня), свой `rng`.

```
startLevel()               : levelTicks = 0, spawnTick = randomInt(MIN, MAX + 1)
update(dt, spawning)       : levelTicks++; levelTicks >= spawnTick && поле пусто
                             -> asteroid, spawnTick = null
asteroid --разбит-->         asteroid(exploding) + capsule
asteroid --gone--> null;     capsule --поймана / ушла за низ--> null
```

- `startLevel()` вызывает `Battle`: в конструкторе и на переходе `cleared → playing`.
  Невыпущенный астероид прошлого уровня этим вызовом теряется (вытягивается новый
  тик). Конструктор `BonusField` тик не вытягивает (без `startLevel` поле никогда не
  выпускает астероид — удобно в тестах).
- `update(dt, spawning)` — `spawning` без умолчания (явность в `Battle`): сначала
  двигает астероид и капсулу и убирает `gone` / ушедшую капсулу; затем, только если `spawning`, `levelTicks++` и проверка появления.
  `spawning = false` (`cleared`, `over`) — счётчик стоит, летящее летит.
- Тик появления — `randomInt(rng, minTicks, maxTicks + 1)` из окна конструктора; по
  умолчанию `ASTEROID_SPAWN_WINDOW` = 300…900 включительно (В9). Окно — параметр
  только ради тестов (как `BattleOptions.levels`): игра всегда создаёт поле с
  умолчанием; короткое окно позволяет проверить отложенное появление и быстро получить
  астероид в тестах боя (2б). Неверное окно (не целые, `min < 1`, `min > max`) —
  `RangeError`. После `startLevel` в конце тика перехода первый
  `update` даёт `levelTicks = 1`, то есть астероид появляется в `update`, где
  `levelTicks === spawnTick` (или позже, если поле занято).
- **Отложенное появление.** Если в `update` `levelTicks >= spawnTick`, но поле занято,
  `spawnTick` не сбрасывается и проверка повторяется в каждом следующем `update` с
  `spawning`. Поскольку уборка `gone` идёт раньше проверки, новый астероид появляется
  в том же `update`, в котором убран старый. Вызовы `rng` для `dir → offset → bonus` —
  в момент фактического появления, не в `spawnTick`. `startLevel` во время ожидания
  вытягивает новый тик (ожидание прошлого уровня теряется).
- Порядок вызовов `rng` фиксирован: `startLevel` — один вызов (тик); появление —
  `dir` (`rng() < 0.5 ? -1 : 1`), затем `offset` (`randomInt(rng, 0, OFFSET_MAX + 1)`),
  затем `bonus` (`BONUS_KINDS[randomInt(rng, 0, 3)]`). Тесты подменяют `rng`
  заглушкой.

## Поток тика

`Battle.update(dt, intent)`:

1. `player.update(dt, intent)` — корабль, все свои выстрелы, огонь (лимит и скорость —
   от `powerUps`).
2. `wave.update(dt, targetX)` — без изменений.
3. `bonuses?.update(dt, phase === 'playing')` — астероид летит / взрыв тикает / `gone`
   убирается; капсула падает, ушедшая убирается; затем счёт тиков уровня и появление
   (новый астероид в этом тике не движется).
4. Только `playing`: `resolveCollisions(player, wave)` → очки за убийства (как сейчас).
   Правило 1 — по каждому выстрелу в порядке `shots`.
5. `playing` или `cleared`, если `bonuses` есть: `resolveBonusCollisions(player,
bonuses)` → `BonusEvents`:
   - `asteroidBroken` → `addScore(asteroidPoints(level))`;
   - `collected` → `applyBonus(kind)` (ниже).
     Внутри: (а) первый по порядку выстрел, пересекающий `flying`-астероид, снимается,
     `field.hitAsteroid()` (разбитие создаёт капсулу); не больше одного попадания за тик;
     (б) если `player.state !== 'down'` и капсула пересекает корабль — `field.takeCapsule()`.
     Капсула, появившаяся в (а), в (б) этого же тика уже проверяется (астероид сбит на
     высоте корабля — капсула поймана сразу).
6. `updatePhase()` — как сейчас, плюс на переходе `cleared → playing` после создания
   волны — `bonuses?.startLevel()`.

### Применение бонуса (`Battle.applyBonus`)

```
life:       player.lives < MAX_LIVES  ? player.addLife()        : addScore(BONUS_FALLBACK_POINTS)
fastShot /
doubleShot: !player.powerUps[kind]    ? player.grantPowerUp(kind) : addScore(BONUS_FALLBACK_POINTS)
```

Полезность решает `Battle`, а не `Player`: «вместо бонуса — очки» — правило боя (очки
живут в бою), `Player` о счёте не знает. Начисление через `addScore` — значит пороги
доп. жизни работают без особых случаев.

Почему бонусные коллизии отдельно, а не правилом 4 в `resolveCollisions`: та работает
только в `playing` и возвращает `Kill` с `EnemyKind`; астероид — не враг, а работать
он должен и в `cleared`. Отдельная функция не трогает контракт `Kill`.

Почему шаг 3 до коллизий: как у волны — всё сначала двигается, потом проверяется.

### Рендер

`drawBattle`, сзади вперёд: астероид (`flying` — спрайт по `Math.floor(x/y)`,
`exploding` — `drawExplosion` по центру его прямоугольника, `gone` — ничего) → капсула
(поверх взрыва — «выпала из обломков») → вражеские выстрелы → выстрелы игрока (все) →
враги → корабль. Астероид и капсула — самый задний слой боя (над звёздами):

- выстрелы поверх: вражеский выстрел — угроза, его нельзя прятать за 12×12; свой
  выстрел, пролетающий сквозь взрыв или летящий в `over`, тоже виден (рек. 11 (в)
  разработчика, расширена на вражеские выстрелы);
- враги и корабль поверх — астероид «пролетает за ними», что и читается как «не
  опасен».

Над строем астероид проходит под панелью (HUD рисуется после боя) — так и должно быть.

`drawHud` добавляет `drawPowerUps(ctx, view.powerUps)` после жизней.

### HUD

`POWER_UPS_ZONE = { x: 156, y: 14, width: 18, height: 8 }` — строка значений, 8 px
отступа от `LEVEL_ZONE`, до `LIVES_ZONE` (200) — 26 px. Два **фиксированных** слота:
`fastShot` — x 156, `doubleShot` — x 166 (шаг `LIFE_ICON_STEP = 10`); пустой слот —
ничего. Иконка — спрайт капсулы того же вида (игрок узнаёт то, что поймал).
Спрайты капсул рисуются вручную (плашка с рамкой и буквой поменьше), а не собираются
из глифа `font-art.ts`: глифы шрифта 7×7 в ячейке 8×8 — на плашку и рамку места не
остаётся, буква слилась бы с краем капсулы.
Фиксированные слоты, а не «подряд»: иконка не прыгает, когда приходит второе
улучшение. Подписи нет (строка подписей над зоной остаётся пустой). Улучшения
постоянные — иконки не гаснут до конца игры. Вид — на приёмке глазами.

## Интерфейсы

```ts
// bonus.ts
export type PowerUpKind = 'fastShot' | 'doubleShot';
export type BonusKind = 'life' | PowerUpKind;
/** Fixed order: the bonus rng indexes into it. */
export const BONUS_KINDS: readonly BonusKind[];
export interface PowerUps {
  readonly fastShot: boolean;
  readonly doubleShot: boolean;
}
export const NO_POWER_UPS: PowerUps;

// shot.ts
export const SHOT_SPEED = 240;
/** fastShot power-up, 6 px/tick (ADR 002); see the tunneling test. */
export const FAST_SHOT_SPEED = 360;
export class Shot {
  constructor(readonly x: number, public y: number, readonly speed: number = SHOT_SPEED);
  update(dt: number): void;
  get isOffscreen(): boolean;
}

// ship.ts
spawnShot(speed?: number): Shot;

// player.ts
export class Player {
  /** Shots in flight, oldest first; length <= maxShots. Replaces `shot`. */
  get shots(): readonly Shot[];
  get maxShots(): number; // 1, or 2 with doubleShot
  /** Kept for the whole game: hit() and level changes never clear them. */
  get powerUps(): PowerUps;
  /** Drops this shot (it hit something); unknown shots are ignored. */
  removeShot(shot: Shot): void;
  /** Turns a power-up on in any ship state; false when it was already on (no-op). */
  grantPowerUp(kind: PowerUpKind): boolean;
}

// asteroid.ts
export type AsteroidState = 'flying' | 'exploding' | 'gone';
export const ASTEROID_SIZE = 12;
export const ASTEROID_FALL_SPEED = 60; // px/s, 1 px/tick (ADR 002)
export const ASTEROID_DRIFT_SPEED = 30; // px/s, 1/2 px/tick (ADR 003)
/** Sideways travel over the whole fall, px: (SCREEN_HEIGHT + size) * drift / fall = 126. */
export const ASTEROID_DRIFT_TOTAL: number;
/** Largest start offset from the side it starts at, px: keeps the whole fall on screen (118). */
export const ASTEROID_SPAWN_OFFSET_MAX: number;
export class Asteroid {
  /** dir: sideways drift; offset in [0, ASTEROID_SPAWN_OFFSET_MAX] from the starting side. */
  constructor(dir: -1 | 1, offset: number, readonly bonus: BonusKind);
  x: number; y: number; readonly width: number; readonly height: number;
  readonly dir: -1 | 1;
  get state(): AsteroidState;
  get stateTicks(): number;
  update(dt: number): void;
  /** Only while flying: -> exploding, true; otherwise false, no effect. */
  hit(): boolean;
}

// capsule.ts
export const CAPSULE_SIZE = 8;
export const CAPSULE_SPEED = 60;
export class Capsule {
  constructor(readonly kind: BonusKind, readonly x: number, public y: number);
  readonly width: number; readonly height: number;
  update(dt: number): void;
  get isOffscreen(): boolean;
}

// bonus-field.ts
export const ASTEROID_SPAWN_MIN_TICKS = 300;
export const ASTEROID_SPAWN_MAX_TICKS = 900;
/** Inclusive window of the spawn tick, in 'playing' ticks of the level. */
export interface SpawnWindow {
  readonly minTicks: number;
  readonly maxTicks: number;
}
/** { minTicks: ASTEROID_SPAWN_MIN_TICKS, maxTicks: ASTEROID_SPAWN_MAX_TICKS } — 300…900 (В9). */
export const ASTEROID_SPAWN_WINDOW: SpawnWindow;
export class BonusField {
  /** spawnWindow defaults to ASTEROID_SPAWN_WINDOW; tests inject short ones. RangeError unless integers 1 <= min <= max. */
  constructor(rng: Rng, spawnWindow: SpawnWindow = ASTEROID_SPAWN_WINDOW);
  get asteroid(): Asteroid | null;
  get capsule(): Capsule | null;
  /** This level's spawn tick; null once spawned or before the first startLevel. For tests. */
  get spawnTick(): number | null;
  /** Ticks of 'playing' counted in the current level. For tests. */
  get levelTicks(): number;
  /** A new level begins: draws its spawn tick; an unspawned asteroid of the last level is lost. */
  startLevel(): void;
  /** Moves what is on the field, drops what is gone; counts the level and spawns only if spawning. */
  update(dt: number, spawning: boolean): void;
  /** Hits the flying asteroid; on break drops a capsule. Returns true when broken. */
  hitAsteroid(): boolean;
  /** Removes the capsule and returns its kind; null if there is none. */
  takeCapsule(): BonusKind | null;
}

// collisions.ts
export interface BonusEvents {
  readonly asteroidBroken: boolean;
  readonly collected: BonusKind | null;
}
export function resolveBonusCollisions(player: Player, field: BonusField): BonusEvents;
// resolveCollisions: rule 1 over player.shots in order; up to three kills a tick now.

// score.ts
/** floor((base * (9 + level) + 50) / 100) * 10; RangeError on a bad level. */
export function levelPoints(base: number, level: number): number;
export const ASTEROID_POINTS = 100;
export function asteroidPoints(level: number): number;
/** Instead of a useless bonus (L at MAX_LIVES, a power-up already on); flat, no level bonus. */
export const BONUS_FALLBACK_POINTS = 500;
// killPoints(kill, level) = levelPoints(ENEMY_POINTS[...], level)

// battle.ts
export interface BonusOptions {
  /** The bonus field's own generator: never shifts the wave's dive choices. */
  readonly rng: Rng;
}
export interface BattleOptions {
  // ...as now
  /** Asteroids and bonuses; absent = none (old tests, test tables). PlayScene always passes it. */
  readonly bonuses?: BonusOptions;
}
class Battle {
  /** null when opts.bonuses is absent. */
  get bonuses(): BonusField | null;
}

// hud.ts
export interface HudView { /* level, score, lives, */ readonly powerUps: PowerUps }
export const POWER_UPS_ZONE: HudZone; // 156, 14, 18×8; added to HUD_ZONES
export const POWER_UP_SLOT_X: Readonly<Record<PowerUpKind, number>>; // 156, 166

// bonus-art.ts
export const ASTEROID_SPRITE: Sprite; // 12×12
export const CAPSULE_SPRITES: Readonly<Record<BonusKind, Sprite>>; // 8×8 each
```

`PlayScene`: seed бонусов — производный от seed боя, `rng` сцены не трогается:

```ts
/** Mixed into the battle seed for the bonus field's generator; the scene rng is not touched. */
const BONUS_SEED_SALT = 0x9e3779b9;

const battleSeed = Math.floor(rng() * 2 ** 32);
this.battle = new Battle(createRng(battleSeed), {
  ...opts,
  bonuses: opts?.bonuses ?? { rng: createRng((battleSeed ^ BONUS_SEED_SALT) >>> 0) },
});
```

- Вызовы `rng` сцены ровно те же, что до фичи: начальные звёзды, бой **и все
  последующие перезапуски звёзд** для данного seed сцены не меняются. Второй вызов
  `rng()` сцены отвергнут: он сохранял бы начальную раскладку и бой, но сдвигал бы X
  каждой перезапущенной звезды (`Starfield` держит тот же `rng`).
- `opts.bonuses`, переданный снаружи, не затирается (`??`): тест сцены подсовывает
  заглушку `rng` и детерминированно вызывает астероид.
- Потоки mulberry32 от seed и seed ^ соль — разные точки одного цикла 2³², разнесённые
  на псевдослучайное расстояние; корреляция бонусов с вылетами на практике не
  наблюдаема и на корректность не влияет.

## Тестирование

Юнит-тесты (без canvas):

- `shot.test.ts`: скорость по умолчанию 240, переданная — 360; оба значения целые
  px/тик (ADR 002); **инвариант пробоя врагов** (задача 1): для `levelConfig(1..20)`
  `FAST_SHOT_SPEED·TICK + Math.ceil(diveSpeed·TICK) < SHOT_HEIGHT + min высоты по
ENEMY_KINDS` — от конфигурации, не литералами 3 и 8.
- `asteroid.test.ts` (задача 2а) — **инвариант пробоя астероида**:
  `FAST_SHOT_SPEED·TICK + ASTEROID_FALL_SPEED·TICK < SHOT_HEIGHT + ASTEROID_SIZE`.
- Тестовый помощник `onlyShot(player): Shot | null` (`test-shots.ts`): выстрел или
  `null`, бросает при двух и более — переводит ~60 мест `player.shot` коротким
  дифом и заодно проверяет «без улучшений ≤ 1 выстрела». Геттера `shot` в `Player` для
  совместимости нет — два источника правды.
- `player.test.ts`: без улучшений — второй выстрел не вылетает, пока летит первый
  (старое поведение); с `doubleShot` — до двух, третий игнорируется; слот,
  освободившийся уходом за верх, свободен в том же тике; `fastShot` — новые выстрелы
  6 px/тик, летящие — со старой скоростью; **`hit()` улучшения не сбрасывает**, после
  возрождения лимит и скорость прежние; `removeShot` конкретного и неизвестного;
  `grantPowerUp` — `true`, повторно — `false` и no-op; в `down` тоже включает.
- `asteroid.test.ts`: старт `y = -height`, `x` по `dir`/`offset` (оба края); шаг
  ½ px/тик по X и 1 px/тик по Y; в тике появления не движется; **инвариант**: при
  `offset` 0 и `ASTEROID_SPAWN_OFFSET_MAX`, обоих `dir`, весь полёт внутри экрана по X;
  `gone` ровно при `y >= SCREEN_HEIGHT`; `hit()` → `exploding` (не движется) →
  `EXPLOSION_TICKS` → `gone`; `hit()` вне `flying` — `false`, без эффекта; скорости
  проходят `isAllowedSpeed`; `ASTEROID_SIZE` = размер спрайта (задача 2б — спрайт
  появляется там; в 2а `ASTEROID_SIZE` — просто константа).
- `capsule.test.ts`: падение 1 px/тик, `isOffscreen` на границе.
- `bonus-field.test.ts` (заглушка `rng`): без `startLevel` астероида нет никогда;
  тик появления из диапазона и включительность краёв; астероид появляется в `update`
  с `levelTicks === spawnTick`; при `spawning = false` счётчик стоит; `startLevel` до
  появления — тик вытягивается заново, старый потерян; после появления на этом уровне
  второго нет (`spawnTick === null`); при занятом поле появление откладывается до
  опустения (окно 1…1: выпустить астероид, `startLevel`, проверить, что новый
  появляется ровно в `update`, где убран старый, и не раньше; при `spawning = false`
  ожидание не срабатывает); неверное окно — `RangeError`; поле без второго аргумента
  тянет тик из 300…900; разбитие → капсула по центру астероида, вид = `asteroid.bonus`; порядок
  вызовов `rng` (тик; `dir` → `offset` → `bonus`); `takeCapsule` без капсулы — `null`;
  **инвариант-симуляция** (задача 3): для каждого k = 1…(тик ухода) астероид сбивается
  `hitAsteroid()` на k-м тике полёта (плюс прогон без попадания), считаются тики до
  пустого поля; максимум < `LEVEL_PAUSE_TICKS + ASTEROID_SPAWN_MIN_TICKS`. Формула
  «максимальной жизни» в тесте не пишется — разошлась бы с кодом при смене констант.
- `collisions.test.ts`: правило 1 с двумя выстрелами (каждый своя цель — **оба в
  одном тике**, ловит пропуск при удалении в цикле; оба в одного — второй летит
  дальше; порядок — старший первым); до трёх `Kill` за тик;
  `resolveBonusCollisions` — выстрел в астероид снимается; враг в приоритете (выстрел,
  уже снятый правилом 1, астероид не задевает); не больше одного попадания в астероид
  за тик; капсула берётся в `active` и `invulnerable`, не в `down`; астероид,
  разбитый на высоте корабля, — капсула взята в том же тике; корабль, пересекающий
  астероид, не сбит.
- `score.test.ts`: `levelPoints` даёт прежние контрольные значения `killPoints`;
  `asteroidPoints` 1/5-й уровень — 100/140 (задача 2а); `BONUS_FALLBACK_POINTS`
  кратно 10 (задача 3 — константа добавляется там).
- `battle.test.ts`: без `bonuses` — `battle.bonuses === null`, старое поведение
  (существующие тесты не меняются, кроме перехода `shot → shots`); с `bonuses` —
  `startLevel` в конструкторе и на каждом новом уровне (тик вытянут); астероид не
  появляется в `cleared`; уровень зачищен до тика — астероида нет, на следующем —
  новый тик; летящий переживает смену уровня; сбит в `cleared` — очки и капсула; в
  `over` коллизий нет, поле долетает; капсула `life` → +1 жизнь, на 5 жизнях → +500 и
  жизней 5; `fastShot`/`doubleShot` → `powerUps`, повторный → +500; улучшения
  переживают гибель и смену уровня; гибель в тике касания капсулы — не взята; очки
  астероида и 500 очков пересекают порог 5000 → доп. жизнь; `L` при 4 жизнях после
  доп. жизни за очки того же тика → +500.
- `hud.test.ts`: `hudView` берёт `player.powerUps`; литералы `HudView` в
  `hud-render.test.ts` (`BASE` и др.) получают `powerUps: NO_POWER_UPS` — иначе падает
  `typecheck`; `POWER_UPS_ZONE` в `HUD_ZONES`,
  тест непересечения зон проходит; слоты внутри зоны; `CAPSULE_SIZE <=
LIFE_ICON_MAX_SIZE`.
- `hud-render.test.ts`, `battle-render.test.ts` (рекордер): иконки только включённых
  улучшений в своих слотах; оба выстрела игрока; астероид спрайтом / взрывом / ничем;
  астероид и капсула раньше всех выстрелов, врагов и корабля; капсула поверх взрыва.
- `bonus-art.test.ts`: спрайты разбираются, размеры 12×12 и 8×8, у каждого
  `BonusKind` есть капсула.
- `play-scene.test.ts`: бой получает `bonuses`; переданный `opts.bonuses` не
  затирается (заглушка `rng` → астероид на заданном тике); для данного seed сцены
  звёзды (в т.ч. после перезапусков) и бой — те же, что до фичи (seed бонусов
  производный, `rng` сцены не тронут).

Глазами (`acceptance.md`): вид астероида и капсул, читаемость букв, угол и скорость
падения, удаётся ли попасть сквозь строй и под ним, ощущение момента появления
(5–15 с), иконки в панели.

## Альтернативы

- **Горизонтальный пролёт по полосе ниже строя** (раунд 1, В1 (а)). Отклонён
  владельцем.
- **Падение под 45° (1 px/тик по обеим осям).** Отвергнуто: снос за полёт 252 px — на
  всю ширину экрана; астероид в основном уходит за боковой край на высоте 130–200 и
  под строем открыт ≈ 0,8 с — слишком мало, и появляется второй вид ухода (за бок).
  Шаг ½ px/тик по X держит весь полёт на экране и даёт ≈ 2 с под строем.
- **Строго вертикальное падение.** Отвергнуто: владелец выбрал «наискосок».
- **Круче/быстрее — 90 px/с вниз (В9 (б)); окно 3–10 с (В9 (в)).** Отклонены
  владельцем: выбран В9 (а). ADR 004 на астероид не распространяется.
- **Seed бонусов — второй вызов `rng()` сцены** (раунд 2). Отвергнуто в раунде 3: сдвигал
  бы X всех перезапусков звёзд (`Starfield` держит `rng` сцены); производный seed не
  трогает сцену вовсе.
- **Капсулы из глифов шрифта.** Отвергнуто: глиф 7×7 в 8×8 не оставляет места на
  плашку и рамку.
- **Таймер 20–30 с вместо «один за уровень»** (раунд 1, В2 (а)). Отклонён владельцем.
- **Момент уровня по доле сбитых врагов** (например, когда осталось случайных 30–70 %).
  Гарантирует астероид на каждом уровне, но это по сути В2 (в) («после N сбитых»),
  который владелец не выбрал; время понятнее и не зависит от раскладки.
- **Астероид, не успевший вылететь до зачистки, выпускать в `cleared` / переносить.**
  Отвергнуто: пауза 1,5 с, астероид перелетал бы в следующий уровень, где появится
  свой — два за уровень; перенос — лишнее состояние ради редкого случая.
- **500 очков с надбавкой уровня.** Отвергнуто: это не награда за цель (как враг или
  астероид, сложность которых растёт с уровнем), а замена бонуса; ровное число
  читается как «утешительный приз» и не тянет в `applyBonus` зависимость от уровня.
  Владелец назвал «500 очков» — ровно это и берём.
- **Астероид внутри `Wave`.** Отвергнуто: волна выбрасывается при смене уровня
  (летящий астероид пропадал бы на ровном месте), и у неё общий `rng` с директором атак.
- **Общий `rng` боя для бонусов.** Отвергнуто: каждый вызов сдвигает выбор вылетов,
  десятки тестов с фиксированным seed поменяли бы поведение. Свой `rng` + выключение
  по умолчанию (`bonuses` отсутствует) оставляют старые тесты как есть.
- **`BonusField` считает тики по `battle.phaseTicks`.** Отвергнуто: поле зависело бы от
  фаз боя; свой счётчик + `startLevel()` проще тестировать в отрыве от `Battle`.
- **Бонусы по умолчанию включены, тесты выключают явно.** Отвергнуто: правка ~40
  вызовов `new Battle` без пользы; сцена — единственный боевой создатель боя.
- **Копия `[...player.shots]` в каждом цикле коллизий** вместо замены массива в
  `Player`. Отвергнуто: безопасность зависела бы от дисциплины каждого вызывающего.
- **Второй слот выстрела (`shot2`) вместо массива.** Отвергнуто: два почти одинаковых
  пути в `update`, коллизиях и рендере; массив проще и не дороже.
- **Улучшения в `Battle`.** Отвергнуто — см. «Player — выстрелы и улучшения».
- **Астероид как `Kill` в `resolveCollisions`.** Отвергнуто: `Kill` несёт `EnemyKind`,
  а правило работает только в `playing`.
- **Полезность бонуса решает `Player`** (`grantPowerUp`/`addLife` возвращают «не
  пригодилось», `Battle` по возврату даёт очки). Отвергнуто: тогда «применить» и
  «проверить» смешаны, а `addLife` вызывается и за пороги, где замены очками нет.
- **ECS / общий «менеджер сущностей».** Отвергнуто: три новых маленьких класса и один
  агрегат — по образцу `Wave`.

## Открытые вопросы к владельцу

Нет. В9 закрыт владельцем 2026-11-12: вариант (а) — 60 px/с вниз, 30 px/с вбок, окно
появления 5–15 с (300…900 тиков). Вид спрайтов, читаемость букв и ощущение угла —
проверка глазами на приёмке (`acceptance.md`), не вопрос дизайна.

## Нарезка на задачи

Каждая задача проходит полный набор проверок и не ломает игру. В каждой задаче
обновляются комментарии-контракты затронутого кода (перечислены ниже), иначе код
противоречит своим докам.

1. **Несколько выстрелов и скорость пули.** `bonus.ts` (типы), `Shot.speed` +
   `FAST_SHOT_SPEED`, `spawnShot(speed?)`, `Player.shots` / `removeShot(shot)` (замена
   массива, не мутация) / `maxShots` / `powerUps` / `grantPowerUp`; правило 1 по всем
   выстрелам; `drawBattle` рисует все выстрелы; помощник `onlyShot` (`test-shots.ts`) и
   перевод ~60 мест `shot → shots` в тестах (`player`, `play-scene`, `collisions`,
   `battle`, `battle-render`, `hud`); инвариант пробоя врагов по `levelConfig(1..20)`.
   Комментарии: класс-док `Player` («its single shot», автомат Ready/InFlight,
   `removeShot` «Fire is available from the next update»); `resolveCollisions` «at most
   two» → три; `drawBattle` «player shot» → все выстрелы. В игре без изменений
   (улучшений взять пока неоткуда), проверка — тестами. Зависимостей нет.
   2а. **Модель астероида.** `asteroid.ts` (диагональ, разброс старта, инвариант «весь
   полёт на экране», инвариант пробоя астероида), `bonus-field.ts` (тик уровня,
   `startLevel`, отложенное появление, окно появления параметром конструктора с
   умолчанием 300…900, `update(dt, spawning)` без умолчания, `hitAsteroid` только
   разбивает — без капсулы), `levelPoints` / `asteroidPoints` в `score.ts` (без
   `BONUS_FALLBACK_POINTS` — он в задаче 3); строка `score.ts` в
   `architecture/overview.md` (`levelPoints`, `asteroidPoints`). Только тесты, в игру
   не встроено. Зависит от 1 (типы `bonus.ts`).
   2б. **Астероид в бою.** `ASTEROID_SPRITE` (`bonus-art.ts`), `resolveBonusCollisions`
   (только выстрел↔астероид, `collected` всегда `null`; `import type` для
   `BonusField`), `BattleOptions.bonuses`, шаги 3/5 тика, `startLevel` в `Battle`,
   `PlayScene` с производным seed бонусов и `opts?.bonuses ??`, рендер астероида
   задним слоем; **строка в ADR 003** «Применение: снос астероида (фича 006)» (ADR 004
   не трогать). Комментарии: `Battle.score` «grows only by kills during 'playing'» →
   ещё астероид, в т.ч. в `cleared`; порядок тика в `Battle.update`. В
   `architecture/overview.md` — описания изменённых модулей (`battle.ts`,
   `battle-render.ts`, `collisions.ts`, `play-scene.ts`) и граф импортов целиком по
   коду (с рёбрами к новым модулям); абзацы новых модулей — в задаче 3. Глазами: раз за
   уровень падает наискосок, сбивается, даёт очки, сквозь корабль проходит, выстрелы
   видны поверх. Зависит от 2а.
2. **Капсула и бонусы.** `capsule.ts`, `CAPSULE_SPRITES` (рисованные, не из шрифта),
   выпадение при разбитии, ловля кораблём, `applyBonus` в `Battle` с заменой на
   `BONUS_FALLBACK_POINTS`, рендер капсулы; инвариант «поле пусто к следующему уровню»
   симуляцией; комментарий `Battle.score` дополнить 500 очками; обновить
   `game-design.md` и `architecture/overview.md` (абзацы новых модулей `asteroid.ts`,
   `bonus-field.ts`, `bonus-art.ts`, `capsule.ts`, `BONUS_FALLBACK_POINTS`, правки
   графа и изменённых модулей от этой задачи; строка формулы очков обновлена в 2а,
   изменённые модули и граф — в 2б). Глазами: поймал `S` — пули быстрее,
   `D` — две, `L` — +1 иконка; после гибели улучшения остаются. Зависит от 2б.
3. **Улучшения в панели.** `HudView.powerUps`, `POWER_UPS_ZONE`, слоты,
   `drawPowerUps`; `powerUps: NO_POWER_UPS` в литералах `HudView` в
   `hud-render.test.ts`. Зависит от 1 (тип `PowerUps`) и 3 (спрайты капсул).

## История

- **Раунд 1** (2026-11-12): первый черновик. Астероид и капсула — в `BonusField`,
  агрегате боя со своим `rng`, выключен без `BattleOptions.bonuses`; улучшения — в
  `Player` (список выстрелов, скорость в `Shot`, сброс в `hit()`); бонусные коллизии —
  отдельной функцией (работают в `playing` и `cleared`); HUD — зона из двух
  фиксированных слотов. 8 вопросов к владельцу, 4 задачи.
- **Раунд 2** (2026-11-12): ответы владельца на В1–В8 (`discussion.md`). Полёт —
  диагональное падение сверху (1 px/тик вниз, ½ px/тик вбок), только уход за низ,
  кораблю безопасен; появление — один тик за уровень (`startLevel`, 5–15 с `playing`),
  не успел — пропал; одно попадание (счётчик попаданий убран); улучшения до конца игры
  (сброса в `hit()` и `clearPowerUps` нет); бесполезный бонус — ровно 500 очков через
  `addScore`. Один новый вопрос (В9, не блокирует), 4 задачи.
- **Раунд 3** (2026-11-12): владелец закрыл В9 вариантом (а). Отзыв разработчика:
  0 блокеров, 11 рекомендаций — 10 приняты полностью, в 11-й приняты (а)–(в), (г)
  отклонена (глифы шрифта 7×7 не помещаются на плашку 8×8). Изменения: `removeShot`
  заменяет массив (безопасная итерация); seed бонусов — производный от seed боя
  (`BONUS_SEED_SALT`), `rng` сцены не трогается; `opts?.bonuses ??` в `PlayScene`;
  астероид и капсула — задний слой рендера, все выстрелы поверх; инварианты пробоя —
  от `levelConfig` и `ENEMY_KINDS`, «поле пусто» — симуляцией; помощник `onlyShot`;
  ADR 003 — строка о новом потребителе в задаче 2б; список комментариев-контрактов по
  задачам. Задача 2 разделена на 2а (модель) и 2б (встраивание) — 5 задач. Вопросов к
  владельцу нет, статус — согласовано.
- **Реализация 2а** (2026-11-12, задача 025, вопросы разработчика на analyze): у
  `BonusField` появился необязательный второй параметр — окно появления `SpawnWindow`
  (умолчание `ASTEROID_SPAWN_WINDOW` = 300…900, `RangeError` на неверном), чтобы
  отложенное появление проверялось прямым тестом; уточнена семантика ожидания
  (`spawnTick` держится, появление в том же `update`, где убран старый; `rng` — в
  момент появления). Тест «`ASTEROID_SIZE` = спрайт» — в 2б, `BONUS_FALLBACK_POINTS` —
  в 3, строка `score.ts` в `overview.md` — в 2а. Игровое поведение и числа не меняются.
- **Реализация 2б** (2026-11-12, задача 026, вопрос разработчика на analyze): правка
  `architecture/overview.md` разнесена по коду — в 2б описания изменённых модулей
  (`battle.ts`, `battle-render.ts`, `collisions.ts`, `play-scene.ts`) и граф импортов
  целиком; абзацы новых модулей — в 3. Игровое поведение и числа не меняются.

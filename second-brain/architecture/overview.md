# Архитектура

## Слои

| Слой        | Папка           | Назначение                               |
| ----------- | --------------- | ---------------------------------------- |
| Конфиг      | `src/config.ts` | разрешение 256×240, 60 тиков/с           |
| Движок      | `src/engine/`   | не знает про игру                        |
| Игра        | `src/game/`     | сущности, сцены, фон                     |
| Точка входа | `src/main.ts`   | собирает экран, ввод, цикл, первую сцену |

## Движок

- `loop.ts` — `accumulate()` (чистая функция фиксированного шага, ограничение шагов
  за кадр) + `GameLoop` на `requestAnimationFrame`.
- `input.ts` — `Input`: действия `left/right/up/down/fire/start`, `isDown()` (зажата),
  `pressed()` (нажата в этом тике); `endTick()` после каждого тика.
- `screen.ts` — канвас в логическом разрешении, целочисленный масштаб под окно.
- `rng.ts` — сидируемый PRNG (mulberry32), `randomInt()`.
- `scene.ts` — интерфейс `Scene`: `update(dt, input)` может вернуть следующую сцену,
  `render(ctx)`.

## Игра

- `starfield.ts` — фон из звёзд.
- `scenes/title-scene.ts` — `TitleScene(rng, startLevel?, starfield?)`, заглушка титульного
  экрана; переданные звёзды продолжаются (`rng` на них не тратится), без них — новые из `rng`;
  `readonly starfield` (для тестов). По `start` (Enter) возвращает `PlayScene`, передавая свой
  `rng`, тот же экземпляр `Starfield` — звёзды продолжаются без скачка — `{ startLevel }` и
  фабрику `exit`, создающую новый `TitleScene` с теми же `rng`, `startLevel`, `starfield`
  (возврат после Game Over). Фабрика живёт в титуле — `play-scene` не импортирует `title-scene`.
- Точка входа `main.ts`: в dev-сборке (`import.meta.env.DEV`) читает `?level=N` через
  `parseStartLevel` и передаёт в `TitleScene`; в прод-сборке — `undefined` (уровень 1).
- `sprite.ts` — формат спрайта: массив строк + палитра, `.` — прозрачный пиксель.
  Чистый `parseSprite()` (бросает на ошибках формата: нет строк, нулевая ширина, строки
  разной длины, ключ `.` в палитре, символ вне палитры) и `drawSprite()` — `fillRect` 1×1
  на каждый непрозрачный пиксель; координаты целые (`Math.floor` — в вызывающем коде).
- `art.ts` — данные пиксель-арта: `SHIP_SPRITE` 15×16 (разбирается при загрузке модуля —
  ошибка формата роняет импорт и ловится тестами), `SHOT_COLOR` (белый; выстрел —
  прямоугольник, не спрайт), `LIFE_ICON_SPRITE` 7×8 (иконка жизни для HUD — уменьшенный
  силуэт корабля в палитре корабля; предел 8×8 — `LIFE_ICON_MAX_SIZE` в `hud.ts`,
  проверяется тестом) и цвета панели `HUD_LABEL_COLOR` (красный, как `R` корабля) /
  `HUD_VALUE_COLOR` (белый).
- `font.ts` / `font-art.ts` — моноширинный пиксельный шрифт (NES-стиль): глифы 7×7
  в клетке 8×8 (`GLYPH_WIDTH`, `GLYPH_HEIGHT`, `CHAR_ADVANCE`), набор `0–9`, `A–Z`,
  пробел. Данные — строки `#`/`.` в `font-art.ts` (`FONT_GLYPHS`, под `// prettier-ignore`,
  чтобы глифы оставались по строке на ряд), разбор через `parseSprite` в `parseFont` при
  загрузке модуля (`FONT`; неверный размер глифа или ошибка формата роняет импорт).
  `textWidth(text)` = `text.length * CHAR_ADVANCE` (хвостовой зазор 1 px намеренно);
  `drawText(ctx, text, x, y, color)` — один `fillStyle` на вызов, `fillRect` 1×1 на пиксель
  маски (цвет из глифа не читается), координаты целые. Оба бросают на символе без глифа.
  Шрифт в `game/`, не в движке (строится на `sprite.ts`). Используется верхней
  панелью (`hud-render.ts`).
- `shot.ts` — `Shot`: позиция — левый верхний угол, `SHOT_WIDTH × SHOT_HEIGHT = 1×4`,
  `SHOT_SPEED = 240` px/с (4 px/тик); `x` фиксирован после вылета (за кораблём не
  следует), `update(dt)` — движение вверх, `isOffscreen` — `y + SHOT_HEIGHT <= 0`.
  Не зависит от других модулей игры.
- `enemy-shot.ts` — `EnemyShot(x, y)`: отдельный класс вражеского выстрела, позиция — левый
  верхний угол, `ENEMY_SHOT_WIDTH × ENEMY_SHOT_HEIGHT = 1×4`, `ENEMY_SHOT_SPEED = 240` px/с
  (4 px/тик, быстрее любого `diveSpeed` — выстрел сразу отрывается от носа врага); `x`
  фиксирован после вылета, `update(dt)` — движение вниз, `isOffscreen` — `y >= SCREEN_HEIGHT`.
  Импортирует `config`.
- `ship.ts` — `Ship`: позиция — левый верхний угол, старт по центру по X
  (`SHIP_START_X = 120` — точка старта и возрождения),
  `SHIP_Y = 208` (полоса под кораблём пустая; жизни — в верхней панели); `SHIP_WIDTH`/`SHIP_HEIGHT`
  выводятся из спрайта. Движение — `update(dt, move)` с `MoveDir` (`-1 | 0 | 1`):
  `SHIP_SPEED = 120` px/с (2 px/тик), без инерции, зажим `[0, SCREEN_WIDTH - SHIP_WIDTH]`;
  шаг за край обрезается ровно до края. `spawnShot()` — новый `Shot` по центру носа,
  низ выстрела касается верха корабля.
- `player.ts` — `PlayerIntent { move, fire }` и `readIntent(input)` — единственное место,
  где игра читает клавиатуру для игрока (обе стороны зажаты — `move = 0`; `fire` —
  `pressed`, только тик нажатия). `Player` — агрегат «корабль + единственный выстрел»:
  `ship`, `get shot(): Shot | null`, `update(dt, intent)`. Автомат выстрела:
  Ready (`shot === null`) → огонь → InFlight → ушёл за верх → Ready; InFlight →
  попадание (`removeShot()`) → Ready; нажатие во время полёта игнорируется и не
  буферизуется. Выстрел, снятый попаданием, освобождает слот со следующего тика (огонь в
  `update` идёт до коллизий). Порядок тика: движение корабля → полёт
  выстрела и удаление ушедшего → огонь (слот освобождается в том же тике, новый выстрел
  вылетает из уже сдвинутого корабля и в тике вылета не движется).
  Жизни: `START_LIVES = 3` (общее число, включая корабль на поле), `MAX_LIVES = 5`;
  конструктор `Player(ship?, lives?)` — `lives` целое 1…`MAX_LIVES`, иначе `RangeError`;
  геттеры `lives`, `isLost` (`lives === 0`). `addLife()` — `lives + 1` до `MAX_LIVES` в
  любом состоянии, состояние и `stateTicks` не трогает; в `down` при 0 жизнях возвращает
  возрождение в тик `DOWN_TICKS` от попадания.
  Автомат корабля (`ShipState`): `active` → `hit()` (`lives − 1`) → `down` → `DOWN_TICKS = 60`
  (1 с), только при `lives > 0` → `invulnerable` → `INVULNERABLE_TICKS = 120` (2 с) →
  `active`; при `lives === 0` корабль остаётся `down`, пока `addLife()` не вернёт жизнь (`stateTicks` растёт, ввод
  игнорируется, выстрел в полёте долетает). Геттеры `state`,
  `stateTicks`, `canBeHit` (только `active`), `canBeTargeted` (всё, кроме `down`).
  `hit()` действует только из `active` (в `down`/`invulnerable` игнорируется: жизнь не
  списывает, таймер не сбрасывает) и не снимает выстрел в полёте. Правило тиков — как у `Enemy`: вход в
  состояние ставит `stateTicks = 0`; `update` — счёт тика → переход по таймеру →
  поведение нового состояния. В `down` ввод игнорируется, летит только выстрел; в тике
  возрождения корабль ставится в `SHIP_START_X`, и intent этого тика уже применяется
  (движение и огонь); в `invulnerable` корабль управляем.
- `levels.ts` — `EnemyKind` (`drone | striker | raider`), `LayoutChar` (`D`, `S`, `R`, `.`),
  `LevelConfig { layout, swaySpeed, diveSpeed, firstDiveDelayTicks, diveIntervalTicks,
maxSorties, diverShots, raiderShots }` (`swaySpeed` — px/с, ADR 003; `diveSpeed` — px/с, целые или половинные px/тик ≥ 1, ADR 004;
  таймеры — целые тики; `maxSorties` — сколько вылетов одновременно; `diverShots` — выстрелов
  за вылет у `drone`/`striker`, целое ≥ 0, 0 — не стреляют; у уровней 1–5 — 0/0/1/2/2;
  `raiderShots` — выстрелов за вылет у каждого `raider`, целое ≥ 0, > 0 при `R` в раскладке; у
  уровней 1–3 — 0, у 4/5 — 2/3; `maxSorties` — группа `raider` считается одним вылетом),
  `Slot { row, col, kind, group }` (`group` — номер непрерывной серии `R` в строке, сквозной
  по раскладке row-major: 0, 1, …; у остальных `null`),
  `Layout { rows, cols, slots }` (слоты row-major: сверху вниз, слева направо),
  `FORMATION_MAX_COLS = 11`, `LEVELS` — пять уровней (уровень 1: `.SSSSSSSS.` + два ряда
  `DDDDDDDDDD`, пике 60, вылеты через 180/180 тиков, 1 в полёте; уровень 2: `.SSSSSSSS.` +
  `SSSSSSSSSS` + два ряда `DDDDDDDDDD`, пике 90, 150/150, 2 в полёте; уровень 3 — раскладка
  уровня 2, `swaySpeed = 30`, пике 120, 120/120, 2 в полёте; уровень 4: `..RR..RR..` +
  `.SSSSSSSS.` + два ряда `DDDDDDDDDD` (32 слота), `swaySpeed = 30`, пике 150, 120/90, 3 в
  полёте; уровень 5: `.RRR..RRR.` + `.SSSSSSSS.` + два ряда `DDDDDDDDDD` (34 слота), пике 180,
  90/60, 3 в полёте; у 1–2 `swaySpeed = 15`). Правила таблицы (`R` только в верхнем ряду,
  группа из 2–3) проверяет тест `LEVELS`, не парсер.
  `isAllowedSpeed(pxPerSecond)` — px/тик целое ≥ 1 или ровно `1/2`, `1/4`, `1/8` (ADR 003).
  `isAllowedDiveSpeed(pxPerSecond)` — px/тик ≥ 1 и кратно `1/2` (только вертикаль пике, ADR 004).
  Эскалация: `ESCALATION_STEP_TICKS = 6`, `ESCALATION_MIN_INTERVAL_TICKS = 30`,
  `ESCALATION_MIN_FIRST_DELAY_TICKS = 60`. `levelConfig(n, levels?)` — целое ≥ 1; внутри
  таблицы — та же строка; за концом таблицы — последний уровень с таймингами
  `min(последний, max(пол, последний − 6·k))`, `k = n − длина таблицы`; пустая таблица — ошибка.
  `parseLayout()` бросает: нет строк, строки разной длины, неизвестный символ, ширина > 11, ни одного врага. `parseStartLevel(value)` — разбор dev-параметра
  `?level=N`: только десятичные цифры и целое ≥ 1, иначе 1. Импортирует `config`
  (`TICK_SECONDS`).
- `formation.ts` — `Formation(cols, rows, swaySpeed)`: ячейка `CELL_WIDTH × CELL_HEIGHT = 16×12`,
  верх строя `FORMATION_TOP = 32`, строй центрирован по X (`baseX` — private);
  `slotX(col, width)` / `slotY(row, height)` — левый верхний угол спрайта, центрированного
  в ячейке. Покачивание: `SWAY_RANGE = 16` (видимый размах), `offset` — getter, дробный,
  старт 0, вправо; `update(dt)` — сдвиг на `swaySpeed * dt` и разворот у краёв
  (`maxOffset = 16 + max(0, 1 - step)`, `min = -16` — после `Math.floor` оба края видны
  одинаково долго). `slotX` включает `offset`, `slotY` — нет.
- `enemy-art.ts` — `DRONE_SPRITE` 11×8 (зелёный), `STRIKER_SPRITE` 13×9 (синий с
  пурпурным), `RAIDER_SPRITE` 13×9 (серебристый корпус, красные крылья-клешни, жёлтые глаза;
  стартовый, утверждает владелец), `EXPLOSION_FRAMES` — 2 кадра взрыва (11×9 вспышка, 13×9 осколки; тёплые
  цвета; вид стартовый, утверждает владелец); разбираются при загрузке модуля.
  `ENEMY_SHOT_COLOR = '#ff5fd2'` — цвет вражеского выстрела (не белый, не корпус корабля, не
  цвет звёзд; стартовый, утверждает владелец).
- `steering.ts` — чистые функции боковой рулёжки `descend`, без импортов: `SteerSpec
{ retargetTicks, turnTicks, maxVx }` (профиль вида), `SteerState { vx, turnCounter }`,
  `isRetargetTick(d, N)` (тики 1, 1+N, …; `null` — только 1-й), `desiredVx(centerX, aimX,
maxVx)` (`±maxVx` при gap ≥ 1, иначе 0), `turn(state, desired, T)` (инерция: `vx` меняется на
  1 px/тик за `T` тиков; `T = 0` — сразу; достижение `desired` сбрасывает счётчик, смена
  `desired` на полпути — нет).
- `enemy.ts` — `ENEMY_KINDS { sprite, steer }` по виду (`steer: SteerSpec`; профили `drone
{DRONE_RETARGET_TICKS = 30, 0, 1}`, `striker {1, STRIKER_TURN_TICKS = 8, 1}` (инерция: разворот — `T − 1` тиков прежним курсом, `T` тиков `vx = 0`, затем обратно), `raider {null, 0, 1}`); `Enemy(slot, formation)`: размер из
  спрайта вида (хитбокс = картинка), позиция — левый верхний угол = слот; в `formation`
  `update(dt, env)` пересчитывает позицию из слота (`EnemyEnv { diveSpeed, targetX }` —
  новый объект на тик от волны). Состояния `formation | diving | returning | exploding | dead`:
  `startDive(DiveOrder { sortieId, side, shots, aimOffsetX, groupMinOffsetX, groupMaxOffsetX })` —
  только из `formation`, первый шаг — в следующем `update`; `shots` — выстрелов на этот вылет
  (счётчик и сдвиги с прошлого вылета не переносятся); сдвиги — для группы `raider`, у
  одиночки все 0. `diving` = peel (`PEEL_SEGMENTS` — отрезки в px/тик, зеркалятся по
  `side`, фаза по `stateTicks`; 14 тиков; `x` зажат в экран) → descend, тик `d = stateTicks - 14`
  по профилю `steer`: в `d = 1` `vx` продолжает последний отрезок дуги (зажат в `±maxVx`); в
  тиках `isRetargetTick(d, retargetTicks)` цель берётся заново через `aimFor` (для всех видов;
  `null` → `desiredVx = 0`, прямо вниз): якорь — центр корабля, зажатый в `[floor(w/2) -
groupMinOffsetX, SCREEN_WIDTH - w + floor(w/2) - groupMaxOffsetX]`, плюс `aimOffsetX` (у края
  группа сдвигается целиком, не сжимаясь; одиночку зажим не задевает); `desiredVx` по центру
  врага (`x + floor(width / 2)`) → `turn` → `x += vx` (целые px/тик без `dt`),
  `y += diveSpeed · dt`; `x` зажат в `[0, SCREEN_WIDTH - width]`, упор в край обнуляет `vx` в
  стену. Состояние вылета `aimX`/`steerVx`/`turnCounter` сбрасывается только в `startDive`;
  геттер `vx` — от состояния (0 вне descend). Уход за низ (`y >= SCREEN_HEIGHT`) →
  `returning`: над текущим слотом (`y = -height`), шаг 1 px по осям (`STEER_SPEED` — шаг X
  только в `returning`; `RETURN_SPEED` = 60 px/с), не ниже `slotY`; в пределах шага — защёлкивается в слот →
  `formation`. `kill()` (из любого живого) → `exploding` на месте попадания → через
  `EXPLOSION_TICKS = 16` (`EXPLOSION_FRAME_TICKS = 8` × 2 кадра) → `dead`. `stateTicks` —
  «Правило тиков переходов»: 0 в тике входа, `update` сначала `++`, затем таймер, затем
  поведение. Геттеры от состояния: `isAlive` = строй + полёт, `isOut` = `diving | returning`,
  `sortieId` — `null` вне полёта. В `exploding` стоит на месте, `dead` не обновляется.
  Стрельба: `update` возвращает `boolean` — `true` только в тике выстрела в descend (выстрел
  создаёт волна). Расписание — тики `D, D + 20, D + 40, …` (`D = 15`, первый тик descend;
  `ENEMY_FIRE_INTERVAL_TICKS = 20`), пока остались выстрелы и низ врага не ниже верха корабля
  (`y + height <= SHIP_Y`) по позиции после сдвига этого тика; в тике ухода за низ — не
  стреляет. Выстрел расходуется, даже если волна отбросила его по лимиту. От `targetX` не
  зависит (стреляют и при `null`).
  Импортирует `config` (`SCREEN_WIDTH`, `SCREEN_HEIGHT`) и `ship` (`SHIP_Y`).
- `attack-director.ts` — `selectSortie(enemies, cols, config, sortieId, rng)` — чистая.
  Одиночные кандидаты — крайний левый (`side = -1`) и крайний правый (`+1`) ряда среди не-`raider`
  в `formation`; одиночка ряда летит в сторону своей половины строя (ровно посередине —
  вправо); `shots = config.diverShots`. Групповые кандидаты — группа `raider` целиком, если
  все её живые члены в `formation` (взрывающиеся/мёртвые не участвуют, группа без живых не
  даёт кандидата); `side` — по центру живых членов (посередине — вправо); `shots =
config.raiderShots`. Порядок кандидатов — по рядам сверху вниз, внутри ряда по левому
  столбцу; выбор `randomInt`; `null` без вызова `rng`, если кандидатов нет. Лидер — крайний
  член в сторону `side`; `aimOffsetX = (col - leader.col) * CELL_WIDTH`, `groupMin/MaxOffsetX`
  — min/max сдвигов (у одиночки всё 0). `Sortie { members, orders }` — участники по
  столбцам, `members[i]` получает `orders[i]`. `AttackDirector(config)` — таймер в тиках от
  `firstDiveDelayTicks`, на 0 запускает вылет, если в полёте меньше `maxSorties` различных
  `sortieId` и есть кандидат, затем таймер = `diveIntervalTicks`; иначе ждёт на 0. Не
  больше одного вылета за тик.
- `wave.ts` — `Wave(config, rng)`: `parseLayout` → `Formation` → враги в порядке слотов
  (`enemies`), `config` и `rng` боя хранятся, `AttackDirector` — один на уровень,
  `EnemyEnv` — новый на тик (`diveSpeed` уровня + `targetX`). `update(dt, targetX)` — строй →
  полёт вражеских выстрелов и удаление ушедших за низ → `enemy.update(dt, env)` каждого (если
  враг выстрелил и на экране меньше `MAX_ENEMY_SHOTS = 4` — выстрел из центра нижнего края
  спрайта, `floor(x) + floor(width / 2)`, `y + height`; лишний пропадает; в тике появления не
  движется; слот, освобождённый уходом за низ, свободен в том же тике) → директор (вылетевший
  стоит в слоте этого тика). `shots` — вражеские выстрелы в порядке создания (живой массив),
  `removeShot(shot)` (неизвестный игнорируется), `clearShots()`. `isCleared` — все враги
  `dead` (взрывы доиграны).
- `collisions.ts` — `Rect`, `overlaps(a, b)` — строгий AABB по `Math.floor`-координатам
  (касание краями — не пересечение). `resolveCollisions(player, wave)` — правило 1:
  выстрел игрока убивает одного живого (`isAlive`: в строю или в полёте) врага, которого пересекает, — самого нижнего
  (наибольший `y + height`, при равенстве — меньший индекс в `wave.enemies`), и
  снимается. Правило 2 — вражеский выстрел: при `player.canBeHit` первый по порядку
  `wave.shots` выстрел, пересекающий корабль, снимается, корабль — `hit()`; не больше одного за
  тик. Правило 3 —
  таран: при `player.canBeHit` первый по порядку `wave.enemies` враг вне строя
  (`isOut`: `diving`/`returning`), пересекающий корабль, гибнет (`kill()`), корабль —
  `hit()`; не больше одного тарана за тик. Правило 1 идёт первым: враг, сбитый
  выстрелом в этом тике, уже `exploding` и не таранит. Правила 2 и 3 делят одно поражение за
  тик: после попадания выстрела корабль уже не `canBeHit`, таранщик выживает и летит дальше.
  Выстрелы игрока и врагов не взаимодействуют. Возвращает `readonly Kill[]`
  (`Kill { kind, inFlight }`) — убийства тика в порядке событий: событие записывается до
  `kill()`, `inFlight` = `enemy.isOut` (у тарана всегда `true`); не больше двух за тик,
  правило 1 раньше правила 3; вражеский выстрел событий не даёт.
- `score.ts` — очки без состояния: `KindPoints { formation, flying }`, `ENEMY_POINTS`
  (В1: `drone` 30/60, `striker` 40/80, `raider` 50/100), `killPoints(kill, level)` —
  целочисленная формула `floor((base × (9 + level) + 50) / 100) × 10` (+10 % за уровень
  выше первого, к ближайшим 10, половина вверх, без потолка; В2), `RangeError` на уровне
  не целом ≥ 1. Доп. жизни (В4): `EXTRA_LIFE_FIRST = 5000`, `EXTRA_LIFE_EVERY = 10000`,
  `extraLivesEarned(before, after)` — число порогов 5000/15000/25000/…, пройденных за
  начисление (ровно на пороге — считается), без предела по жизням; внутренняя
  `thresholdsReached`.
- `test-levels.ts` — только для тестов: `passiveLevel(layout, overrides?)` — уровень с
  пассивными значениями (`firstDiveDelayTicks = diveIntervalTicks = 1_000_000`, вылетов
  нет; `diverShots = raiderShots = 0`; `overrides` включают отдельные поля);
  `diveOrder(overrides?)` — одиночный `DiveOrder` с нулевыми умолчаниями (`sortieId = 1`,
  `side = 1`, `shots` и сдвиги 0); `ONE_CORNER_ENEMY` (один `drone` в левом верхнем
  углу раскладки ширины 11, `swaySpeed = 15`, стартовый x = 42 — далеко от столбца
  выстрела); `TWO_LEVELS` — два разных пассивных уровня для теста смены уровня
  (один `drone` в углу; два `drone` по углам), уровень 3+ — второй с эскалацией таймингов
  (остаётся пассивным).
- `test-evasion.ts` — только для тестов: сценарий уходимости `striker` — `EVASION_CASES`
  (`{ diveSpeed, turnY }`: 180/125, 150/128, 120/135, 90/141 — середины окон «`T = 8` уходит, `T = 0`
  таран»), `EVASION_START`, `runEvasion(diver, step, script)` (скриптовый корабль стоит /
  финтит, таран — `overlaps`); используют `enemy.test.ts` и `steering.test.ts`.
- `battle.ts` — `Battle(rng, opts?)`: агрегат боя без ввода и canvas; `rng` — свой
  генератор боя (хранится для новых волн). `BattleOptions { startLevel?, levels?, lives? }`
  (уровень по умолчанию 1, таблица — `LEVELS`, жизни — `START_LIVES`, проверяет `Player`;
  тесты внедряют таблицы из `test-levels.ts`). `readonly player` (создаётся в конструкторе
  с `opts.lives`, `rng` не трогает), геттеры `level`, `wave`, `score` (целое ≥ 0, с 0;
  меняется только в private `addScore`; там же за каждый пройденный порог
  `player.addLife()` — после `resolveCollisions`, так что гибель этого тика списывается
  раньше; доп. жизнь в `down` при 0 жизнях отменяет `over`), `phase`
  (`BattlePhase = 'playing' | 'cleared' | 'over'`), `phaseTicks` — общий счётчик всех фаз
  (0 после `update` перехода, +1 за каждый следующий; private `ticksInPhase`). `update(dt, intent)`: игрок → волна (получает
  `targetX` = центр корабля `ship.x + floor(SHIP_WIDTH / 2)` при `player.canBeTargeted`, иначе `null` — в `down` `striker` гасит боковой ход за ≤ `STRIKER_TURN_TICKS` тиков и идёт прямо вниз, `drone` перестаёт сворачивать на ближайшем переприцеливании) → коллизии и начисление очков (только `playing`: `addScore(killPoints(kill, level))` за каждое убийство, уровень этого тика) → фазы. Фазы: счёт тика, затем по порядку — (1) из `playing`/`cleared` в `over`, когда `player.isLost` и `player.stateTicks >= GAME_OVER_DELAY_TICKS` (`= DOWN_TICKS`, 1 с — момент, когда корабль появился бы); проверяется первым, поэтому после потери последнего корабля уровень не меняется; `over` терминальна: коллизий нет, волна обновляется дальше; (2) когда все враги `dead` — `cleared` (`phaseTicks = 0`, вражеские выстрелы в полёте снимаются — `wave.clearShots()`);
  через `LEVEL_PAUSE_TICKS = 90` (1,5 с, без надписи) — `level++`, новая `Wave`
  (рисуется в этом тике в начальных позициях, первый `update` — в следующем), `playing`.
  За концом таблицы — эскалация последнего уровня (`levelConfig`). В `cleared` игрок двигается и
  стреляет как обычно.
- `battle-render.ts` — `drawBattle(ctx, battle)`: вся отрисовка игровых сущностей,
  слои вражеские выстрелы (`ENEMY_SHOT_COLOR`, 1×4) → выстрел игрока → враги (в порядке
  `wave.enemies`, спрайт из `ENEMY_KINDS`) → корабль,
  координаты через `Math.floor`; фон не рисует. `dead` — пропуск; `exploding` — кадр
  `EXPLOSION_FRAMES[floor(stateTicks / EXPLOSION_FRAME_TICKS)]`, центрированный в
  прямоугольнике врага. Корабль — по состоянию: `active` — спрайт; `down` — взрыв
  (общий с врагами `drawExplosion`, по центру прямоугольника 15 × 16 на месте поражения)
  `EXPLOSION_TICKS` тиков, затем ничего; `invulnerable` — мигание `BLINK_TICKS = 4`
  (4 тика виден, 4 скрыт; виден в тике входа). Выстрел игрока рисуется в любом
  состоянии корабля.
- `hud.ts` — модель панели без canvas: `HudView { level, score, lives }` (`lives` — общее
  число, включая корабль на поле), `hudView(battle)` (уровень — `battle.level`, жизни —
  `battle.player.lives`, счёт — `battle.score`), `formatScore`
  (6 цифр с ведущими нулями, длиннее — целиком), `formatLevel`; раскладка:
  `HUD_HEIGHT = 24`, `HUD_MARGIN_X = 8`, строки `HUD_LABEL_Y = 4` / `HUD_VALUE_Y = 14`,
  `HudZone`, `SCORE_ZONE` (8, 4, 48×17), `LEVEL_ZONE` (108, 4, 40×17; номер — по центру
  под подписью: `levelValueX(text)` = `x + floor((40 − textWidth(text)) / 2)`, +16 для
  1 цифры, +12 для 2; влезает до 5 цифр; счёт — по левому краю), `LIVES_ZONE` (200, 14, 48×8; иконки от правого края, шаг
  `LIFE_ICON_STEP = 10`, `LIVES_ICON_SLOTS = 5`, предел иконки `LIFE_ICON_MAX_SIZE = 8`),
  `HUD_ZONES` — для теста непересечения. Новая секция = поле `HudView` + зона + `drawX`.
- `hud-render.ts` — `drawHud(ctx, view)`: секции счёт → уровень → жизни, каждая рисует
  только в своей зоне; подписи `HUD_LABEL_COLOR`, значения `HUD_VALUE_COLOR` через
  `drawText`, иконки — `drawSprite` (своей палитрой), не больше `LIVES_ICON_SLOTS`; фон не рисует.
- `game-over-render.ts` — `drawGameOver(ctx, phaseTicks, backdrop = GAME_OVER_BACKDROP)`:
  `GAME OVER` (`HUD_LABEL_COLOR`, y = `GAME_OVER_Y` = 112) и под ним мигающее `PRESS ENTER`
  (`HUD_VALUE_COLOR`, y = `PRESS_ENTER_Y` = 128) пиксельным шрифтом, по X по центру —
  `centeredX(text)` = `floor((SCREEN_WIDTH − textWidth(text)) / 2)`. Мигание от
  `battle.phaseTicks`: `isPromptVisible` — видно `PRESS_ENTER_BLINK_TICKS = 30` тиков, скрыто
  30, видно с `phaseTicks = 0`. Чёрная подложка под строками (поле `GAME_OVER_BACKDROP_PAD = 2`,
  рисуется до текста строки, под `PRESS ENTER` — и когда текст скрыт) выключена
  константой `GAME_OVER_BACKDROP = false`.
- `canvas-test-utils.ts` — только для тестов: `recorder()` — фейковый ctx, пишет
  `fillRect` с текущим `fillStyle` (`FillCall`); используют `sprite.test.ts`,
  `battle-render.test.ts`, `font.test.ts`, `hud-render.test.ts`, `game-over-render.test.ts`,
  `scenes/play-scene.test.ts`.
- `scenes/play-scene.ts` — `PlayScene(rng, starfield?, opts?, exit?)`, `opts: BattleOptions`
  передаются в `Battle` как есть, `exit: () => Scene` — куда ведёт Enter после Game Over.
  Игровая сцена: держит `readonly battle` и `readonly starfield` (открыты для тестов, тесты
  ходят через `scene.battle.player`); `update` — звёзды → `battle.update(dt, readIntent(input))`
  → в фазе `over` по `start` возвращает `exit()` (проверка после боя — Enter в тик перехода
  в `over` уже срабатывает; без `exit` сцена остаётся). Слои: заливка → звёзды → `drawBattle` →
  `drawHud(hudView(battle))` (без фона) → в фазе `over` `drawGameOver(ctx, battle.phaseTicks)`
  последним. Цикла `play ↔ title` нет: фабрику `exit` создаёт `TitleScene`.
  `readIntent` остаётся в сцене — `Battle` ввод не знает. `Starfield` принимает снаружи
  или создаёт из `rng`. `Battle` создаётся в конструкторе с отдельным `Rng`: сначала
  звёзды, потом seed боя `createRng(Math.floor(rng() * 2 ** 32))` — фон не влияет на бой.
- `scenes/scene-test-utils.ts` — только для тестов: `step(scene, input, n)` прогоняет
  тики как `main.ts` (`update` → смена сцены → `input.endTick()`). Тесты сцен вызывают
  `update` только через него.

Граф импортов: `title-scene → {play-scene, starfield}`,
`play-scene → {starfield, battle, battle-render, game-over-render, hud, hud-render, player, engine/rng}`,
`game-over-render → {config, art, font}`,
`hud → {config, font}` (`Battle` — type), `hud-render → {art, font, hud, sprite}` (`HudView`, `HudZone` — type),
`battle → {player, ship, wave, levels, collisions, score}` (`Rng`, `LevelConfig`, `PlayerIntent` — type),
`collisions → {ship, shot, enemy-shot}` (`Player`, `Wave`, `Enemy`, `EnemyKind` — type),
`score` (`Kill`, `EnemyKind` — type),
`battle-render → {art, enemy, enemy-art, enemy-shot, sprite, shot, ship}` (`Battle`, `Enemy`, `Player` — type),
`main → {config, engine/*, game/levels, game/scenes/title-scene}`,
`wave → {attack-director, enemy, enemy-shot, formation, levels}` (`Rng`, `EnemyEnv` — type),
`attack-director → {engine/rng, formation}` (`Rng`, `DiveOrder`, `Enemy`, `LevelConfig` — type),
`enemy → {config, enemy-art, ship, steering}` (`Formation`, `EnemyKind`, `Slot`, `Sprite`, `SteerSpec` — type), `steering` — без импортов, `formation → config`, `enemy-art → sprite`,
`levels → config`, `player → ship` (`Ship`, `SHIP_START_X`; `Input`, `Shot`, `MoveDir` — `import type`),
`ship → {config, art, shot}`, `art → sprite`, `font → {sprite, font-art}`, `font-art` — без импортов, `shot` — без импортов, `enemy-shot → config`;
`scene-test-utils → config` (типы `Scene`/`Input` — `import type`); `canvas-test-utils` —
без импортов, `test-levels` (`LevelConfig`, `DiveOrder` — type) — оба только из `*.test.ts`; `test-evasion → {config, collisions, ship}` (`Rect` — type), только из `*.test.ts`. Циклов
нет; `engine` ничего не знает о `game`.

## Принципы

- Детерминизм: случайность — через `Rng`, время — через `dt`.
- Скорости: для сущностей со спрайтом `SPEED * TICK_SECONDS` — целое число px/тик
  (иначе `Math.floor` при отрисовке даёт подёргивание); закреплено тестами
  (`second-brain/decisions/002-integer-speeds.md`). Медленным движениям (покачивание
  строя) разрешены двоичные дроби `1/2`, `1/4`, `1/8` px/тик; таймеры — целые тики
  (`second-brain/decisions/003-slow-speeds-tick-timers.md`). Вертикали пике разрешены
  половинные px/тик ≥ 1 (`second-brain/decisions/004-half-pixel-dive.md`). X в `descend` — целые px/тик без
  `dt` (как `PEEL_SEGMENTS`; допустимо, `dt` фиксирован — ADR 003).
- Логика отдельно от рендера — тестируется без canvas (Vitest, environment `node`).

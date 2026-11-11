# Дизайн: Враги и уровни

**Статус:** согласовано · **Раунд:** 3 (+ сверка с задачами 005–013)

## Цель и сценарии

Игра становится игрой: наверху — строй разных врагов, покачивающийся влево-вправо;
враги вылетают из строя, пикируют на игрока, на высоких уровнях стреляют. Игрок их
сбивает; строй уничтожен целиком — пауза и следующий уровень, сложнее. Выстрел врага
или таран поражают игрока: корабль взрывается, через паузу появляется по центру с
временной неуязвимостью (жизней, Game Over, счёта и HUD нет — отдельная фича).

Числа, помеченные **(В№)**, владелец принял как стартовые (раунд 2, см. «Решения
владельца»); подстройка — через таблицу уровней `LEVELS` и константы модулей, структура
от конкретных чисел не зависит. Визуальные числа (маршрут `PEEL_SEGMENTS`, кадры взрыва,
каденция мигания) подбирает разработчик, утверждает владелец глазами.

**Ключевые сценарии**

1. Титул → Enter → игровая сцена, уровень 1. Наверху строй из нескольких рядов
   (виды врагов по рядам), строй покачивается влево-вправо. Первые секунды (В1) никто
   не вылетает — игрок успевает освоиться.
2. Через паузу враги начинают вылетать по одному: крайний (фланговый) враг любого ряда
   «отклеивается» дугой вверх-наружу, затем пикирует вниз, смещаясь к игроку. Пролетев
   низ экрана, он появляется над верхним краем и возвращается на своё место в строю.
3. Выстрел игрока попадает во врага (в строю или в полёте) — враг взрывается (короткая
   анимация) и исчезает; выстрел игрока исчезает, можно стрелять снова.
4. Враг в полёте касается корабля (таран) — взрываются оба (В6). Выстрел врага попадает
   в корабль — корабль взрывается, выстрел исчезает.
5. Корабль взорван: секунда (В5) — корабля нет, управление игнорируется; затем корабль
   появляется по центру и мигает — неуязвим (В5), но двигается и стреляет; затем
   обычное состояние. Уровень не перезапускается, строй продолжает жить.
6. Уничтожен последний враг (включая тех, что в полёте) — вражеские выстрелы исчезают,
   пауза (В8), появляется строй следующего уровня.
7. Рост сложности (таблица `LEVELS`, В1): быстрее покачивание и пикирование, чаще и
   больше одновременных вылетов; с уровня 3 вылетевшие враги стреляют; с уровня 4 в
   верхнем ряду строя есть специальные враги (`raider`), которые вылетают группами по
   2–3 и стреляют.
8. После последней строки таблицы сложность больше не растёт: повторяется последний
   уровень (В7).

**Крайние случаи**

- Выстрел игрока задевает двух врагов сразу (пикирующий поверх строя) — погибает один:
  самый нижний (тот, в кого выстрел «врезался» первым); при равенстве — первый в
  порядке массива врагов (детерминизм).
- Выстрел игрока и вражеский выстрел друг друга не сбивают — пролетают насквозь.
- Корабль поражён, пока его выстрел летит — выстрел долетает и может убить врага
  (жизненные циклы раздельны, как и задумано в 001).
- В одном тике и таран, и вражеский выстрел — одно поражение (`hit()` действует только
  из состояния `active`); враг-таранщик при этом тоже погибает.
- Во время `down` и `invulnerable` коллизии с кораблём не проверяются; враги и выстрелы
  пролетают сквозь. Пикирующие в `down` летят прямо вниз (цели нет); `drone`/`raider`
  (`fixed`), начавшие `descend`, пока корабль `down`, цель не берут и весь `descend`
  летят прямо вниз, даже если корабль возродился посреди пике.
- Последний враг уничтожен, пока корабль `down`, — переход уровня идёт параллельно
  восстановлению корабля, состояния независимы.
- Враг убит во время вылета группы — остальные члены группы продолжают свой маршрут.
- Вылет не помещается (достигнут лимит одновременных вылетов) — таймер ждёт свободного
  слота и запускает вылет сразу, как слот освободился.
- Лимит вражеских выстрелов на экране достигнут — очередной выстрел врага пропадает
  (не откладывается); детерминированно и не копит «долг» залпов.
- Покачивание строя считается по полной ширине раскладки уровня, а не по живым врагам:
  строй не «расширяет размах» по мере потерь (проще и предсказуемо).
- Строй может стать пустым, пока враги в полёте: уровень не кончается, пока они живы.
- Дуга вылета у крайнего столбца при крайнем смещении строя могла бы увести врага за
  край экрана — `x` зажат в `[0, SCREEN_WIDTH - width]` во всех фазах `diving`.
- Долгая пауза вкладки — как в 001: `accumulate()` ограничивает число тиков за кадр.

## Модули и файлы

| Файл                                    | Ответственность                                                                                                                                                   | Статус     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/game/levels.ts`                    | `EnemyKind`, `LevelConfig`, таблица `LEVELS`, `levelConfig(n, levels?)` (за концом таблицы — последний), `parseLayout()`, `parseStartLevel()` (разбор `?level=N`) | новый      |
| `src/game/levels.test.ts`               | разбор раскладки и ошибки формата; **валидация каждой строки `LEVELS`** (скорости по ADR 002/003, раскладка, лимиты, инварианты)                                  | новый      |
| `src/game/test-levels.ts`               | только для тестов: маленькие таблицы уровней (`ONE_CORNER_ENEMY`, `TWO_LEVELS`) для `battle`/`wave`/`play-scene` тестов                                           | новый      |
| `src/game/canvas-test-utils.ts`         | только для тестов: `recorder()` — фейковый ctx (перенос из `sprite.test.ts`)                                                                                      | новый      |
| `src/game/enemy-art.ts`                 | спрайты врагов (`drone`, `striker`, `raider`) и взрыва; цвет вражеского выстрела                                                                                  | новый      |
| `src/game/formation.ts`                 | `Formation`: геометрия ячеек, покачивание (смещение и разворот у границ), координаты слотов                                                                       | новый      |
| `src/game/formation.test.ts`            | геометрия, покачивание, разворот, инварианты (строй не выходит за экран)                                                                                          | новый      |
| `src/game/enemy.ts`                     | `ENEMY_KINDS` (спрайт, способ прицеливания), `Enemy` — автомат состояний: в строю → вылет → возврат; взрыв; смерть                                                | новый      |
| `src/game/enemy.test.ts`                | переходы автомата, маршрут вылета, возврат на место, прицеливание, расписание стрельбы                                                                            | новый      |
| `src/game/attack-director.ts`           | `AttackDirector`: таймеры вылетов, лимит одновременных вылетов; `selectSortie()` — кто вылетает (через `Rng`)                                                     | новый      |
| `src/game/attack-director.test.ts`      | кандидаты (крайние в ряду, группы `raider`), лимит, таймер, детерминизм по seed                                                                                   | новый      |
| `src/game/enemy-shot.ts`                | `EnemyShot`: полёт вниз, «ушёл за низ»; константы                                                                                                                 | новый      |
| `src/game/enemy-shot.test.ts`           | полёт, граница исчезновения, инвариант скорости                                                                                                                   | новый      |
| `src/game/wave.ts`                      | `Wave` — один уровень: строй, враги, директор атак, вражеские выстрелы; `isCleared`                                                                               | новый      |
| `src/game/wave.test.ts`                 | создание по раскладке, обновление, выстрелы и лимит, «уровень пройден», детерминизм                                                                               | новый      |
| `src/game/collisions.ts`                | `Rect`, `overlaps()` (AABB), `resolveCollisions(player, wave)` — все правила попаданий                                                                            | новый      |
| `src/game/collisions.test.ts`           | каждое правило попадания, приоритет «самый нижний», неуязвимость, отсутствие туннелирования                                                                       | новый      |
| `src/game/battle.ts`                    | `Battle` — агрегат игры без ввода и canvas: `Player` + текущая `Wave` + номер уровня + фазы; `BattleOptions` (`startLevel`, `levels`)                             | новый      |
| `src/game/battle.test.ts`               | порядок тика, переход уровня, пауза, старт с заданного уровня                                                                                                     | новый      |
| `src/game/battle-render.ts`             | `drawBattle(ctx, battle)` — вся отрисовка игровых сущностей (слои — «Поток тика»)                                                                                 | новый      |
| `src/game/battle-render.test.ts`        | на фейковом ctx: мигание неуязвимого корабля, корабль не рисуется в `down` после взрыва, взрыв врага вместо спрайта                                               | новый      |
| `src/game/player.ts`                    | + состояния корабля `active`/`down`/`invulnerable`, `hit()`, `removeShot()`, `canBeHit`; возрождение по центру                                                    | изменяемый |
| `src/game/player.test.ts`               | + автомат состояний, игнор ввода в `down`, выстрел переживает корабль                                                                                             | изменяемый |
| `src/game/scenes/play-scene.ts`         | только звёзды + `Battle` + `drawBattle`; `readonly battle` вместо `readonly player`; `BattleOptions` пробрасываются в `Battle`                                    | изменяемый |
| `src/game/scenes/play-scene.test.ts`    | `scene.player` → `scene.battle.player`; с задачи 4 — сцена на тестовой таблице (враг в углу); сквозной тест «сбил врага»                                          | изменяемый |
| `src/game/scenes/title-scene.ts`        | пробрасывает `startLevel` в `PlayScene`                                                                                                                           | изменяемый |
| `src/main.ts`                           | только в dev-сборке (`import.meta.env.DEV`): `?level=N` из URL → `parseStartLevel()` → `startLevel`; своей логики разбора нет                                     | изменяемый |
| `src/game/ship.ts`                      | одна правка: `export const SHIP_START_X` (центр) — им пользуются конструктор `Ship` и возрождение в `Player`                                                      | изменяемый |
| `src/game/sprite.test.ts`               | `recorder()` берётся из `canvas-test-utils.ts`                                                                                                                    | изменяемый |
| `src/game/art.ts`, `shot.ts`            | не меняются                                                                                                                                                       | —          |
| `src/engine/*`                          | не меняется: `Rng`, `createRng`, `Scene`, `Input` хватает                                                                                                         | —          |
| `second-brain/decisions/003-*.md`       | ADR 003 «медленные скорости и таймеры в тиках» (задача 2)                                                                                                         | новый      |
| `second-brain/architecture/overview.md` | каждая задача дописывает свои модули                                                                                                                              | изменяемый |
| `second-brain/game-design.md`           | решения владельца по врагам/уровням (последняя задача)                                                                                                            | изменяемый |

**Почему `Battle`.** Сейчас `PlayScene` сама владеет `Player`. С врагами, коллизиями и
переходом уровней сцена разрастётся, а тестировать её можно только через `Input` и
`step()`. `Battle` принимает `PlayerIntent` (как `Player` в 001) и тестируется
тривиальными объектами; сцена остаётся тонкой: звёзды, `readIntent`, `drawBattle`.

**Почему `Wave` отдельно от `Battle`.** `Wave` — всё, что живёт ровно один уровень
(создаётся из `LevelConfig`, выбрасывается целиком при переходе). `Battle` — то, что
переживает уровни (игрок, номер уровня). Переход уровня = `new Wave(levelConfig(n+1))`,
без ручной очистки полей.

**Почему коллизии — отдельный модуль, а не методы сущностей.** Правила попаданий —
перекрёстные (игрок × волна); в одном месте их легко прочитать, упорядочить и покрыть
тестами. Сущности дают только прямоугольники и методы `kill()`/`hit()`/`removeShot()`.

**Почему рендер — `battle-render.ts`.** Логические модули (`Enemy`, `Wave`, `Battle`)
не знают про `ctx`. Отрисовка сущностей собрана в одной функции, сцена её вызывает.
Мигание и кадры взрыва зависят от счётчиков тиков, которые логика уже хранит
(`stateTicks`), — рендер ничего не считает сам.

Производительность: `drawSprite` — `fillRect` 1×1 на пиксель; при 55 врагах до 13 × 10
это до ~7 000 вызовов за кадр — на десктопе нормально. Сейчас не оптимизируем; если
глазами появятся просадки — кэш спрайтов в offscreen-canvas внутри `sprite`/
`battle-render`, API логики не меняется.

**Почему `enemy-art.ts`, а не папка `art/`.** В 001 решено разнести арт, когда его
станет много. Отдельный файл для врагов — без переименования `art.ts` и правки импортов
корабля; два файла папки не требуют.

**Отдельный `Rng` для боя.** `Starfield` тратит общий `rng` в каждом `update` (перерождение
звёзд). Если бой делит с ним генератор, любое изменение фона сдвигает последовательность
вылетов. `PlayScene` один раз берёт из своего `rng` seed и создаёт для `Battle` свой
генератор: `createRng(Math.floor(rng() * 2 ** 32))`. Детерминизм сохраняется, тесты боя
от фона не зависят. Порядок в конструкторе сцены: сначала `Starfield` из `rng` (если
звёзды не переданы), потом seed боя — раскладка звёзд для данного seed та же, что в
001/005. Появляется в задаче 2 вместе с `Wave` (первым потребителем): в
задаче 1 `Battle` создаётся без аргументов — неиспользуемый `rng` не прошёл бы
`noUnusedParameters`/`noUnusedLocals`.

Граф импортов (без циклов, в том числе по типам):

- `play-scene → {starfield, battle, battle-render, player, engine/rng}`;
- `battle → {player, wave, levels, collisions}`;
- `battle-render → {battle(type), player(type), enemy (ENEMY_KINDS, EXPLOSION_FRAMES,
EXPLOSION_FRAME_TICKS, EXPLOSION_TICKS), art, enemy-art, sprite, shot, enemy-shot, ship}`;
- `collisions → {ship, shot, enemy-shot}` (`Player`, `Wave`, `Enemy` — `import type`);
- `wave → {formation, enemy, attack-director, enemy-shot, levels}`;
- `attack-director → {enemy(type), levels(type LevelConfig), engine/rng}`;
- `enemy → {formation(type), levels(type Slot, EnemyKind), enemy-art, ship(SHIP_Y),
config}`;
- `levels → {config}` — лист: `EnemyKind` живёт здесь (раскладка — источник видов);
- `main → {config, engine/*, levels (parseStartLevel), title-scene}` — `main` берёт из
  `levels` только чистую функцию разбора `?level=N`;
- `player → {ship, shot}`; `enemy-art → sprite`.

`engine` ничего не знает о `game`. Тестовые хелперы (`test-levels`, `canvas-test-utils`)
импортируются только из `*.test.ts` и в сборку не попадают.

## Сущности и состояния

**Система координат, позиции** — как в 001: логические пиксели, `y` вниз, позиция —
левый верхний угол, `Math.floor` при отрисовке.

**Правило скоростей и таймеров (новый ADR 003, расширяет ADR 002).**

- Быстрые движения — целые px/тик (ADR 002): пикирование, выстрелы.
- Покачиванию строя нужна скорость меньше 1 px/тик (1 px/тик = 60 px/с — строй
  проезжает размах за долю секунды). Разрешаем скорости, у которых px/тик — **двоичная
  дробь** `1/2`, `1/4`, `1/8` (30, 15, 7,5 px/с). Такие числа в double точны, сумма
  `x += speed * dt` не накапливает ошибку, и после `floor` спрайт сдвигается ровно на
  1 px каждые 2/4/8 тиков — равномерно, без 1-2-1-2. Дроби вроде `1/3` (20 px/с) и
  `3/4` (45 px/с) запрещены: первая неточна в double (сбой каденции), вторая даёт
  неравномерный шаг 0-1-1-1. Механизм тот же (`x += speed * dt`), тест —
  `isAllowedSpeed(speed)`: `speed * TICK_SECONDS` — целое ≥ 1 или одно из `1/2, 1/4, 1/8`.
  Проверено: `30 * (1/60) === 0.5`, `15 * (1/60) === 0.25` в double.
- **Таймеры — в целых тиках.** Длительности (пауза до первого вылета, интервалы,
  взрыв, неуязвимость, сегменты маршрута) — целые числа тиков, счётчик уменьшается на 1
  за `update`. Вариант «секунды и `timer -= dt`» отвергнут: сумма `1/60` в double
  неточна, событие «0,5 с» срабатывало бы то на 30-м, то на 31-м тике, а тесты зависели
  бы от погрешности. `update` вызывается ровно раз за фиксированный тик, детерминизм не
  страдает. В таблицах суффикс `Ticks` в имени поля обязателен.

**Формат раскладки строя.** Массив строк одинаковой длины, сверху вниз; символ —
вид врага: `D` — `drone`, `S` — `striker`, `R` — `raider`, `.` — пустая ячейка. Пример:

```
'...RR.RR...'
'.SSSSSSSSS.'
'DDDDDDDDDDD'
```

`parseLayout()` возвращает список слотов `{ row, col, kind, group }` и бросает на ошибках
(нет строк, строки разной длины, неизвестный символ, ширина больше `FORMATION_MAX_COLS`,
ни одного врага). `group` — номер непрерывной серии `R` в строке (для вылета группами;
у остальных видов — `null`). В примере выше — две группы `raider` по 2.

**LevelConfig** — одна строка таблицы `LEVELS` (поля — в «Интерфейсы»):
раскладка, скорость покачивания, скорость пикирования, пауза до первого вылета,
интервал между вылетами, лимит одновременных вылетов, число выстрелов за вылет у
обычных врагов (0 — не стреляют) и у `raider`. Таблица по умолчанию (В1):

| Уровень | Раскладка (рядов × врагов)    | sway px/с | dive px/с | первый вылет | интервал | вылетов одновременно | выстрелов D/S | выстрелов R |
| ------- | ----------------------------- | --------- | --------- | ------------ | -------- | -------------------- | ------------- | ----------- |
| 1       | `S`×8, `D`×10, `D`×10         | 15        | 60        | 180 тиков    | 180      | 1                    | 0             | —           |
| 2       | `S`×8, `S`×10, `D`×10, `D`×10 | 15        | 120       | 150          | 150      | 2                    | 0             | —           |
| 3       | как 2                         | 30        | 120       | 120          | 120      | 2                    | 1             | —           |
| 4       | `R`×2+2, `S`×8, `D`×10 ×2     | 30        | 120       | 120          | 90       | 3                    | 2             | 2           |
| 5       | как 4, `R`×3+3                | 30        | 180       | 90           | 60       | 3                    | 2             | 3           |

**Formation** — сетка ячеек `CELL_WIDTH × CELL_HEIGHT` = 16 × 12 (В9), не более
`FORMATION_MAX_COLS = 11` столбцов, верх строя — `FORMATION_TOP = 32` (над ним место
под будущий HUD, В9).

- Данные: `cols`, `rows`, `offset` (смещение покачивания), `dir` (`-1 | 1`), `swaySpeed`.
- Базовая X: `baseX = Math.floor((SCREEN_WIDTH - cols * CELL_WIDTH) / 2)`.
- Покачивание: `offset += dir * swaySpeed * dt`; на границе смещение обрезается до
  границы и `dir` меняет знак (как зажим корабля в 001). Границы — `[-SWAY_RANGE,
SWAY_RANGE + max(0, 1 - step)]`, `step = swaySpeed * dt`: видимый (по `Math.floor`)
  размах — ровно `±SWAY_RANGE` (В9, 16 px), оба края стоят одинаково долго (точное
  правило и числа — «Уточнения для реализации» → «Разворот покачивания»).
  Старт: `offset = 0`, `dir = 1`.
- Координаты слота врага ширины `w`, высоты `h`:
  `slotX = baseX + col * CELL_WIDTH + Math.floor((CELL_WIDTH - w) / 2) + offset`,
  `slotY = FORMATION_TOP + row * CELL_HEIGHT + Math.floor((CELL_HEIGHT - h) / 2)`.
- Инвариант (тест): при максимальной ширине и крайних смещениях (`-SWAY_RANGE` и
  `maxOffset`, для 11 столбцов — 24 … 232,75) строй внутри экрана.

**Виды врагов (`ENEMY_KINDS`, В3/В4).** Спрайты оригинальные, 8-битные, ширина
нечётная (центр под выстрел), не больше `13 × 10` — чтобы влезать в ячейку 16 × 12 с
зазором. Хитбокс = размер спрайта (как у корабля). Различия в поведении:

| Вид       | Где в строю  | Прицеливание при пикировании                                       | Выстрелы             |
| --------- | ------------ | ------------------------------------------------------------------ | -------------------- |
| `drone`   | нижние ряды  | `fixed`: в начале пике запоминает X корабля и смещается к этой X   | `diverShots` уровня  |
| `striker` | средние ряды | `track`: каждый тик смещается к текущему X корабля                 | `diverShots` уровня  |
| `raider`  | верхний ряд  | `fixed`, группа сохраняет строй (каждому цель со сдвигом по слоту) | `raiderShots` уровня |

Скорость бокового смещения при пикировании — `STEER_SPEED = 60` px/с (1 px/тик) для
всех: меньше скорости корабля (2 px/тик), от `track` можно увернуться.

**Enemy — автомат состояний**

```
             startDive()                y > SCREEN_HEIGHT
 formation ─────────────▶ diving ─────────────────────────▶ returning
     ▲                   (peel → descend)                       │
     └────────────────── дошёл до своего слота ─────────────────┘

 formation | diving | returning ── kill() ──▶ exploding ── EXPLOSION_TICKS ──▶ dead
```

- `formation`: позиция каждый тик пересчитывается из `formation.slotX/slotY`; поля
  `x/y` всё равно обновляются, чтобы коллизии и рендер читали одно и то же.
- `diving`, фаза `peel`: короткий заранее заданный маршрут `PEEL_SEGMENTS` — список
  `{ ticks, vx, vy }` (целые px/тик), `vx` зеркалится по `side` (наружу от строя: дуга
  вверх-вбок, затем вниз). Числа маршрута — визуальные, подбирает разработчик,
  утверждает владелец глазами. `x` зажат в `[0, SCREEN_WIDTH - width]` и здесь: у
  крайнего столбца при `-SWAY_RANGE` (`x ≈ 25`) дуга наружу может быть шире запаса.
  Зажим проще, чем инвариант на сумму `vx` маршрута, и не ломается при подстройке дуги.
- `diving`, фаза `descend`: `vy = diveSpeed` уровня; `vx = sign(aimX - центрВрага) *
STEER_SPEED`, если `|aimX - центрВрага| ≥ 1 шага`, иначе `0` (не дрожит над целью).
  `aimX`: `fixed` — «якорь» + `aimOffsetX`, взятый в первом тике `descend`; якорь — X
  центра корабля, зажатый так, чтобы цели **всех** членов вылета помещались на экране
  (формула — «Точные правила», «Цель `fixed` группы»; у одиночки зажим ничего не меняет);
  если в этом тике `targetX === null` (корабль `down`), цель не берётся и **весь**
  `descend` идёт прямо вниз (`vx = 0`), даже если корабль возродится посреди пике;
  `track` — X центра корабля каждый тик, в тиках с `targetX === null` — `vx = 0`.
  Боковое движение зажато в `[0, SCREEN_WIDTH - width]`.
- Стрельба в `descend`: `shotsLeft` (из `order.shots`); первый выстрел — в первом тике
  `descend`, далее каждые `ENEMY_FIRE_INTERVAL_TICKS` (В2); только пока низ врага выше
  `SHIP_Y` (не стреляет в упор и снизу). `update` возвращает `true` в тике выстрела —
  выстрел создаёт `Wave` (она знает лимит).
- `diving → returning`: верх врага ниже экрана (`y >= SCREEN_HEIGHT`). Враг
  переносится на `y = -height`, `x = slotX` (над своим слотом).
- `returning`: движется к текущему слоту: `vy = RETURN_SPEED` (60 px/с), но **ниже
  `slotY` не проходит** (`y = Math.min(y + RETURN_SPEED * dt, slotY)`; `slotY` от
  покачивания не зависит); `vx` — к `slotX` не быстрее `STEER_SPEED`; когда до слота
  по обеим осям не больше шага — встаёт ровно в слот и переходит в `formation` (слот
  сам смещается двоичными долями px — привязка точная). Без зажима враг, дошедший до
  `slotY` раньше, чем до `slotX`, уходил бы вниз за экран и оставался `isAlive`
  навсегда — уровень не кончился бы.
- Инвариант возврата (тест каждой строки `LEVELS`): `swaySpeed < STEER_SPEED` — слот
  движется медленнее догоняющего его врага, иначе по X враг слот не догонит. ADR 003
  разрешает и целые px/тик для покачивания, поэтому ограничение нужно явно.
- `kill()`: из любого живого состояния → `exploding` (`stateTicks = 0`); не
  коллизится, не стреляет, стоит на месте. Через `EXPLOSION_TICKS` (визуальное число,
  2 кадра) → `dead`. `dead` — не рисуется, не обновляется; массив врагов не
  перестраивается (стабильный порядок для детерминизма).
- `isAlive` = `formation | diving | returning`. `isOut` = `diving | returning`.
- `stateTicks` — та же семантика, что у `Player` (см. «Правило тиков переходов»):
  `0` в тике входа в состояние, `+1` в начале каждого следующего `update`.
- `startDive()` в тике `N` (из директора, после `enemy.update`) — в тике `N` враг стоит
  ровно в слоте этого тика; первый шаг `peel` — в тике `N + 1`.
- Поля приказа (`DiveOrder`): `sortieId` (номер вылета — для подсчёта одновременных
  вылетов), `side`, `shots`, `aimOffsetX`, `groupMinOffsetX`/`groupMaxOffsetX`. Враг
  копирует `shots` во внутренний счётчик
  `shotsLeft`.

**AttackDirector**

- Данные: `timer` (тики до следующего вылета), `nextSortieId`.
- Старт: `timer = firstDiveDelayTicks`.
- Каждый тик: `timer > 0` → `timer--`. Если `timer === 0` и число активных вылетов
  (различных `sortieId` у врагов с `isOut`) `< maxSorties` → `selectSortie()`; нашёлся —
  всем участникам `startDive(order)`, `timer = diveIntervalTicks`; не нашёлся (все в
  полёте) — ждём со `timer = 0`.
- `selectSortie(enemies, cols, rng)` — чистая функция. Кандидаты (В3):
  - для каждого ряда — самый левый и самый правый враг вида `drone`/`striker` в
    состоянии `formation` (крайние «отклеиваются» без пролёта сквозь соседей);
    `side = -1` для левого, `+1` для правого; если в ряду один — по половине строя;
  - для каждой группы `raider`: группа — кандидат целиком, если все её живые члены в
    `formation` (группа вылетает только вся). `side` — по половине строя центра
    группы, `aimOffsetX` — сдвиг слота члена относительно лидера (самого внешнего),
    `groupMinOffsetX`/`groupMaxOffsetX` — крайние сдвиги вылета (одинаковы у всех членов).
  - выбор — равновероятно среди кандидатов: `randomInt(rng, 0, n)`. Порядок списка
    кандидатов фиксирован (по рядам сверху вниз; внутри ряда — по левому столбцу
    кандидата: у группы — левый живой член) — детерминизм.

**EnemyShot** — `ENEMY_SHOT_WIDTH × ENEMY_SHOT_HEIGHT = 1 × 4`, `ENEMY_SHOT_SPEED = 240`
px/с (4 px/тик, как у выстрела игрока — решение владельца, В2), цвет — свой
(`ENEMY_SHOT_COLOR`, не белый — отличать от своего).

**Инвариант: выстрел быстрее любого пикирования** — `ENEMY_SHOT_SPEED > diveSpeed` для
каждой строки `LEVELS` (тест таблицы). Причина: выстрел рождается у низа врага и летит
строго вниз; при равной скорости он «висит» у носа врага, при меньшей — враг его
обгоняет, и выстрел, рисуемый под спрайтом, становится невидим. Игрок получает выстрел,
которого не видел. С 240 px/с и `diveSpeed ≤ 180` (В1) выстрел отрывается от врага на
1+ px/тик.
Вылетает из центра низа врага, летит строго вниз, `x` фиксирован. **В тике появления
выстрел не движется** (как выстрел игрока в 001): `Wave.update` двигает выстрелы до
`enemy.update`, поэтому новый выстрел рисуется и коллизится ровно у носа врага
(`y = enemy.y + enemy.height`), а лимит `MAX_ENEMY_SHOTS` считается после удаления
ушедших за низ в этом же тике. `isOffscreen`:
`y >= SCREEN_HEIGHT`. Отдельный класс, а не `Shot` с направлением: у них разные
владельцы, скорость, цвет и граница исчезновения; общий класс дал бы флаг и ветвления
ради двух строк кода, а `shot.ts` из 001 не трогаем.

**Wave**

- Создаётся из `LevelConfig` и `Rng`: `parseLayout` → `Formation` → `Enemy` на каждый
  слот (сразу в `formation`, без влёта на экран — В3) → `AttackDirector`.
- `shots: EnemyShot[]` — не больше `MAX_ENEMY_SHOTS = 4` (В2) одновременно.
- `isCleared` — все враги `dead` (взрывы доиграны).

**Player — автомат корабля** (расширение 001; автомат выстрела не меняется)

```
          hit()                 DOWN_TICKS                  INVULNERABLE_TICKS
 active ───────▶ down ─────────────────────▶ invulnerable ──────────────────────▶ active
```

- `active`: как в 001; `canBeHit = true`.
- `down`: корабль не двигается, «огонь» игнорируется, `canBeHit = false`; выстрел в
  полёте продолжает лететь. Первые `EXPLOSION_TICKS` рендер рисует взрыв на месте
  корабля, дальше — пусто. По истечении `DOWN_TICKS` (В5, 60 = 1 с) `ship.x =
SHIP_START_X` (константа центра из `ship.ts`, общая с конструктором `Ship`).
- `invulnerable`: двигается и стреляет, `canBeHit = false`; рендер мигает (рисует
  корабль через каждые 4 тика — визуальное число, точное правило — в «Уточнениях для
  реализации»). `INVULNERABLE_TICKS` (В5, 120 = 2 с).
- `hit()` вне `active` — ничего не делает. `removeShot()` — снимает выстрел (попадание);
  слот огня свободен уже в следующем тике.
- `stateTicks` — тиков с входа в текущее состояние (для рендера).

**Правило тиков переходов** (одно для `Player`, `Enemy`, `Battle` — чтобы тесты писались
однозначно):

- Вход в состояние (`hit()`, `kill()`, `startDive()`) ставит `stateTicks = 0`; в этом
  тике сущность уже рисуется в новом состоянии.
- `update` **сначала** делает `stateTicks++` и проверяет переход по таймеру, **затем**
  выполняет поведение уже нового состояния.
- Для `Player`: `hit()` в тике `T` (коллизии) → тики `T+1 … T+59` — `down`, intent
  игнорируется; в тике `T+60` (`stateTicks` дошёл до `DOWN_TICKS`) — переход в
  `invulnerable`, `ship.x = SHIP_START_X`, и **в этом же тике** intent обрабатывается
  (корабль может сдвинуться и выстрелить). Итого `down` виден ровно `DOWN_TICKS` кадров.
  Так же `invulnerable → active` через `INVULNERABLE_TICKS`: в тике перехода коллизии
  уже действуют.

**Battle — фазы**

```
            wave.isCleared                    LEVEL_PAUSE_TICKS
 playing ─────────────────▶ cleared ───────────────────────────▶ playing (level + 1, new Wave)
```

- `playing`: всё обновляется и коллизится.
- `cleared`: при входе `wave.clearShots()`; игрок двигается и стреляет (выстрел никого
  не задевает — врагов нет), волна пустая. Через `LEVEL_PAUSE_TICKS` (В8, 90 = 1,5 с) —
  `level++`, `wave = new Wave(levelConfig(level, levels), rng)`. Надписи «LEVEL N» нет —
  текст и HUD — отдельная фича (В8).
- Тики перехода (по «Правилу тиков переходов»): `playing → cleared` — в шаге 4 тика `T`,
  `phaseTicks = 0`. В шаге 4 каждого следующего тика `phaseTicks++`; когда
  `phaseTicks === LEVEL_PAUSE_TICKS`, создаётся новая волна. Она рисуется в этом же
  тике в начальных позициях, а **первый `update` получает в следующем тике**.
- `BattleOptions`: `startLevel` (по умолчанию 1), `levels` (по умолчанию `LEVELS`).
  Внедряемая таблица нужна тестам: `battle.test.ts` и `play-scene.test.ts` берут
  маленькие таблицы из `test-levels.ts` (один враг в углу, длинные таймеры) и не
  ломаются, когда владелец подстраивает В1. `levelConfig(level, levels)` применяет к
  внедрённой таблице то же правило «за концом — последний».

## Поток тика

`main.ts` и цикл не меняются.

**`PlayScene.update(dt, input)`**

1. `starfield.update(dt)`
2. `battle.update(dt, readIntent(input))`

**`Battle.update(dt, intent)`**

1. `player.update(dt, intent)` — состояние корабля (в `down` intent игнорируется),
   движение, полёт своего выстрела, огонь (порядок внутри — как в 001).
2. `wave.update(dt, targetX)`, `targetX = player.canBeTargeted ? центр корабля : null`
   (`canBeTargeted` — не `down`):
   1. `formation.update(dt)` — покачивание;
   2. вражеские выстрелы летят, ушедшие за низ удаляются (до создания новых — как
      `Player.update` в 001: сначала полёт, потом огонь; новый выстрел в тике появления
      не движется, освободившийся слот лимита доступен сразу);
   3. каждый враг `enemy.update(dt, env)`; вернул `true` и `shots.length <
MAX_ENEMY_SHOTS` → новый `EnemyShot` из центра низа врага;
   4. `director.update(enemies, cols, rng)` — возможно, новый вылет: враги переходят в
      `diving`, стоя ровно в слоте этого тика, и двигаются **со следующего тика**.
3. Если фаза `playing`: `resolveCollisions(player, wave)`:
   1. выстрел игрока × живые враги → один враг (самый нижний) `kill()`,
      `player.removeShot()`;
   2. если `player.canBeHit`: вражеские выстрелы × корабль → первый попавший удаляется,
      `player.hit()`;
   3. если `player.canBeHit` (всё ещё): живые враги с `isOut` × корабль → `enemy.kill()`,
      `player.hit()` (первый по порядку массива).
4. Фазы: `playing` и `wave.isCleared` → `cleared`; `cleared` и пауза вышла → новая волна.

Почему коллизии после движения всех: позиции в момент проверки — итоговые для тика,
рендер покажет ровно то, что проверялось. Почему выстрел игрока проверяется первым:
если в одном тике игрок сбил пикирующего и тот же враг таранил бы корабль — враг уже
`exploding`, тарана нет (в пользу игрока).

**Отсутствие туннелирования** (тест-инвариант): за тик расстояние сближения меньше
суммы высот: `SHOT_SPEED/60 + maxDown < SHOT_HEIGHT + min высоты врага` (4 + 3 < 4 +
высота) и `ENEMY_SHOT_SPEED/60 < ENEMY_SHOT_HEIGHT + SHIP_HEIGHT` (4 < 4 + высота
корабля). `maxDown` — максимальная скорость врага вниз в px/тик по всем фазам:
`max(diveSpeed/60, max vy по PEEL_SEGMENTS, RETURN_SPEED/60)` — маршрут `peel`
подбирается глазами, и сегмент быстрее `diveSpeed` иначе прошёл бы незамеченным
(поэтому `PEEL_SEGMENTS` экспортируется из `enemy.ts`). Проверяется для всех строк
`LEVELS`; часть про выстрел игрока — с задачи 5, часть про вражеский выстрел и
`ENEMY_SHOT_SPEED > diveSpeed` — с задачи 8. Для «выстрел быстрее пикирования» хватает
`diveSpeed`: враги стреляют только в `descend`.

**`PlayScene.render(ctx)`** — заливка → звёзды → `drawBattle(ctx, battle)`:

1. вражеские выстрелы;
2. выстрел игрока;
3. враги: живые — спрайт вида; `exploding` — кадр взрыва по `stateTicks`;
4. корабль: `active` — спрайт; `down` — взрыв в первые `EXPLOSION_TICKS`, затем ничего;
   `invulnerable` — спрайт в «видимых» тиках мигания.

Выстрелы под спрайтами — как в 001 (вылетая, выстрел касается своего носителя).

## Интерфейсы

```ts
// src/game/levels.ts
export type EnemyKind = 'drone' | 'striker' | 'raider';
export type LayoutChar = 'D' | 'S' | 'R' | '.';
export interface LevelConfig {
  /** Rows top→bottom; 'D' drone, 'S' striker, 'R' raider, '.' empty. */
  readonly layout: readonly string[];
  readonly swaySpeed: number;          // px/s, px/tick ∈ {1/8, 1/4, 1/2} ∪ ℕ (ADR 003)
  readonly diveSpeed: number;          // px/s, whole px/tick (ADR 002)
  readonly firstDiveDelayTicks: number;
  readonly diveIntervalTicks: number;
  readonly maxSorties: number;         // simultaneous sorties (a raider group is one sortie)
  readonly diverShots: number;         // shots per dive for drone/striker; 0 = no shooting
  readonly raiderShots: number;        // shots per dive for each raider
}
export interface Slot {
  readonly row: number;
  readonly col: number;
  readonly kind: EnemyKind;
  readonly group: number | null;       // raider run id within the layout, null for others
}
export interface Layout { readonly rows: number; readonly cols: number; readonly slots: readonly Slot[] }
export const FORMATION_MAX_COLS = 11;
export const LEVELS: readonly LevelConfig[];
/** 1-based; past the end of the table returns the last level.
 *  Throws if !Number.isInteger(level) || level < 1, or if the table is empty. */
export function levelConfig(level: number, levels?: readonly LevelConfig[]): LevelConfig; // default LEVELS
/** Throws on bad format (see design). */
export function parseLayout(layout: readonly string[]): Layout;
/** Dev-only `?level=N` value: N for a plain decimal integer >= 1 (/^\d+$/, safe integer),
 *  otherwise 1 (null, '', '0', '1.5', '-2', '1e3', ' 2', too big). Never throws.
 *  A level past the end of the table is fine: levelConfig repeats the last one. */
export function parseStartLevel(value: string | null): number;
/** Speed rule check shared by tests: whole px/tick ≥ 1 or exactly 1/2, 1/4, 1/8 px/tick. */
export function isAllowedSpeed(pxPerSecond: number): boolean;

// src/game/enemy-art.ts
export const DRONE_SPRITE: Sprite;
export const STRIKER_SPRITE: Sprite;
export const RAIDER_SPRITE: Sprite;
export const EXPLOSION_FRAMES: readonly Sprite[]; // 2 frames
export const ENEMY_SHOT_COLOR: string;

// src/game/formation.ts
export const CELL_WIDTH = 16;
export const CELL_HEIGHT = 12;
export const FORMATION_TOP = 32;
export const SWAY_RANGE = 16; // visible sway amplitude, px; offset ∈ [-16, 16 + max(0, 1 - step)]
export class Formation {
  readonly cols: number;
  readonly rows: number;
  get offset(): number;
  constructor(cols: number, rows: number, swaySpeed: number);
  update(dt: number): void;
  slotX(col: number, width: number): number;
  slotY(row: number, height: number): number;
}

// src/game/enemy.ts  (EnemyKind is imported from levels.ts)
export type Aim = 'fixed' | 'track';
export interface EnemyKindSpec { readonly sprite: Sprite; readonly aim: Aim }
export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>>;
export type EnemyState = 'formation' | 'diving' | 'returning' | 'exploding' | 'dead';
export const STEER_SPEED = 60;       // px/s, 1 px/tick
export const RETURN_SPEED = 60;      // px/s, 1 px/tick
export const EXPLOSION_FRAME_TICKS = 8;  // visual, starting value
export const EXPLOSION_TICKS = EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS; // 16; must be < DOWN_TICKS
export const ENEMY_FIRE_INTERVAL_TICKS = 20; // owner decision В2
export interface DiveOrder {
  readonly sortieId: number;
  readonly side: -1 | 1;
  readonly shots: number;
  readonly aimOffsetX: number;      // 0 for solo dives
  readonly groupMinOffsetX: number; // min aimOffsetX over the sortie's members (<= 0); 0 for solo
  readonly groupMaxOffsetX: number; // max aimOffsetX over the sortie's members (>= 0); 0 for solo
}
export interface PeelSegment { readonly ticks: number; readonly vx: number; readonly vy: number } // whole px/tick; vx for side = +1
export const PEEL_SEGMENTS: readonly PeelSegment[]; // exported for the tunneling invariant test
export interface EnemyEnv {
  // no formation here: the enemy keeps the one passed to its constructor (single source)
  readonly diveSpeed: number;
  /** Center X of the ship, or null when there is nothing to aim at. */
  readonly targetX: number | null;
}
export class Enemy {
  readonly kind: EnemyKind;
  readonly slot: Slot;
  readonly width: number;           // from sprite
  readonly height: number;
  x: number;
  y: number;
  get state(): EnemyState;
  get stateTicks(): number;
  get sortieId(): number | null;    // null when not out
  get isAlive(): boolean;
  get isOut(): boolean;
  constructor(slot: Slot, formation: Formation);
  /** Only from 'formation'; ignored otherwise. */
  startDive(order: DiveOrder): void;
  /** Any alive state → 'exploding'; ignored otherwise. */
  kill(): void;
  /** Returns true on a tick the enemy wants to fire. */
  update(dt: number, env: EnemyEnv): boolean;
}

// src/game/attack-director.ts
export interface Sortie { readonly members: readonly Enemy[]; readonly orders: readonly DiveOrder[] }
/** Pure: candidates per design, uniform pick via rng; null when nobody can go. */
export function selectSortie(enemies: readonly Enemy[], cols: number, config: LevelConfig, sortieId: number, rng: Rng): Sortie | null;
export class AttackDirector {
  constructor(config: LevelConfig);
  /** Launches at most one sortie per tick. */
  update(enemies: readonly Enemy[], cols: number, rng: Rng): void;
}

// src/game/enemy-shot.ts
export const ENEMY_SHOT_WIDTH = 1;
export const ENEMY_SHOT_HEIGHT = 4;
export const ENEMY_SHOT_SPEED = 240; // px/s, 4 px/tick; must exceed every diveSpeed
export class EnemyShot {
  constructor(readonly x: number, public y: number);
  update(dt: number): void;
  get isOffscreen(): boolean;      // y >= SCREEN_HEIGHT
}

// src/game/wave.ts
export const MAX_ENEMY_SHOTS = 4;
export class Wave {
  readonly config: LevelConfig;
  readonly formation: Formation;
  readonly enemies: readonly Enemy[];
  get shots(): readonly EnemyShot[];
  constructor(config: LevelConfig, rng: Rng);
  update(dt: number, targetX: number | null): void;
  removeShot(shot: EnemyShot): void;
  clearShots(): void;
  get isCleared(): boolean;
}

// src/game/collisions.ts
export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
/** Strict AABB: touching edges do not overlap. */
export function overlaps(a: Rect, b: Rect): boolean;
export function resolveCollisions(player: Player, wave: Wave): void;

// src/game/ship.ts — one addition
export const SHIP_START_X: number; // Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2); Ship's default x

// src/game/player.ts — additions
export type ShipState = 'active' | 'down' | 'invulnerable';
export const DOWN_TICKS = 60;
export const INVULNERABLE_TICKS = 120;
export class Player {
  get state(): ShipState;
  get stateTicks(): number;
  get canBeHit(): boolean;         // state === 'active'
  get canBeTargeted(): boolean;    // state !== 'down'
  hit(): void;
  removeShot(): void;
  // update(dt, intent) — unchanged signature; ignores intent in 'down'
}

// src/game/battle.ts
export type BattlePhase = 'playing' | 'cleared';
export const LEVEL_PAUSE_TICKS = 90;
export interface BattleOptions {
  readonly startLevel?: number;                 // default 1
  readonly levels?: readonly LevelConfig[];     // default LEVELS; tests inject small tables
}
export class Battle {
  readonly player: Player;
  get level(): number;
  get wave(): Wave;
  get phase(): BattlePhase;
  constructor(rng: Rng, opts?: BattleOptions); // task 1: constructor() — rng arrives with Wave in task 2
  update(dt: number, intent: PlayerIntent): void;
}

// src/game/battle-render.ts
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void;

// src/game/scenes/play-scene.ts
export class PlayScene implements Scene {
  readonly battle: Battle;          // exposed for tests (replaces `player`)
  constructor(rng: Rng, starfield?: Starfield, opts?: BattleOptions);
}

// src/game/scenes/title-scene.ts
export class TitleScene implements Scene {
  constructor(rng: Rng, startLevel?: number); // passes { startLevel } to PlayScene
}

// src/game/test-levels.ts — test-only
// layout ['D..........'] — full FORMATION_MAX_COLS width so baseX = 40 and the enemy starts at x = 42
// (baseX + floor((CELL_WIDTH - width) / 2)), then x = 42 + formation.offset (within ±SWAY_RANGE),
// far from the ship's shot column (x = 127); a one-column layout would be centered right above the ship.
// Dive/fire fields (added by later tasks) keep it passive: huge firstDiveDelayTicks, diverShots = 0.
export const ONE_CORNER_ENEMY: readonly LevelConfig[];
// Two distinct levels (level 1 — one enemy, level 2 — two, different layouts), same passive fields:
// lets battle.test tell "took the next row" from "repeated the last one"; level 3 must equal level 2.
export const TWO_LEVELS: readonly LevelConfig[];

// src/game/canvas-test-utils.ts — test-only
export interface FillCall { fillStyle: string; x: number; y: number; w: number; h: number }
export function recorder(): { ctx: CanvasRenderingContext2D; calls: FillCall[] }; // moved from sprite.test.ts
```

`Enemy` хранит `x/y` и в `formation` — чтобы коллизии и рендер не ветвились по
состоянию. `Enemy` реализует `Rect` структурно (поля `x, y, width, height`).

`selectSortie` принимает `config` ради числа выстрелов (`diverShots`/`raiderShots`) в
приказе — враг сам не знает уровень.

## Тестирование

**Unit-тесты (Vitest, без canvas):**

- `levels.test.ts`:
  - `parseLayout`: размеры, виды, пустые ячейки, номера групп `R` (две серии в строке —
    две группы, серии в разных строках — разные группы); ошибки: пусто, разная длина,
    чужой символ, шире `FORMATION_MAX_COLS`, ни одного врага;
  - `levelConfig`: `1` → первая строка, `LEVELS.length + 5` → последняя; `0`, `1.5`,
    `NaN` — бросает; внедрённая таблица — то же правило «за концом — последний»;
  - **для каждой строки `LEVELS`** (`it.each`): раскладка разбирается;
    `isAllowedSpeed(swaySpeed)`; `diveSpeed` — целые px/тик; таймеры — целые ≥ 1;
    `maxSorties ≥ 1`; `swaySpeed < STEER_SPEED` (возврат догоняет слот); инвариант
    туннелирования по максимальной скорости врага вниз (`maxDown`, см. «Поток тика»);
    `ENEMY_SHOT_SPEED > diveSpeed`;
    `raiderShots > 0`, если в раскладке есть `R`; `R` — только в верхней строке
    раскладки, каждая группа — 2–3 врага (решение владельца В3; правило таблицы, а не
    парсера — `parseLayout` остаётся общим);
  - `isAllowedSpeed`: 15, 30, 60, 120 — да; 20, 45, 90 — нет;
  - `parseStartLevel` (с задачи 008): `'1'`, `'2'`, `'99'` → то же число; `null`, `''`,
    `'0'`, `'1.5'`, `'abc'`, `'-2'`, `'1e3'`, `' 2'`, `'99999999999999999999'` → 1.
- `formation.test.ts`: `slotX/slotY` центрируют спрайт в ячейке; покачивание на 1 тик =
  `swaySpeed * TICK_SECONDS`; разворот ровно на границах из «Разворот покачивания»
  (прямая установка смещения через N тиков, `toBe`); симметрия краёв — за период
  `Math.floor(offset)` равно `+SWAY_RANGE` и `-SWAY_RANGE` одинаковое число тиков (для
  1/8, 1/4, 1/2 px/тик); строй максимальной ширины внутри экрана при обоих крайних
  смещениях.
- `enemy.test.ts`: в `formation` позиция = слот и следует за покачиванием;
  `startDive` → `diving`, первый шаг — в следующем `update`, `peel` проходит ровно сумму
  `PEEL_SEGMENTS`, зеркально для `side = ±1`; крайний враг при `-SWAY_RANGE` не уходит
  за край в `peel`; `descend` — `fixed` держит цель, взятую в первом тике, `track` —
  следует; без цели `vx = 0`; `fixed`, начавший `descend` без цели, летит прямо вниз и
  после появления цели; не дрожит над целью; уход за низ → `returning` над слотом; возврат
  точно в слот → `formation`; возврат при слоте, уехавшем по X (враг дошёл до `slotY`
  раньше), не проходит ниже `slotY` и всё равно заканчивается в `formation`; `kill` из каждого живого состояния → `exploding` → `dead`
  через `EXPLOSION_TICKS`; `kill`/`startDive` в неподходящем состоянии игнорируются;
  стрельба: первый выстрел в первом тике `descend`, интервал, `shots = 0` — ни разу,
  ниже `SHIP_Y` — не стреляет; `fixed` группы у края экрана: якорь зажат, цели всех
  членов на экране, разница X членов сохраняется (корабль у правого края — для группы с
  `aimOffsetX` 0/16/32, у левого — для −32/−16/0). Инвариант: спрайты нечётной ширины,
  ≤ 13 × 10.
- `attack-director.test.ts`: кандидаты — только крайние в `formation`; кто в полёте —
  не кандидат; группа `raider` — целиком или никак, `aimOffsetX` и
  `groupMinOffsetX`/`groupMaxOffsetX` верные (по живым членам); таймер:
  первый вылет ровно на `firstDiveDelayTicks`, следующий — через интервал; лимит
  `maxSorties` держится, вылет сразу при освобождении слота; одинаковый seed →
  одинаковая последовательность вылетов, разный seed → (в тесте с фиксированными seed)
  разная.
- `enemy-shot.test.ts`: полёт вниз на шаг за тик, граница `isOffscreen` прямой
  установкой, `Number.isInteger(ENEMY_SHOT_SPEED * TICK_SECONDS)`. Инвариант «быстрее
  пикирования» — в `levels.test.ts` (он про строки таблицы).
- `wave.test.ts`: враги по раскладке (число, виды, позиции); выстрел создаётся из
  центра низа врага и в тике появления не движется (`y === enemy.y + enemy.height`);
  лимит `MAX_ENEMY_SHOTS`, слот лимита, освобождённый уходом выстрела за низ, доступен в
  том же тике; ушедшие за низ удаляются; `isCleared`
  только когда все `dead` (не `exploding`); детерминизм — две волны с одним seed после
  N тиков совпадают по позициям всех врагов.
- `collisions.test.ts` (сущности ставятся прямой установкой координат): `overlaps` —
  касание краями не пересечение; выстрел игрока убивает ровно одного — самого нижнего;
  враги `exploding`/`dead` не задеваются; вражеский выстрел поражает `active`
  корабль и удаляется; в `invulnerable`/`down` — нет; таран убивает обоих;
  враг в `formation` не таранит; таран и выстрел в одном тике — одно поражение;
  враг, сбитый игроком в этом тике, не таранит.
- `player.test.ts`: `hit` → `down`, в `down` движение и огонь игнорируются, выстрел
  в полёте продолжает лететь; ровно на `DOWN_TICKS`-м `update` после `hit` →
  `invulnerable`, и intent этого тика уже обработан — два теста: с `IDLE` —
  `ship.x === SHIP_START_X`; с `move: 1` и огнём — `ship.x === SHIP_START_X + шаг
корабля` и выстрел создан;
  `INVULNERABLE_TICKS` → `active`; `hit` вне `active` ничего не делает;
  `removeShot` освобождает слот.
- `battle.test.ts` (на таблицах из `test-levels.ts`, не на `LEVELS`): фаза `cleared`
  после гибели последнего врага (врагов «убивают» через `kill()` напрямую); вражеские
  выстрелы очищены; на `TWO_LEVELS` ровно через `LEVEL_PAUSE_TICKS` — уровень 2 и новая
  полная волна **второй** строки (два врага, её раскладка) в начальных позициях, её
  первый `update` — в следующем тике; после уровня 2 — уровень 3 с волной строки 2
  («за концом — последний»); `startLevel` работает.
- `battle-render.test.ts` (фейковый ctx — `recorder()` из `canvas-test-utils.ts`): в `down` после взрыва
  корабль не рисуется; в `invulnerable` чередование «рисуется/нет»; враг `exploding`
  рисуется кадром взрыва; `dead` — не рисуется.
- `play-scene.test.ts` (через `step()`): обращения к `battle.player`. С задачи 4
  (появляются попадания) сцена в тестах создаётся с `{ levels: ONE_CORNER_ENEMY }`:
  иначе тесты `does not autofire…` и `ignores a press while the shot is in flight`
  сбивают врага нижнего ряда (строй съезжает под траекторию выстрела к ~35-му тику), а
  длинные прогоны с задачи 7 попадают под таран. Сквозной сценарий — на той же таблице:
  корабль под врагом в углу, огонь, через нужное число тиков враг `exploding`.

**Глазами (`npm run dev`, высокие уровни — `?level=N`):**

- Спрайты врагов и взрыва — оригинальные, читаемые, разные по видам; **владелец
  утверждает вид** (задачи 2, 4, 9).
- Строй качается ровно, без подёргивания, разворачивается у границ.
- Дуга вылета выглядит как «отклеивание»; пикирование плавное; возврат в слот без
  рывка.
- Мигание неуязвимости заметно; переход уровня читается (пауза, новый строй).
- Сложность ощутимо растёт от уровня к уровню (владелец оценивает таблицу В1).

## Уточнения для реализации

Добавлено при сверке дизайна с описаниями задач 005–013 (после раунда 3). Решения
технические, геймдизайн и числа владельца (В1–В9) не меняются. Если правило ниже
расходится с текстом выше, действует правило ниже.

### Таблица `LEVELS` — точные строки

Таблица В1 задаёт ряды как «вид × число». Ширина раскладки — **10 столбцов** для всех
уровней: ряд из 8 врагов в 10 столбцах центрируется ровно (`.SSSSSSSS.`), а в 11 — нет
(3 пустые ячейки на две стороны). `FORMATION_MAX_COLS = 11` остаётся верхним пределом
формата. Группы `raider` стоят симметрично над рядом `striker`.

| Уровень | `layout`                                                       | `swaySpeed` | `diveSpeed` | `firstDiveDelayTicks` | `diveIntervalTicks` | `maxSorties` | `diverShots` | `raiderShots` |
| ------- | -------------------------------------------------------------- | ----------- | ----------- | --------------------- | ------------------- | ------------ | ------------ | ------------- |
| 1       | `'.SSSSSSSS.'`, `'DDDDDDDDDD'`, `'DDDDDDDDDD'`                 | 15          | 60          | 180                   | 180                 | 1            | 0            | 0             |
| 2       | `'.SSSSSSSS.'`, `'SSSSSSSSSS'`, `'DDDDDDDDDD'`, `'DDDDDDDDDD'` | 15          | 120         | 150                   | 150                 | 2            | 0            | 0             |
| 3       | как 2                                                          | 30          | 120         | 120                   | 120                 | 2            | 1            | 0             |
| 4       | `'..RR..RR..'`, `'.SSSSSSSS.'`, `'DDDDDDDDDD'`, `'DDDDDDDDDD'` | 30          | 120         | 120                   | 90                  | 3            | 2            | 2             |
| 5       | `'.RRR..RRR.'`, `'.SSSSSSSS.'`, `'DDDDDDDDDD'`, `'DDDDDDDDDD'` | 30          | 180         | 90                    | 60                  | 3            | 2            | 3             |

- «—» в столбце «выстрелов R» таблицы В1 — это `raiderShots = 0` (поле обязательное;
  правило таблицы «`raiderShots > 0`, если есть `R`» не нарушается).
- Уровень 4 по В1 — `R`, `S`×8, `D`×10 ×2 (ряда `S`×10, как на уровнях 2–3, нет) —
  переносится как есть; подстройка — владельцем через таблицу.

### Тестовые таблицы `test-levels.ts`

Пассивные значения полей, которые добавляют задачи 007–013 (общие для
`ONE_CORNER_ENEMY` и `TWO_LEVELS`): `swaySpeed = 15`, `diveSpeed = 60`,
`firstDiveDelayTicks = 1_000_000` (вылетов в тестах сцены/боя нет), `diveIntervalTicks
= 1_000_000`, `maxSorties = 1`, `diverShots = 0`, `raiderShots = 0`. Тест «для каждой
строки» проверяет только `LEVELS`, тестовые таблицы ему не подлежат.
`ONE_CORNER_ENEMY` создаётся в задаче 006 (его используют `battle.test.ts` и
`battle-render.test.ts` — тесты рендера сравнивают список вызовов целиком), тесты сцены
переходят на него в задаче 008; `TWO_LEVELS` — в задаче 008.

### Стартовые визуальные числа

Визуальные числа подбирает разработчик, утверждает владелец глазами; ниже — стартовые
значения и ограничения, чтобы задачи не ждали решения.

- **Взрыв:** `EXPLOSION_FRAMES` — 2 кадра, ширина нечётная, не больше `13 × 10`;
  `EXPLOSION_FRAME_TICKS = 8`, `EXPLOSION_TICKS = 16`. Кадр:
  `EXPLOSION_FRAMES[Math.floor(stateTicks / EXPLOSION_FRAME_TICKS)]` (`stateTicks` в
  `exploding` — `0 … EXPLOSION_TICKS - 1`; в тике `stateTicks === EXPLOSION_TICKS` враг
  уже `dead`). Для корабля в `down` — тот же кадр по `player.stateTicks`, пока
  `stateTicks < EXPLOSION_TICKS`. Инвариант (тест в `battle-render.test.ts`):
  `EXPLOSION_TICKS < DOWN_TICKS`.
- **Позиция взрыва:** кадр центрируется в прямоугольнике сущности:
  `Math.floor(x) + Math.floor((width - frame.width) / 2)`, аналогично по `y` (у корабля
  15 × 16 кадр меньше корабля — так и задумано).
- **Мигание неуязвимости:** `BLINK_TICKS = 4` (константа `battle-render.ts`); корабль
  рисуется, когда `Math.floor(player.stateTicks / BLINK_TICKS) % 2 === 0` (тик входа
  в `invulnerable` — видимый).
- **`ENEMY_SHOT_COLOR`:** не белый (`SHOT_COLOR`) и не цвет корпуса корабля; хорошо
  читается на чёрном и на звёздах. Конкретный цвет — разработчик.
- **`PEEL_SEGMENTS`:** ограничения — `ticks` целое ≥ 1, `vx`/`vy` целые px/тик, первый
  сегмент с `vy < 0` (вверх), последний — с `vy > 0` (вниз), `vx ≥ 0` для `side = +1`
  (наружу), `max vy ≤ 3` (держит инвариант туннелирования при спрайтах высотой ≥ 4).
  Стартовое предложение (`side = +1`): `[{ ticks: 4, vx: 1, vy: -1 }, { ticks: 4, vx: 1,
vy: 0 }, { ticks: 6, vx: 1, vy: 1 }]`.

### Точные правила

- **Центр по X** (прицеливание, `side`, выстрел): `centerX = x + Math.floor(width / 2)`
  — для корабля (`ship.x + 7`) и для врага. Порог «не дрожит над целью» — шаг
  `STEER_SPEED * dt` = 1 px: `|aimX - centerX| >= 1` → `vx = ±STEER_SPEED`, иначе `0`.
- **Тики фаз `diving`.** `startDive` в тике `N`; `P = Σ PEEL_SEGMENTS.ticks`; тики
  `N+1 … N+P` — `peel`; тик `N+P+1` — первый тик `descend`. Порядок внутри `update` в
  `descend`: (первый тик — взять цель `fixed`) → сдвиг по X и Y, зажим X → проверка
  ухода за низ (`→ returning`) → решение о выстреле по новой позиции.
- **Выстрел врага.** Тики выстрела — `D, D + 20, D + 40, …` (`D` — первый тик
  `descend`), пока `shotsLeft > 0`. Выстрел разрешён, если низ врага не ниже верха
  корабля: `y + height <= SHIP_Y`; иначе этот и последующие плановые выстрелы не
  делаются (враг в `descend` движется только вниз — откладывать нечего). `update`
  возвращает `true` и уменьшает `shotsLeft` — **независимо** от того, создаст ли `Wave`
  выстрел (лимит `MAX_ENEMY_SHOTS` — «выстрел пропал», В2). Позиция выстрела:
  `x = Math.floor(enemy.x) + Math.floor(enemy.width / 2)` (целый столбец под центром
  нарисованного спрайта; `ENEMY_SHOT_WIDTH = 1`), `y = enemy.y + enemy.height`.
- **`returning` — шаг.** `step = 1` px (`STEER_SPEED * dt` = `RETURN_SPEED * dt`).
  В каждом `update`: если `|slotX - x| <= step` и `slotY - y <= step` → `x = slotX`,
  `y = slotY`, переход в `formation` (`stateTicks = 0`, `sortieId = null`); иначе
  `y = Math.min(y + step, slotY)`, `x += clamp(slotX - x, -step, step)`. `slotX/slotY`
  — текущие (строй в этом тике уже сдвинут).
- **`side` одиночного врага в ряду и группы:** `side = 2 * col + 1 < cols ? -1 : 1`
  (центр ячейки левее середины строя — влево; ровно посередине — вправо). Для группы
  `raider` вместо `col` — средний столбец группы: `side = firstCol + lastCol + 1 < cols
? -1 : 1`, где `firstCol`/`lastCol` — крайние **живые** члены группы (как у одиночки:
  `side` по текущему положению). Если в ряду в `formation` ровно один враг — он один кандидат (без
  дублирования).
- **Лидер группы и `aimOffsetX`.** Лидер — самый внешний **живой** член группы в
  сторону `side` (для `side = -1` — с наименьшим `col`). `aimOffsetX = (member.col -
leader.col) * CELL_WIDTH`. У одиночных вылетов `aimOffsetX = 0`. Все члены группы
  получают один `sortieId`, один `side` и одинаковые `groupMinOffsetX` /
  `groupMaxOffsetX` — минимум и максимум `aimOffsetX` по живым членам вылета (лидер даёт
  0, поэтому `min ≤ 0 ≤ max`; одиночка — `0`/`0`).
- **Цель `fixed` группы (строй у края экрана).** В первом тике `descend`, если
  `targetX !== null`: `half = Math.floor(width / 2)`, `lo = half - groupMinOffsetX`,
  `hi = SCREEN_WIDTH - width + half - groupMaxOffsetX`, `anchor = clamp(targetX, lo,
hi)`, `fixedAimX = anchor + aimOffsetX`. Члены группы — один вид (одна ширина) и
  одинаковые поля группы, поэтому якорь у всех один и строй сдвигается целиком: у края
  к кораблю выходит крайний член группы, а не все разом. `lo ≤ hi`, т. к. размах группы
  (`≤ 2 * CELL_WIDTH + width`) много меньше экрана. Цели в пределах экрана, старт тоже,
  руление не перелетает цель — зажим X позиции в `descend` у группы не срабатывает
  (остаётся страховкой). У одиночки (`0`/`0`) `[lo, hi]` шире диапазона центра корабля
  (`[7, 248]`, спрайты врагов ≤ 13 < 15) — поведение 010 не меняется. `track` поля
  группы не использует. Зажим в `peel` при нынешних числах тоже не срабатывает: крайний
  столбец при `-SWAY_RANGE` — `x ≥ 25`, дуга уводит на 14 px.
- **Разворот покачивания.** `step = swaySpeed * dt`; `maxOffset = SWAY_RANGE +
Math.max(0, 1 - step)`, `minOffset = -SWAY_RANGE`. В `update`: `offset += dir * step`;
  если `offset >= maxOffset` → `offset = maxOffset`, `dir = -1`; иначе если `offset <=
minOffset` → `offset = minOffset`, `dir = 1`. Все числа — двоичные дроби, сравнения
  точные. Причина: рендер и коллизии берут `Math.floor`, пиксель `v` виден при `offset ∈
[v, v + 1)`; при границах `±16` правый край `+16` виден 1 тик (15 → 16 → 15), левый
  `-16` — 7 тиков (`floor(-15.25) = -16`), однокадровый «выскок» на 1 px. Сдвиг правой
  границы на `1 - step` делает отображение симметричным (`floor(1 - step - x) =
-floor(x)` на сетке шага): каждый край — последний пиксель перед выходом за `±16`.
  Числа для 15 px/с (`step = 1/4`, `maxOffset = 16.75`): `+16` (первый раз) — тик 64,
  `16.75` и разворот — тик 67 (тик 68 — `16.5`); `-16` и разворот — тик 198 (тик 199 —
  `-15.75`); снова `0` с `dir = 1` — тик 262. Период — **262 тика** (~4,37 с; было бы
  256). Видимые пиксели: каждый край `±16` — **7 тиков** подряд, каждое промежуточное
  положение — 4 тика за проход (8 за период); видимый размах — ровно `[-16, +16]`.
  Другие допустимые скорости: 1/8 px/тик — `maxOffset = 16.875`, края по 15 тиков,
  середина по 8, период 526; 1/2 — `16.5`, края по 3, середина по 2, период 130; целые
  px/тик — `maxOffset = SWAY_RANGE` (`floor` — тождество, правило совпадает с прежним).
  Отвергнуто: границы `±16` с разворотом «как есть» — дефект выше; `[-15.25, 16]`
  (края по 1 тику) — симметрично, но край мелькает одним кадром; `[-15.5, 16.25]` (по 3)
  — край короче середины; квантовать `offset` до целых — ломает ADR 003 и точную
  привязку `returning` к дробному слоту; менять `floor` в рендере — затрагивает
  рендер и коллизии всех сущностей. Правило «край = последний пиксель перед выходом»
  даёт краю почти ту же долю экранного времени за период, что и любому промежуточному
  положению (7 против 8), и описывается одной формулой для всех скоростей. API не
  меняется: `SWAY_RANGE = 16` — видимый размах, `maxOffset` — приватная деталь.
- **«Самый нижний»** при попадании выстрела игрока — наибольший `y + height`; при
  равенстве — меньший индекс в `wave.enemies`.
- **Коллизии на пиксельной сетке.** `overlaps` сравнивает `Math.floor(x)`,
  `Math.floor(y)` обоих прямоугольников (размеры целые): позиции врагов дробные из-за
  покачивания, и без `floor` попадание расходилось бы с картинкой на долю пикселя
  («рендер покажет ровно то, что проверялось»).

### Появление API по задачам

Поля и параметры добавляются той задачей, которая их использует: иначе `tsc`
(`noUnusedParameters`/`noUnusedLocals`) и линтер не пропустят. Итоговые сигнатуры —
в «Интерфейсы».

| Задача | Что появляется                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 005    | `Battle()` (только `player`, `update(dt, intent)`), `drawBattle`, `recorder()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 006    | `EnemyKind = 'drone' \| 'striker'`; `LevelConfig { layout }`; `Slot { row, col, kind }` (без `group`); `parseLayout` (`R` — неизвестный символ); `ENEMY_KINDS { sprite }`; `Formation(cols, rows)` (без `swaySpeed`, `SWAY_RANGE`); `Enemy` (`state: 'formation'`, `update()` без параметров — позиция из слота, `void`); `Wave(config, _rng)`, `Wave.update(_dt)` (вызывает `enemy.update()`); `Battle(rng, { levels })`; `PlayScene` создаёт `Battle` в конструкторе: сначала `Starfield` из `rng` (если не передан), потом seed боя; `ONE_CORNER_ENEMY` |
| 007    | `swaySpeed`, `isAllowedSpeed`, `Formation.update`, `offset`, `SWAY_RANGE`; `Wave.update(_dt)` → `update(dt)`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 008    | `exploding`/`dead`, `kill()`, `stateTicks`, `isAlive`, `EXPLOSION_*`; `Wave.isCleared`; `collisions.ts` (правило 1); `Player.removeShot`; фазы `Battle`, `startLevel`; `PlayScene(rng, starfield?, opts?)`, `TitleScene(rng, startLevel?)`; `parseStartLevel`; `TWO_LEVELS`                                                                                                                                                                                                                                                                                |
| 009    | `diving`/`returning`, `isOut`, `sortieId`, `startDive(order)`, `DiveOrder { sortieId, side }`, `EnemyEnv { diveSpeed }`, `PEEL_SEGMENTS`, `STEER_SPEED`, `RETURN_SPEED`; `selectSortie(enemies, cols, sortieId, rng)`, `AttackDirector`; поля `diveSpeed`, `firstDiveDelayTicks`, `diveIntervalTicks`, `maxSorties`; уровень 3; `Wave(config, _rng)` → `rng`; `Enemy.update(dt, env)` (`dt` — раньше, если его использует 008)                                                                                                                             |
| 010    | `Aim`, `ENEMY_KINDS[kind].aim`, `EnemyEnv.targetX`, `Wave.update(dt, targetX)`; `fixed` целится в центр корабля (без `aimOffsetX`)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 011    | `SHIP_START_X`, `ShipState`, `DOWN_TICKS`, `INVULNERABLE_TICKS`, `hit()`, `canBeHit`, `canBeTargeted`; правило 3 коллизий; `BLINK_TICKS`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 012    | `enemy-shot.ts`, `ENEMY_SHOT_COLOR`, `ENEMY_FIRE_INTERVAL_TICKS`, `DiveOrder.shots`, параметр `config` у `selectSortie`, поле `diverShots`; `MAX_ENEMY_SHOTS`, `Wave.shots`/`removeShot`/`clearShots`; правило 2 коллизий; `clearShots` при входе в `cleared`; `Enemy.update` возвращает `boolean` (до 012 — `void`)                                                                                                                                                                                                                                       |
| 013    | `'raider'` в `EnemyKind`, `R`, `Slot.group`, `RAIDER_SPRITE`, `ENEMY_KINDS.raider` (`fixed`), `DiveOrder.aimOffsetX`/`groupMinOffsetX`/`groupMaxOffsetX`, поле `raiderShots`; группы в `selectSortie`; уровни 4–5                                                                                                                                                                                                                                                                                                                                          |

## Альтернативы

- **Числа уровней кодом (`if (level >= 3) ...`).** Владелец просил таблицу. Таблица
  `LEVELS` проверяется тестом построчно и правится без логики. Принято — таблица.
- **Секунды и `timer -= dt` для таймеров.** Неточность суммы `1/60` (см. ADR 003).
  Отвергнуто — целые тики.
- **Скорость строя «1 px раз в N тиков» (счётчик).** Даёт и `1/3`, но вводит второй
  механизм движения рядом с `x += speed * dt`. Двоичных дробей (15/30/60 px/с) для
  покачивания хватает; если владельцу нужна тоньше градация — переход на счётчик
  локален в `Formation`. Отвергнуто пока.
- **Маршрут пикирования как кривая Безье / синусоида.** Красиво, но дробные шаги по
  обеим осям нарушают ADR 002 (подёргивание), а тесты маршрута становятся численными.
  Сегменты с целыми px/тик + наведение — проще и точны. Отвергнуто.
- **Вылет врагов из-за экрана в начале уровня (влёт строем, как в поздних играх жанра).**
  Эффектно, но это отдельная система маршрутов; в требованиях нет. Отвергнуто —
  владелец подтвердил: строй появляется сразу (В3).
- **Специальные враги как отдельная волна, прилетающая из-за края.** Возможное
  прочтение «вылетают несколькими группами»; требует влёта (см. выше). Отвергнуто —
  владелец подтвердил группы `raider` в верхнем ряду строя (В3).
- **Скорость вражеского выстрела 120/180 px/с с потолком `diveSpeed`.** Медленный
  выстрел легче увидеть, но потолок пикирования сковал бы рост сложности, а при
  `diveSpeed ≥` скорости выстрела он прячется под спрайтом. Отвергнуто — владелец выбрал
  240 px/с плюс инвариант «быстрее любого пикирования».
- **Переписать два теста сцены (увести корабль к краю) вместо внедряемой таблицы.**
  Дешевле на один шаг, но не решает зависимость `battle.test.ts` от чисел В1 и ломается
  снова при каждой новой механике (таран, выстрелы). Отвергнуто — `BattleOptions.levels`.
- **Двигать вражеский выстрел уже в тике появления** (порядок «враги → выстрелы»).
  Выстрел появлялся бы на 4 px ниже носа, а лимит считался бы до удаления ушедших —
  расхождение с выстрелом игрока в 001 без причины. Отвергнуто — порядок «выстрелы →
  враги».
- **Переход `returning` → `diving` (или удаление) при уходе за низ вместо зажима `y`.**
  Лечит симптом, а не причину; зажим по `slotY` плюс инвариант `swaySpeed <
STEER_SPEED` гарантируют сходимость. Отвергнуто.
- **`Formation` в `EnemyEnv` вместо конструктора.** Два источника одного объекта.
  Отвергнуто — только конструктор: строй живёт ровно столько же, сколько волна и враг.
- **Пропуск `update` в тике `startDive` флагом.** Враг отстал бы от слота на шаг
  покачивания. Отвергнуто — порядок «враги → директор».
- **Инвариант на сумму `vx` маршрута `peel` вместо зажима.** Ломается при каждой
  подстройке дуги и не учитывает будущие раскладки. Отвергнуто — зажим во всех фазах
  `diving`.
- **Валидировать «`R` только в верхнем ряду» в `parseLayout`.** Смешало бы формат с
  правилом геймдизайна. Отвергнуто — правило в тесте таблицы `LEVELS`.
- **Общий класс выстрела с направлением.** См. `EnemyShot`. Отвергнуто.
- **Коллизии внутри `Enemy`/`Player`.** Перекрёстные правила размазались бы по
  сущностям, порядок проверок — неявный. Отвергнуто — `collisions.ts`.
- **Перезапуск уровня при поражении игрока.** Сброс строя наказывает сильнее, чем
  нужно без системы жизней, и требует больше кода. Минимальная реакция —
  исчезновение, возрождение, неуязвимость. Отвергнуто (В5).
- **Ждать возвращения всех пикирующих перед возрождением (как в классике жанра).**
  Честнее, но нужен ещё один переход и связь `Player` ↔ `Wave`. Неуязвимость решает
  ту же проблему проще. Отвергнуто (можно добавить в фиче жизней).
- **Удалять мёртвых врагов из массива.** Порядок итерации менялся бы, усложняя
  детерминизм и тесты по индексам. Отвергнуто — состояние `dead`.
- **Анимация крыльев врагов (2 кадра в строю).** Приятно, но не требуется; формат
  `Sprite` и рендер позволяют добавить кадры позже без смены API. Отложено.
- **Общий `Rng` с фоном.** См. «Отдельный `Rng` для боя». Отвергнуто.
- **Отладочный выбор уровня через меню.** Меню — отдельная фича; `?level=N` только в
  dev-сборке — дешевле и не попадает в прод. Принято.
- **ECS / общий `Entity`.** Сущностей больше, но общего поведения у них по-прежнему
  только «прямоугольник» — его даёт структурный `Rect`. Отвергнуто.

## Решения владельца (раунд 2)

- **В1** — таблица уровней принята как стартовая (подстройка через `LEVELS`).
- **В2** — вражеские выстрелы: 1 × 4 px, свой цвет, не больше 4 на экране, интервал 20
  тиков — приняты; **скорость — 240 px/с** (как у выстрела игрока) с тестом «выстрел
  быстрее любого пикирования» для каждой строки таблицы.
- **В3** — вылетают крайние (фланговые) враги любого ряда; `raider` — в верхнем ряду
  строя, вылетают группой 2–3 и стреляют; строй появляется сразу, без влёта.
- **В4** — различия видов приняты: `drone` — в точку, где был корабль в начале пике;
  `striker` — преследует (1 px/тик); `raider` — группой в точку.
- **В5** — корабль исчезает на 1 с, затем появляется по центру и 2 с мигает (неуязвим,
  управляем); уровень не перезапускается.
- **В6** — при таране гибнут оба.
- **В7** — после конца таблицы повторяется последний уровень.
- **В8** — пауза 1,5 с без надписи — принято.
- **В9** — геометрия строя (16 × 12, до 11 столбцов, верх на y = 32, размах ±16) —
  принята.

## Открытые вопросы к владельцу

Открытых вопросов нет: В1–В9 закрыты (см. выше); замечания раунда 3 — технические и
решены без владельца. Остаётся приёмка глазами по ходу
задач — спрайты `drone`/`striker` (задача 2), взрыв (задача 4), дуга вылета и
пикирование (задачи 5–6), `raider` (задача 9), ощущение роста сложности (после задачи 9).

## Нарезка на задачи

Принята нарезка разработчика на 9 задач (раунд 2; в раунде 3 состав не менялся,
уточнены задачи 1, 2, 4, 5, 7, 8): крупные задачи 1 и 4 раунда 1
разрезаны — рефакторинг сцены отделён от появления врагов (регрессию корабля ловят
существующие тесты 001), прицеливание отделено от механики вылета. Слияния «1+2» и
«5+6» не делаем: каждая из 9 задач оставляет игру рабочей и проверяется отдельно, а
крупные задачи хуже ревьюятся.

Каждая задача оставляет игру рабочей, проходит `format:check`, `lint`, `typecheck`,
`test`, `build`, дописывает свои модули в `second-brain/architecture/overview.md`.
Поля `LevelConfig` добавляются той задачей, которой они нужны (это расширение, не
переделка); тест «для каждой строки `LEVELS`» и таблицы `test-levels.ts` расширяются
вместе с ними.

1. **Выделение `Battle` и `battle-render` (без изменения поведения).** `battle.ts`
   (только `Player`; `new Battle()` — без `rng`, без волны и без `BattleOptions`),
   `battle-render.ts` (корабль + выстрел — перенос из сцены), `PlayScene → battle`,
   правка `play-scene.test.ts` на `scene.battle.player`, `canvas-test-utils.ts`
   (`recorder()` из `sprite.test.ts`). Проверка: все тесты 001 зелёные,
   `battle-render.test.ts` на фейковом ctx (корабль и выстрел рисуются); глазами —
   ничего не изменилось.
2. **Статичный строй.** `enemy-art.ts` (`DRONE_SPRITE`, `STRIKER_SPRITE`), `levels.ts`
   (`EnemyKind`, `LevelConfig { layout }`, `parseLayout` без групп `R`, `LEVELS` с
   уровнем 1, `levelConfig(n, levels?)` с проверкой целого ≥ 1), `formation.ts`
   (геометрия, без покачивания), `enemy.ts` (только `formation`), `wave.ts`, отрисовка
   врагов, отдельный `Rng` боя (`Battle(rng, opts?)`, seed из `rng` сцены),
   `BattleOptions.levels` (пока нужен только `battle.test.ts`; третий аргумент
   `PlayScene` — в задаче 4), `test-levels.ts`. Проверка: `levels`, `formation`,
   `wave`, `battle-render`; глазами — строй двух видов наверху, корабль как раньше;
   **владелец утверждает спрайты** `drone`/`striker`.
3. **Покачивание строя + ADR 003.** ADR 003 (двоичные дроби, таймеры в тиках),
   `isAllowedSpeed`, `swaySpeed` в `LevelConfig`, `Formation.update` с разворотом.
   Проверка: `formation.test.ts`, валидация таблицы; глазами — строй качается ровно.
4. **Сбивание врагов и уровни.** `collisions.ts` (`overlaps`, «выстрел игрока × враг»,
   самый нижний), `Player.removeShot`, `Enemy.kill` → `exploding` → `dead`,
   `EXPLOSION_FRAMES`, `Wave.isCleared`, фазы `Battle` (`phaseTicks`,
   `LEVEL_PAUSE_TICKS`), `LEVELS` — уровни 1–2 (отличаются раскладкой; покачивание
   одинаковое — 15 px/с), `BattleOptions.startLevel` в `Battle`/`PlayScene`/
   `TitleScene` (здесь же `PlayScene(rng, starfield?, opts?)`), `?level=N` в dev
   `main.ts` через `parseStartLevel` в `levels.ts` (не целое ≥ 1 — уровень 1), `TWO_LEVELS` в `test-levels.ts` для теста
   перехода уровня. Тесты сцены переходят на `{ levels: ONE_CORNER_ENEMY }`. Проверка: `collisions`, `battle`,
   сквозной `play-scene` тест; глазами — враги взрываются, после последнего — пауза и
   новый строй; **владелец утверждает взрыв**.
5. **Пикирование: вылет и возврат.** `attack-director.ts` (кандидаты-крайние, таймеры,
   `maxSorties`), порядок «враги → директор» в `Wave.update`, `Enemy`: `diving`
   (`peel` с зажимом по X, `descend` прямо вниз), `returning` с зажимом `y` по `slotY`;
   `EnemyEnv { diveSpeed }` (строй — только через конструктор); экспорт
   `PEEL_SEGMENTS`; поля `diveSpeed`, `firstDiveDelayTicks`, `diveIntervalTicks`,
   `maxSorties`; уровни 1–3 по В1 (без стрельбы). Инварианты таблицы: `swaySpeed <
STEER_SPEED` и туннелирование «выстрел игрока × враг» по `maxDown`. Пикирующие проходят сквозь корабль. Проверка: `enemy`, `attack-director`,
   детерминизм `wave`; глазами — враги отклеиваются, пикируют, возвращаются,
   сбиваются в полёте; **владелец утверждает дугу**.
6. **Прицеливание `fixed`/`track`.** `ENEMY_KINDS[kind].aim`, `targetX` в `EnemyEnv`
   (пока всегда центр корабля — `canBeTargeted` появится в задаче 7), «не дрожит над
   целью», ветка `targetX === null` (тестируется прямой передачей `null`). Проверка:
   `enemy.test.ts`; глазами — `drone` летит в точку, `striker` преследует.
7. **Поражение игрока тараном.** `SHIP_START_X` в `ship.ts`, автомат корабля в `Player`
   (`down`/`invulnerable`, `hit`, возрождение, «Правило тиков переходов»), правило
   тарана в `collisions.ts`, `canBeTargeted` → `targetX = null` в `down`, рендер
   взрыва корабля и мигания. Проверка: `player` (два теста тика возрождения — `IDLE` и
   `move: 1` + огонь), `collisions`, `battle-render`; глазами
   — таран взрывает корабль и врага, корабль возвращается и мигает.
8. **Стрельба пикирующих.** `enemy-shot.ts` (240 px/с), `ENEMY_SHOT_COLOR`, расписание
   стрельбы в `Enemy`, `diverShots` в `LevelConfig`, `MAX_ENEMY_SHOTS` и создание
   выстрелов в `Wave` (порядок «полёт выстрелов → `enemy.update`»: новый выстрел в тике
   появления не движется), «вражеский выстрел × корабль», `clearShots` при `cleared`,
   инварианты туннелирования вражеского выстрела и `ENEMY_SHOT_SPEED > diveSpeed`. Проверка: `enemy-shot`,
   `enemy`, `wave`, `collisions`, `levels`; глазами — `?level=3`, выстрелы видны и
   отрываются от врага, попадание поражает корабль.
9. **Специальные враги.** `RAIDER_SPRITE`, вид `raider`, символ `R` и группы в
   `parseLayout`, вылет группой в `selectSortie` (`aimOffsetX`), `raiderShots`, уровни
   4–5 в `LEVELS`, правила таблицы «`R` только в верхнем ряду, группа 2–3»; обновление
   `game-design.md` решениями владельца. Проверка: `levels` (группы), `attack-director`
   (группа целиком); глазами — `?level=4`, группы вылетают вместе, держат строй и
   стреляют; **владелец утверждает спрайт**.

Зависимости — линейные (каждая следующая опирается на предыдущую); блокирующих
вопросов к владельцу нет.

## История

- **Раунд 1:** первый черновик по README фичи и ответам владельца (попадания в обе
  стороны, минимальная реакция на поражение, переход по уничтожению строя, рост
  сложности: скорость → стрельба → специальные группы, таблица уровней, оригинальные
  спрайты). Предложен ADR 003 (двоичные дробные скорости для строя, таймеры в тиках).
  Числа — по умолчанию, вынесены в В1–В9.
- **Раунд 2:** по `dev-review.md` (2 блокера, 10 рекомендаций — все приняты, см.
  `discussion.md`) и ответам владельца на В1–В9. Изменено: `ENEMY_SHOT_SPEED = 240` и
  инвариант «выстрел быстрее пикирования»; `BattleOptions` (`startLevel`, внедряемая
  таблица `levels`) и `test-levels.ts` для тестов; порядок `Wave.update` «враги →
  директор»; зажим X во всех фазах `diving`; `levelConfig` бросает на не целом;
  `EnemyKind` перенесён в `levels.ts`, граф импортов исправлен; `SHIP_START_X` в
  `ship.ts`; «Правило тиков переходов»; `fixed` без цели — прямо вниз весь `descend`;
  общий `recorder()`; `raider` — только верхний ряд, группы 2–3. Нарезка — 9 задач.
  Открытых вопросов нет.
- **Раунд 3:** по `dev-review-2.md` (блокеров нет, 7 рекомендаций — все приняты, см.
  `discussion.md`). Изменено: порядок `Wave.update` «строй → выстрелы → враги →
  директор» — вражеский выстрел в тике появления не движется (как в 001); в `returning`
  `y` зажат по `slotY`, инвариант `swaySpeed < STEER_SPEED`; `TWO_LEVELS` для теста
  перехода уровня; тест тика возрождения разделён на два; `Battle` в задаче 1 без `rng`,
  отдельный `Rng` боя — в задаче 2; `EnemyEnv` без `formation`; инвариант
  туннелирования по максимальной скорости врага вниз, `PEEL_SEGMENTS` экспортируется.
  Нарезка — те же 9 задач. Статус — согласовано.
- **Сверка с задачами 005–013 (после раунда 3):** добавлен раздел «Уточнения для
  реализации» — точные строки `LEVELS` (ширина 10, `raiderShots = 0` вместо «—»),
  пассивные поля тестовых таблиц, стартовые визуальные числа (`EXPLOSION_FRAME_TICKS = 8`,
  `EXPLOSION_TICKS = 16 < DOWN_TICKS`, `BLINK_TICKS = 4`, ограничения и стартовый
  `PEEL_SEGMENTS`), `ENEMY_FIRE_INTERVAL_TICKS = 20` в «Интерфейсы», формулы центра,
  тиков `peel`/`descend`, расписания выстрела и его позиции, шага `returning`, `side` и
  лидера группы, «самого нижнего»; коллизии по `Math.floor`-координатам; таблица
  появления API по задачам (`config` у `selectSortie` — с задачи 012, `aimOffsetX` — с
  013, `Slot.group` — с 013, иначе `noUnused*`). Поле приказа переименовано в тексте
  `shotsLeft` → `shots` (как в интерфейсе). Описания задач 006–013 поправлены. Вопросов к
  владельцу нет.
- **Реализация 006 (analyze):** по 4 техническим вопросам разработчика (см.
  `discussion.md`, «Реализация: задача 006-static-formation») — все решены без владельца.
  В «Появление API по задачам» уточнено: в 006 `Wave(config, _rng)`, `Wave.update(_dt)`,
  `Enemy.update()` без параметров, `Formation(cols, rows)` без `SWAY_RANGE`;
  переименования `_dt` → `dt` в 007, `_rng` → `rng` в 009; `Enemy.update` возвращает
  `boolean` с 012. Зафиксирован порядок потребления `rng` в `PlayScene` (звёзды, потом
  seed боя). Итоговые сигнатуры в «Интерфейсы» не менялись.
- **Реализация 007 (analyze):** по 2 вопросам разработчика (см. `discussion.md`,
  «Реализация: задача 007-formation-sway») — оба решены без владельца. Правило
  разворота покачивания сделано симметричным по видимым пикселям: границы
  `[-SWAY_RANGE, SWAY_RANGE + max(0, 1 - step)]` (для 15 px/с — `[-16, 16.75]`, края по
  7 тиков, период 262 тика) — новый пункт «Разворот покачивания» в «Точных правилах»,
  поправлены «Formation» и `formation.test.ts` в «Тестировании». Видимый размах ±16 px
  и скорость 15 px/с (В1, В9) не менялись. ADR 002 получает строку «расширено ADR 003».
  Сигнатуры в «Интерфейсы» не менялись.
- **Правка документа (замечания разработчика, после 007):** комментарий к
  `ONE_CORNER_ENEMY` в «Интерфейсах» сверен с кодом — враг стоит на x = 42
  (`baseX + floor((CELL_WIDTH - width) / 2)`), затем `42 + formation.offset`; было
  «x ≈ 41». В графе импортов у `battle-render` уточнены импорты из `enemy`: для выбора
  кадра взрыва нужны `EXPLOSION_FRAMES` и `EXPLOSION_FRAME_TICKS` (формула кадра — в
  «Стартовые визуальные числа»), `EXPLOSION_TICKS` — для окна взрыва корабля. Поведение
  и сигнатуры не менялись.
- **Реализация 008 (plan):** разбор `?level=N` вынесен из `main.ts` в чистую функцию
  `parseStartLevel(value: string | null): number` в `levels.ts` (только десятичные
  цифры, безопасное целое ≥ 1, иначе 1; не бросает) с тестами в `levels.test.ts`;
  `main.ts` только читает параметр URL и передаёт результат в `TitleScene` (см.
  `discussion.md`, «Реализация: задача 008-enemy-hits-levels»). Поправлены «Модули и
  файлы», граф импортов (`main → levels`), «Интерфейсы», «Тестирование», нарезка
  (задача 4). Поведение для игрока не менялось.
- **Реализация 013 (analyze):** по вопросам разработчика (см. `discussion.md`,
  «Реализация: задача 013-raiders»). Зажим X по каждому члену сжимал группу у края
  экрана — в `DiveOrder` добавлены `groupMinOffsetX`/`groupMaxOffsetX`, цель `fixed`
  берётся от якоря, зажатого по размаху группы (новый пункт «Цель `fixed` группы» в
  «Точных правилах»; поправлены «Enemy», «AttackDirector», «Интерфейсы»,
  «Тестирование», «Появление API по задачам»). Уточнено: `side` группы — по живым
  членам; порядок кандидатов внутри ряда — по левому столбцу. Числа и поведение
  одиночек не менялись; вопросов к владельцу нет.

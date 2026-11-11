# Дизайн: Корабль игрока — движение и выстрел

**Статус:** согласовано · **Раунд:** 2

## Цель и сценарии

Первый играбельный экран. С титульного экрана игрок по Enter попадает в игровую сцену:
тот же звёздный фон, внизу его корабль. Корабль ездит влево-вправо и стреляет вверх,
на экране одновременно не больше одного своего выстрела.

**Ключевые сценарии**

1. Титул → Enter → игровая сцена. Корабль стоит по центру внизу, выстрела нет.
2. Зажата «влево» (← / A) или «вправо» (→ / D) — корабль едет с постоянной скоростью
   120 px/с (2 px/тик). Отпустил — сразу встал (без инерции).
3. Нажат «огонь» (Space / Z), своего выстрела на экране нет — из носа корабля вылетает
   выстрел и летит вверх с постоянной скоростью 240 px/с (4 px/тик).
4. Выстрел полностью ушёл за верх экрана — он исчезает, можно стрелять снова.

**Крайние случаи**

- Корабль у края: дальше не едет, позиция зажата в `[0, SCREEN_WIDTH - SHIP_WIDTH]`
  (`[0, 241]`). Позиция не «прилипает» за краем: шаг, который вывел бы за край,
  обрезается до края.
- Зажаты обе стороны сразу — корабль стоит (`move = 0`).
- «Огонь», пока свой выстрел ещё летит, — игнорируется. Нажатие **не запоминается**
  (нет буфера): после исчезновения выстрела нужно нажать снова. Удержание кнопки
  **не стреляет повторно** — каждый выстрел требует нового нажатия (решение владельца
  В5, автоогня нет).
- Выстрел исчез и в этом же тике нажат «огонь» — новый выстрел вылетает в этом же тике
  (порядок в «Поток тика»: сначала обновляется старый выстрел, потом обработка огня).
- Выстрел после вылета **не следует** за кораблём: его `x` фиксирован.
- Потеря фокуса окна: `Input` уже сбрасывает зажатые клавиши на `blur` — корабль
  останавливается. Пауза — вне рамок.
- Долгая пауза вкладки: `accumulate()` ограничивает число тиков за кадр — без
  телепортации корабля сквозь край (зажим и так это гарантирует).
- Возврата из игры на титул нет — вне рамок (появится с Game Over).

## Модули и файлы

| Файл                                    | Ответственность                                                                                                     | Статус     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/game/scenes/title-scene.ts`        | по `input.pressed('start')` возвращает `new PlayScene(...)`; хранит `rng` и передаёт дальше (детали — «Интерфейсы») | изменяемый |
| `src/game/scenes/title-scene.test.ts`   | переход в `PlayScene` по Enter, без Enter — остаётся                                                                | новый      |
| `src/game/scenes/scene-test-utils.ts`   | тестовый хелпер `step()` — повторяет цикл `main.ts` (`update` → смена сцены → `endTick`)                            | новый      |
| `src/game/scenes/play-scene.ts`         | игровая сцена: звёздный фон + `Player`; читает `Input` → `PlayerIntent`; рисует всё                                 | новый      |
| `src/game/scenes/play-scene.test.ts`    | сквозной тест сцены через `Input.press()` и `step()` (без canvas)                                                   | новый      |
| `src/game/player.ts`                    | `Player` — агрегат «корабль + его единственный выстрел», правило «не больше одного выстрела»; `readIntent(input)`   | новый      |
| `src/game/player.test.ts`               | правило одного выстрела, порядок тика, повторный выстрел                                                            | новый      |
| `src/game/ship.ts`                      | `Ship` — позиция, движение с зажимом в границы, точка вылета выстрела; константы корабля                            | новый      |
| `src/game/ship.test.ts`                 | движение, зажим у краёв, обе стороны, точка вылета, инварианты констант                                             | новый      |
| `src/game/shot.ts`                      | `Shot` — позиция, полёт вверх, признак «ушёл за экран»; константы выстрела                                          | новый      |
| `src/game/shot.test.ts`                 | полёт, момент исчезновения, инвариант скорости                                                                      | новый      |
| `src/game/sprite.ts`                    | формат спрайта (строки + палитра), `parseSprite()` (чистая), `drawSprite(ctx, ...)`                                 | новый      |
| `src/game/sprite.test.ts`               | разбор, размеры, прозрачность, ошибки формата; `drawSprite` на фейковом ctx                                         | новый      |
| `src/game/art.ts`                       | данные пиксель-арта игры: `SHIP_SPRITE`, `SHOT_COLOR`                                                               | новый      |
| `src/main.ts`                           | не меняется: первая сцена по-прежнему `TitleScene`                                                                  | —          |
| `src/engine/*`                          | не меняется: всего нужного (`Input`, `Scene`, `Rng`) хватает                                                        | —          |
| `second-brain/architecture/overview.md` | каждая задача дописывает свои модули                                                                                | изменяемый |

Почему `Ship`/`Shot`/`Player` — без `ctx`: вся логика фичи тестируется в Vitest
(environment `node`) без canvas; рисование собрано в `PlayScene.render()` и `sprite.ts`.

Почему данные арта — `art.ts`, а не `sprites.ts`: рядом с `sprite.ts` (формат) имя
`sprites.ts` легко перепутать в импорте и автодополнении. Отдельную папку
`src/game/sprites/` не заводим — два файла папки не требуют; когда арта станет много
(враги), разнести — механическое переименование.

Граф импортов (без циклов): `title-scene → play-scene → player → ship → {art, shot}`,
`art → sprite`; `Input` в `player.ts` — через `import type`. `engine` ничего не знает
о `game`.

## Сущности и состояния

**Система координат.** Логические пиксели, `(0,0)` — левый верхний угол экрана, `y`
растёт вниз. Позиция сущности — **левый верхний угол** её прямоугольника (как у
спрайта). Координаты — `number`, при отрисовке — `Math.floor` (как в `Starfield`).

**Правило скоростей.** Скорости сущностей со спрайтом с чёткими краями (корабль,
выстрел; дальше — враги) выбираются так, чтобы `SPEED * TICK_SECONDS` было **целым**
числом px/тик. Дробный шаг (например, 1,5 px/тик) после `Math.floor` даёт видимое
чередование сдвига 1-2-1-2 px — «подёргивание» спрайта. Механизм движения не меняется
(`x += speed * dt`, конвенция «время через `dt`»), правило ограничивает только выбор
чисел. В double `120 * (1/60) === 2` и `240 * (1/60) === 4` ровно, старт и края
зажима — целые, поэтому координаты корабля и выстрела в этой фиче всегда целые.
Правило закреплено тестами (см. «Тестирование»). Звёзд не касается: точка при дробном
шаге не дёргается.

**Ship**

- Константы: `SHIP_SPEED = 120` (px/с, 2 px/тик), `SHIP_Y = 208` (верх корабля; низ —
  на 224, ниже 16 px свободно под будущие иконки жизней), `SHIP_WIDTH × SHIP_HEIGHT =
15 × 16` — выводятся из `SHIP_SPRITE`.
- Данные: `x` (меняется), `y` (константа `SHIP_Y`).
- Старт: `x = Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2)` = 120.
- Движение: `x += move * SHIP_SPEED * dt`, затем зажим в `[0, SCREEN_WIDTH - SHIP_WIDTH]`.
  От края до края ≈ 2 с.
- Точка вылета: `muzzleX = x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2)`
  (= `x + 7`), `muzzleY = y - SHOT_HEIGHT` (= 204; низ выстрела касается верха
  корабля). Нечётная ширина 15 даёт центральный столбец под «нос».
- Автомата нет: в этой фиче корабль всегда «активен». Состояния `exploding`/`respawning`
  появятся в фиче про смерть и жизни — тогда `Ship` получит поле `state`; текущий API
  этому не мешает.

**Shot**

- Константы: `SHOT_SPEED = 240` (px/с, 4 px/тик), `SHOT_WIDTH × SHOT_HEIGHT = 1 × 4`,
  цвет `SHOT_COLOR` — белый (`'#ffffff'`, в `art.ts`).
- Данные: `x` (константа после вылета), `y`.
- Полёт: `y -= SHOT_SPEED * dt`. От вылета (`y = 204`) до исчезновения — 52 тика
  (≈ 0,87 с); это и есть минимальный интервал между выстрелами при правиле «один
  выстрел».
- `isOffscreen`: `y + SHOT_HEIGHT <= 0` — выстрел целиком выше экрана.

**Player — автомат выстрела** (состояние кодируется `shot: Shot | null`):

```
          fire && shot === null
  Ready ───────────────────────────▶ InFlight
    ▲                                    │
    └──────── shot.isOffscreen ──────────┘
```

- `Ready` (`shot === null`): «огонь» → создаётся `Shot` в точке вылета.
- `InFlight` (`shot !== null`): «огонь» игнорируется; выстрел летит; как только
  `isOffscreen` — `shot = null`.
- Будущий переход `InFlight → Ready` по попаданию во врага добавит фича коллизий
  (метод `Player.removeShot()` — не сейчас, см. «Альтернативы»).

**PlayerIntent** — что игрок хочет сделать в этом тике, без привязки к клавиатуре:
`{ move: -1 | 0 | 1; fire: boolean }`. Получается из `Input` функцией `readIntent()`:
`move = (right ? 1 : 0) - (left ? 1 : 0)` по `isDown`, `fire = input.pressed('fire')`
(edge: только тик нажатия — решение владельца В5).

**Сцены**

```
TitleScene ── pressed('start') ──▶ PlayScene
```

`TitleScene` передаёт в `PlayScene` свой `rng` и свой экземпляр `Starfield` — звёзды
продолжают двигаться без скачка при смене сцены.

## Поток тика

`main.ts` не меняется: `scene.update(dt, input)` → смена сцены, если вернулась →
`input.endTick()`; `render()` раз в кадр.

**`TitleScene.update(dt, input): Scene | void`** — как сейчас (`ticks++`,
`starfield.update(dt)`) + в конце: `if (input.pressed('start')) return new
PlayScene(this.rng, this.starfield)`. Первый тик `PlayScene` — следующий тик;
`endTick()` после смены гасит `pressed('start')`.

**`PlayScene.update(dt, input)`**

1. `starfield.update(dt)`
2. `intent = readIntent(input)`
3. `player.update(dt, intent)`:
   1. `ship.update(dt, intent.move)` — движение + зажим;
   2. если есть `shot`: `shot.update(dt)`; если `shot.isOffscreen` → `shot = null`;
   3. если `intent.fire && shot === null` → `shot = ship.spawnShot()`
      (из уже сдвинутой позиции корабля; в тике вылета выстрел не двигается).

Почему такой порядок: (2) раньше (3) — выстрел, исчезнувший в этом тике, сразу
освобождает слот, задержки в лишний тик нет; (1) раньше (3) — выстрел вылетает из
актуального положения носа.

**`PlayScene.render(ctx)`** (порядок слоёв снизу вверх)

1. Чёрная заливка экрана.
2. `starfield.render(ctx)`.
3. Выстрел (если есть): `fillRect` цветом `SHOT_COLOR`.
4. Корабль: `drawSprite(ctx, SHIP_SPRITE, floor(ship.x), floor(ship.y))`.

Выстрел под кораблём — в тике вылета он касается корабля и не должен его перекрывать.

## Интерфейсы

```ts
// src/game/sprite.ts
/** Row-major pixel colors; null = transparent. */
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly (string | null)[];
}
/** rows: equal-length strings; '.' = transparent, other chars are keys of palette. Throws on bad input. */
export function parseSprite(rows: readonly string[], palette: Readonly<Record<string, string>>): Sprite;
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number): void;

// src/game/art.ts
export const SHIP_SPRITE: Sprite;  // 15×16, 2–3 colors, original silhouette
export const SHOT_COLOR: string;   // '#ffffff'

// src/game/ship.ts
export const SHIP_WIDTH: number;   // = SHIP_SPRITE.width (15)
export const SHIP_HEIGHT: number;  // = SHIP_SPRITE.height (16)
export const SHIP_Y = 208;
export const SHIP_SPEED = 120;     // px/s, 2 px/tick
export type MoveDir = -1 | 0 | 1;
export class Ship {
  x: number;
  readonly y: number;
  constructor(x?: number); // default: centered
  update(dt: number, move: MoveDir): void;
  spawnShot(): Shot;
}

// src/game/shot.ts
export const SHOT_WIDTH = 1;
export const SHOT_HEIGHT = 4;
export const SHOT_SPEED = 240;     // px/s, 4 px/tick
export class Shot {
  constructor(public readonly x: number, public y: number);
  update(dt: number): void;
  get isOffscreen(): boolean;
}

// src/game/player.ts
export interface PlayerIntent {
  move: MoveDir;
  fire: boolean;
}
export function readIntent(input: Input): PlayerIntent;
export class Player {
  readonly ship: Ship;
  get shot(): Shot | null;
  constructor(ship?: Ship);
  update(dt: number, intent: PlayerIntent): void;
}

// src/game/scenes/play-scene.ts
export class PlayScene implements Scene {
  readonly player: Player; // exposed for tests
  constructor(rng: Rng, starfield?: Starfield);
  update(dt: number, input: Input): void;
  render(ctx: CanvasRenderingContext2D): void;
}

// src/game/scenes/title-scene.ts — changes only
export class TitleScene implements Scene {
  constructor(private readonly rng: Rng);          // was: constructor(rng: Rng), rng not kept
  update(dt: number, input: Input): Scene | void;  // was: (dt, _input): void
  // starfield stays `private readonly`, handed over to PlayScene
}

// src/game/scenes/scene-test-utils.ts (test-only, not matched by *.test.ts)
/** Runs n ticks exactly like main.ts: update → switch scene if returned → input.endTick(). Returns the current scene. */
export function step(scene: Scene, input: Input, n?: number): Scene; // n defaults to 1
```

Размеры корабля выводятся из спрайта (`SHIP_WIDTH = SHIP_SPRITE.width`), а не задаются
отдельно, — чтобы хитбокс и картинка не разъехались при перерисовке спрайта.

Константы лежат в модулях своих сущностей (не в `src/config.ts`): `config.ts` —
глобальное (экран, тики), а это тюнинг конкретной сущности.

`step()` — отдельный модуль, а не функция внутри `play-scene.test.ts`: импорт из одного
тест-файла в другой заставил бы Vitest выполнить тесты повторно.

## Тестирование

**Unit-тесты (Vitest, без canvas):**

- `sprite.test.ts`:
  - `parseSprite`: размеры по строкам; `.` → `null`; символ → цвет из палитры; ошибка
    на строках разной длины, пустом массиве и символе вне палитры.
  - `drawSprite` на фейковом ctx (объект, записывающий `fillStyle` на момент каждого
    `fillRect`, `as unknown as CanvasRenderingContext2D`): прозрачные пиксели не
    рисуются; число `fillRect` = числу непрозрачных пикселей; смещение `x/y`
    применяется; на несимметричном спрайте (например, 2×3) пиксель `(col, row)` рисуется
    в `(x + col, y + row)` своим цветом — защита от перепутанных строк/столбцов.
- `ship.test.ts`:
  - инварианты: `SHIP_WIDTH === SHIP_SPRITE.width`, ширина нечётная (нос по центру);
    `Number.isInteger(SHIP_SPEED * TICK_SECONDS)` (правило скоростей);
  - старт по центру; `move=1` за 1 тик сдвигает на `SHIP_SPEED * TICK_SECONDS`;
    `move=0` — стоит;
  - зажим: `new Ship(1)` + `move=-1` → ровно `0`; `new Ship(SCREEN_WIDTH - SHIP_WIDTH - 1)`
    - `move=1` → ровно `SCREEN_WIDTH - SHIP_WIDTH` (прямая установка позиции, `toBe`);
  - `spawnShot()` — выстрел по центру носа, низ выстрела на верхе корабля.
- `shot.test.ts`:
  - инвариант `Number.isInteger(SHOT_SPEED * TICK_SECONDS)`;
  - летит вверх на `SHOT_SPEED * TICK_SECONDS` за тик, `x` не меняется;
  - граница — прямой установкой: `new Shot(x, -SHOT_HEIGHT).isOffscreen === true`,
    `new Shot(x, -SHOT_HEIGHT + 1).isOffscreen === false`.
- `player.test.ts`:
  - fire без выстрела → выстрел есть; fire при летящем → тот же объект, второго нет;
  - «уход за экран» — прямой установкой: `player.shot.y` ставится так, чтобы один тик
    выводил выстрел целиком за верх (например, `-SHOT_HEIGHT + 1`), затем один `update`:
    без fire → `shot === null`; с `fire: true` → новый выстрел в этом же тике из носа;
  - выстрел не следует за кораблём;
  - `readIntent`: обе стороны → `move=0`; fire — только в тике нажатия (через
    `Input.press`/`endTick`), при удержании в следующем тике — `false`.
- `title-scene.test.ts` (через `step()`): без `start` — `step(title, input)` возвращает
  тот же `title`; после `input.press('start')` — экземпляр `PlayScene`.
- `play-scene.test.ts` (через `step()`): зажать «вправо» N тиков — корабль сдвинулся на
  `N * SHIP_SPEED * TICK_SECONDS`; нажать огонь — `player.shot` появился; огонь
  удерживается — второго выстрела нет и после ухода первого за экран новый не
  появляется без нового нажатия.

Числа в тестах — через экспортируемые константы, а не магические значения. Шаги
целые (правило скоростей), поэтому сравнения позиций — `toBe`.

Тесты сцен вызывают `update` только через `step()` — иначе `pressed()` не гасится
`endTick()` и «огонь» срабатывал бы каждый тик, а проверка «второго выстрела нет»
проходила/падала бы не по той причине.

**Глазами (`npm run dev`):**

- Enter на титуле → игровая сцена, звёзды не прыгают при переходе.
- Корабль чёткий (без размытия), выглядит оригинально и в 8-битном стиле; владелец
  утверждает вид (В7).
- Корабль едет ровно, без подёргивания; у краёв упирается ровно в край, не дрожит.
- Нельзя выпустить второй выстрел, пока летит первый; удержание «огня» не стреляет
  очередью.

## Альтернативы

- **Логика выстрела прямо в `PlayScene`, без `Player`.** Меньше на один класс, но
  правило «один выстрел» и порядок тика пришлось бы тестировать через сцену и `Input`;
  а следующие фичи (коллизии, смерть) добавят в сцену врагов — сцена разрастётся.
  `Player` держит всё «игроцкое» в одном месте. Отвергнуто.
- **`Ship` и `Shot` без отдельного `Player` (выстрел внутри `Ship`).** Выстрел живёт
  дольше корабля (корабль взорвался — выстрел долетает) — смешивать их жизненные
  циклы в одном объекте неудобно. Отвергнуто.
- **Передавать `Input` прямо в `Player.update`.** Работает, но привязывает логику к
  клавиатуре; `PlayerIntent` позволяет тестировать тривиальными объектами и пригодится
  для демо-режима/повторов. Цена — одна маленькая функция `readIntent`. Принято
  `PlayerIntent`.
- **Массив выстрелов с лимитом 1.** Универсальнее, но лимит «один» — сущностное
  правило жанра; `Shot | null` делает недопустимое состояние непредставимым.
  Отвергнуто (вражеские выстрелы — другая сущность в другой фиче).
- **Спрайт картинкой (PNG) или предрендер в offscreen-canvas.** PNG требует загрузки
  ассетов и асинхронного старта; кэш в offscreen-canvas — оптимизация без нужды
  (≈240 `fillRect` за кадр — ничто). Строки-пиксели в коде проще править и
  тестировать. Если врагов станет много и это станет узким местом — кэш внутри
  `drawSprite` без смены API.
- **Позиция по центру сущности.** Удобно для «носа», но всё рисование и будущие AABB-
  коллизии естественнее от левого верхнего угла. Отвергнуто; центр считается в
  `spawnShot()`.
- **Новый `Starfield` в `PlayScene`.** Проще на один параметр, но при переходе звёзды
  «перещёлкнутся» на новую раскладку. Отвергнуто: передаём экземпляр (параметр
  необязательный — для тестов).
- **Скорость в целых px/тик как механизм (`x += SHIP_STEP` без `dt`).** Ближе к NES, но
  жёстко связывает скорость с частотой тика и нарушает конвенцию «время только через
  `dt`». Отвергнуто. Ту же гладкость даёт «Правило скоростей»: механизм через `dt`,
  числа кратны 1 px/тик.
- **Дробная скорость с принятым подёргиванием (например, 90 px/с).** Владелец выбрал
  кратную скорость. Отвергнуто.
- **Субпиксельное сглаживание (округление вместо `floor`, интерполяция между тиками).**
  Не убирает чередование 1-2 при дробном шаге, а интерполяция усложняет цикл ради
  проблемы, которую снимает выбор чисел. Отвергнуто.
- **Данные арта в папке `src/game/sprites/`.** Решает путаницу имён так же, как
  `art.ts`, но вводит структуру ради двух файлов. Отвергнуто до появления арта врагов.
- **Хелпер `step()` внутри `play-scene.test.ts`.** Импорт из тест-файла повторно
  выполняет его тесты. Отвергнуто: отдельный модуль `scene-test-utils.ts`.
- **Общий `Entity`/ECS.** Две сущности без общего поведения — абстракция преждевременна.

## Открытые вопросы к владельцу

нет

## Нарезка на задачи

Каждая задача оставляет игру рабочей, проходит `format:check`, `lint`, `typecheck`,
`test`, `build` и дописывает свои модули в `second-brain/architecture/overview.md`.

1. **Игровая сцена и переход с титула.** `PlayScene` (звёзды, пока без корабля);
   изменения `TitleScene` (`private readonly rng`, `input` вместо `_input`, возврат
   `Scene | void`, по Enter — `new PlayScene(this.rng, this.starfield)`);
   `scene-test-utils.ts` со `step()`. Проверка: `title-scene.test.ts` через `step()`;
   глазами — Enter переводит на экран со звёздами без надписей, звёзды не прыгают.
   `overview.md`: `PlayScene`, переход сцен.
2. **Спрайты и корабль на месте.** `sprite.ts` (+тесты, включая `drawSprite` на
   фейковом ctx), `art.ts` с `SHIP_SPRITE` 15×16 (свой силуэт, 2–3 цвета), `Ship` без
   движения (старт по центру, `SHIP_Y = 208`), отрисовка в `PlayScene`. Проверка:
   `sprite.test.ts`, инварианты размеров в `ship.test.ts`; глазами — корабль по центру
   внизу, чёткий; **владелец утверждает вид корабля** (В7). `overview.md`: `sprite.ts`,
   `art.ts`, `Ship`.
3. **Движение корабля.** `Ship.update` с зажимом (`SHIP_SPEED = 120`), `MoveDir`,
   `PlayerIntent`/`readIntent`, `Player` (пока только корабль), подключение в
   `PlayScene`. Проверка: `ship.test.ts` (движение, зажим прямой установкой, инвариант
   скорости), `readIntent`-тесты, `play-scene.test.ts` (движение через `step()`);
   глазами — ездит ровно, без подёргивания, упирается в края. `overview.md`: `Player`,
   `PlayerIntent`, правило скоростей.
4. **Выстрел.** `Shot` (`1×4`, `SHOT_SPEED = 240`), `SHOT_COLOR` в `art.ts`,
   `Ship.spawnShot`, автомат выстрела в `Player` (огонь только по нажатию), отрисовка.
   Проверка: `shot.test.ts` и `player.test.ts` (границы — прямой установкой
   координат), `play-scene.test.ts` (огонь, удержание без очереди); глазами — один
   выстрел за раз, после ухода за верх — снова можно. `overview.md`: `Shot`, автомат
   выстрела.

## История

- **Раунд 1:** первый черновик архитектуры по README фичи. Ответов владельца нет;
  числа предложены по умолчанию и вынесены в вопросы В1–В7.
- **Раунд 2:** ответ на `dev-review.md` (0 блокеров, 7 рекомендаций — все приняты, см.
  `discussion.md`). Внесены решения владельца В1–В7: корабль 120 px/с, `y = 208`,
  спрайт 15×16 (вид — на усмотрение разработчика, утверждение в задаче 2); выстрел
  240 px/с, 1×4, белый; огонь только по нажатию. Добавлено «Правило скоростей» (кратно
  1 px/тик, закреплено тестами); данные арта переименованы в `art.ts`; добавлен
  тестовый хелпер `step()`; явно описаны изменения `TitleScene`; тест `drawSprite` на
  фейковом ctx; граничные тесты — прямой установкой координат; `overview.md`
  обновляется в каждой задаче. Открытых вопросов нет.

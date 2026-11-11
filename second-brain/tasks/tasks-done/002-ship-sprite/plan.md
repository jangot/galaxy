# План реализации: Спрайты и корабль на месте

Вторая задача фичи 001 «Корабль игрока» (пункт 2 нарезки `design.md`). Добавляем модуль
спрайтов (строки пикселей + палитра, `parseSprite`/`drawSprite`), данные арта с
оригинальным `SHIP_SPRITE` 15×16 и неподвижный `Ship` по центру внизу (`SHIP_Y = 208`),
который `PlayScene` рисует поверх звёзд. Движения, ввода и выстрела в задаче нет (003, 004).

## Решения по мелким вопросам из analyze.md (в рамке design.md)

- **Имя поля корабля в `PlayScene`** — `readonly ship: Ship` (публичное, «exposed for
  tests»). В задаче 003 его заменит `readonly player: Player`; правка механическая.
- **Ошибки формата `parseSprite`** — бросает `Error`, если: массив строк пуст; первая
  строка пустая (нулевая ширина); строки разной длины; в палитре есть ключ `.` (`.`
  всегда прозрачный, неоднозначность запрещаем); символ строки отсутствует в палитре.
  Сообщения содержат номер строки/символ — для быстрой диагностики при правке арта.
- **`Math.floor`** — только в вызывающем коде (`PlayScene.render`), как в дизайне
  («Поток тика» → render, п. 4). `drawSprite` рисует в `x + col, y + row` как есть;
  контракт — «целые координаты» в JSDoc. Тест смещения — на целых `x/y`.
- **`fillStyle`** — присваивается только при смене цвета (мелкая бесплатная оптимизация;
  тест на фейковом ctx записывает `fillStyle` на момент `fillRect`, поэтому с ней
  совместим).
- **Стартовая X** — default-параметр конструктора `Ship`, выражение
  `Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2)`; отдельной экспортируемой константы
  не вводим (в интерфейсах дизайна её нет), тест считает ту же формулу из констант.

## 1. Модуль спрайтов

**Файл (создать):** `src/game/sprite.ts`

Без импортов из игровых модулей. `CanvasRenderingContext2D` — только как тип в сигнатуре
(глобальный DOM-тип из `lib`, в рантайме не нужен); в теле — только `fillStyle` и `fillRect`.

```typescript
/** Row-major pixel colors; null = transparent. Pixel (col, row) is pixels[row * width + col]. */
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly (string | null)[];
}

const TRANSPARENT = '.';

/**
 * Builds a sprite from text rows.
 * rows: equal-length strings; '.' = transparent, any other char is a key of palette.
 * Throws on bad input (no rows, zero width, ragged rows, '.' in palette, unknown char).
 */
export function parseSprite(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): Sprite {
  const first = rows[0];
  if (first === undefined) throw new Error('Sprite has no rows');
  const width = first.length;
  if (width === 0) throw new Error('Sprite has zero width');
  if (Object.hasOwn(palette, TRANSPARENT)) {
    throw new Error(`Palette must not define '${TRANSPARENT}' (it is always transparent)`);
  }

  const pixels: (string | null)[] = [];
  rows.forEach((row, r) => {
    if (row.length !== width) {
      throw new Error(`Sprite row ${r} has length ${row.length}, expected ${width}`);
    }
    for (const ch of row) {
      if (ch === TRANSPARENT) {
        pixels.push(null);
        continue;
      }
      const color = Object.hasOwn(palette, ch) ? palette[ch] : undefined;
      if (color === undefined) throw new Error(`Unknown sprite char '${ch}' in row ${r}`);
      pixels.push(color);
    }
  });
  return { width, height: rows.length, pixels };
}

/** Draws the sprite with its top-left corner at (x, y), one 1×1 fillRect per opaque pixel. Expects integer x/y. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
): void {
  let current: string | null = null;
  for (let row = 0; row < sprite.height; row++) {
    for (let col = 0; col < sprite.width; col++) {
      const color = sprite.pixels[row * sprite.width + col];
      if (color == null) continue; // null = transparent; undefined cannot happen for a parsed sprite
      if (color !== current) {
        ctx.fillStyle = color;
        current = color;
      }
      ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
}
```

Примечания:

- `Object.hasOwn` (ES2022, есть в `lib`) — чтобы ключи прототипа (`constructor`,
  `toString`) не считались цветами; символ строки всегда один char, но защита дешёвая.
- `for (const ch of row)` итерирует по кодовым точкам; арт — ASCII, расхождения с
  `row.length` нет. Если в будущем появится не-ASCII символ, проверка длины поймает
  несовпадение только косвенно — не наш случай, не усложняем.
- Если `lint` (`no-restricted-syntax`/`unicorn` и т.п.) ругается на `== null` — заменить
  на `if (color === null || color === undefined) continue;`.

## 2. Данные арта

**Файл (создать):** `src/game/art.ts`

Свой силуэт: не «красный нос-стрелка над бело-голубыми крыльями» референса, а
золотой корпус-игла с узкой кабиной, фиолетовые крылья-«клешни» с выносными пилонами и
красные огни двигателей снизу. 3 цвета из уже используемой в игре палитры: `#ffd36b`
(корпус), `#b884ff` (крылья), `#ff5a3c` (кабина и выхлоп). Ширина 15, нос — столбец 7
(`row 0, col 7`). Силуэт симметричен (проверено: 16 строк, все по 15 символов, каждая —
палиндром).

```typescript
import { parseSprite, type Sprite } from './sprite';

/** Player ship, 15×16. Nose is the center column (col 7). */
export const SHIP_SPRITE: Sprite = parseSprite(
  [
    '.......Y.......',
    '.......Y.......',
    '......YYY......',
    '......YRY......',
    '.....YYRYY.....',
    '.....YYYYY.....',
    '..P..YYYYY..P..',
    '..P.YYYYYYY.P..',
    '.PP.YYYYYYY.PP.',
    '.PPYYYYYYYYYPP.',
    'PPPYYYYYYYYYPPP',
    'PPYYYPYYYPYYYPP',
    'PP.YYP.Y.PYY.PP',
    'P...RR.Y.RR...P',
    '.....R.R.R.....',
    '.......R.......',
  ],
  {
    Y: '#ffd36b', // hull
    P: '#b884ff', // wings
    R: '#ff5a3c', // cockpit, engine glow
  },
);
```

Конкретный рисунок — предложение разработчика (В7); владелец смотрит глазами после
реализации. Если вид не утверждён — правится только массив строк/палитра в `art.ts`
(размер 15×16 держит тест), остальной код не меняется.

`SHOT_COLOR` в эту задачу не входит (задача 004).

## 3. Корабль

**Файл (создать):** `src/game/ship.ts`

```typescript
import { SCREEN_WIDTH } from '../config';
import { SHIP_SPRITE } from './art';

/** Ship size is derived from its sprite so the hitbox never drifts from the picture. */
export const SHIP_WIDTH = SHIP_SPRITE.width;
export const SHIP_HEIGHT = SHIP_SPRITE.height;
/** Top edge of the ship; the bottom 16 px below it are reserved for the lives HUD. */
export const SHIP_Y = 208;

/** Player ship. Position is the top-left corner in logical pixels. Stationary for now. */
export class Ship {
  readonly y = SHIP_Y;

  /** Defaults to horizontally centered. */
  constructor(public x = Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2)) {}
}
```

`SHIP_SPEED`, `MoveDir`, `update`, `spawnShot` — не добавлять (задачи 003/004).

## 4. Отрисовка в `PlayScene`

**Файл (изменить):** `src/game/scenes/play-scene.ts`

- Импорты: `import { SHIP_SPRITE } from '../art';`, `import { Ship } from '../ship';`,
  `import { drawSprite } from '../sprite';`.
- Поле `readonly ship = new Ship();` с комментарием `/** Exposed for tests. */`.
- `render`: после `starfield.render(ctx)` — корабль.
- Комментарий класса обновить: звёзды + неподвижный корабль игрока.
- `update` и `_input` не трогать.

```typescript
/** Gameplay screen: starfield and the (still stationary) player ship. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly ship = new Ship();
  private readonly starfield: Starfield;

  // constructor and update unchanged

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawSprite(ctx, SHIP_SPRITE, Math.floor(this.ship.x), Math.floor(this.ship.y));
  }
}
```

`TitleScene`, `main.ts`, `src/engine/*`, `src/config.ts` — не меняются.

## 5. Тесты

### 5.1 `src/game/sprite.test.ts` (создать; Vitest, environment `node`)

Фейковый ctx-рекордер (в самом тест-файле):

```typescript
interface Call {
  fillStyle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function recorder() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
```

Сценарии `parseSprite`:

- размеры: `['ab.', '.ba']` → `width 3`, `height 2`;
- `.` → `null`, символ → цвет палитры; порядок row-major: `pixels` у `['ab', 'b.']`
  с палитрой `{a:'#1', b:'#2'}` равен `['#1', '#2', '#2', null]` (`toEqual`);
- ошибки (`toThrow`): `[]`; `['']`; `['ab', 'a']` (разная длина); `['ax']` при палитре
  без `x`; палитра с ключом `.` (например, `{ '.': '#000', a: '#1' }`).

Сценарии `drawSprite`:

- прозрачные не рисуются, число `fillRect` = числу непрозрачных пикселей
  (спрайт с пикселями `null` в разных местах);
- каждый вызов — `w === 1 && h === 1`;
- смещение: спрайт `['a']` в `(10, 20)` → один вызов `{x: 10, y: 20}`;
- несимметричный 2×3: `['ab', '.c', 'd.']`, палитра из 4 разных цветов, рисуем в
  `(5, 7)` → вызовы ровно (`toEqual`, порядок row-major):
  `a(5,7)`, `b(6,7)`, `c(6,8)`, `d(5,9)` с верными `fillStyle` — ловит перепутанные
  строки/столбцы и ошибку в смене `fillStyle`;
- смена цвета: в спрайте `['aab']` у каждого вызова правильный `fillStyle`
  (проверка оптимизации «присваивать только при смене»).

### 5.2 `src/game/ship.test.ts` (создать)

```typescript
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';
import { SHIP_SPRITE } from './art';
import { SHIP_HEIGHT, SHIP_WIDTH, SHIP_Y, Ship } from './ship';
```

- `SHIP_WIDTH === SHIP_SPRITE.width`, `SHIP_HEIGHT === SHIP_SPRITE.height`;
- размер спрайта ровно 15×16 (решение В3);
- `SHIP_WIDTH % 2 === 1` (нос по центру);
- нос: `SHIP_SPRITE.pixels[Math.floor(SHIP_WIDTH / 2)]` (верхняя строка, центральный
  столбец) не `null` — выстрел в 004 вылетает из непустого пикселя;
- `new Ship()`: `x === Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2)`, `y === SHIP_Y`;
- корабль целиком на экране: `x >= 0`, `x + SHIP_WIDTH <= SCREEN_WIDTH`,
  `SHIP_Y + SHIP_HEIGHT <= SCREEN_HEIGHT`;
- `new Ship(37).x === 37`.

Валидность `SHIP_SPRITE` проверяется импортом: ошибка формата в `art.ts` уронит модуль.

### 5.3 `src/game/scenes/play-scene.test.ts` (создать, минимально)

Дизайн заводит этот файл в 003; здесь — один-два теста, которые 003 расширит:

- `new PlayScene(createRng(1)).ship` — экземпляр `Ship` в стартовой позиции
  (`x === new Ship().x`, `y === SHIP_Y`);
- после `input.press('left')`/`press('right')` и `step(scene, input, 30)` позиция не
  изменилась (корабль пока неподвижен; `update` — только через `step()`).

## 6. Ручная проверка

`npm run dev` → титул → Enter:

- звёздный фон, внизу по центру — корабль (верх на y=208, под ним полоса 16 px пустая);
- пиксели чёткие, без размытия, на любом масштабе окна;
- корабль читается на звёздах, не похож на корабль из референса;
- звёзды рисуются под кораблём, не поверх.

**Владелец утверждает вид корабля** (В7) — без этого задача не закрывается. При правках
вида меняется только `art.ts`.

## 7. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- Раздел «Игра» — добавить:
  - `sprite.ts` — формат спрайта (строки + палитра, `.` прозрачный), чистый
    `parseSprite()` (бросает на ошибках формата), `drawSprite()` — `fillRect` 1×1 на
    непрозрачный пиксель, координаты целые (`Math.floor` в вызывающем коде);
  - `art.ts` — данные пиксель-арта: `SHIP_SPRITE` 15×16 (разбор при загрузке модуля);
  - `ship.ts` — `Ship`: позиция — левый верхний угол, старт по центру, `SHIP_Y = 208`,
    размеры выводятся из спрайта; пока неподвижен;
  - `scenes/play-scene.ts` — уточнить: звёзды + корабль (`readonly ship`), слои:
    заливка → звёзды → корабль.
- Граф импортов: `play-scene → {starfield, ship, art, sprite}`, `ship → {config, art}`,
  `art → sprite`.

`game-design.md` не меняется (механики игрока там уже описаны дизайном фичи). README в
`src/` нет.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/sprite.ts`                    |
| Создать  | `src/game/sprite.test.ts`               |
| Создать  | `src/game/art.ts`                       |
| Создать  | `src/game/ship.ts`                      |
| Создать  | `src/game/ship.test.ts`                 |
| Создать  | `src/game/scenes/play-scene.test.ts`    |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `second-brain/architecture/overview.md` |

Проверки: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

## Архитектура и паттерны

- Граница engine/game: всё новое — в `src/game/`, `engine` не трогается.
- Логика отдельно от рендера: `Ship` без `ctx`; рисование — в `PlayScene.render` и
  `sprite.ts`; `drawSprite` использует только `fillStyle`/`fillRect`, тестируется на
  фейковом ctx в environment `node`.
- Размеры корабля — из спрайта (не литералы): хитбокс и картинка не разъедутся.
- Константы сущности — в её модуле, не в `config.ts`.
- Стиль `Starfield`: parameter properties, `Math.floor` при отрисовке, `fillRect` 1×1.
- `import type`/inline `type` для `Sprite` и типов engine (`verbatimModuleSyntax`);
  `noUncheckedIndexedAccess` — явные проверки `undefined` при индексации.
- Детерминизм не затронут: случайности и времени в новых модулях нет.

## Открытые вопросы

Блокирующих нет. Мелкие вопросы из `analyze.md` решены выше (раздел «Решения»).
Утверждение вида корабля владельцем — критерий готовности после реализации (В7), не
вопрос к плану. Отдельных задач не всплыло.

## Ссылки

- `second-brain/tasks/tasks/002-ship-sprite/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/001-player-ship/design.md` (раунд 2: «Сущности и состояния»,
  «Поток тика», «Интерфейсы», «Тестирование», «Нарезка» п. 2)
- `second-brain/features/001-player-ship/discussion.md` (В3, В6, В7)
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`

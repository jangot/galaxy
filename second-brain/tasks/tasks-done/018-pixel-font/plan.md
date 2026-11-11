# План реализации: Пиксельный шрифт

Добавить в `src/game/` свой моноширинный пиксельный шрифт в стиле NES: данные 37 глифов
7×7 (`0–9`, `A–Z`, пробел) в `font-art.ts`, разбор через `parseSprite` при загрузке
модуля и функции `textWidth` / `drawText` в `font.ts`, тесты в `font.test.ts`. На экран
шрифт в этой задаче не выводится — потребитель появится в задаче 019 (HUD).

Рамка — `second-brain/features/004-hud/design.md` (разделы «Шрифт», «Интерфейсы»,
«Тестирование», п. 1 нарезки) и `analyze.md`. Технические уточнения из «Открытых
вопросов» `analyze.md` решены (см. раздел «Решения по открытым вопросам»).

## 1. Данные глифов

**Файл (создать):** `src/game/font-art.ts`

Без импортов: только строки, палитры нет (палитру с `FONT_INK` задаёт `font.ts`).
Каждый глиф — 7 строк по 7 символов, `#` — пиксель, `.` — пусто. Стиль — NES: штрих
2 px по вертикали, `0` с косой засечкой (отличим от `O`), `1` с основанием (от `I` —
у `I` засечки сверху и снизу), `5` с прямым верхом (от `S`), `8` асимметричная (от `B`).
Форма букв — художественное решение; если в задаче 019 что-то не понравится, правятся
только эти данные. Ниже — готовые данные (проверено скриптом: 37 ключей, все 7×7, только
`#`/`.`, нет двух одинаковых глифов).

```typescript
/**
 * Raw glyph data for the game font (see font.ts): 7 rows of 7 chars each,
 * '#' = ink, '.' = empty. Monospace cell is 8×8, the 1 px gap is added by CHAR_ADVANCE.
 * Character set: 0-9, A-Z, space.
 */
// prettier-ignore
export const FONT_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': [
    '..###..',
    '.#..##.',
    '##...##',
    '##...##',
    '##...##',
    '.##..#.',
    '..###..',
  ],
  '1': [
    '...##..',
    '..###..',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
    '.######',
  ],
  '2': [
    '.#####.',
    '##...##',
    '....###',
    '..####.',
    '.###...',
    '###....',
    '#######',
  ],
  '3': [
    '.######',
    '....##.',
    '...##..',
    '..####.',
    '.....##',
    '##...##',
    '.#####.',
  ],
  '4': [
    '...###.',
    '..####.',
    '.##.##.',
    '##..##.',
    '#######',
    '....##.',
    '....##.',
  ],
  '5': [
    '######.',
    '##.....',
    '######.',
    '.....##',
    '.....##',
    '##...##',
    '.#####.',
  ],
  '6': [
    '..####.',
    '.##....',
    '##.....',
    '######.',
    '##...##',
    '##...##',
    '.#####.',
  ],
  '7': [
    '#######',
    '##...##',
    '....##.',
    '...##..',
    '..##...',
    '..##...',
    '..##...',
  ],
  '8': [
    '.####..',
    '##...#.',
    '###..#.',
    '.####..',
    '#..####',
    '#....##',
    '.#####.',
  ],
  '9': [
    '.#####.',
    '##...##',
    '##...##',
    '.######',
    '.....##',
    '....##.',
    '.####..',
  ],
  A: [
    '..###..',
    '.##.##.',
    '##...##',
    '##...##',
    '#######',
    '##...##',
    '##...##',
  ],
  B: [
    '######.',
    '##...##',
    '##...##',
    '######.',
    '##...##',
    '##...##',
    '######.',
  ],
  C: [
    '..####.',
    '.##..##',
    '##.....',
    '##.....',
    '##.....',
    '.##..##',
    '..####.',
  ],
  D: [
    '#####..',
    '##..##.',
    '##...##',
    '##...##',
    '##...##',
    '##..##.',
    '#####..',
  ],
  E: [
    '#######',
    '##.....',
    '##.....',
    '######.',
    '##.....',
    '##.....',
    '#######',
  ],
  F: [
    '#######',
    '##.....',
    '##.....',
    '######.',
    '##.....',
    '##.....',
    '##.....',
  ],
  G: [
    '..#####',
    '.##....',
    '##.....',
    '##..###',
    '##...##',
    '.##..##',
    '..#####',
  ],
  H: [
    '##...##',
    '##...##',
    '##...##',
    '#######',
    '##...##',
    '##...##',
    '##...##',
  ],
  I: [
    '.######',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
    '.######',
  ],
  J: [
    '....###',
    '.....##',
    '.....##',
    '.....##',
    '##...##',
    '##...##',
    '.#####.',
  ],
  K: [
    '##...##',
    '##..##.',
    '##.##..',
    '####...',
    '#####..',
    '##.###.',
    '##..###',
  ],
  L: [
    '.##....',
    '.##....',
    '.##....',
    '.##....',
    '.##....',
    '.##....',
    '.######',
  ],
  M: [
    '##...##',
    '###.###',
    '#######',
    '#######',
    '##.#.##',
    '##...##',
    '##...##',
  ],
  N: [
    '##...##',
    '###..##',
    '####.##',
    '#######',
    '##.####',
    '##..###',
    '##...##',
  ],
  O: [
    '.#####.',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '.#####.',
  ],
  P: [
    '######.',
    '##...##',
    '##...##',
    '##...##',
    '######.',
    '##.....',
    '##.....',
  ],
  Q: [
    '.#####.',
    '##...##',
    '##...##',
    '##...##',
    '##.####',
    '##..##.',
    '.####.#',
  ],
  R: [
    '######.',
    '##...##',
    '##...##',
    '##..###',
    '#####..',
    '##.###.',
    '##..###',
  ],
  S: [
    '.####..',
    '##..##.',
    '##.....',
    '.#####.',
    '.....##',
    '##...##',
    '.#####.',
  ],
  T: [
    '.######',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
    '...##..',
  ],
  U: [
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '.#####.',
  ],
  V: [
    '##...##',
    '##...##',
    '##...##',
    '###.###',
    '.#####.',
    '..###..',
    '...#...',
  ],
  W: [
    '##...##',
    '##...##',
    '##.#.##',
    '#######',
    '#######',
    '###.###',
    '##...##',
  ],
  X: [
    '##...##',
    '###.###',
    '.#####.',
    '..###..',
    '.#####.',
    '###.###',
    '##...##',
  ],
  Y: [
    '.##..##',
    '.##..##',
    '.##..##',
    '..####.',
    '...##..',
    '...##..',
    '...##..',
  ],
  Z: [
    '#######',
    '....###',
    '...###.',
    '..###..',
    '.###...',
    '###....',
    '#######',
  ],
  ' ': [
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
  ],
};
```

Ключи-цифры и пробел — в кавычках (`'0'`, `' '`), буквы — без. Если Prettier
поменяет кавычки ключей — принять его вариант (`npm run format`).

## 2. Модуль шрифта

**Файл (создать):** `src/game/font.ts`

Граф импортов: `font → {sprite, font-art}`; `Sprite` — через `import type`.

```typescript
import { FONT_GLYPHS } from './font-art';
import { parseSprite, type Sprite } from './sprite';

export const GLYPH_WIDTH = 7;
export const GLYPH_HEIGHT = 7;
/** Monospace cell width: glyph plus 1 px gap (8×8 cell, NES style). */
export const CHAR_ADVANCE = 8;

export type Font = ReadonlyMap<string, Sprite>;

/** Placeholder palette color for glyph pixels: mask only, never drawn. */
const FONT_INK = '#fff';

/** Builds a monospace font; throws on bad glyph data or a glyph of the wrong size. */
export function parseFont(glyphs: Readonly<Record<string, readonly string[]>>): Font {
  const font = new Map<string, Sprite>();
  for (const [ch, rows] of Object.entries(glyphs)) {
    const glyph = parseSprite(rows, { '#': FONT_INK }); // format errors propagate
    if (glyph.width !== GLYPH_WIDTH || glyph.height !== GLYPH_HEIGHT) {
      throw new Error(
        `Glyph '${ch}' is ${glyph.width}x${glyph.height}, expected ${GLYPH_WIDTH}x${GLYPH_HEIGHT}`,
      );
    }
    font.set(ch, glyph);
  }
  return font;
}

/** The game font (parsed at module load, a format error fails the import). */
export const FONT: Font = parseFont(FONT_GLYPHS);

function glyphOf(ch: string): Sprite {
  const glyph = FONT.get(ch);
  if (glyph === undefined) throw new Error(`No glyph for char '${ch}'`);
  return glyph;
}

/**
 * Width in px: text.length * CHAR_ADVANCE. Includes the trailing 1 px gap of the last
 * cell on purpose (monospace cell width) - do not trim it. Throws on unknown char.
 */
export function textWidth(text: string): number {
  for (const ch of text) glyphOf(ch);
  return text.length * CHAR_ADVANCE;
}

/**
 * Draws text with its top-left at (x, y) in one color: sets fillStyle once, then one
 * 1×1 fillRect per mask pixel. Expects integer x/y. Throws on unknown char
 * (before drawing anything).
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  const glyphs = Array.from(text, glyphOf); // validate the whole string first
  ctx.fillStyle = color;
  glyphs.forEach((glyph, i) => {
    const gx = x + i * CHAR_ADVANCE;
    for (let row = 0; row < glyph.height; row++) {
      for (let col = 0; col < glyph.width; col++) {
        if (glyph.pixels[row * glyph.width + col] == null) continue; // mask only
        ctx.fillRect(gx + col, y + row, 1, 1);
      }
    }
  });
}
```

Заметки к реализации:

- Ошибка на неизвестном символе в `drawText` бросается **до** установки `fillStyle` и
  до первого `fillRect`: строка сначала целиком переводится в глифы. Частичной
  отрисовки нет — это закрепляется тестом.
- `drawText('')` и строка из пробелов: `fillStyle` ставится всегда («один раз на
  вызов»), тестом не закрепляется (решение по п. 2).
- `== null` на `pixels[i]` покрывает и `undefined` из `noUncheckedIndexedAccess` (как
  в `drawSprite`); `!` не используется.
- Проверки «ключ глифа — ровно один символ» в `parseFont` нет (решение по п. 3).
- `text.length` vs `for…of`: для разрешённого набора (ASCII) совпадают; любой
  не-ASCII символ бросает ошибку раньше, чем на результат повлияет `length`.
- Значение `FONT_INK` произвольное — оно нигде не читается; не экспортируется.

## 3. Тесты

**Файл (создать):** `src/game/font.test.ts` (Vitest, environment `node` из
`vite.config.ts`)

Отрисовка пикселей проверяется через `recorder()` из `canvas-test-utils.ts`;
`canvas-test-utils.ts` **не меняется**. Для счёта присваиваний `fillStyle` — локальный
фейк-контекст в самом `font.test.ts` (решение по п. 1).

```typescript
import { describe, expect, it } from 'vitest';
import { recorder } from './canvas-test-utils';
import {
  CHAR_ADVANCE,
  drawText,
  FONT,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  parseFont,
  textWidth,
} from './font';
import type { Sprite } from './sprite';

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARSET = `${DIGITS}${LETTERS} `;

/** Test-local fake ctx that counts fillStyle assignments (recorder() does not). */
function styleCounter(): { ctx: CanvasRenderingContext2D; styles: string[] } {
  const styles: string[] = [];
  const ctx = {
    set fillStyle(value: string) {
      styles.push(value);
    },
    fillRect() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, styles };
}

function glyph(ch: string): Sprite {
  const g = FONT.get(ch);
  if (g === undefined) throw new Error(`missing glyph '${ch}'`);
  return g;
}

/** Expected fillRect calls for one glyph at (x, y): mask pixels in row-major order. */
function maskRects(g: Sprite, x: number, y: number, color: string) {
  const rects = [];
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      if (g.pixels[row * g.width + col] != null) {
        rects.push({ fillStyle: color, x: x + col, y: y + row, w: 1, h: 1 });
      }
    }
  }
  return rects;
}

const maskKey = (g: Sprite) => g.pixels.map((p) => (p === null ? '.' : '#')).join('');
const SEVEN_DOTS = '.......';
const blankGlyph = (): string[] => Array.from({ length: GLYPH_HEIGHT }, () => SEVEN_DOTS);
```

Сценарии (каждый — отдельный `it`):

**`FONT`**

- Содержит ровно набор `0–9`, `A–Z`, пробел:
  `expect([...FONT.keys()].sort()).toEqual([...CHARSET].sort())`.
- Каждый глиф — `GLYPH_WIDTH × GLYPH_HEIGHT` (`width`, `height`, `pixels.length`).
- Пробел пуст: все `pixels` — `null`.
- Каждый не-пробельный глиф содержит хотя бы один пиксель (защита от пустой заготовки).
- Цифры попарно различны: `new Set([...DIGITS].map((c) => maskKey(glyph(c)))).size === 10`.
- Буквы попарно различны (то же для `LETTERS`, `size === 26`).

**`parseFont`**

- Корректные данные: `parseFont({ A: blankGlyph() })` — `Map` с ключом `A`, глиф 7×7.
- Бросает на неверной ширине: строки по 6 символов (`toThrow(/expected 7x7/)` или просто
  `toThrow()`).
- Бросает на неверной высоте: 6 строк по 7 символов.
- Пробрасывает ошибку `parseSprite`: рваные строки (одна строка 6 символов при прочих 7).
- Пробрасывает ошибку `parseSprite`: неизвестный символ (`'x'` в строке).

**`textWidth`**

- `textWidth('') === 0`.
- `textWidth('AB') === 2 * CHAR_ADVANCE`; `textWidth('SCORE') === 5 * CHAR_ADVANCE`
  (хвостовой зазор включён).
- Бросает на строчной букве (`'a'`) и на знаке (`'!'`).

**`drawText`** (через `recorder()`)

- Один глиф в `(x, y) = (10, 20)`, цвет `'#abc'`: `calls` ровно равны
  `maskRects(glyph('A'), 10, 20, '#abc')` — пиксели маски, порядок обхода, цвет, 1×1.
- Второй символ сдвинут на `CHAR_ADVANCE`: `drawText(ctx, 'A1', 3, 5, c)` ==
  `[...maskRects(glyph('A'), 3, 5, c), ...maskRects(glyph('1'), 3 + CHAR_ADVANCE, 5, c)]`.
- Пробел ничего не рисует: `drawText(ctx, ' ', 0, 0, c)` → `calls` пуст; `'A A'` —
  третий символ на `x + 2 * CHAR_ADVANCE`, вызовов столько же, сколько у `'AA'`.
- Цвет не зависит от `FONT_INK`: все `calls[i].fillStyle` равны переданному цвету
  (покрывается сравнением выше; отдельно для двух разных цветов `'#123'` и `'#456'`).
- `fillStyle` выставлен ровно один раз и равен цвету — через `styleCounter()`:
  `drawText(ctx, 'SCORE 0', 0, 0, '#f00')` → `styles` равно `['#f00']`.
- Бросает на неизвестном символе и ничего не рисует: `drawText(ctx, 'Aa', 0, 0, c)`
  бросает, `calls` пуст.

## 4. Ручная проверка

Нечего: шрифт в этой задаче нигде не выводится, `TitleScene` не меняется. Вид глифов
смотрится глазами в задаче 019 (`acceptance.md` там). Достаточно, что `npm run dev`
запускается и игра работает как раньше.

## 5. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- Раздел «Игра», после пункта про `art.ts` — новый пункт:
  > - `font.ts` / `font-art.ts` — моноширинный пиксельный шрифт (NES-стиль): глифы 7×7
  >   в клетке 8×8 (`GLYPH_WIDTH`, `GLYPH_HEIGHT`, `CHAR_ADVANCE`), набор `0–9`, `A–Z`,
  >   пробел. Данные — строки `#`/`.` в `font-art.ts` (`FONT_GLYPHS`), разбор через
  >   `parseSprite` в `parseFont` при загрузке модуля (`FONT`; неверный размер глифа или
  >   ошибка формата роняет импорт). `textWidth(text)` = `text.length * CHAR_ADVANCE`
  >   (хвостовой зазор 1 px намеренно); `drawText(ctx, text, x, y, color)` — один
  >   `fillStyle` на вызов, `fillRect` 1×1 на пиксель маски (цвет из глифа не читается),
  >   координаты целые. Оба бросают на символе без глифа. Шрифт в `game/`, не в движке
  >   (строится на `sprite.ts`). Пока не используется; потребитель — HUD (фича 004).
- Пункт про `canvas-test-utils.ts`: в перечень потребителей `recorder()` добавить
  `font.test.ts`.
- Граф импортов: добавить `font → {sprite, font-art}`, `font-art` — без импортов
  (рядом с `art → sprite`).

`src/game/` README нет — обновлять нечего. `game-design.md` не меняется (решения В7 уже
записаны в фиче; внести их в «Экран» — дело задачи 019 по нарезке).

## 6. Проверки

`npm run format` (выровнять данные глифов), затем полный набор: `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/font-art.ts`                  |
| Создать  | `src/game/font.ts`                      |
| Создать  | `src/game/font.test.ts`                 |
| Изменить | `second-brain/architecture/overview.md` |

Без изменений: `src/game/sprite.ts`, `src/game/canvas-test-utils.ts`,
`src/game/scenes/title-scene.ts`, `src/engine/`.

## Архитектура и паттерны

- Логика отдельно от рендера: данные и разбор — чистые; `drawText` принимает `ctx`
  снаружи и тестируется фейковым контекстом без canvas.
- Переиспользование формата спрайтов: глиф — обычный `Sprite` из `parseSprite`, все
  проверки формата бесплатно; палитра-заглушка `FONT_INK` приватна.
- Разбор при загрузке модуля, как `art.ts` / `enemy-art.ts`: ошибка данных роняет импорт
  и ловится любым тестом, импортирующим `font.ts`.
- Граница engine/game: шрифт — игровой модуль в `src/game/`; `engine` не затронут.
- Детерминизм: ни случайности, ни времени нет.
- `import type` для `Sprite`; strict + `noUncheckedIndexedAccess` — отсутствие глифа
  обрабатывается ошибкой, без `!`.

## Решения по открытым вопросам

Вопросы из `analyze.md` закрыты рекомендациями разработчика (приняты в промпте запуска):

1. Счёт присваиваний `fillStyle` — локальный фейк-ctx `styleCounter()` в `font.test.ts`;
   `canvas-test-utils.ts` не трогается; пиксели проверяются через `recorder()`.
2. `drawText('')` ставит `fillStyle` всегда; тестом не закрепляется.
3. Проверку «ключ глифа — ровно один символ» в `parseFont` не добавлять.

## Открытые вопросы

Нет. Отдельных задач не выявлено.

## Ссылки

- `second-brain/tasks/tasks/018-pixel-font/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/004-hud/design.md` — «Шрифт», «Интерфейсы», «Тестирование», п. 1 нарезки
- `second-brain/features/004-hud/dev-review.md`, `discussion.md` — В7, пункты 5, 6
- `second-brain/architecture/overview.md`
- `src/game/sprite.ts`, `src/game/art.ts`, `src/game/enemy-art.ts`,
  `src/game/canvas-test-utils.ts`, `src/game/sprite.test.ts`

# План реализации: Верхняя панель (HUD)

Вывести в полосе y = 0…23 над строем панель из трёх секций: `SCORE` / `000000` слева,
`LEVEL` / номер по центру, иконки жизней справа. Модель и раскладка — в `hud.ts` (без
canvas), отрисовка — в `hud-render.ts` через шрифт из задачи 018; `PlayScene.render`
рисует панель последней, поверх боя, без фона. Меняется только уровень; счёт и жизни —
заглушки.

Рамка — `second-brain/features/004-hud/design.md` (раунд 2, п. 2 нарезки) и `analyze.md`.
Опора — реальный код шрифта (`src/game/font.ts`: `GLYPH_HEIGHT = 7`, `CHAR_ADVANCE = 8`,
`textWidth`, `drawText`).

## Решения по открытым вопросам analyze.md

Приняты рекомендации (ответ в промпте запуска):

1. `overview.md` правится по актуальным строкам: «нижние 16 px» — строка 59 (не 49);
   плюс у шрифта убрать «Пока не используется» (стр. 46–47), слои `PlayScene` (стр. 238),
   пользователи `recorder()` (стр. 233–234), граф импортов (стр. 246–259).
2. Предел размера иконки — именованная константа `LIFE_ICON_MAX_SIZE = 8` в `hud.ts`;
   ширина и высота `LIVES_ZONE` выводятся из неё, а не из `LIFE_ICON_SPRITE`. `hud.ts` не
   импортирует `art.ts`; проверка «иконка ≤ 8×8» — в `hud.test.ts` (тест импортирует оба).
3. Комментарий у теста `HUD_HEIGHT ≤ 28` — с точным значением: верх взрыва на апексе дуги
   вылета — y = 29, предел 28 оставляет 1 px зазора.

Отступление от дизайна одно и только в константе: формула ширины зоны жизней в дизайне
`(SLOTS − 1) * STEP + 8` — то же число 48, но `8` теперь названо (`LIFE_ICON_MAX_SIZE`).
Формула позиции иконки (`… − LIFE_ICON_SPRITE.width − i * STEP`) — как в дизайне.

## 1. Арт: иконка жизни и цвета панели

**Файл (изменить):** `src/game/art.ts`

- Палитру корабля вынести в приватную константу `SHIP_PALETTE` и использовать в
  `SHIP_SPRITE` и `LIFE_ICON_SPRITE` (иконка — того же цвета, что корабль; результат
  разбора `SHIP_SPRITE` не меняется).
- `LIFE_ICON_SPRITE` — 7×8 (≤ 8×8), нечётная ширина: нос по центральной колонке, как у
  корабля. Рисунок стартовый, утверждает владелец на приёмке.
- `HUD_LABEL_COLOR = '#ff5a3c'` (совпадает с `R` корабля), `HUD_VALUE_COLOR = '#ffffff'`.

```typescript
const SHIP_PALETTE = {
  Y: '#ffd36b', // hull
  P: '#b884ff', // wings
  R: '#ff5a3c', // cockpit, engine glow
} as const;

/** Player ship, 15×16. Nose is the center column (col 7). */
export const SHIP_SPRITE: Sprite = parseSprite([/* rows unchanged */], SHIP_PALETTE);

/** Lives icon for the HUD: a small ship silhouette, 7×8 (must stay within 8×8, see hud.ts). */
export const LIFE_ICON_SPRITE: Sprite = parseSprite(
  ['...Y...', '...Y...', '..YYY..', '..YRY..', 'P.YYY.P', 'PYYYYYP', 'PPYYYPP', 'P.R.R.P'],
  SHIP_PALETTE,
);

/** HUD label row color (SCORE, LEVEL). */
export const HUD_LABEL_COLOR = '#ff5a3c';
/** HUD value row color (digits). */
export const HUD_VALUE_COLOR = '#ffffff';
```

Если `as const` мешает типу `Readonly<Record<string, string>>` — убрать `as const`
(объект и так подходит).

## 2. Модель панели

**Файл (создать):** `src/game/hud.ts`

Без canvas. Импорты: `config` (`SCREEN_WIDTH`), `font` (`CHAR_ADVANCE`, `GLYPH_HEIGHT`,
`textWidth`), `import type { Battle }`. `art.ts` не импортировать. Все зоны — через
базовые константы; значения в комментариях для наглядности.

```typescript
import { SCREEN_WIDTH } from '../config';
import type { Battle } from './battle';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';

/** Data shown by the HUD; a pure snapshot built from the battle each frame. */
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Total lives including the ship on the field. */
  readonly lives: number;
}

/** A section's rectangle in logical px (half-open: x...x+width, y...y+height). */
export interface HudZone {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Until the scoring feature: the battle has no score yet. */
export const PLACEHOLDER_SCORE = 0;
/** Until the lives feature: total lives including the current ship. */
export const PLACEHOLDER_LIVES = 3;

export const SCORE_DIGITS = 6;
export const SCORE_LABEL = 'SCORE';
export const LEVEL_LABEL = 'LEVEL';

/** The HUD occupies y = 0...HUD_HEIGHT-1, above the formation (FORMATION_TOP = 32). */
export const HUD_HEIGHT = 24;
/** Left/right screen margin: one 8 px cell. */
export const HUD_MARGIN_X = 8;
/** Top of the label row (glyphs y = 4...10). */
export const HUD_LABEL_Y = 4;
/** Top of the value row (glyphs y = 14...20, icons y = 14...21). */
export const HUD_VALUE_Y = 14;

/** Size limit of the lives icon (both sides); the zone is sized by it, not by the art. */
export const LIFE_ICON_MAX_SIZE = 8;
/** Horizontal step between lives icons: icon <= 8 px plus a 2 px gap. */
export const LIFE_ICON_STEP = 10;
/** How many icons the lives zone holds (layout reserve). */
export const LIVES_ICON_SLOTS = 5;

/** Label row + value row: 14 + 7 - 4 = 17. */
const TEXT_ZONE_HEIGHT = HUD_VALUE_Y + GLYPH_HEIGHT - HUD_LABEL_Y;

/** x = 8...55: the label or SCORE_DIGITS digits, whichever is wider (48). */
export const SCORE_ZONE: HudZone = {
  x: HUD_MARGIN_X,
  y: HUD_LABEL_Y,
  width: Math.max(textWidth(SCORE_LABEL), SCORE_DIGITS * CHAR_ADVANCE),
  height: TEXT_ZONE_HEIGHT,
};

const LEVEL_ZONE_WIDTH = textWidth(LEVEL_LABEL); // 40: the number is left-aligned under the label

/** x = 108...147, centered on screen. */
export const LEVEL_ZONE: HudZone = {
  x: Math.floor((SCREEN_WIDTH - LEVEL_ZONE_WIDTH) / 2),
  y: HUD_LABEL_Y,
  width: LEVEL_ZONE_WIDTH,
  height: TEXT_ZONE_HEIGHT,
};

const LIVES_ZONE_WIDTH = (LIVES_ICON_SLOTS - 1) * LIFE_ICON_STEP + LIFE_ICON_MAX_SIZE; // 48

/** x = 200...247, y = 14...21: value row only; icons fill it from the right edge. */
export const LIVES_ZONE: HudZone = {
  x: SCREEN_WIDTH - HUD_MARGIN_X - LIVES_ZONE_WIDTH,
  y: HUD_VALUE_Y,
  width: LIVES_ZONE_WIDTH,
  height: LIFE_ICON_MAX_SIZE,
};

/** All section zones, for the overlap test; a new section adds its zone here. */
export const HUD_ZONES: readonly HudZone[] = [SCORE_ZONE, LEVEL_ZONE, LIVES_ZONE];

/** Builds the HUD snapshot; score and lives are placeholders until their features exist. */
export function hudView(battle: Battle): HudView {
  return { level: battle.level, score: PLACEHOLDER_SCORE, lives: PLACEHOLDER_LIVES };
}

/** Zero-padded to SCORE_DIGITS; longer numbers are kept whole. Expects an integer >= 0. */
export function formatScore(score: number): string {
  return String(score).padStart(SCORE_DIGITS, '0');
}

/** Plain decimal, no padding. */
export function formatLevel(level: number): string {
  return String(level);
}
```

Граф: `hud → {config, font}` (+ `Battle` — type). Циклов нет: `battle` не импортирует
`hud`.

## 3. Отрисовка панели

**Файл (создать):** `src/game/hud-render.ts`

По функции на секцию, все в порядке счёт → уровень → жизни. Текст — `drawText`, иконки —
`drawSprite` (цвета из палитры иконки). Все координаты — целые константы, `Math.floor`
не нужен.

```typescript
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR, LIFE_ICON_SPRITE } from './art';
import { drawText } from './font';
import type { HudView, HudZone } from './hud';
import {
  formatLevel,
  formatScore,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  LEVEL_LABEL,
  LEVEL_ZONE,
  LIFE_ICON_STEP,
  LIVES_ZONE,
  SCORE_LABEL,
  SCORE_ZONE,
} from './hud';
import { drawSprite } from './sprite';

/**
 * Draws the top HUD over the scene, no background: score, level, lives sections.
 * Each section draws only inside its own zone (see hud.ts); a new section adds a drawX here.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawScore(ctx, view.score);
  drawLevel(ctx, view.level);
  drawLives(ctx, view.lives);
}

/** Label on the label row, value under it; both left-aligned to the zone. */
function drawLabeled(
  ctx: CanvasRenderingContext2D,
  zone: HudZone,
  label: string,
  value: string,
): void {
  drawText(ctx, label, zone.x, HUD_LABEL_Y, HUD_LABEL_COLOR);
  drawText(ctx, value, zone.x, HUD_VALUE_Y, HUD_VALUE_COLOR);
}

function drawScore(ctx: CanvasRenderingContext2D, score: number): void {
  drawLabeled(ctx, SCORE_ZONE, SCORE_LABEL, formatScore(score));
}

function drawLevel(ctx: CanvasRenderingContext2D, level: number): void {
  drawLabeled(ctx, LEVEL_ZONE, LEVEL_LABEL, formatLevel(level));
}

/** Icons from the zone's right edge leftwards; icon 0 is the rightmost. */
function drawLives(ctx: CanvasRenderingContext2D, lives: number): void {
  const rightmostX = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width;
  for (let i = 0; i < lives; i++) {
    drawSprite(ctx, LIFE_ICON_SPRITE, rightmostX - i * LIFE_ICON_STEP, LIVES_ZONE.y);
  }
}
```

При ширине иконки 7: иконки на x = 241, 231, 221 (правый край самой правой — 248).

Граф: `hud-render → {art, font, hud, sprite}` (`HudView`, `HudZone` — type).

## 4. Подключение в игровую сцену

**Файл (изменить):** `src/game/scenes/play-scene.ts`

Импорты `hudView` из `'../hud'` и `drawHud` из `'../hud-render'`; в `render` — последним
вызовом. Комментарий класса дополнить: «starfield background, the battle and the HUD on
top».

```typescript
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawBattle(ctx, this.battle);
    drawHud(ctx, hudView(this.battle)); // last, no background: text over the battle
  }
```

`update`, `Battle`, `TitleScene`, `play-scene.test.ts` не меняются.

## 5. Комментарий у SHIP_Y

**Файл (изменить):** `src/game/ship.ts:8`

```typescript
/** Top edge of the ship; the strip below it stays empty (lives are shown in the top HUD). */
export const SHIP_Y = 208;
```

## 6. Тесты модели

**Файл (создать):** `src/game/hud.test.ts` (Vitest, environment `node`)

Импорты: `SCREEN_WIDTH`, `createRng`, `LIFE_ICON_SPRITE` (из `art` — только тест),
`Battle`, `CHAR_ADVANCE`, `GLYPH_HEIGHT`, `textWidth`, всё нужное из `hud`, `TWO_LEVELS`.

Сценарии:

- **Форматирование:** `formatScore(0) === '000000'`, `formatScore(123) === '000123'`,
  `formatScore(1234567) === '1234567'` (без обрезки); `formatLevel(12) === '12'`,
  `formatLevel(1) === '1'`.
- **`hudView`:** для `startLevel` 1 и 3 (`it.each`) —
  `hudView(new Battle(createRng(1), { levels: TWO_LEVELS, startLevel }))` равен
  `{ level: startLevel, score: PLACEHOLDER_SCORE, lives: PLACEHOLDER_LIVES }`
  (`startLevel: 3` за концом `TWO_LEVELS` — эскалация `levelConfig`). Тайминг смены
  уровня не проверять — он в `battle.test.ts`.
- **Заглушки:** `PLACEHOLDER_SCORE === 0`, `PLACEHOLDER_LIVES === 3`.
- **Раскладка:**
  - каждая зона `HUD_ZONES` — целые координаты, `x >= 0`, `y >= 0`,
    `x + width <= SCREEN_WIDTH`, `y + height <= HUD_HEIGHT`;
  - зоны попарно не пересекаются (полуоткрытые прямоугольники, перебор всех пар `i < j`);
  - `HUD_HEIGHT <= 28` с комментарием:

    ```typescript
    // Free strip above the formation: the highest enemy pixel is an explosion at the peel
    // apex, top y = 29 (drone row 0: slot y 34, 4 px up, frame 9 px tall centered -> -1).
    // <= 28 keeps at least 1 px between the HUD and it; a limit for future sections too.
    expect(HUD_HEIGHT).toBeLessThanOrEqual(28);
    ```

  - строки не накладываются: `HUD_LABEL_Y + GLYPH_HEIGHT <= HUD_VALUE_Y`.
- **Вместимость:**
  - `SCORE_ZONE.width >= textWidth(SCORE_LABEL)` и `>= SCORE_DIGITS * CHAR_ADVANCE`;
  - `LEVEL_ZONE.width >= textWidth(LEVEL_LABEL)`;
  - для `SCORE_ZONE` и `LEVEL_ZONE`: `zone.y <= HUD_LABEL_Y`,
    `zone.y + zone.height >= HUD_VALUE_Y + GLYPH_HEIGHT`;
  - `LIVES_ZONE.width >= (LIVES_ICON_SLOTS - 1) * LIFE_ICON_STEP + LIFE_ICON_MAX_SIZE`,
    `LIVES_ZONE.height >= LIFE_ICON_MAX_SIZE`.
- **Иконка:** `LIFE_ICON_SPRITE.width <= LIFE_ICON_MAX_SIZE`,
  `LIFE_ICON_SPRITE.height <= LIFE_ICON_MAX_SIZE`, `LIFE_ICON_MAX_SIZE <= LIFE_ICON_STEP`
  (иконки не налезают друг на друга), `LIFE_ICON_MAX_SIZE <= 8` (решение владельца).

## 7. Тесты отрисовки

**Файл (создать):** `src/game/hud-render.test.ts` (Vitest, environment `node`, `recorder()`)

Вспомогательные функции в тесте:

```typescript
const BASE: HudView = { level: 1, score: 0, lives: 3 };

function draw(view: HudView): FillCall[] {
  const { ctx, calls } = recorder();
  drawHud(ctx, view);
  return calls;
}

/** Reference output of a drawText call, recorded separately. */
function textCalls(text: string, x: number, y: number, color: string): FillCall[] {
  const { ctx, calls } = recorder();
  drawText(ctx, text, x, y, color);
  return calls;
}

const key = (c: FillCall): string => `${c.fillStyle}|${c.x}|${c.y}|${c.w}|${c.h}`;

/** Multiset difference: calls of a that are not matched in b. */
function minus(a: readonly FillCall[], b: readonly FillCall[]): FillCall[] {
  /* count map */
}

function inZone(c: FillCall, z: HudZone): boolean {
  return c.x >= z.x && c.x + c.w <= z.x + z.width && c.y >= z.y && c.y + c.h <= z.y + z.height;
}

/** Number of opaque pixels of the icon. */
const ICON_PIXELS = LIFE_ICON_SPRITE.pixels.filter((p) => p != null).length;
```

Сценарии:

- **Границы панели:** для `BASE` и «максимального» вида
  `{ level: 99999, score: 999999, lives: LIVES_ICON_SLOTS }` — у каждого вызова
  `0 <= x`, `x + w <= SCREEN_WIDTH`, `0 <= y`, `y + h <= HUD_HEIGHT`; каждый вызов лежит
  хотя бы в одной зоне `HUD_ZONES`.
- **Изоляция секций** (`it.each`): пары `BASE` против `{ ...BASE, level: 2 }` →
  `LEVEL_ZONE`, `{ ...BASE, score: 123 }` → `SCORE_ZONE`, `{ ...BASE, lives: 2 }` →
  `LIVES_ZONE`. Разница `[...minus(a, b), ...minus(b, a)]` непуста и вся лежит в зоне
  этой секции (`inZone`). Сравнение мультимножествами, не по индексам.
- **Позиции текста:** `draw({ ...BASE, lives: 0 })` в точности равен (по порядку)
  конкатенации эталонов: `textCalls(SCORE_LABEL, SCORE_ZONE.x, HUD_LABEL_Y,
HUD_LABEL_COLOR)`, `textCalls(formatScore(0), SCORE_ZONE.x, HUD_VALUE_Y,
HUD_VALUE_COLOR)`, `textCalls(LEVEL_LABEL, LEVEL_ZONE.x, HUD_LABEL_Y, …)`,
  `textCalls(formatLevel(1), LEVEL_ZONE.x, HUD_VALUE_Y, …)`.
- **Уровень 9 и 10 — первая цифра на месте** (`it.each([9, 10])`): вызовы цвета
  `HUD_VALUE_COLOR` в `LEVEL_ZONE` (без счёта) равны `textCalls(formatLevel(n),
LEVEL_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR)`. Не проверять через «минимальный x
  пикселей»: у глифа `1` первая колонка пустая, чернила начинаются с `LEVEL_ZONE.x + 1`.
- **Иконки жизней** (`it.each([0, 1, 3, LIVES_ICON_SLOTS])`): вызовы в `LIVES_ZONE` —
  ровно `lives * ICON_PIXELS` штук; при `lives > 0` максимум `x + w` среди них равен
  `LIVES_ZONE.x + LIVES_ZONE.width`; иконка `i` — копия пикселей `LIFE_ICON_SPRITE`
  со сдвигом `x = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width -
i * LIFE_ICON_STEP`, `y = LIVES_ZONE.y` (эталон — `drawSprite` в отдельный
  `recorder()`; сравнение мультимножеством).
- **Цвета:** у `draw(BASE)` вызовы в строке подписей (`HUD_LABEL_Y <= y < HUD_LABEL_Y +
GLYPH_HEIGHT`) — все `HUD_LABEL_COLOR`; текстовые вызовы строки значений в
  `SCORE_ZONE`/`LEVEL_ZONE` — все `HUD_VALUE_COLOR`; вызовы в `LIVES_ZONE` — только
  цвета из `LIFE_ICON_SPRITE.pixels` (иконка рисуется своей палитрой, не цветами HUD).
- **Подписи на месте при любом значении:** множество вызовов `HUD_LABEL_COLOR` у
  `draw(BASE)` и у `draw({ level: 12, score: 4567, lives: 1 })` совпадает.

## 8. Ручная проверка

Создать на стадии `do`: **`second-brain/tasks/tasks/019-hud-panel/acceptance.md`** —
чеклист для владельца. `npm run dev`, Enter на заставке:

- панель вверху: слева `SCORE` красным и `000000` белым под ним, по центру `LEVEL` / `1`,
  справа три иконки корабля в строке значений, правый отступ ≈ левому;
- шрифт читается при масштабе ×2…×4 (менять размер окна), вид глифов устраивает;
- рисунок иконки жизни (7×8, `LIFE_ICON_SPRITE` в `art.ts`) устраивает — правится только
  массив строк;
- панель не налезает на строй при покачивании ±16 px; на `?level=4` / `?level=5` верхний
  ряд `raider` и взрыв врага, сбитого сразу после вылета (на апексе дуги), ниже панели;
- враг, возвращающийся в строй сверху, и выстрел игрока проходят под текстом; звёзды
  видны под панелью;
- уничтожить строй → после паузы ≈ 1,5 с номер меняется вместе с появлением волны;
- `?level=9` → уничтожить строй → `10`, первая цифра не сдвинулась (стоит под `L`).

## 9. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- Стр. 35–37 (`art.ts`): добавить `LIFE_ICON_SPRITE` 7×8 (уменьшенный силуэт корабля,
  палитра корабля; предел 8×8 — `LIFE_ICON_MAX_SIZE` в `hud.ts`, проверяется тестом) и
  `HUD_LABEL_COLOR` / `HUD_VALUE_COLOR`.
- Стр. 46–47 (шрифт): «Пока не используется; потребитель — HUD (фича 004)» →
  «Используется верхней панелью (`hud-render.ts`)».
- Стр. 59 (`ship.ts`): «(под кораблём 16 px под HUD жизней)» → «(полоса под кораблём
  пустая; жизни — в верхней панели)».
- После пункта `battle-render.ts` — новые пункты:
  - `hud.ts` — модель панели без canvas: `HudView { level, score, lives }` (`lives` — общее
    число, включая корабль на поле), `hudView(battle)` (уровень — `battle.level`; счёт и
    жизни — заглушки `PLACEHOLDER_SCORE = 0`, `PLACEHOLDER_LIVES = 3`), `formatScore`
    (6 цифр с ведущими нулями, длиннее — целиком), `formatLevel`; раскладка: `HUD_HEIGHT =
24`, `HUD_MARGIN_X = 8`, строки `HUD_LABEL_Y = 4` / `HUD_VALUE_Y = 14`, `HudZone`,
    `SCORE_ZONE` (8, 4, 48×17), `LEVEL_ZONE` (108, 4, 40×17; номер — по левому краю
    подписи), `LIVES_ZONE` (200, 14, 48×8; иконки от правого края, шаг `LIFE_ICON_STEP =
10`, `LIVES_ICON_SLOTS = 5`, предел иконки `LIFE_ICON_MAX_SIZE = 8`), `HUD_ZONES` —
    для теста непересечения. Новая секция = поле `HudView` + зона + `drawX`.
  - `hud-render.ts` — `drawHud(ctx, view)`: секции счёт → уровень → жизни, каждая рисует
    только в своей зоне; подписи `HUD_LABEL_COLOR`, значения `HUD_VALUE_COLOR` через
    `drawText`, иконки — `drawSprite`; фон не рисует.
- Стр. 233–234 (`recorder()`): добавить `hud-render.test.ts`.
- Стр. 238 (слои `PlayScene`): «заливка → звёзды → `drawBattle` → `drawHud(hudView(battle))`
  (панель последней, без фона)».
- Граф импортов: `play-scene → {starfield, battle, battle-render, hud, hud-render, player,
engine/rng}`; добавить `hud → {config, font}` (`Battle` — type), `hud-render → {art, font,
hud, sprite}` (`HudView`, `HudZone` — type).

**Файл (изменить):** `second-brain/game-design.md`, «Экран» (стр. 17–18):

```markdown
- HUD сверху (решено, фича 004): две строки — красные подписи, белые значения; слева
  `SCORE` (6 цифр с ведущими нулями), по центру `LEVEL` (номер уровня), справа жизни —
  иконки кораблей, **общее** число жизней, включая текущий корабль. Панель поверх игры,
  без фона, поле не сдвигается. Пока меняется только уровень: счёт (0) и жизни (3) —
  заглушки до фич очков и жизней. Рекорд и счётчик волн (флажки) — позже.
```

README в `src/game/` нет. `second-brain/features/` не трогать.

## Сводка по файлам

| Действие | Файл                                                   |
| -------- | ------------------------------------------------------ |
| Изменить | `src/game/art.ts`                                      |
| Создать  | `src/game/hud.ts`                                      |
| Создать  | `src/game/hud-render.ts`                               |
| Изменить | `src/game/scenes/play-scene.ts`                        |
| Изменить | `src/game/ship.ts` (комментарий `SHIP_Y`)              |
| Создать  | `src/game/hud.test.ts`                                 |
| Создать  | `src/game/hud-render.test.ts`                          |
| Создать  | `second-brain/tasks/tasks/019-hud-panel/acceptance.md` |
| Изменить | `second-brain/architecture/overview.md`                |
| Изменить | `second-brain/game-design.md`                          |

Проверки: `npm run format:check`, `lint`, `typecheck`, `test`, `build`.

## Архитектура и паттерны

- Логика отдельно от рендера: `hud.ts` / `hud-render.ts` — как `battle.ts` /
  `battle-render.ts`; модель и раскладка тестируются без canvas, отрисовка — `recorder()`.
- Панель — чистая функция от `Battle`: нет состояния, таймеров, `Rng`, `dt`; `update`
  сцены не меняется.
- Граница engine/game не затрагивается; шрифт и HUD — в `src/game/`.
- `import type` для `Battle`, `HudView`, `HudZone`, `FillCall`, `Sprite` (ESLint
  `consistent-type-imports`).
- Расширяемость: секция = поле `HudView` + `HudZone` в `HUD_ZONES` + `drawX` в `drawHud`;
  тесты границ и непересечения сразу охватывают новую зону.
- Целые координаты на входе `drawText`/`drawSprite` — все константы целые
  (`Math.floor` только при центрировании `LEVEL_ZONE`).

## Открытые вопросы

Вопросов к владельцу нет. Уточнения analyze.md закрыты (см. «Решения по открытым
вопросам»). Рисунок `LIFE_ICON_SPRITE` и вид шрифта утверждает владелец на приёмке
(`acceptance.md`); при правке иконки меняются только строки в `art.ts`, тесты держат
предел 8×8.

### Вопрос скила commit (2026-11-11) — закрыт ответом владельца

Решение владельца: задачи 018 и 019 — **одним коммитом** вместе с
`second-brain/features/004-hud/` и правкой `second-brain/features/README.md` (сознательное
исключение из правила «одна задача — один коммит»). 019 коммитится до приёмки глазами;
задача остаётся в `tasks/` с `acceptance.md`.

## Ссылки

- `second-brain/tasks/tasks/019-hud-panel/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/004-hud/design.md` (раунд 2), `discussion.md`
- `second-brain/architecture/overview.md`, `second-brain/game-design.md`
- `src/game/font.ts`, `sprite.ts`, `art.ts`, `battle.ts`, `battle-render.ts`,
  `battle-render.test.ts` (паттерн эталонных вызовов), `canvas-test-utils.ts`,
  `test-levels.ts`, `scenes/play-scene.ts`, `ship.ts`

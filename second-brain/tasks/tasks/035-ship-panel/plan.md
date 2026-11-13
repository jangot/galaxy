# План реализации: панель корабля (035)

Верхняя полоса 24 px становится непрозрачной приборной панелью: плита во всю ширину,
светлая верхняя кромка, тёмный нижний скос, заклёпки, чёрные окна приборов вокруг значений
и лампы улучшений (погасшие/горящие). Подписи и значения поднимаются (`HUD_LABEL_Y` 4 → 3,
`HUD_VALUE_Y` 14 → 12); раскладка по X — из 034, без изменений. Состояния нет — только
константы геометрии (`hud.ts`), цвета (`art.ts`, `bonus-art.ts`) и отрисовка
(`hud-render.ts`).

Рамка — согласованный `design.md` фичи 009 (раунд 3, пункт 2 нарезки) и `analyze.md`.
Принятые решения по замечаниям анализа (пп. 1–6, по рекомендациям разработчика):

1. Цвет буквы капсулы — новым параметром `capsuleSprite(..., letter = CAPSULE_LETTER_COLOR)`
   (строки букв `S`/`D` выносятся в константы, чтобы горящий и погасший спрайты брали
   одну форму).
2. Цвет окна — `HUD_WINDOW_COLOR = '#000'` в `art.ts` (не `PANEL_*`, чтобы тест
   «`PANEL_*` ≠ цвет окна» не проверял цвет сам с собой).
3. Порядок секций в `drawHud` — как в коде (щит, затем улучшения), не как в перечислении
   дизайна; на пиксели не влияет.
4. Доп. проверка в `art.test`: `PANEL_*_COLOR` ≠ `HUD_RECORD_COLOR` (защищает фильтр по
   цвету в `play-scene.test.ts` `recordColorCalls`).
5. В `hud-render.test.ts` — отдельные хелперы `panelCalls()` (вызовы `drawPanel`) и
   `sections(view)` (вызовы `drawHud` без плиты); имя `draw` уже занято.
6. Устаревшие комментарии (`hud.ts`, `hud-render.ts`, `play-scene.ts`) и `overview.md`
   правятся в этой задаче.

Дополнение к анализу: кроме `hud.test.ts:224` и `:289`, меняется ещё литерал
`hud.test.ts:193` — `HI_ZONE` `{ x: 64, y: 4, width: 48, height: 17 }` →
`{ x: 64, y: 3, width: 48, height: 16 }` (зона выводится из `HUD_LABEL_Y` и
`TEXT_ZONE_HEIGHT`). Проверка не ослабляется — меняется только ожидаемое значение.

## 1. Строки Y и геометрия панели

**Файл (изменить):** `src/game/hud.ts`

1.1. Строки и комментарии с координатами:

```typescript
/** Top of the label row (glyphs y = 3...9), under the plate's top edge (y = 0). */
export const HUD_LABEL_Y = 3;
/**
 * Top of the value row (glyphs y = 12...18, icons and gauge zone y = 12...19); the
 * instrument windows around it are y = 11...20, above the bottom bevel (y = 22...23).
 */
export const HUD_VALUE_Y = 12;
```

- `SHIELD_SEGMENT_Y` — комментарий `(12 + (8 - 4) / 2 = 14, rows 14...17)`.
- `TEXT_ZONE_HEIGHT` — комментарий `Label row + value row: 12 + 7 - 3 = 16.`
- `SHIELD_ZONE` — `/** x = 200...247, y = 12...19: ... */`.
- `POWER_UPS_ZONE` — `x = 168...185, y = 12...19`.
- Комментарий у `HUD_HEIGHT` — дописать: `The opaque panel plate covers the whole strip.`

1.2. После `HUD_ZONES` — геометрия плиты и окон:

```typescript
/** The value row of a section zone: same x/width, y = HUD_VALUE_Y, height = HUD_ICON_SIZE. */
export function valueRow(zone: HudZone): HudZone {
  return { x: zone.x, y: HUD_VALUE_Y, width: zone.width, height: HUD_ICON_SIZE };
}

/** Panel plate = the whole HUD strip (opaque, covers stars and objects under it, В5). */
export const PANEL_ZONE: HudZone = { x: 0, y: 0, width: SCREEN_WIDTH, height: HUD_HEIGHT };

/** Light top edge of the plate: row y = 0. */
export const PANEL_EDGE_HEIGHT = 1;
/** Dark bottom bevel of the plate: rows y = 22...23. */
export const PANEL_BEVEL_HEIGHT = 2;

/** Window margin around a value row, px. */
export const HUD_WINDOW_PAD = 1;

/**
 * Dark instrument windows: valueRow(zone) grown by HUD_WINDOW_PAD, one per HUD_ZONES entry
 * (same order). y = 11...20; x: SCORE 7...56, HI 63...112, LEVEL 119...160,
 * shield 199...248, power-ups 167...186.
 */
export const HUD_WINDOWS: readonly HudZone[] = HUD_ZONES.map((zone) => {
  const row = valueRow(zone);
  return {
    x: row.x - HUD_WINDOW_PAD,
    y: row.y - HUD_WINDOW_PAD,
    width: row.width + 2 * HUD_WINDOW_PAD,
    height: row.height + 2 * HUD_WINDOW_PAD,
  };
});

/** 1 px rivets in the plate corners, in the side margins (x 0...6, 249...255), off the windows. */
export const PANEL_RIVETS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 2, y: 2 },
  { x: SCREEN_WIDTH - 3, y: 2 },
  { x: 2, y: HUD_HEIGHT - PANEL_BEVEL_HEIGHT - 2 },
  { x: SCREEN_WIDTH - 3, y: HUD_HEIGHT - PANEL_BEVEL_HEIGHT - 2 },
];
```

Заклёпки: (2, 2), (253, 2), (2, 20), (253, 20) — по 1 px зазора до кромки (y = 0) и до
скоса (y = 22). `PANEL_EDGE_HEIGHT`, `PANEL_BEVEL_HEIGHT`, `PANEL_RIVETS` — уточнение
дизайна («константы геометрии в `hud.ts`», раздел «Панель»): нужны тестам как константы,
а не литералы в рендере. Боковые кромки x = 0 / 255 отдельно не рисуются (дизайн задаёт
только протяжённость плиты); при желании владельца — правка на приёмке.

## 2. Цвета панели и окна

**Файл (изменить):** `src/game/art.ts` — после `HUD_RECORD_COLOR`, импорт по-прежнему
только `sprite.ts`.

```typescript
/**
 * Ship panel colors (feature 009 В5), first pass, approved at acceptance. Pairwise distinct,
 * distinct from the window, the empty gauge segment and the HUD text colors (art.test.ts).
 */
/** Plate: cool steel grey-blue; the red labels sit on it. */
export const PANEL_PLATE_COLOR = '#545470';
/** Light top edge, y = 0. */
export const PANEL_EDGE_COLOR = '#a8a8c8';
/** Dark bottom bevel, y = 22...23. */
export const PANEL_BEVEL_COLOR = '#24243a';
/** Corner rivets, 1 px. */
export const PANEL_RIVET_COLOR = '#d0d0e0';

/** Instrument windows behind the values. Not a PANEL_* color: tests compare those with it. */
export const HUD_WINDOW_COLOR = '#000';
```

Оттенки — первый проход в духе NES (стальная плита, светлая кромка, тёмный скос), итог —
приёмка глазами.

## 3. Погасшие лампы

**Файл (изменить):** `src/game/bonus-art.ts`

- `import type { BonusKind, PowerUpKind } from './bonus';`
- Строки букв `S`/`D` — в константы (одна форма для горящей и погасшей капсулы):

```typescript
/** Letter rows 1...5 of the capsule plates (4×5 letter L on fill F, frame B). */
const FAST_SHOT_LETTER = ['BFFLLLFB', 'BFLFFFFB', 'BFFLLFFB', 'BFFFFLFB', 'BFLLLFFB'];
const DOUBLE_SHOT_LETTER = ['BFLLLFFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLLLFFB'];

/** Plate, 8×8: frame B, fill F, letter L (4×5) in rows 1...5. */
function capsuleSprite(
  letterRows: readonly string[],
  fill: string,
  frame: string,
  letter: string = CAPSULE_LETTER_COLOR,
): Sprite {
  return parseSprite(['.BBBBBB.', ...letterRows, 'BFFFFFFB', '.BBBBBB.'], {
    B: frame,
    F: fill,
    L: letter,
  });
}
```

- В `CAPSULE_SPRITES` для `fastShot`/`doubleShot` — `FAST_SHOT_LETTER` /
  `DOUBLE_SHOT_LETTER` вместо литералов (пиксели не меняются; `shield` — как есть).
- Новый экспорт:

```typescript
/**
 * Unlit HUD lamps (feature 009 В7): the same capsule and letter in a dark palette, shown in a
 * power-up slot until the power-up is taken. No window black and no color of the lit sprite
 * (bonus-art.test.ts). First pass, approved at acceptance.
 */
export const CAPSULE_OFF_SPRITES: Readonly<Record<PowerUpKind, Sprite>> = {
  fastShot: capsuleSprite(FAST_SHOT_LETTER, '#1c2a54', '#0e1838', '#56689c'), // dim blue
  doubleShot: capsuleSprite(DOUBLE_SHOT_LETTER, '#1c3a22', '#0e2412', '#56845e'), // dim green
};
```

## 4. Отрисовка: `drawPanel` и лампы

**Файл (изменить):** `src/game/hud-render.ts`

- Импорты: `HUD_WINDOW_COLOR`, `PANEL_BEVEL_COLOR`, `PANEL_EDGE_COLOR`, `PANEL_PLATE_COLOR`,
  `PANEL_RIVET_COLOR` из `./art`; `CAPSULE_OFF_SPRITES` из `./bonus-art`; `HUD_WINDOWS`,
  `PANEL_BEVEL_HEIGHT`, `PANEL_EDGE_HEIGHT`, `PANEL_RIVETS`, `PANEL_ZONE` из `./hud`.

```typescript
/**
 * Draws the top HUD over the scene: the panel plate first (it covers the stars and anything
 * flying under it), then the sections - score, record (HI), level, shield gauge, power-up lamps.
 * Each section draws only inside its own zone (see hud.ts); a new section adds a drawX here.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawPanel(ctx);
  drawScore(ctx, view.score);
  drawHighScore(ctx, view.highScore, view.newRecord);
  drawLevel(ctx, view.level);
  drawShield(ctx, view.shield);
  drawPowerUps(ctx, view.powerUps);
}

/**
 * Plate, top edge, bottom bevel, windows, rivets; only inside PANEL_ZONE. The first fillRect
 * is the whole plate. Static: same calls every frame. Exported for the HUD render tests.
 */
export function drawPanel(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height } = PANEL_ZONE;
  ctx.fillStyle = PANEL_PLATE_COLOR;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = PANEL_EDGE_COLOR;
  ctx.fillRect(x, y, width, PANEL_EDGE_HEIGHT);
  ctx.fillStyle = PANEL_BEVEL_COLOR;
  ctx.fillRect(x, y + height - PANEL_BEVEL_HEIGHT, width, PANEL_BEVEL_HEIGHT);
  ctx.fillStyle = HUD_WINDOW_COLOR;
  for (const w of HUD_WINDOWS) ctx.fillRect(w.x, w.y, w.width, w.height);
  ctx.fillStyle = PANEL_RIVET_COLOR;
  for (const r of PANEL_RIVETS) ctx.fillRect(r.x, r.y, 1, 1);
}

/**
 * A lamp per power-up slot: lit (the capsule sprite, as on the field) when enabled, unlit
 * (CAPSULE_OFF_SPRITES) otherwise (В7). Slots are fixed: a lamp never moves.
 */
function drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUps): void {
  for (const kind of POWER_UP_SLOT_KINDS) {
    const sprite = powerUps[kind] ? CAPSULE_SPRITES[kind] : CAPSULE_OFF_SPRITES[kind];
    drawSprite(ctx, sprite, POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
  }
}
```

Производительность: плита — 3 + 5 + 4 = 12 `fillRect`, погасшие лампы — до 2 спрайтов 8×8;
пренебрежимо на 60 тиках (offscreen-кэш отвергнут дизайном).

## 5. Сцена: комментарий

**Файл (изменить):** `src/game/scenes/play-scene.ts:82` — комментарий
`// no background: text over the battle` → `// opaque panel over the battle: covers what flies under it`.
Логика сцены не меняется.

## 6. Тесты

Все — Vitest, environment `node`, без canvas (`recorder()`).

### 6.1. `src/game/hud.test.ts` (изменить)

Импорты: `valueRow`, `PANEL_ZONE`, `HUD_WINDOWS`, `HUD_WINDOW_PAD`, `PANEL_EDGE_HEIGHT`,
`PANEL_BEVEL_HEIGHT`, `PANEL_RIVETS`.

Правка ожиданий (строки 035 таблицы дизайна + `:193`):

- `:193` `HI_ZONE` → `{ x: 64, y: 3, width: 48, height: 16 }`.
- `:224` `SHIELD_ZONE` → `{ x: 200, y: 12, width: 48, height: 8 }`.
- `:287-290` название → `'centers segments vertically in the value row (y = 14...17)'`,
  `toBe(16)` → `toBe(14)`.

Новые тесты (в `describe('layout')` или новый `describe('panel')`):

```typescript
describe('panel', () => {
  it('puts the label and value rows inside the panel (labels y = 3, values y = 12)', () => {
    expect(HUD_LABEL_Y).toBe(3);
    expect(HUD_VALUE_Y).toBe(12);
  });

  it('valueRow keeps x and width and takes the value row', () => {
    expect(valueRow(SCORE_ZONE)).toEqual({ x: 8, y: 12, width: 48, height: HUD_ICON_SIZE });
    expect(valueRow(LEVEL_ZONE)).toEqual({ x: 120, y: 12, width: 40, height: 8 });
  });

  it.each([
    ['shield', SHIELD_ZONE],
    ['power-ups', POWER_UPS_ZONE],
  ])('valueRow of the value-row-only %s zone is the zone itself', (_n, zone) => {
    expect(valueRow(zone)).toEqual(zone);
  });

  it('the plate is the whole HUD strip', () => {
    expect(PANEL_ZONE).toEqual({ x: 0, y: 0, width: SCREEN_WIDTH, height: HUD_HEIGHT });
  });

  it('has one window per zone: its value row grown by HUD_WINDOW_PAD', () => {
    expect(HUD_WINDOW_PAD).toBe(1);
    expect(HUD_WINDOWS).toHaveLength(HUD_ZONES.length);
    HUD_ZONES.forEach((zone, i) => {
      const row = valueRow(zone);
      expect(HUD_WINDOWS[i]).toEqual({
        x: row.x - 1,
        y: row.y - 1,
        width: row.width + 2,
        height: row.height + 2,
      });
    });
  });

  it('places the windows at the designed pixels', () => {
    expect(HUD_WINDOWS).toEqual([
      { x: 7, y: 11, width: 50, height: 10 }, // SCORE
      { x: 63, y: 11, width: 50, height: 10 }, // HI
      { x: 119, y: 11, width: 42, height: 10 }, // LEVEL
      { x: 199, y: 11, width: 50, height: 10 }, // shield
      { x: 167, y: 11, width: 20, height: 10 }, // power-ups
    ]);
  });

  it('keeps every window inside the plate, below the labels and above the bevel', () => {
    for (const w of HUD_WINDOWS) {
      expect(inside(w, PANEL_ZONE)).toBe(true);
      expect(w.y).toBeGreaterThan(HUD_LABEL_Y + GLYPH_HEIGHT - 1); // label bottom 9 < top 11
      expect(w.y).toBeGreaterThanOrEqual(PANEL_EDGE_HEIGHT);
      expect(w.y + w.height).toBeLessThanOrEqual(HUD_HEIGHT - PANEL_BEVEL_HEIGHT);
    }
  });

  it('has no overlapping windows', () => {
    /* попарно, как 'has no overlapping zones' */
  });

  it('keeps the rivets in the plate, off the edge, the bevel, the windows and the zones', () => {
    for (const r of PANEL_RIVETS) {
      const px = { x: r.x, y: r.y, width: 1, height: 1 };
      expect(inside(px, PANEL_ZONE)).toBe(true);
      expect(r.y).toBeGreaterThanOrEqual(PANEL_EDGE_HEIGHT);
      expect(r.y).toBeLessThan(HUD_HEIGHT - PANEL_BEVEL_HEIGHT);
      for (const z of [...HUD_WINDOWS, ...HUD_ZONES]) expect(overlaps(px, z)).toBe(false);
    }
  });
});
```

Хелперы `inside(a, b)` и `overlaps(a, b)` для `HudZone` — локально в тесте; существующий
`'has no overlapping zones'` переписать на `overlaps` (поведение то же) — допустимо, но
не обязательно.

Существующие «zone spans both text rows», «label row above value row», `HUD_HEIGHT ≤ 28`,
«no overlapping zones», «keeps every zone ... inside the HUD strip» — без правок, проходят
при новых Y.

### 6.2. `src/game/hud-render.test.ts` (изменить)

Импорты: `drawPanel` из `./hud-render`; `CAPSULE_OFF_SPRITES` из `./bonus-art`;
`HUD_WINDOW_COLOR`, `PANEL_*_COLOR` из `./art`; `HUD_WINDOWS`, `PANEL_ZONE`,
`PANEL_RIVETS` из `./hud`.

Хелперы (п. 5 решений):

```typescript
/** Reference output of drawPanel (static: the same every call). */
function panelCalls(): FillCall[] {
  const { ctx, calls } = recorder();
  drawPanel(ctx);
  return calls;
}

/** drawHud calls without the panel plate: the sections only. */
function sections(view: HudView): FillCall[] {
  return draw(view).slice(panelCalls().length);
}

/** Reference output: a lit capsule for each enabled kind, an unlit lamp for the rest. */
function iconCalls(powerUps: PowerUps): FillCall[] {
  const { ctx, calls } = recorder();
  for (const kind of POWER_UP_SLOT_KINDS) {
    const sprite = powerUps[kind] ? CAPSULE_SPRITES[kind] : CAPSULE_OFF_SPRITES[kind];
    drawSprite(ctx, sprite, POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
  }
  return calls;
}
```

Правила: во **всех** тестах, фильтрующих вызовы `drawHud` по координатам или цвету,
`draw(view)` → `sections(view)`. Проверки не ослабляются.

Существующие тесты:

| тест                                                      | правка                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «draws only inside the HUD strip and its zones (%s)»      | `sections(view)`; правило зон прежнее (погасшие лампы — в `POWER_UPS_ZONE`)                                                                                                                       |
| «a %s change touches only its own zone»                   | `sections(BASE)` / `sections(changed)`                                                                                                                                                            |
| «places the text and the gauge exactly»                   | `draw(...)` целиком `toEqual([...panelCalls(), ...текст как сейчас, ...gaugeCalls(0), ...iconCalls(NO_POWER_UPS)])`                                                                               |
| «centers level %i», «draws the gauge for shield %i»       | `sections(...)`                                                                                                                                                                                   |
| «draws the gauge at the exact pixels»                     | `sections(...)`; `[200, 16, 8, 4]…[240, 16, 8, 4]` → `[200, 14, 8, 4]…[240, 14, 8, 4]`                                                                                                            |
| «uses label, value and gauge colors in their places»      | `sections(BASE)` (иначе фильтр по Y цепляет заклёпки/плиту)                                                                                                                                       |
| «draws the labels the same…», три record-теста            | `sections(...)`                                                                                                                                                                                   |
| «draws nothing in the power-ups zone without power-ups»   | переименовать в «draws an unlit lamp in every slot without power-ups»: `sortedKeys(зона) == sortedKeys(iconCalls(NO_POWER_UPS))`, длина > 0, и ни одного цвета из горящих `CAPSULE_SPRITES[kind]` |
| «draws only the enabled power-ups, each in its slot (%s)» | → «lights the enabled power-ups, the rest stay unlit (%s)»; `sections(...)`; эталон — новый `iconCalls`                                                                                           |
| «keeps the doubleShot icon in place…»                     | без правок (разность мультимножеств: плита и погасшие лампы сокращаются; цвета погасшей и горящей не пересекаются)                                                                                |

Новые тесты (`describe('drawPanel')` + в `describe('drawHud')`):

```typescript
describe('drawPanel', () => {
  it('starts with the whole plate', () => {
    expect(panelCalls()[0]).toEqual({
      fillStyle: PANEL_PLATE_COLOR,
      x: 0,
      y: 0,
      w: SCREEN_WIDTH,
      h: HUD_HEIGHT,
    });
  });

  it('draws only inside PANEL_ZONE', () => {
    for (const c of panelCalls()) expect(inZone(c, PANEL_ZONE), key(c)).toBe(true);
  });

  it('draws the top edge and the bottom bevel across the full width', () => {
    const calls = panelCalls();
    expect(calls).toContainEqual({
      fillStyle: PANEL_EDGE_COLOR,
      x: 0,
      y: 0,
      w: SCREEN_WIDTH,
      h: 1,
    });
    expect(calls).toContainEqual({
      fillStyle: PANEL_BEVEL_COLOR,
      x: 0,
      y: 22,
      w: SCREEN_WIDTH,
      h: 2,
    });
  });

  it('draws every window in the window color', () => {
    const windows = panelCalls().filter((c) => c.fillStyle === HUD_WINDOW_COLOR);
    expect(windows.map((c) => ({ x: c.x, y: c.y, width: c.w, height: c.h }))).toEqual([
      ...HUD_WINDOWS,
    ]);
  });

  it('draws a 1 px rivet at every PANEL_RIVETS point', () => {
    const rivets = panelCalls().filter((c) => c.fillStyle === PANEL_RIVET_COLOR);
    expect(rivets).toEqual(
      PANEL_RIVETS.map((r) => ({ fillStyle: PANEL_RIVET_COLOR, x: r.x, y: r.y, w: 1, h: 1 })),
    );
  });

  it('uses only the panel and window colors', () => {
    const allowed = new Set([
      PANEL_PLATE_COLOR,
      PANEL_EDGE_COLOR,
      PANEL_BEVEL_COLOR,
      PANEL_RIVET_COLOR,
      HUD_WINDOW_COLOR,
    ]);
    for (const c of panelCalls()) expect(allowed.has(c.fillStyle), key(c)).toBe(true);
  });
});

// in describe('drawHud'):
it.each([
  ['base', BASE],
  ['max', MAX_VIEW],
])('starts with the panel (%s)', (_n, view) => {
  const panel = panelCalls();
  expect(panel.length).toBeGreaterThan(0);
  expect(draw(view).slice(0, panel.length)).toEqual(panel);
});

it('draws the values inside their windows', () => {
  // every value-row call of a section (y >= HUD_VALUE_Y) lies inside some HUD_WINDOWS entry
  for (const c of sections(MAX_VIEW).filter((c) => c.y >= HUD_VALUE_Y)) {
    expect(
      HUD_WINDOWS.some((w) => inZone(c, w)),
      key(c),
    ).toBe(true);
  }
});
```

`MAX_VIEW` — вынести в константу объект `'max'` из теста «draws only inside…» (сейчас
литерал в `it.each`), чтобы использовать в нескольких тестах.

### 6.3. `src/game/art.test.ts` (изменить)

В `describe('HUD colors')`:

```typescript
const PANEL_COLORS = [PANEL_PLATE_COLOR, PANEL_EDGE_COLOR, PANEL_BEVEL_COLOR, PANEL_RIVET_COLOR];

it('the panel colors, the window and the empty gauge segment are pairwise distinct', () => {
  const colors = [...PANEL_COLORS, HUD_WINDOW_COLOR, SHIELD_GAUGE_EMPTY_COLOR];
  expect(new Set(colors).size).toBe(colors.length);
});

it('the window is black', () => {
  expect(HUD_WINDOW_COLOR).toBe('#000');
});

it('the panel colors differ from the HUD text colors (label, value, record)', () => {
  for (const c of PANEL_COLORS) {
    expect([HUD_LABEL_COLOR, HUD_VALUE_COLOR, HUD_RECORD_COLOR]).not.toContain(c);
  }
});
```

Сравнение строк: все цвета — в одном формате (`#rrggbb` / `#000`); различимость — по
строке, как в существующих тестах палитры.

### 6.4. `src/game/bonus-art.test.ts` (изменить)

Импорты: `HUD_WINDOW_COLOR` из `./art`, `NO_POWER_UPS` из `./bonus`,
`CAPSULE_OFF_SPRITES` из `./bonus-art`.

```typescript
const POWER_UP_KINDS = Object.keys(NO_POWER_UPS) as PowerUpKind[];
const colorsOf = (s: Sprite): Set<string> =>
  new Set(s.pixels.filter((p): p is string => p !== null));

describe('CAPSULE_OFF_SPRITES', () => {
  it('has an unlit lamp for every power-up kind', () => {
    expect(Object.keys(CAPSULE_OFF_SPRITES).sort()).toEqual([...POWER_UP_KINDS].sort());
  });

  it.each(POWER_UP_KINDS)('%s is the size of the lit capsule (8×8)', (kind) => {
    expect(CAPSULE_OFF_SPRITES[kind].width).toBe(CAPSULE_SPRITES[kind].width);
    expect(CAPSULE_OFF_SPRITES[kind].height).toBe(CAPSULE_SPRITES[kind].height);
  });

  it.each(POWER_UP_KINDS)('%s has the lit capsule shape (same opaque pixels)', (kind) => {
    const off = CAPSULE_OFF_SPRITES[kind].pixels.map((p) => p !== null);
    const lit = CAPSULE_SPRITES[kind].pixels.map((p) => p !== null);
    expect(off).toEqual(lit);
  });

  it.each(POWER_UP_KINDS)('%s does not use the window black', (kind) => {
    expect(colorsOf(CAPSULE_OFF_SPRITES[kind]).has(HUD_WINDOW_COLOR)).toBe(false);
  });

  it.each(POWER_UP_KINDS)('%s shares no color with the lit capsule', (kind) => {
    const lit = colorsOf(CAPSULE_SPRITES[kind]);
    for (const c of colorsOf(CAPSULE_OFF_SPRITES[kind])) expect(lit.has(c), c).toBe(false);
  });

  it('differs between kinds', () => {
    expect(CAPSULE_OFF_SPRITES.fastShot.pixels).not.toEqual(CAPSULE_OFF_SPRITES.doubleShot.pixels);
  });
});
```

`import type { PowerUpKind } from './bonus'`, `import type { Sprite } from './sprite'`.
Существующие тесты `CAPSULE_SPRITES` проходят без правок (пиксели горящих не меняются —
это и проверка рефакторинга строк букв).

### 6.5. `src/game/scenes/play-scene.test.ts` (изменить, один тест)

Плита закрывает бой — HUD рисуется после `drawBattle`:

```typescript
it('draws the HUD panel last while playing, over the battle', () => {
  const scene = newScene();
  const hud = recorder();
  drawHud(hud.ctx, hudView(scene.battle, scene.hudRecord()));
  const { ctx, calls } = recorder();
  scene.render(ctx);
  expect(calls.slice(-hud.calls.length)).toEqual(hud.calls);
});
```

(`drawHud` импортировать из `../hud-render`.) `recordColorCalls` и тесты подписи game over —
без правок (окно `HI` x = 63…112 и плита не лежат внутри `HI_ZONE`; `PANEL_*` ≠
`HUD_RECORD_COLOR` закреплено в `art.test`).

Не затронуты: `game-over-render.test.ts` (только `HUD_HEIGHT`), `dev-snapshot.test.ts`,
`battle-render.test.ts`.

### 6.6. Полный набор проверок

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 7. Ручная проверка

`npm run dev`, начать игру:

- Плита во всю ширину 24 px закрывает звёзды; светлая линия по верху, тёмный скос 2 px
  внизу, 4 заклёпки в углах; плита в духе NES, не «кислотная».
- Пять чёрных окон: `SCORE`, `HI`, `LEVEL`, лампы, шкала щита; цифры белые, читаются,
  окно вокруг цифр — 1 px сверху, 2 px снизу (асимметрия принята дизайном, оценить глазами).
  Красные подписи читаются на плите.
- Без улучшений — две погасшие лампы `S`, `D`, буквы различимы, но явно «выключены»; после
  капсулы `S`/`D` лампа загорается (обычный значок), не сдвигаясь.
- Шкала щита — в своём окне, пустые сегменты (`#3c3c3c`) видны на чёрном.
- `HI` при новом рекорде — жёлтый на чёрном окне.
- Враги, возвращающиеся сверху, и астероид выезжают из-под нижнего края панели без
  артефактов; взрыв врага на апексе дуги вылета (верх y = 29) не задевает панель.
- Game over: подпись поверх поля, панель не мерцает.

Итог — `acceptance.md` в папке задачи (заполняется на приёмке).

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- `art.ts` (`:76-81`): добавить `PANEL_PLATE_COLOR`, `PANEL_EDGE_COLOR`,
  `PANEL_BEVEL_COLOR`, `PANEL_RIVET_COLOR` (стальная плита, светлая кромка, тёмный скос,
  заклёпки; утверждаются на приёмке) и `HUD_WINDOW_COLOR = '#000'` (окна; не `PANEL_*`);
  попарная различимость с окном, `SHIELD_GAUGE_EMPTY_COLOR` и цветами текста — тест.
- `bonus-art.ts` (`:335`): `CAPSULE_OFF_SPRITES: Record<PowerUpKind, Sprite>` — погасшие
  лампы HUD (та же форма и буква в тёмной палитре, без `#000` и цветов горящей);
  `capsuleSprite(letterRows, fill, frame, letter?)`.
- `hud.ts` (`:376-395`): `HUD_LABEL_Y = 3` / `HUD_VALUE_Y = 12`; `SCORE_ZONE` (8, 3, 48×16),
  `HI_ZONE` (64, 3, 48×16), `LEVEL_ZONE` (120, 3, 40×16), `SHIELD_ZONE` (200, 12, 48×8,
  `SHIELD_SEGMENT_Y = 14`), `POWER_UPS_ZONE` (168, 12, 18×8); новые `valueRow(zone)`,
  `PANEL_ZONE`, `PANEL_EDGE_HEIGHT = 1`, `PANEL_BEVEL_HEIGHT = 2`, `HUD_WINDOW_PAD = 1`,
  `HUD_WINDOWS` (из зон, y = 11…20), `PANEL_RIVETS` (2/253 × 2/20).
- `hud-render.ts` (`:396-402`): `drawPanel` (экспорт) первым в `drawHud` — плита, кромка,
  скос, окна, заклёпки; лампы — горящий `CAPSULE_SPRITES` / погасший `CAPSULE_OFF_SPRITES`
  в каждом слоте; убрать «фон не рисует».
- `play-scene.ts` (`:426`): «`drawHud(...)` (без фона)» → «(непрозрачная панель поверх боя)».
- Граф импортов (`:456`): `bonus-art → sprite` (`BonusKind`, `PowerUpKind` — type).

**Файл (сверить):** `second-brain/game-design.md`, раздел «Экран» (`:17-25`) — панель уже
описана (обновлено в 034). Сверить с итогом; при необходимости дописать: «плита
стальная, погасшая лампа — та же капсула в тёмных тонах». Оттенки после приёмки — правкой
по её итогу.

README в `src/game/` нет — не требуется.

## Сводка по файлам

| Действие | Файл                                       |
| -------- | ------------------------------------------ |
| Изменить | `src/game/hud.ts`                          |
| Изменить | `src/game/art.ts`                          |
| Изменить | `src/game/bonus-art.ts`                    |
| Изменить | `src/game/hud-render.ts`                   |
| Изменить | `src/game/scenes/play-scene.ts` (коммент.) |
| Изменить | `src/game/hud.test.ts`                     |
| Изменить | `src/game/hud-render.test.ts`              |
| Изменить | `src/game/art.test.ts`                     |
| Изменить | `src/game/bonus-art.test.ts`               |
| Изменить | `src/game/scenes/play-scene.test.ts`       |
| Изменить | `second-brain/architecture/overview.md`    |
| Сверить  | `second-brain/game-design.md` («Экран»)    |

## Архитектура и паттерны

- Логика отдельно от рендера: вся геометрия (`valueRow`, `PANEL_ZONE`, `HUD_WINDOWS`,
  `PANEL_RIVETS`) — чистые константы в `hud.ts`, тестируемые без canvas; `drawPanel` —
  только `fillRect` по ним.
- Окна выводятся из зон (`HUD_ZONES.map`), а не числами: новая секция получает окно
  автоматически.
- Граница модулей: `art.ts` импортирует только `sprite.ts`; цвета ламп — в `bonus-art.ts`
  (`import type { PowerUpKind }`); `hud.ts` не знает о цветах.
- Детерминизм: панель статична, без `Rng` и `dt`; лампы — чистая функция `view.powerUps`.
- `import type` для типов; комментарии и код — на английском.

## Ссылки

- `second-brain/tasks/tasks/035-ship-panel/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/009-high-score-ship-panel/design.md` (раунд 3: «Панель»,
  «Раскладка», «Тестирование», таблица меняющихся тестов, нарезка п. 2), `README.md` (В5–В8)
- `second-brain/architecture/overview.md`
- `second-brain/game-design.md` («Экран»)

## Открытые вопросы

нет. Из `analyze.md` перенесено: открытых вопросов не было; замечания пп. 1–6 решены по
рекомендациям разработчика (см. начало плана). Оттенки плиты и ламп, боковые кромки
(не рисуются) — вкусовое, решается на приёмке (`acceptance.md`).

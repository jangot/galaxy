# План реализации: Шкала щита в панели

Временные иконки кораблей справа в HUD (031 рисует `shield` штук `LIFE_ICON_SPRITE`)
заменяются постоянной шкалой щита: `MAX_SHIELD` = 5 сегментов 8×4 с шагом 10 в прежней зоне
200…247 × 14…21, залиты первые `shield` цветом `SHIELD_COLORS[shield]`, остальные —
`SHIELD_GAUGE_EMPTY_COLOR`. Попутно из HUD уходят «жизни»: `LIFE_ICON_*` → `HUD_ICON_*`,
`LIVES_ZONE` → `SHIELD_ZONE`, `drawLives` → `drawShield`, удаляются `LIFE_ICON_SPRITE` и
`LIVES_ICON_SLOTS`. Раскладка панели не сдвигается, логика игры не меняется.

Решения плана по «Открытым вопросам» analyze.md (уровень реализации, не к владельцу):

1. `drawShield` рисует **всегда ровно `MAX_SHIELD`** сегментов; залит сегмент `i < shield`.
   Кейс «at most LIVES_ICON_SLOTS» заменяется на «всегда `MAX_SHIELD` сегментов». Вход вне
   `0…MAX_SHIELD` — вне контракта (`Player` его не допускает); при `SHIELD_COLORS[shield]`
   `null`/`undefined` цвет заливки падает на `SHIELD_GAUGE_EMPTY_COLOR` (`??` нужен и для
   типа — `noUncheckedIndexedAccess`), поэтому за пределы зоны ничего не уходит.
2. y сегмента — экспортируемая константа `SHIELD_SEGMENT_Y` в `hud.ts` (= 16), удобно в
   тестах.
3. В `art.test.ts` — проверка, что `SHIELD_GAUGE_EMPTY_COLOR` не совпадает ни с одним
   `SHIELD_COLORS` (защищает приёмочную подстройку цвета).

## 1. Цвет пустого сегмента, удаление иконки корабля

**Файл (изменить):** `src/game/art.ts`

- Удалить `LIFE_ICON_SPRITE` (строки 32–36) вместе с doc-комментарием. `SHIP_PALETTE`
  остаётся (им пользуется `SHIP_SPRITE`).
- После `SHIELD_OFFSET_Y` (рядом с остальным щитом) добавить:

```typescript
/** HUD shield gauge: color of an empty segment (first pass, approved at acceptance). */
export const SHIELD_GAUGE_EMPTY_COLOR = '#3c3c3c';
```

Импорты `art.ts` не меняются (только `./sprite`).

## 2. Раскладка шкалы

**Файл (изменить):** `src/game/hud.ts`

1. Импорт: `import { MAX_SHIELD } from './player';` (значение, не тип; цикла нет — `player`
   от HUD не зависит).
2. Комментарий `HudView.shield` (`:10`): `/** Shield level 0..MAX_SHIELD, drawn as the shield gauge. */`.
3. Комментарий `HUD_VALUE_Y` (`:34`): `/** Top of the value row (glyphs y = 14...20, icons and gauge zone y = 14...21). */`.
4. Заменить блок `LIFE_ICON_MAX_SIZE` / `LIFE_ICON_STEP` / `LIVES_ICON_SLOTS` (`:37–45`):

```typescript
/** Size limit of a value-row icon (both sides); zones are sized by it, not by the art. */
export const HUD_ICON_SIZE = 8;
/** Horizontal step between value-row icons and shield segments: <= 8 px plus a 2 px gap. */
export const HUD_ICON_STEP = 10;

/** One shield gauge segment, a plain rectangle. */
export const SHIELD_SEGMENT_WIDTH = 8;
export const SHIELD_SEGMENT_HEIGHT = 4;
/** Segment top: centered in the value row's icon height (14 + (8 - 4) / 2 = 16, rows 16...19). */
export const SHIELD_SEGMENT_Y = HUD_VALUE_Y + (HUD_ICON_SIZE - SHIELD_SEGMENT_HEIGHT) / 2;
```

5. Заменить `LIVES_ZONE_WIDTH` / `LIVES_ZONE` (`:68–76`):

```typescript
const SHIELD_ZONE_WIDTH = (MAX_SHIELD - 1) * HUD_ICON_STEP + SHIELD_SEGMENT_WIDTH; // 48

/** x = 200...247, y = 14...21: value row only; MAX_SHIELD segments left to right. */
export const SHIELD_ZONE: HudZone = {
  x: SCREEN_WIDTH - HUD_MARGIN_X - SHIELD_ZONE_WIDTH,
  y: HUD_VALUE_Y,
  width: SHIELD_ZONE_WIDTH,
  height: HUD_ICON_SIZE,
};

/** x of shield segment i (0-based, left to right): 200, 210, ..., 240. Filled when i < shield. */
export function shieldSegmentX(i: number): number {
  return SHIELD_ZONE.x + i * HUD_ICON_STEP;
}
```

`shieldSegmentX` — функция, объявленная через `function`, но использует `SHIELD_ZONE`
только при вызове, так что место в файле — сразу после зоны (для читаемости).

6. Значки улучшений (`:81–98`): `LIFE_ICON_STEP` → `HUD_ICON_STEP`,
   `LIFE_ICON_MAX_SIZE` → `HUD_ICON_SIZE` в `POWER_UPS_ZONE_WIDTH`, `POWER_UPS_ZONE.height`,
   `POWER_UP_SLOT_X.doubleShot`. Комментарий `POWER_UPS_ZONE`: «…between the level (ends at 147) and the shield gauge (starts at 200)…».
7. `HUD_ZONES` (`:101`): `[SCORE_ZONE, LEVEL_ZONE, SHIELD_ZONE, POWER_UPS_ZONE]`.

Значения не меняются: `SHIELD_ZONE` = `{ 200, 14, 48, 8 }` (как `LIVES_ZONE`),
`POWER_UPS_ZONE` = `{ 156, 14, 18, 8 }`.

## 3. Отрисовка шкалы

**Файл (изменить):** `src/game/hud-render.ts`

- Импорт из `./art`: `HUD_LABEL_COLOR, HUD_VALUE_COLOR, SHIELD_COLORS, SHIELD_GAUGE_EMPTY_COLOR`
  (без `LIFE_ICON_SPRITE`).
- Импорт из `./hud`: убрать `LIFE_ICON_STEP`, `LIVES_ICON_SLOTS`, `LIVES_ZONE`; добавить
  `SHIELD_SEGMENT_HEIGHT`, `SHIELD_SEGMENT_WIDTH`, `SHIELD_SEGMENT_Y`, `shieldSegmentX`.
- Новый импорт: `import { MAX_SHIELD } from './player';`.
- `drawSprite` остаётся (нужен `drawPowerUps`).
- Doc `drawHud`: «Draws the top HUD over the scene, no background: score, level, shield
  gauge, power-ups sections. …»; вызов `drawLives(ctx, view.shield)` → `drawShield(ctx, view.shield)`.
- Заменить `drawLives` (`:60–70`):

```typescript
/**
 * Shield gauge: MAX_SHIELD segments left to right; the first `shield` are filled with the
 * current level's color (the whole gauge in one color, like the arc), the rest are empty.
 * Always drawn, all empty at shield 0. Not blinking: it shows the value, not the ship.
 */
function drawShield(ctx: CanvasRenderingContext2D, shield: number): void {
  const filled = SHIELD_COLORS[shield] ?? SHIELD_GAUGE_EMPTY_COLOR;
  for (let i = 0; i < MAX_SHIELD; i++) {
    ctx.fillStyle = i < shield ? filled : SHIELD_GAUGE_EMPTY_COLOR;
    ctx.fillRect(shieldSegmentX(i), SHIELD_SEGMENT_Y, SHIELD_SEGMENT_WIDTH, SHIELD_SEGMENT_HEIGHT);
  }
}
```

(Длина строки с `fillRect` — по Prettier; переносить как отформатирует `npm run format`.)

## 4. Комментарий у `MAX_SHIELD`

**Файл (изменить):** `src/game/player.ts`, строка 18:

```typescript
/** Cap for addShield (В1); also the number of HUD shield gauge segments. */
export const MAX_SHIELD = 5;
```

## 5. Тесты

### 5.1 `src/game/hud.test.ts` (изменить)

- Импорты: убрать `LIFE_ICON_SPRITE` из `./art`; из `./hud` убрать `LIFE_ICON_MAX_SIZE`,
  `LIFE_ICON_STEP`, `LIVES_ICON_SLOTS`, `LIVES_ZONE`; добавить `HUD_ICON_SIZE`,
  `HUD_ICON_STEP`, `SHIELD_SEGMENT_HEIGHT`, `SHIELD_SEGMENT_WIDTH`, `SHIELD_SEGMENT_Y`,
  `SHIELD_ZONE`, `shieldSegmentX`. `MAX_SHIELD` уже импортирован.
- `layout`: `LIFE_ICON_MAX_SIZE` → `HUD_ICON_SIZE` (`:135`); добавить
  `it('includes the shield zone')` — `expect(HUD_ZONES).toContain(SHIELD_ZONE)` и
  `it('puts the shield zone on the value row at the right margin')` —
  `SHIELD_ZONE.y === HUD_VALUE_Y`, `SHIELD_ZONE.x + SHIELD_ZONE.width === SCREEN_WIDTH - 8`
  (через `HUD_MARGIN_X`, его добавить в импорт), `toEqual({ x: 200, y: 14, width: 48, height: 8 })`.
- `capacity`: кейсы «icon slot for every shield level» (`:169`) и «fits all icon slots»
  (`:173`) заменить на `describe('shield gauge')`:

```typescript
describe('shield gauge', () => {
  it('places segments at integer x with HUD_ICON_STEP, left to right', () => {
    const xs = Array.from({ length: MAX_SHIELD }, (_, i) => shieldSegmentX(i));
    expect(xs).toEqual([200, 210, 220, 230, 240]);
    for (const x of xs) expect(Number.isInteger(x)).toBe(true);
  });

  it('does not overlap neighboring segments', () => {
    expect(SHIELD_SEGMENT_WIDTH).toBeLessThanOrEqual(HUD_ICON_STEP);
  });

  it('fits all MAX_SHIELD segments into the zone', () => {
    expect(shieldSegmentX(0)).toBeGreaterThanOrEqual(SHIELD_ZONE.x);
    expect(shieldSegmentX(MAX_SHIELD - 1) + SHIELD_SEGMENT_WIDTH).toBeLessThanOrEqual(
      SHIELD_ZONE.x + SHIELD_ZONE.width,
    );
    expect(SHIELD_SEGMENT_Y).toBeGreaterThanOrEqual(SHIELD_ZONE.y);
    expect(SHIELD_SEGMENT_Y + SHIELD_SEGMENT_HEIGHT).toBeLessThanOrEqual(
      SHIELD_ZONE.y + SHIELD_ZONE.height,
    );
  });

  it('centers segments vertically in the value row (y = 16...19)', () => {
    expect(Number.isInteger(SHIELD_SEGMENT_Y)).toBe(true);
    expect(SHIELD_SEGMENT_Y).toBe(16);
  });
});
```

- `describe('ship icon')` (`:181–188`) удалить; предел 8×8 сохранить одной проверкой в
  `power-up icons`: `expect(HUD_ICON_SIZE).toBeLessThanOrEqual(HUD_ICON_STEP)` и
  `expect(HUD_ICON_SIZE).toBeLessThanOrEqual(8); // owner's decision: icon at most 8×8`
  (новый `it('keeps the icon size limit within the step')`).
- `power-up icons`: `LIFE_ICON_MAX_SIZE` → `HUD_ICON_SIZE` (`:199`, `:206`, `:211–212`).

### 5.2 `src/game/hud-render.test.ts` (изменить)

- Импорты: из `./art` — `HUD_LABEL_COLOR, HUD_VALUE_COLOR, SHIELD_COLORS, SHIELD_GAUGE_EMPTY_COLOR`;
  из `./hud` убрать `LIFE_ICON_STEP`, `LIVES_ICON_SLOTS`, `LIVES_ZONE`, добавить
  `SHIELD_SEGMENT_HEIGHT`, `SHIELD_SEGMENT_WIDTH`, `SHIELD_SEGMENT_Y`, `SHIELD_ZONE`,
  `shieldSegmentX`; `import { MAX_SHIELD } from './player';`. Удалить `ICON_PIXELS`.
- Эталон шкалы (рядом с `iconCalls`):

```typescript
/** Reference output: the gauge for a shield level, built from the layout constants. */
function gaugeCalls(shield: number): FillCall[] {
  return Array.from({ length: MAX_SHIELD }, (_, i) => ({
    fillStyle: i < shield ? SHIELD_COLORS[shield]! : SHIELD_GAUGE_EMPTY_COLOR,
    x: shieldSegmentX(i),
    y: SHIELD_SEGMENT_Y,
    w: SHIELD_SEGMENT_WIDTH,
    h: SHIELD_SEGMENT_HEIGHT,
  }));
}
```

- Кейс «max» (`:87`): `shield: LIVES_ICON_SLOTS` → `shield: MAX_SHIELD`.
- Кейс «own zone» (`:106`): `LIVES_ZONE` → `SHIELD_ZONE` (3 → 2: гаснет один сегмент и
  перекрашиваются оставшиеся — всё в `SHIELD_ZONE`).
- Кейс «places the text exactly» (`:116`): переименовать в «places the text and the gauge
  exactly», в конец ожидания добавить `...gaugeCalls(0)` (шкала рисуется после уровня, до
  улучшений; при `shield = 0` — 5 пустых).
- Кейсы иконок (`:138–153`) заменить:

```typescript
it.each([0, 1, 2, 3, 4, MAX_SHIELD])(
  'draws the gauge for shield %i: that many filled segments, the rest empty',
  (shield) => {
    const calls = draw({ ...BASE, shield }).filter((c) => inZone(c, SHIELD_ZONE));
    expect(calls).toEqual(gaugeCalls(shield));
    expect(calls).toHaveLength(MAX_SHIELD);
    const filled = calls.filter((c) => c.fillStyle !== SHIELD_GAUGE_EMPTY_COLOR);
    expect(filled).toHaveLength(shield);
    for (const c of filled) expect(c.fillStyle).toBe(SHIELD_COLORS[shield]);
  },
);

it('draws the gauge at the exact pixels', () => {
  const calls = draw({ ...BASE, shield: 2 }).filter((c) => inZone(c, SHIELD_ZONE));
  expect(calls.map((c) => [c.x, c.y, c.w, c.h])).toEqual([
    [200, 16, 8, 4],
    [210, 16, 8, 4],
    [220, 16, 8, 4],
    [230, 16, 8, 4],
    [240, 16, 8, 4],
  ]);
  expect(calls.map((c) => c.fillStyle)).toEqual([
    SHIELD_COLORS[2],
    SHIELD_COLORS[2],
    SHIELD_GAUGE_EMPTY_COLOR,
    SHIELD_GAUGE_EMPTY_COLOR,
    SHIELD_GAUGE_EMPTY_COLOR,
  ]);
});
```

Порядок вызовов фиксирован (слева направо), поэтому `toEqual` без сортировки.

- Кейс «at most LIVES_ICON_SLOTS» (`:155–159`) заменить на «always draws MAX_SHIELD
  segments»: для `shield` из `0…MAX_SHIELD` число вызовов в `SHIELD_ZONE` = `MAX_SHIELD`
  (можно влить в кейс выше — тогда отдельный не нужен; оставить один из двух).
- Кейс «colors in their places» (`:176–179`): блок иконок заменить на
  `const gauge = calls.filter((c) => inZone(c, SHIELD_ZONE));` — непусто, каждый
  `fillStyle` ∈ `{ SHIELD_COLORS[BASE.shield], SHIELD_GAUGE_EMPTY_COLOR }`.
- Кейс «labels the same» (`:183`): комментарий заменить на «Text zones only: other
  sections may share colors with the labels.» (фильтр по зонам оставить).

### 5.3 `src/game/art.test.ts` (изменить)

Импорт `SHIELD_GAUGE_EMPTY_COLOR`; новый кейс:

```typescript
it('the empty gauge segment color differs from every level color', () => {
  expect(SHIELD_COLORS).not.toContain(SHIELD_GAUGE_EMPTY_COLOR);
});
```

### 5.4 Поиск остатков

`grep -rn "LIFE_ICON\|LIVES_ZONE\|LIVES_ICON_SLOTS\|drawLives\|until task 033" src` — пусто.
Исключение — `scenes/title-scene.ts:32` («The factory lives here») не трогать.

## 6. Ручная проверка

`npm run dev`:

- `/?shield=0` … `/?shield=5`, начать игру: справа в строке значений 5 сегментов,
  залито 0…5 слева направо; цвет залитых — красный (1) / жёлтый (2) / жёлто-зелёный (3) /
  светло-зелёный (4) / зелёный (5), как дуга над кораблём; при 0 — все тёмно-серые.
- Без параметра: 2 жёлтых + 3 серых. Попадание: сегмент гаснет, остаток краснеет в тот же
  кадр, что и дуга; шкала не мигает вместе с кораблём.
- Капсула `L` / порог 5000 очков: сегмент загорается, шкала перекрашивается.
- Значки `S`/`D` (156…173) и подписи на месте, ничего не сдвинулось.

## 7. Приёмка

**Файл (создать):** `second-brain/tasks/tasks/033-hud-shield-gauge/acceptance.md` — по
формату `032-shield-on-ship/acceptance.md`:

- шапка: код готов, проверки зелёные; утвердить владельцу — цвет пустых сегментов
  `#3c3c3c` (виден ли на звёздном фоне, не путается ли с залитыми); точка подстройки —
  `SHIELD_GAUGE_EMPTY_COLOR` в `src/game/art.ts`;
- кейс 1: `?shield=0…5` — число залитых и цвет (как в разделе 6);
- кейс 2: удары `?seed=1&paused=1` → `press('start'); step(1); release('start')`, `step`
  до попаданий: 2 → 1 → 0, шкала перекрашивается синхронно с дугой, `state().battle.shield`
  совпадает с числом залитых; при 0 все серые, после `down` шкала остаётся (5 серых);
- кейс 3: мигание — во время неуязвимости шкала не мигает;
- кейс 4: рост — капсула `L` (`bonuses.asteroid.bonus === 'shield'`) или порог очков:
  +1 сегмент, новый цвет; на `?shield=5` — шкала не меняется;
- кейс 5: раскладка — шкала в 200…247, не наезжает на значки улучшений и край экрана.

## 8. Обновление документации

- **`second-brain/game-design.md`**, «Экран → HUD» (`:17–23`): заменить пункт целиком
  текстом из раздела «Правка game-design.md → Экран → HUD» design.md (дословно).
- **`second-brain/architecture/overview.md`**:
  - `art.ts` (`:58–60`): убрать `LIFE_ICON_SPRITE` и упоминание `LIFE_ICON_MAX_SIZE`;
    добавить `SHIELD_GAUGE_EMPTY_COLOR` (тёмно-серый `#3c3c3c`, пустой сегмент шкалы,
    утверждается на приёмке). `HUD_LABEL_COLOR` — «красный, как `R` корабля» оставить.
  - `hud.ts` (`:362–372`): `LIVES_ZONE …` → `SHIELD_ZONE` (200, 14, 48×8; `MAX_SHIELD`
    сегментов `SHIELD_SEGMENT_WIDTH × SHIELD_SEGMENT_HEIGHT` = 8×4 на `SHIELD_SEGMENT_Y = 16`,
    x = `shieldSegmentX(i)` = 200 + 10·i; ширина от `MAX_SHIELD`, импорт из `player.ts`),
    `HUD_ICON_SIZE = 8` / `HUD_ICON_STEP = 10` вместо `LIFE_ICON_*`; «между уровнем и
    жизнями» → «между уровнем и шкалой щита»; шаг слотов улучшений — `HUD_ICON_STEP`.
  - `hud-render.ts` (`:373–378`): секции «счёт → уровень → щит → улучшения»; `drawShield`
    рисует всегда `MAX_SHIELD` прямоугольников `fillRect`: `i < shield` — `SHIELD_COLORS[shield]`,
    иначе `SHIELD_GAUGE_EMPTY_COLOR`; не мигает; убрать «не больше `LIVES_ICON_SLOTS`» и
    «До 033 …».
- README в `src/game/` нет — не требуется. `dev-hooks.md` не меняется (`shield` в снимке уже
  есть).

## 9. Проверки

`npm run format`, затем `format:check`, `lint`, `typecheck`, `test`, `build`; поиск из 5.4.

## Сводка по файлам

| Действие | Файл                                                          |
| -------- | ------------------------------------------------------------- |
| Изменить | `src/game/art.ts`                                             |
| Изменить | `src/game/hud.ts`                                             |
| Изменить | `src/game/hud-render.ts`                                      |
| Изменить | `src/game/player.ts` (комментарий)                            |
| Изменить | `src/game/hud.test.ts`                                        |
| Изменить | `src/game/hud-render.test.ts`                                 |
| Изменить | `src/game/art.test.ts`                                        |
| Изменить | `second-brain/game-design.md`                                 |
| Изменить | `second-brain/architecture/overview.md`                       |
| Создать  | `second-brain/tasks/tasks/033-hud-shield-gauge/acceptance.md` |

## Архитектура и паттерны

- Логика отдельно от рендера: раскладка (`SHIELD_ZONE`, `shieldSegmentX`, `SHIELD_SEGMENT_*`)
  — в `hud.ts` без canvas, `drawShield` — чистая функция от `shield`, тестируется мок-контекстом
  `recorder()`.
- Секции HUD независимы и рисуют только в своей зоне (`HUD_ZONES`, тест непересечения).
- Импорты: `art.ts` — только `sprite.ts` (цвет — литерал); `hud.ts`/`hud-render.ts` →
  `player.ts` допустим (design.md, «Импорты»), цикла нет.
- Детерминизм не затрагивается: ни `Rng`, ни `dt`.
- Производительность: 5 `fillRect` на кадр вместо до 135 пиксельных.

## Открытые вопросы

Блокирующих нет. Вкусовое — на приёмку: цвет пустых сегментов (`#3c3c3c`). Решения уровня
плана (диапазон `shield`, `SHIELD_SEGMENT_Y`, проверка цвета в `art.test.ts`) — в начале
плана.

## Ссылки

- `second-brain/tasks/tasks/033-hud-shield-gauge/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/008-ship-shield/design.md` — «Интерфейсы», «Пиксель-арт и цвета»,
  «Тестирование» (таблица «033»), «Правка game-design.md»
- `second-brain/features/008-ship-shield/discussion.md` — В9
- `second-brain/architecture/overview.md` — `art.ts`, `hud.ts`, `hud-render.ts`
- `second-brain/tasks/tasks/032-shield-on-ship/acceptance.md` — формат приёмки

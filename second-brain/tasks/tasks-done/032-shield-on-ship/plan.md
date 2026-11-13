# План реализации: Дуга щита над кораблём

Над кораблём игрока рисуется одноцветная дуга 15×4, цвет которой — уровень щита
(`SHIELD_COLORS[player.shield]`); при `shield = 0`, в `down` и в «выключенной» фазе мигания
дуги нет. Чистая отрисовка: логика, хитбокс, коллизии и снимок не меняются. Рамка —
`second-brain/features/008-ship-shield/design.md` («Пиксель-арт и цвета», «Интерфейсы»,
`drawShip`, таблица тестов «032», нарезка п. 2) и `analyze.md` этой задачи.

Код: ветка `feature/008-ship-shield`, база `33e77e7` + задача 031 в рабочем дереве. Проверено
пробным прогоном: в `asteroidBattle()` (300 тиков `IDLE`) щит остаётся `2`, корабль `active` —
стартовый уровень в помощнике годится для кейсов астероида.

## 1. Данные дуги в `art.ts`

**Файл (изменить):** `src/game/art.ts`

Добавить после `SHOT_COLOR` (до цветов HUD). Импорт остаётся единственным — `./sprite`
(правило дизайна: иначе цикл `art → player → ship → art` и TDZ на `SHIP_SPRITE`). Ни
`MAX_SHIELD`, ни `SHIP_WIDTH` здесь не импортировать — связь держит `art.test.ts` (шаг 4).

```typescript
/**
 * Shield arc color per level (index = player.shield); index 0 is null (no shield).
 * 6 literals = MAX_SHIELD + 1 (art.ts must not import player.ts; art.test.ts checks the length).
 */
export const SHIELD_COLORS: readonly (string | null)[] = [
  null,
  '#ff3b3b', // 1 red (explosion embers)
  '#ffe14f', // 2 yellow (explosion flash), START_SHIELD
  '#c8e84a', // 3 yellow-green
  '#8ee05a', // 4 light green
  '#4fd16a', // 5 green (drone body), MAX_SHIELD
];

/** Shield arc shape, 15×4 = ship width; drawn above the ship, one color per level. */
// prettier-ignore
const SHIELD_ARC_ROWS = [
  '....#######....',
  '..##.......##..',
  '.#...........#.',
  '#.............#',
];

/** The arc in SHIELD_COLORS[level]; index 0 is null. Same length as SHIELD_COLORS. */
export const SHIELD_SPRITES: readonly (Sprite | null)[] = SHIELD_COLORS.map((color) =>
  color === null ? null : parseSprite(SHIELD_ARC_ROWS, { '#': color }),
);

/** Arc top relative to ship.y: rows 203..206, one empty row (207) above the nose at 208. */
export const SHIELD_OFFSET_Y = -5;
```

Замечания:

- `SHIELD_SPRITES` выводится из литерального `SHIELD_COLORS` через `map` — тот же смысл,
  что «6 литеральных элементов» дизайна (длина фиксирована литералом, без `MAX_SHIELD`), но
  без шести копий вызова `parseSprite` и без `!` на индексах (`noUncheckedIndexedAccess`).
  Отступление от буквы дизайна — только в способе записи, интерфейс тот же.
- `// prettier-ignore` над массивом строк — как в `font-art.ts`, чтобы Prettier не свернул
  4 короткие строки в одну (влезают в `printWidth: 100`) и форма дуги читалась. Если
  `format:check` проходит и без него — оставить всё равно ради читаемости.
- `LIFE_ICON_SPRITE` не трогать (удаляется в 033). `SHIELD_GAUGE_EMPTY_COLOR` — не здесь (033).
- Ошибка формата спрайта роняет импорт модуля — ловится любым тестом, импортирующим `art.ts`.

## 2. Отрисовка дуги в `drawShip`

**Файл (изменить):** `src/game/battle-render.ts`

Импорт: `import { SHIELD_OFFSET_Y, SHIELD_SPRITES, SHIP_SPRITE, SHOT_COLOR } from './art';`
(`MAX_SHIELD` не нужен — массив индексируется `player.shield`).

`drawShip` — дуга в ветке «иначе», после спрайта корабля, с уже округлёнными `x`, `y`. Ранние
`return` (`down`, выключенная фаза мигания) уже дают «нет дуги» без новых веток.

```typescript
/**
 * active: sprite and the shield arc; down: explosion for EXPLOSION_TICKS, then nothing
 * (no arc: shield is 0); invulnerable: the sprite and the arc blink together.
 */
function drawShip(ctx: CanvasRenderingContext2D, player: Player): void {
  const x = Math.floor(player.ship.x);
  const y = Math.floor(player.ship.y);
  const ticks = player.stateTicks;
  if (player.state === 'down') {
    if (ticks < EXPLOSION_TICKS) drawExplosion(ctx, ticks, x, y, SHIP_WIDTH, SHIP_HEIGHT);
    return;
  }
  if (player.state === 'invulnerable' && Math.floor(ticks / BLINK_TICKS) % 2 !== 0) return;
  drawSprite(ctx, SHIP_SPRITE, x, y);
  const arc = SHIELD_SPRITES[player.shield];
  if (arc) drawSprite(ctx, arc, x, y + SHIELD_OFFSET_Y);
}
```

JSDoc `drawBattle` (строка «The ship: active - sprite; …»): заменить на
`The ship: active - sprite and the shield arc (SHIELD_SPRITES[shield], none at 0); down -
explosion, then nothing; invulnerable - ship and arc blink together.`

## 3. Комментарий `SHIP_Y`

**Файл (изменить):** `src/game/ship.ts:8`

Комментарий устарел («the shield is shown in the top HUD»). Логику не трогать:

```typescript
/** Top edge of the ship; the strip above it (203..206) holds the shield arc, see SHIELD_OFFSET_Y. */
export const SHIP_Y = 208;
```

(Строка ≤ 100 символов; если Prettier/линтер против — разбить на многострочный JSDoc.)

## 4. Тесты данных: `art.test.ts`

**Файл (создать):** `src/game/art.test.ts` (Vitest, environment `node`)

Тест может импортировать `MAX_SHIELD` и `SHIP_WIDTH` — он не в графе модулей приложения.

```typescript
import { describe, expect, it } from 'vitest';
import { SHIELD_COLORS, SHIELD_OFFSET_Y, SHIELD_SPRITES } from './art';
import { MAX_SHIELD, START_SHIELD } from './player';
import { SHIP_WIDTH } from './ship';

describe('shield arc data', () => {
  it('has one entry per shield level 0..MAX_SHIELD', () => {
    expect(SHIELD_COLORS).toHaveLength(MAX_SHIELD + 1);
    expect(SHIELD_SPRITES).toHaveLength(MAX_SHIELD + 1);
  });

  it('level 0 has no color and no arc, every other level has both', () => {
    expect(SHIELD_COLORS[0]).toBeNull();
    expect(SHIELD_SPRITES[0]).toBeNull();
    for (let k = 1; k <= MAX_SHIELD; k++) {
      expect(SHIELD_COLORS[k]).toEqual(expect.any(String));
      expect(SHIELD_SPRITES[k]).not.toBeNull();
    }
  });

  it('the arc is as wide as the ship and drawn in its level color only', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      const arc = SHIELD_SPRITES[k]!;
      expect(arc.width).toBe(SHIP_WIDTH);
      const opaque = arc.pixels.filter((p) => p != null);
      expect(opaque.length).toBeGreaterThan(0);
      expect(new Set(opaque)).toEqual(new Set([SHIELD_COLORS[k]]));
    }
  });

  it('the arc stays above the ship sprite', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      expect(SHIELD_OFFSET_Y + SHIELD_SPRITES[k]!.height).toBeLessThanOrEqual(0);
    }
  });

  it('levels 1..MAX_SHIELD have distinct colors', () => {
    const colors = SHIELD_COLORS.slice(1);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('the start shield is drawn (START_SHIELD has an arc)', () => {
    expect(SHIELD_SPRITES[START_SHIELD]).not.toBeNull();
  });
});
```

Последний кейс — необязательный, но дешёвый: страхует, что дефолт тестов рендера даёт дугу.

## 5. Тесты рендера: `battle-render.test.ts`

**Файл (изменить):** `src/game/battle-render.test.ts`

### 5.1 Помощники

Импорты: из `./art` — добавить `SHIELD_COLORS`, `SHIELD_OFFSET_Y`, `SHIELD_SPRITES`; из
`./player` — `START_SHIELD`, `MAX_SHIELD` (рядом с `INVULNERABLE_TICKS`).

```typescript
/** Expected calls for the shield arc of `shield` above a ship at (x, y); none at 0. */
function shieldCalls(x: number, y: number, shield: number): FillCall[] {
  const arc = SHIELD_SPRITES[shield];
  return arc ? spriteCalls(arc, x, y + SHIELD_OFFSET_Y) : [];
}

/** Expected calls for the ship at (x, y) and its shield arc (default START_SHIELD), in draw order. */
function shipCalls(x: number, y: number, shield: number = START_SHIELD): FillCall[] {
  return [...spriteCalls(SHIP_SPRITE, x, y), ...shieldCalls(x, y, shield)];
}
```

Уровень передаётся явно, а не берётся из `battle.player.shield` — так тест ловит неверный
цвет (иначе помощник повторил бы логику рендера).

### 5.2 Существующие кейсы

Почти все кейсы с «полным списком» уже идут через `shipCalls` и при стартовом щите 2
проходят после правки помощника без изменений. Явно поменять:

- `drawBattle › draws every enemy of the default wave` — считает число вызовов:
  `enemyPixels + opaquePixels(SHIP_SPRITE) + opaquePixels(SHIELD_SPRITES[START_SHIELD]!)`.
- `drawBattle › floors fractional coordinates` — `shipCalls(10, SHIP_Y)` уже даёт дугу от
  `x = 10`; изменений не нужно (проверяет, что дуга берёт округлённый `x`).
- `drawBattle ship states › blinks the ship where it was hit` — после `hit()` щит **1**:
  оба ожидания «виден» → `shipCalls(40, SHIP_Y, 1)`; добавить
  `expect(battle.player.shield).toBe(1)` рядом с проверкой состояния.
- `drawBattle ship states › draws the ship again once active…` — последнее ожидание →
  `shipCalls(SHIP_START_X, SHIP_Y, 1)`.
- Кейсы взрыва с `newBattle({ shield: 0 })` — не меняются (теперь ещё и проверяют «нет дуги
  в `down`»).
- `drawBattle asteroid › draws nothing extra before the asteroid spawns` — не меняется.

Если какой-то кейс упадёт из-за того, что щит по ходу сценария сменился (не ожидается:
`asteroidBattle()` после 300 тиков — `shield 2`, `active`), передать фактический уровень
явно и добавить `expect(battle.player.shield).toBe(...)`.

### 5.3 Новые кейсы — `describe('drawBattle shield arc', …)`

```typescript
describe('drawBattle shield arc', () => {
  it('draws the arc after the ship, above it, in the level color, for every level', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      const battle = newBattle({ shield: k });
      const x = battle.player.ship.x;
      const calls = draw(battle);
      expect(calls).toEqual([...enemyCalls(battle), ...shipCalls(x, SHIP_Y, k)]);
      const arc = calls.slice(-opaquePixels(SHIELD_SPRITES[k]!));
      expect(arc.every((c) => c.fillStyle === SHIELD_COLORS[k])).toBe(true);
      expect(Math.min(...arc.map((c) => c.y))).toBe(SHIP_Y + SHIELD_OFFSET_Y);
    }
  });

  it('draws no arc at shield 0', () => {
    const battle = newBattle({ shield: 0 });
    expect(draw(battle)).toEqual([
      ...enemyCalls(battle),
      ...spriteCalls(SHIP_SPRITE, battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws no arc while the ship is down', () => {
    const battle = newBattle({ shield: 0 });
    battle.player.hit();
    expect(battle.player.state).toBe('down');
    const calls = draw(battle);
    expect(calls.some((c) => c.y < SHIP_Y && SHIELD_COLORS.includes(c.fillStyle))).toBe(false);
  });

  it('hides the arc together with the ship in the hidden blink phase', () => {
    const battle = newBattle();
    battle.player.hit();
    run(battle, BLINK_TICKS);
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.shield).toBe(1);
    expect(draw(battle)).toEqual(enemyCalls(battle));
  });

  it('recolors the arc on the hit tick', () => {
    const battle = newBattle({ shield: 3 });
    battle.player.ship.x = 40;
    battle.player.hit();
    expect(battle.player.shield).toBe(2);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 2)]);
  });

  it('a hit at shield 1 leaves the blinking ship without an arc', () => {
    const battle = newBattle({ shield: 1 });
    battle.player.ship.x = 40;
    battle.player.hit();
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.shield).toBe(0);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 0)]);
  });
});
```

Замечания для `/do`:

- Кейс «down»: проверка через `SHIELD_COLORS.includes(c.fillStyle)` — у `includes` на
  `readonly (string | null)[]` аргумент `string` подходит. Кадры взрыва содержат `#ffe14f` /
  `#ff3b3b` (цвета уровней 2 и 1 взяты из `enemy-art`), но рисуются в `y ≥ 211` (центр
  корабля), а условие `c.y < SHIP_Y` их отсекает. Если окажется хрупким — заменить на точное
  сравнение, как в существующем кейсе «draws explosion frame 0…» (он уже проверяет полный
  список).
- `newBattle({ shield: k })` — `BattleOptions.shield` из 031 (`RangeError` вне `0…MAX_SHIELD`).

## 6. Ручная проверка

`npm run dev`, затем:

- `http://localhost:5173/` — старт: над кораблём жёлтая дуга, 1 пустая строка между дугой и
  носом; дуга едет вместе с кораблём, у краёв экрана не обрезается.
- `?shield=5`, `?shield=4`, `?shield=3`, `?shield=1`, `?shield=0` — зелёная / светло-зелёная /
  жёлто-зелёная / красная / нет дуги. Сравнить 3 и 4 — различимы ли.
- Удар по щиту: дуга сразу перекрашивается (2 → 1 → нет), мигает синхронно с кораблём.
- Капсула `L` (или порог 5000 очков): дуга «зеленеет» на уровень.
- Гибель при `shield = 0` — только взрыв, без дуги.
- Свой выстрел: появляется внутри дуги под верхней перекладиной и проходит сквозь неё (на
  1 тик нижний пиксель выстрела закрыт перекладиной; быстрый выстрел не перекрывается).
- Вражеский выстрел гаснет примерно у дуги (хитбокс — корабль, на 5 px ниже).

## 7. Приёмка — `acceptance.md`

**Файл (создать на `/do`):** `second-brain/tasks/tasks/032-shield-on-ship/acceptance.md`

По образцу `031-shield-logic/acceptance.md`: строка «код готов, проверки зелёные»; что
утвердить владельцу (форма дуги, оттенки 3/4, выстрел у дуги); кейсы с шагами
(`?seed=1&paused=1`, `window.__galaxy`, `state().battle.shield`):

1. Пять цветов: `?shield=1…5` и `?shield=0` — цвет/отсутствие дуги; различимость 3 и 4.
2. Удары: со старта 2 → 1 (красная) → 0 (нет дуги, корабль мигает) → `down` (только взрыв).
3. Мигание: в `invulnerable` дуга пропадает и появляется вместе с кораблём.
4. Рост: капсула `L` или порог очков — 2 → 3, цвет сразу новый.
5. Выстрел у дуги — формулировка по факту кода (см. «Открытые вопросы», п. 1); запасной
   вариант — разрыв перекладины `....###.###....` — решение владельца.
6. «Удар в щит»: вражеский выстрел гаснет у дуги, а не проходит её насквозь заметно.

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- Описание `art.ts` (около строк 56–60): добавить `SHIELD_COLORS` (6 цветов, индекс =
  уровень щита, 0 — `null`), `SHIELD_SPRITES` (дуга 15×4 в цвете уровня, выводится из
  `SHIELD_COLORS`), `SHIELD_OFFSET_Y = -5` (строки 203…206); правило «`art.ts` импортирует
  только `sprite.ts`, связь с `MAX_SHIELD`/`SHIP_WIDTH` проверяет `art.test.ts`».
- Описание отрисовки корабля (около строк 340–346): `active` — спрайт и дуга
  `SHIELD_SPRITES[shield]` в `(x, y + SHIELD_OFFSET_Y)` (нет при 0); `invulnerable` — корабль
  и дуга мигают вместе; `down` — только взрыв.

`game-design.md` не меняется (дуга уже описана в 031, `:73`). README в `src/game/` нет.
Запись фичи в `second-brain/features/` не трогать.

## 9. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — все
зелёные. Ожидаемо: +1 тестовый файл (`art.test.ts`), +6 кейсов в `battle-render.test.ts`.

## Сводка по файлам

| Действие | Файл                                                        |
| -------- | ----------------------------------------------------------- |
| Изменить | `src/game/art.ts`                                           |
| Изменить | `src/game/battle-render.ts`                                 |
| Изменить | `src/game/ship.ts` (только комментарий `SHIP_Y`)            |
| Создать  | `src/game/art.test.ts`                                      |
| Изменить | `src/game/battle-render.test.ts`                            |
| Изменить | `second-brain/architecture/overview.md`                     |
| Создать  | `second-brain/tasks/tasks/032-shield-on-ship/acceptance.md` |

Не меняются: `player.ts`, `battle.ts`, `collisions.ts`, `hud*.ts`, `dev-*.ts`, сцены,
`game-design.md`, `second-brain/features/`.

## Архитектура и паттерны

- Логика отдельно от рендера: рендер только читает `player.shield/state/stateTicks`; данные
  арта — в `art.ts`, отрисовка — в `battle-render.ts`.
- Граф импортов: `art.ts` → только `sprite.ts` (нет цикла `art → player → ship → art`);
  инварианты «длина = `MAX_SHIELD + 1`», «ширина = `SHIP_WIDTH`» — в тесте.
- Целые координаты: дуга берёт уже округлённые `x`, `y` корабля (`drawSprite` ждёт целые).
- Порядок слоёв в `drawBattle` не меняется; внутри `drawShip` — корабль, затем дуга (не
  пересекаются, порядок фиксирован ради тестов).
- Тесты без canvas — `recorder()` и ожидания, построенные из пиксельных данных
  (`spriteCalls`), а не через `drawSprite`.
- Детерминизм не затронут (ни `Rng`, ни времени в рендере).

## Открытые вопросы

Блокирующих нет; вкусовое — на приёмку. Перенесено из `analyze.md`:

1. **Свой выстрел у дуги — по коду не «наполовину скрыт».** `spawnShot` ставит выстрел в
   `x = ship.x + 7`, `y = 204…207`; у дуги в колонке 7 непрозрачна только строка `203`. В тик
   выстрела он виден целиком внутри дуги; в следующий тик (4 px/тик → `200…203`) нижний
   пиксель на 1 тик закрыт перекладиной; быстрый (6 px/тик) не перекрывается. В
   `acceptance.md` формулировать по факту; разрыв перекладины — запасной вариант по решению
   владельца после приёмки (не в этой задаче).
2. **Порядок «корабль, затем дуга»** — на картинку не влияет, следуем дизайну.
3. **Комментарий `SHIP_Y` и `overview.md`** — включены в объём (шаги 3 и 8), иначе база
   знаний расходится с кодом.
4. **`SHIELD_SPRITES` через `SHIELD_COLORS.map`** вместо шести литеральных вызовов — запись
   компактнее, импорт и интерфейс те же; если архитектор настаивает на буквальных шести
   элементах — заменить на `[null, arc('#ff3b3b'), …]` с локальной функцией `arc(color)`.

## Ссылки

- `second-brain/tasks/tasks/032-shield-on-ship/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/008-ship-shield/design.md` — «Импорты: `art.ts` не знает логику»,
  «Интерфейсы», «Пиксель-арт и цвета», `drawShip`, «Тестирование» (032), «Альтернативы»
- `second-brain/architecture/overview.md`, `second-brain/architecture/dev-hooks.md` (`?shield=N`)
- `second-brain/tasks/tasks/031-shield-logic/acceptance.md` (образец приёмки)

# План реализации: Экран Game Over и рестарт

Когда бой переходит в фазу `over` (задача 020), `PlayScene` последним слоем рисует
`GAME OVER` и мигающее `PRESS ENTER` пиксельным шрифтом; по Enter сцена возвращает
сцену из фабрики `exit`, которую передаёт `TitleScene`, — новый титул с тем же
`Starfield`. Игра проходит полный цикл «старт → проигрыш → старт». План следует
`features/005-lives-score-game-over/design.md` («Сцена», «Поток тика», «Интерфейсы»,
нарезка п. 2) и `analyze.md`; отступлений нет.

## 1. Модуль надписи Game Over

**Файл (создать):** `src/game/game-over-render.ts`

Константы раскладки (Y приняты: 112 и 128), мигание, подложка; чистые `centeredX`,
`isPromptVisible` и `drawGameOver`. Зависимости: `config` (`SCREEN_WIDTH`), `art`
(цвета), `font`. `HUD_HEIGHT` в модуле не нужен — только в тесте.

```typescript
import { SCREEN_WIDTH } from '../config';
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR } from './art';
import { drawText, GLYPH_HEIGHT, textWidth } from './font';

export const GAME_OVER_TEXT = 'GAME OVER';
export const PRESS_ENTER_TEXT = 'PRESS ENTER';
/** Top of the caption row, logical px: about the middle of the play field (below the HUD). */
export const GAME_OVER_Y = 112;
/** Top of the prompt row: two font rows (2 × 8 px) below the caption. */
export const PRESS_ENTER_Y = GAME_OVER_Y + 16;
/** Prompt blinks: shown BLINK ticks, hidden BLINK ticks; shown on phaseTicks = 0. */
export const PRESS_ENTER_BLINK_TICKS = 30; // as the title's PRESS ENTER
/** Black box under each row; off by default, the owner decides on visual acceptance. */
export const GAME_OVER_BACKDROP = false;
/** Backdrop margin around a row on every side, px. */
export const GAME_OVER_BACKDROP_PAD = 2;

const BACKDROP_COLOR = '#000';

/** floor((SCREEN_WIDTH - textWidth(text)) / 2); textWidth includes the trailing cell gap. */
export function centeredX(text: string): number {
  return Math.floor((SCREEN_WIDTH - textWidth(text)) / 2);
}

export function isPromptVisible(phaseTicks: number): boolean {
  return Math.floor(phaseTicks / PRESS_ENTER_BLINK_TICKS) % 2 === 0;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  const pad = GAME_OVER_BACKDROP_PAD;
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(centeredX(text) - pad, y - pad, textWidth(text) + 2 * pad, GLYPH_HEIGHT + 2 * pad);
}

/**
 * Game over caption over the field and the HUD: GAME OVER (label color) and a blinking
 * PRESS ENTER (value color), both centered by X. The backdrop of a row is drawn before its
 * text; the prompt's backdrop stays while the prompt itself is hidden by the blink.
 */
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  phaseTicks: number,
  backdrop: boolean = GAME_OVER_BACKDROP,
): void {
  if (backdrop) drawBackdrop(ctx, GAME_OVER_TEXT, GAME_OVER_Y);
  drawText(ctx, GAME_OVER_TEXT, centeredX(GAME_OVER_TEXT), GAME_OVER_Y, HUD_LABEL_COLOR);
  if (backdrop) drawBackdrop(ctx, PRESS_ENTER_TEXT, PRESS_ENTER_Y);
  if (isPromptVisible(phaseTicks)) {
    drawText(ctx, PRESS_ENTER_TEXT, centeredX(PRESS_ENTER_TEXT), PRESS_ENTER_Y, HUD_VALUE_COLOR);
  }
}
```

Замечание по типам: аннотацию `backdrop: boolean` оставить явно — `GAME_OVER_BACKDROP`
объявлен через `const … = false` и имеет литеральный тип `false`; без аннотации параметр
мог бы сузиться до `false`, и вызов с `true` в тесте не прошёл бы typecheck.
`no-inferrable-types` из `tseslint.configs.recommended` срабатывает только на литерал в
инициализаторе, не на идентификатор — линтер не возражает.

Значения для проверки: `GAME OVER` — ширина 72, x = 92; `PRESS ENTER` — ширина 88,
x = 84. Строки: 112…118 и 128…134; с подложкой 110…120 и 126…136 — не пересекаются,
ниже `HUD_HEIGHT = 24`, внутри 240.

## 2. `PlayScene`: выход по Enter и слой надписи

**Файл (изменить):** `src/game/scenes/play-scene.ts`

- Импорт `drawGameOver` из `../game-over-render`.
- `starfield` → публичный `readonly` с пометкой «Exposed for tests».
- 4-й необязательный параметр конструктора `exit?: () => Scene` (поле
  `private readonly exit`). Порядок потребления `rng` не меняется.
- `update(): Scene | void` — после `starfield.update` и `battle.update`.
- `render` — `drawGameOver` последним, только в фазе `over`.

```typescript
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  /** Exposed for tests. */
  readonly starfield: Starfield;

  /**
   * Pass the title's starfield to keep the stars continuous; opts go to the Battle as is.
   * exit: where Enter leads after game over; without it the scene stays on the caption.
   */
  constructor(
    rng: Rng,
    starfield?: Starfield,
    opts?: BattleOptions,
    private readonly exit?: () => Scene,
  ) {
    // ... as before
  }

  update(dt: number, input: Input): Scene | void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
    // After the battle tick: Enter on the very tick of entering over already counts.
    if (this.battle.phase === 'over' && input.pressed('start') && this.exit) {
      return this.exit();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // ... fill, stars, drawBattle, drawHud as before
    if (this.battle.phase === 'over') drawGameOver(ctx, this.battle.phaseTicks); // over everything
  }
}
```

`play-scene` не импортирует `title-scene` — цикла модулей нет.

## 3. `TitleScene`: переданный `starfield` и фабрика выхода

**Файл (изменить):** `src/game/scenes/title-scene.ts`

- 3-й необязательный параметр `starfield?: Starfield`; `this.starfield = starfield ??
new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng)` — при переданных звёздах `rng` не
  тратится.
- `starfield` → публичный `readonly` («Exposed for tests»).
- В `new PlayScene(...)` 4-м аргументом — фабрика нового титула.

```typescript
export class TitleScene implements Scene {
  /** Exposed for tests. */
  readonly starfield: Starfield;
  private ticks = 0;

  constructor(
    private readonly rng: Rng,
    /** Level the game starts from; undefined = 1. Dev builds pass ?level=N. */
    private readonly startLevel?: number,
    /** Continue the stars when coming back from a game; undefined = new ones from rng. */
    starfield?: Starfield,
  ) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, input: Input): Scene | void {
    this.ticks++;
    this.starfield.update(dt);
    if (input.pressed('start')) {
      // The factory lives here, so play-scene never imports title-scene (no module cycle).
      const exit = (): Scene => new TitleScene(this.rng, this.startLevel, this.starfield);
      return new PlayScene(this.rng, this.starfield, { startLevel: this.startLevel }, exit);
    }
  }
  // render - unchanged
}
```

Enter, вернувший на титул, новый `TitleScene` не видит: `main.ts` и `step()` вызывают
`input.endTick()` после каждого `update`. `src/engine/` и `main.ts` не меняются.

## 4. Тесты

### 4.1. Рендер надписи

**Файл (создать):** `src/game/game-over-render.test.ts` (Vitest, environment `node`;
`recorder()` из `./canvas-test-utils`)

Хелпер: прямоугольник строки `rowRect(text, y, pad = 0)` = `{ x: centeredX(text) − pad,
y: y − pad, w: textWidth(text) + 2·pad, h: GLYPH_HEIGHT + 2·pad }` и `inside(call, rect)`.

Сценарии:

- `centeredX(GAME_OVER_TEXT)` и `centeredX(PRESS_ENTER_TEXT)` равны
  `Math.floor((SCREEN_WIDTH − textWidth(t)) / 2)` и `Number.isInteger`.
- Раскладка: обе строки с полем `GAME_OVER_BACKDROP_PAD` — `x ≥ 0`, `x + w ≤ SCREEN_WIDTH`,
  `y ≥ HUD_HEIGHT`, `y + h ≤ SCREEN_HEIGHT`; строка `GAME OVER` (с полем) кончается выше
  начала строки `PRESS ENTER` (с полем); `GAME_OVER_Y`, `PRESS_ENTER_Y` — целые.
- `isPromptVisible`: `true` на 0 и 29, `false` на 30 и 59, `true` на 60.
- `drawGameOver(ctx, 0, false)`: вызовы есть; каждый `fillRect` — 1×1 внутри
  `rowRect` одной из строк; в строке `GAME OVER` цвет `HUD_LABEL_COLOR`, в `PRESS ENTER` —
  `HUD_VALUE_COLOR`; чёрных (`#000`) нет; вызовы в обеих строках.
- Совпадение с шрифтом: вызовы `drawGameOver(ctx, 0, false)` равны вызовам
  `drawText(GAME_OVER_TEXT, …)` + `drawText(PRESS_ENTER_TEXT, …)` на втором
  `recorder()` (проверяет, что рисуется именно текст в нужных координатах).
- Скрытый тик (`phaseTicks = 30`, `false`): все вызовы внутри строки `GAME OVER`, ни
  одного в строке `PRESS ENTER`.
- `backdrop = true`, тик 0: ровно 2 вызова с `#000`, каждый — точно `rowRect(…, PAD)`
  своей строки; подложка строки идёт раньше любого пикселя текста этой строки; прочие
  вызовы — внутри своих строк (расширенных на `PAD`).
- `backdrop = true`, тик 30: подложка `PRESS ENTER` есть (2 чёрных вызова), текста
  `PRESS ENTER` нет.
- Умолчание: `drawGameOver(ctx, 0)` даёт те же вызовы, что
  `drawGameOver(ctx, 0, GAME_OVER_BACKDROP)`.

### 4.2. `PlayScene`

**Файл (изменить):** `src/game/scenes/play-scene.test.ts`

Хелпер быстрого Game Over (одна жизнь, удар вручную, 60 тиков):

```typescript
function overScene(exit?: () => Scene): PlayScene {
  const scene = new PlayScene(
    createRng(1),
    undefined,
    { levels: ONE_CORNER_ENEMY, lives: 1 },
    exit,
  );
  scene.battle.player.hit();
  step(scene, new Input(), GAME_OVER_DELAY_TICKS);
  expect(scene.battle.phase).toBe('over');
  return scene;
}
```

Сценарии:

- В `over` `start` → `step` возвращает ровно объект из фабрики-шпиона (фабрика вызвана
  один раз).
- Enter в тик перехода в `over`: после `hit()` `step` на `GAME_OVER_DELAY_TICKS − 1`
  без нажатия, затем `press('start')` и один `step` → сцена из `exit`.
- До `over` (`playing`) `start` → `step` возвращает ту же сцену, фабрика не вызвана.
- Без `exit` в `over` `start` → та же сцена.
- Рендер (через `recorder()`: `PlayScene.render` и всё, что он вызывает, использует только
  `fillStyle`/`fillRect`): эталон `expected` — вызовы `drawGameOver(ctx, phaseTicks)` на
  отдельном `recorder()`, N = `expected.length`.
  - в `over`: последние N вызовов `render` равны `expected`;
  - в `playing` (свежая сцена, `phaseTicks` взять тот же): последние N вызовов `render`
    **не** равны `expected` (надписи нет).

Импорты: `GAME_OVER_DELAY_TICKS` из `../battle`, `type Scene` из `../../engine/scene`,
`drawGameOver` из `../game-over-render`, `recorder` из `../canvas-test-utils`.

### 4.3. `TitleScene`

**Файл (изменить):** `src/game/scenes/title-scene.test.ts`

Сценарии:

- Переданный `starfield`: `const sf = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT,
createRng(2))`; `new TitleScene(createRng(1), undefined, sf).starfield` — `toBe(sf)`; по
  `start` — `PlayScene` с `starfield` `toBe(sf)`.
- Без переданного — `TitleScene.starfield` и `PlayScene.starfield` тот же экземпляр.
- Полный цикл (`createRng(1)`, уровень 1, 3 жизни):

```typescript
it('runs a full cycle: start -> game over -> title -> new game', () => {
  const input = new Input();
  const title = new TitleScene(createRng(1));
  const stars = title.starfield;
  input.press('start');
  const play = step(title, input);
  input.release('start');
  expect(play).toBeInstanceOf(PlayScene);
  const game = play as PlayScene;
  // Hit the ship whenever it can be hit; the limit makes a hang fail instead of looping.
  // Expected about 420 ticks: 2 × (down 60 + invulnerable 120) + 60.
  for (let i = 0; i < 600 && game.battle.phase !== 'over'; i++) {
    if (game.battle.player.canBeHit) game.battle.player.hit();
    expect(step(game, input)).toBe(game);
  }
  expect(game.battle.phase).toBe('over');

  input.press('start');
  const back = step(game, input);
  input.release('start');
  expect(back).toBeInstanceOf(TitleScene);
  expect((back as TitleScene).starfield).toBe(stars);
  // The Enter that led back is consumed: the title stays.
  expect(step(back, input)).toBe(back);

  input.press('start');
  const again = step(back, input);
  expect(again).toBeInstanceOf(PlayScene);
  const next = again as PlayScene;
  expect(next).not.toBe(game);
  expect(next.starfield).toBe(stars);
  expect(next.battle.level).toBe(1);
  expect(next.battle.player.lives).toBe(START_LIVES);
  expect(next.battle.phase).toBe('playing');
});
```

- Возврат сохраняет `startLevel`: `TitleScene(createRng(1), 2)` → `PlayScene` (уровень 2)
  → быстрый Game Over (`hit()` в цикле, как выше) → `start` → титул → `start` →
  новая `PlayScene` с `battle.level === 2`. Можно совместить с полным циклом отдельным
  `it` через общий хелпер `loseGame(scene, input)`.

Без проверки `battle.score === 0` — добавляется в 022. Существующие тесты сцен не
меняются.

## 5. Приёмка глазами

**Файл (создать):** `second-brain/tasks/tasks/021-game-over-screen/acceptance.md`

Пункты для владельца (`npm run dev`, при желании `?level=4` для частых попаданий):

1. Через ~1 с после гибели последнего корабля — `GAME OVER` (красный) и под ним
   мигающее `PRESS ENTER` (белый), по центру, ниже панели; враги, взрывы и звёзды
   продолжают двигаться за надписью.
2. Ритм мигания — 0,5 с видно / 0,5 с скрыто; сразу после появления надпись видна.
3. **Читаемость без подложки** поверх врагов и звёзд. Если плохо — включить
   `GAME_OVER_BACKDROP = true` в `src/game/game-over-render.ts` (одна константа).
4. Положение по Y (112 / 128) — устраивает ли.
5. Enter → титул; звёзды без скачка; титул не уходит сразу в игру.
6. Enter на титуле → новая игра: 3 иконки жизней, уровень 1 (или `?level=N`).

## 6. Ручная проверка

`npm run dev`: проиграть три корабля (можно стоять под пикирующими врагами), проверить
пункты из `acceptance.md`; дополнительно — что Enter во время боя ничего не делает.

## 7. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` — «Поражение игрока» (стр. 45-51):
заменить «надпись Game Over — задача 021» на описание: в конце игры поверх летающих
врагов и панели — `GAME OVER` и мигающее `PRESS ENTER`; Enter → заставка, звёзды
продолжаются без скачка; с заставки Enter — новая игра с 3 жизнями (фича 005, В3).

**Файл (изменить):** `second-brain/architecture/overview.md`:

- стр. ~26-28: `TitleScene(rng, startLevel?, starfield?)` — переданные звёзды
  продолжаются; `readonly starfield`; передаёт в `PlayScene` фабрику `exit`, создающую
  новый `TitleScene` с тем же `rng`, `startLevel`, `starfield`.
- новый пункт `game-over-render.ts` — `drawGameOver(ctx, phaseTicks, backdrop?)`,
  `centeredX`, `isPromptVisible`, константы раскладки/мигания, выключенная подложка.
- стр. ~258-265 (`PlayScene`): сигнатура `PlayScene(rng, starfield?, opts?, exit?)`,
  `readonly starfield`; `update` возвращает `exit()` по `start` в фазе `over`; слой
  `drawGameOver` последним в фазе `over`; цикла `play ↔ title` нет за счёт фабрики.
- стр. ~255-257: `game-over-render.test.ts` — к пользователям `recorder()`.
- граф импортов: `play-scene → {…, game-over-render}`,
  `game-over-render → {config, art, font}`.

`README.md` в папках `src/` нет — не нужно.

## Сводка по файлам

| Действие | Файл                                                          |
| -------- | ------------------------------------------------------------- |
| Создать  | `src/game/game-over-render.ts`                                |
| Создать  | `src/game/game-over-render.test.ts`                           |
| Изменить | `src/game/scenes/play-scene.ts`                               |
| Изменить | `src/game/scenes/play-scene.test.ts`                          |
| Изменить | `src/game/scenes/title-scene.ts`                              |
| Изменить | `src/game/scenes/title-scene.test.ts`                         |
| Создать  | `second-brain/tasks/tasks/021-game-over-screen/acceptance.md` |
| Изменить | `second-brain/game-design.md`                                 |
| Изменить | `second-brain/architecture/overview.md`                       |

Не меняются: `src/engine/*`, `src/main.ts`, `battle.ts`, `hud*.ts`, `font.ts`, запись фичи
в `second-brain/features/`.

## Архитектура и паттерны

- Граница engine/game: `Scene`/`Input` используются как есть, `src/engine/` не меняется.
- Логика отдельно от рендера: `centeredX`, `isPromptVisible` — чистые функции;
  `drawGameOver` зависит только от `phaseTicks` боя, своего счётчика у сцены нет.
- Детерминизм: время — тики `phaseTicks`; `rng` не потребляется по-новому (при переданном
  `starfield` титул не тратит `rng`, порядок в `PlayScene` прежний).
- Цикл модулей снят фабрикой `exit`, которую создаёт `TitleScene`.
- Координаты целые (`Math.floor` в `centeredX`, целые Y) — `drawText` ожидает целые.
- `import type` для `Scene`, `Rng`, `Input`, `BattleOptions`.

## Открытые вопросы

- **Подложка под надписью** — по умолчанию выключена (`GAME_OVER_BACKDROP = false`),
  решение владельца на приёмке глазами (`acceptance.md`, п. 3). Не блокирует.
- Y надписей 112 / 128 — приняты; финально подтверждаются на приёмке (п. 4).

## Ссылки

- `second-brain/tasks/tasks/021-game-over-screen/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/005-lives-score-game-over/design.md` («Сцена», «Поток тика»,
  «Интерфейсы», «Тестирование», нарезка п. 2)
- `second-brain/architecture/overview.md`
- `second-brain/tasks/tasks-done/020-lives-and-game-over-logic/`

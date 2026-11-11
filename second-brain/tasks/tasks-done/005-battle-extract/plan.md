# План реализации: Выделение Battle и battle-render

Подготовительный рефакторинг фичи 002 (пункт 1 нарезки `design.md`) **без изменения
поведения**. Логика боя уходит из `PlayScene` в агрегат `Battle` (без ввода и canvas),
отрисовка игровых сущностей — в `drawBattle`; `PlayScene` становится тонкой. Общий
фейковый ctx `recorder()` выносится из `sprite.test.ts` в `canvas-test-utils.ts`.

Код: ветка `feature/002-enemies-and-levels`, коммит `20da398`.

## Решения по техническим вопросам из analyze.md

1. **`battle.test.ts` в этой задаче не создаём.** По дизайну («Модули и файлы») этот
   файл — про порядок тика, фазы и переход уровня (задачи 006/008). Сейчас `Battle.update`
   — одна строка делегирования в `Player.update`, и она полностью покрыта
   `play-scene.test.ts` через `scene.battle.player` (движение, края, выстрел, автоогонь).
   Отдельный тест сейчас дублировал бы `player.test.ts`. Файл появится в 006/008 вместе
   с первой собственной логикой `Battle`.
2. **`battle-render.test.ts` — точное совпадение массива вызовов.** Ожидаемые вызовы
   корабля строятся в тесте **напрямую из `SHIP_SPRITE.pixels`** (обход row/col, без
   `drawSprite`), поэтому тест не тавтологичен и ловит и порядок слоёв, и смещение, и
   `Math.floor`, и лишние вызовы (например, случайно попавшую в `drawBattle` заливку).
   `recorder()` пишет текущий `fillStyle` на каждый `fillRect`, а `drawSprite` ставит
   `fillStyle` перед сменой цвета — значит цвет каждого вызова равен цвету пикселя.

## 1. Общий фейковый ctx

**Файл (создать):** `src/game/canvas-test-utils.ts`

Перенос из `sprite.test.ts:4-21`; интерфейс `Call` → экспортируемый `FillCall` (как в
«Интерфейсы» дизайна). Не `*.test.ts` — попадает в `tsc` и ESLint, но импортируется
только тестами (в бандл не идёт: `main.ts` его не тянет).

```typescript
/** One recorded fillRect call with the fillStyle active at that moment. */
export interface FillCall {
  fillStyle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Test-only helper. A fake 2D context that records every fillRect call
 * together with the current fillStyle. Supports nothing else.
 */
export function recorder(): { ctx: CanvasRenderingContext2D; calls: FillCall[] } {
  const calls: FillCall[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
```

## 2. sprite.test.ts на общем recorder

**Файл (изменить):** `src/game/sprite.test.ts`

Удалить локальные `interface Call` и `function recorder()` (строки 4-21), добавить импорт:

```typescript
import { describe, expect, it } from 'vitest';
import { recorder } from './canvas-test-utils';
import { drawSprite, parseSprite } from './sprite';
```

Тесты и ожидания не меняются (все 11 тестов файла должны пройти как есть).

## 3. Агрегат Battle

**Файл (создать):** `src/game/battle.ts`

Конструктор без аргументов (`rng` и `BattleOptions` — в 006/008; лишний параметр
нарушит `noUnusedParameters`). `PlayerIntent` — `import type`.

```typescript
import type { PlayerIntent } from './player';
import { Player } from './player';

/**
 * Battle aggregate: everything that happens on the play field, without input or canvas.
 * For now it holds only the player; the enemy wave, levels and collisions join later.
 */
export class Battle {
  readonly player = new Player();

  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
  }
}
```

(Стиль импортов — как в `player.ts`: отдельная строка `import type` и значение. Если
линтер/Prettier предпочтут иное — оставить то, что проходит `lint`.)

## 4. Отрисовка боя

**Файл (создать):** `src/game/battle-render.ts`

Перенос тела из `play-scene.ts:31-37` без изменений: выстрел (если есть) → корабль,
координаты через `Math.floor`. Заливка и звёзды сюда не входят — они остаются в сцене.

```typescript
import { SHIP_SPRITE, SHOT_COLOR } from './art';
import type { Battle } from './battle';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import { drawSprite } from './sprite';

/** Draws the battle entities, back to front: player shot, then ship. No background. */
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const { ship, shot } = battle.player;
  if (shot) {
    ctx.fillStyle = SHOT_COLOR;
    ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
  }
  drawSprite(ctx, SHIP_SPRITE, Math.floor(ship.x), Math.floor(ship.y));
}
```

Импорт `player` (type) из итогового графа дизайна не добавлять — появится в 011.

## 5. Тонкая PlayScene

**Файл (изменить):** `src/game/scenes/play-scene.ts`

`readonly battle = new Battle()` вместо `player`; `update` → `battle.update`; `render` →
заливка → звёзды → `drawBattle`. Уходят импорты `art`, `sprite`, `shot`, значение
`Player` (остаётся `readIntent`). Конструктор `PlayScene(rng, starfield?)` не меняется —
`TitleScene` не трогаем.

```typescript
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { Battle } from '../battle';
import { drawBattle } from '../battle-render';
import { readIntent } from '../player';
import { Starfield } from '../starfield';

/** Gameplay screen: starfield background plus the battle. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle = new Battle();
  private readonly starfield: Starfield;

  /** Pass the title's starfield to keep the stars continuous across the switch. */
  constructor(rng: Rng, starfield?: Starfield) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, input: Input): void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawBattle(ctx, this.battle);
  }
}
```

## 6. Тесты

### 6.1 play-scene.test.ts — путь доступа

**Файл (изменить):** `src/game/scenes/play-scene.test.ts`

- Все `scene.player` → `scene.battle.player` (механическая замена; логика и ожидания
  те же, все 10 тестов).
- Первый тест дополнить: `expect(scene.battle).toBeInstanceOf(Battle)` (импорт
  `Battle` из `../battle`), `Player` — проверка `scene.battle.player` остаётся.

```typescript
it('places the ship at the start position', () => {
  const scene = new PlayScene(createRng(1));
  expect(scene.battle).toBeInstanceOf(Battle);
  expect(scene.battle.player).toBeInstanceOf(Player);
  expect(scene.battle.player.ship.x).toBe(new Ship().x);
  expect(scene.battle.player.ship.y).toBe(SHIP_Y);
});
```

### 6.2 battle-render.test.ts — новый

**Файл (создать):** `src/game/battle-render.test.ts` (Vitest, environment `node`,
фейковый ctx — `recorder()` из `./canvas-test-utils`)

Хелпер в тесте — ожидаемые вызовы корабля прямо из данных спрайта:

```typescript
import { describe, expect, it } from 'vitest';
import { SHIP_SPRITE, SHOT_COLOR } from './art';
import { Battle } from './battle';
import { drawBattle } from './battle-render';
import type { FillCall } from './canvas-test-utils';
import { recorder } from './canvas-test-utils';
import { SHIP_Y } from './ship';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';

/** Expected calls for the ship sprite at (x, y), built from the pixel data, not via drawSprite. */
function shipCalls(x: number, y: number): FillCall[] {
  const calls: FillCall[] = [];
  for (let row = 0; row < SHIP_SPRITE.height; row++) {
    for (let col = 0; col < SHIP_SPRITE.width; col++) {
      const color = SHIP_SPRITE.pixels[row * SHIP_SPRITE.width + col];
      if (color != null) calls.push({ fillStyle: color, x: x + col, y: y + row, w: 1, h: 1 });
    }
  }
  return calls;
}

const IDLE = { move: 0, fire: false } as const;
const FIRE = { move: 0, fire: true } as const;
```

(Если `as const` не сужает `move` до `MoveDir` в аннотации — объявить
`const IDLE: PlayerIntent = { move: 0, fire: false }` с `import type { PlayerIntent }`.)

Сценарии:

- **Без выстрела — только корабль.** `new Battle()`, `drawBattle` →
  `calls` строго равен `shipCalls(ship.x, SHIP_Y)`. Ловит лишние вызовы (заливку/фон
  в `drawBattle`).
- **С выстрелом — выстрел первым, затем корабль.** `battle.update(TICK_SECONDS, FIRE)`;
  `shot = battle.player.shot!` (проверить `not.toBeNull()`); `calls` строго равен
  `[{ fillStyle: SHOT_COLOR, x: shot.x, y: shot.y, w: SHOT_WIDTH, h: SHOT_HEIGHT },
...shipCalls(ship.x, SHIP_Y)]` — порядок слоёв.
- **Корабль сдвинут — вызовы смещаются.** Несколько тиков `{ move: 1, fire: false }`
  (напр. 5 тиков → `x0 + 10`), `calls` равен `shipCalls(ship.x, SHIP_Y)`; доп. проверка
  `ship.x !== x0`, чтобы тест не прошёл вхолостую.
- **Граничный: дробные координаты округляются вниз.** Корабль: `battle.player.ship.x =
10.5` (поле публичное) → `calls` равен `shipCalls(10, SHIP_Y)`. Выстрел: после `FIRE`
  `shot.y += 0.5` (`y` публичное) → первый вызов имеет `y: Math.floor(shot.y)`
  (а `x` выстрела — целый по построению, ожидание `shot.x`). Фиксирует перенос
  `Math.floor` из сцены (`drawSprite` ждёт целые).

`TICK_SECONDS` — из `../config`.

### 6.3 Регрессия

`player.test.ts`, `ship.test.ts`, `shot.test.ts`, `starfield.test.ts`,
`title-scene.test.ts` (`instanceof PlayScene`) — без изменений и зелёные. Базовая линия
до задачи: 9 файлов / 76 тестов; после — 10 файлов, 76 + 4 = 80 тестов.

## 7. Ручная проверка

`npm run dev`, открыть страницу:

- титул как раньше; Enter — переход в игру, звёзды продолжаются без скачка;
- корабль по центру внизу, ←/→ двигают его, у краёв останавливается;
- Space/огонь — один белый выстрел вверх, повторный только после ухода выстрела за верх;
- выстрел рисуется под кораблём в момент вылета (слой ниже), фон чёрный со звёздами.

Ничего визуально не должно отличаться от 001.

Плюс полный набор: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- В «Игра» добавить пункты:
  - `battle.ts` — `Battle`: агрегат боя без ввода и canvas; пока `readonly player` и
    `update(dt, intent)` (делегирует `Player`). Дальше в него ложатся волна, уровни,
    фазы, коллизии (фича 002). Конструктор без аргументов (`rng` появится с волной).
  - `battle-render.ts` — `drawBattle(ctx, battle)`: вся отрисовка игровых сущностей,
    слои выстрел → корабль, координаты через `Math.floor`; фон не рисует.
  - `canvas-test-utils.ts` — только для тестов: `recorder()` — фейковый ctx, пишет
    `fillRect` с текущим `fillStyle` (`FillCall`); используют `sprite.test.ts`,
    `battle-render.test.ts`.
- Переписать пункт `scenes/play-scene.ts`: держит `readonly battle` (открыт для
  тестов, тесты ходят через `scene.battle.player`); `update` — звёзды →
  `battle.update(dt, readIntent(input))`; слои: заливка → звёзды → `drawBattle`.
  `readIntent` остаётся в сцене — `Battle` ввод не знает.
- Граф импортов: `play-scene → {starfield, battle, battle-render, player}`,
  `battle → player` (`PlayerIntent` — type), `battle-render → {art, sprite, shot}`
  (`Battle` — type); `canvas-test-utils` — без импортов, только из `*.test.ts`.
  Остальное без изменений; циклов нет.

README в `src/game/` и `src/game/scenes/` нет — создавать не нужно. `game-design.md` не
меняется (поведение то же). Запись фичи в `second-brain/features/` не трогать.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/canvas-test-utils.ts`         |
| Изменить | `src/game/sprite.test.ts`               |
| Создать  | `src/game/battle.ts`                    |
| Создать  | `src/game/battle-render.ts`             |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `src/game/scenes/play-scene.test.ts`    |
| Создать  | `src/game/battle-render.test.ts`        |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `player.ts`, `ship.ts`, `shot.ts`, `art.ts`, `sprite.ts`, `starfield.ts`,
`title-scene.ts`, `scene-test-utils.ts`, `main.ts`, `src/engine/*`.

## Архитектура и паттерны

- Граница engine/game не меняется; новые модули — в `src/game/`.
- Логика отдельно от рендера: `Battle` не знает ни `Input`, ни canvas; `drawBattle` —
  чистая функция от состояния, тестируется на фейковом ctx в environment `node`.
- Ввод читается в одном месте — `readIntent` в сцене.
- Детерминизм не затронут: та же логика, тот же порядок вызовов; `Rng` в `Battle`
  появится с волной (006).
- `import type` для `Battle`, `PlayerIntent`, `FillCall`, `Rng`, `Input`, `Scene`
  (`verbatimModuleSyntax`, `consistent-type-imports`); никаких неиспользуемых
  импортов/параметров (`noUnusedLocals`/`noUnusedParameters`).
- Сигнатуры — подмножество «Интерфейсов» дизайна (таблица «Появление API по задачам»,
  строка 005); отступлений нет.

## Открытые вопросы

Нет. Оба технических вопроса из `analyze.md` решены выше (раздел «Решения по
техническим вопросам»), в рамке дизайна.

## Ссылки

- `second-brain/tasks/tasks/005-battle-extract/analyze.md`
- `second-brain/tasks/tasks/005-battle-extract/description.md`
- `CLAUDE.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Модули и файлы»,
  «Интерфейсы», «Появление API по задачам» (005), «Нарезка на задачи» п. 1
- `second-brain/features/002-enemies-and-levels/discussion.md` — п. 8 (общий
  `recorder()`), раунд 3 п. 5 (`new Battle()` без `rng`)

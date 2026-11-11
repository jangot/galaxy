# План реализации: Игровая сцена и переход с титула

Добавить `PlayScene` — пустой игровой экран со звёздным фоном (без надписей и без
корабля) — и переход в неё с `TitleScene` по Enter. `TitleScene` передаёт в новую сцену
свой `rng` и тот же экземпляр `Starfield`, поэтому звёзды не перещёлкиваются. Плюс
тестовый хелпер `step()`, повторяющий цикл `main.ts`, и первый тест сцены через него.

Рамка — `second-brain/features/001-player-ship/design.md` (раунд 2), пункт 1 нарезки;
интерфейсы — раздел «Интерфейсы» (без поля `player`, оно появится в задаче 003).

## 1. Игровая сцена `PlayScene`

**Файл (создать):** `src/game/scenes/play-scene.ts`

- `constructor(rng: Rng, starfield?: Starfield)` — без переданного `starfield` создаёт
  свой из `rng` (нужно для тестов задач 002–004, по `design.md`).
- `update(dt, _input)` — только `starfield.update(dt)`; `input` пока не читается
  (префикс `_` — `noUnusedParameters`), возврат `void` (переходов нет).
- `render(ctx)` — чёрная заливка + звёзды, как первые два слоя `TitleScene.render`.
- Импорты: `Starfield` и константы — значением, `Rng`/`Input`/`Scene` — `import type`.
- Не импортировать `title-scene` (иначе цикл импортов).

```typescript
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { Starfield } from '../starfield';

/** Gameplay screen. For now: just the starfield (the player ship comes in later tasks). */
export class PlayScene implements Scene {
  private readonly starfield: Starfield;

  /** Pass the title's starfield to keep the stars continuous across the switch. */
  constructor(rng: Rng, starfield?: Starfield) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, _input: Input): void {
    this.starfield.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
  }
}
```

Замечание: `rng` в конструкторе используется только в ветке по умолчанию — это нормально
(параметр используется, линтер молчит). В поле `rng` не сохраняем — в этой задаче он
сцене не нужен; если понадобится врагам — добавят в своей задаче.

## 2. Переход с титула

**Файл (изменить):** `src/game/scenes/title-scene.ts`

- `constructor(rng: Rng)` → `constructor(private readonly rng: Rng)` (parameter property,
  как в `Input`/`Starfield`); тело — по-прежнему создаёт `this.starfield`.
- `update(dt: number, _input: Input): void` → `update(dt: number, input: Input): Scene | void`.
- В конце `update` (после `ticks++` и `starfield.update(dt)` — тик титула отрабатывает
  целиком, двойного/пропущенного обновления звёзд нет):
  `if (input.pressed('start')) return new PlayScene(this.rng, this.starfield);`
- Добавить импорт `import { PlayScene } from './play-scene';` — значением.
- `render` и комментарий класса не меняются.

```typescript
import { PlayScene } from './play-scene';
// ...
export class TitleScene implements Scene {
  private readonly starfield: Starfield;
  private ticks = 0;

  constructor(private readonly rng: Rng) {
    this.starfield = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, input: Input): Scene | void {
    this.ticks++;
    this.starfield.update(dt);
    if (input.pressed('start')) return new PlayScene(this.rng, this.starfield);
  }
  // render — без изменений
}
```

Проверено по конфигам: `noImplicitReturns` в `tsconfig.json` не включён, а
`no-invalid-void-type` входит только в `strict`-набор typescript-eslint (у нас
`recommended`), так что неявный `undefined` в конце `update` с типом `Scene | void`
проходит и `typecheck`, и `lint`.

## 3. Тестовый хелпер `step()`

**Файл (создать):** `src/game/scenes/scene-test-utils.ts`

Отдельный модуль (не `*.test.ts`), чтобы тест-файлы импортировали его без повторного
выполнения чужих тестов. Повторяет `main.ts:21-25` строго.

```typescript
import { TICK_SECONDS } from '../../config';
import type { Input } from '../../engine/input';
import type { Scene } from '../../engine/scene';

/**
 * Test-only helper. Runs n ticks exactly like main.ts:
 * update -> switch scene if one was returned -> input.endTick().
 * Returns the current scene after the last tick.
 */
export function step(scene: Scene, input: Input, n = 1): Scene {
  let current = scene;
  for (let i = 0; i < n; i++) {
    const next = current.update(TICK_SECONDS, input);
    if (next) current = next;
    input.endTick();
  }
  return current;
}
```

Не импортируется из `main.ts` — в бандл не попадает; проходит `typecheck` и `lint` как
обычный код.

## 4. Тесты

**Файл (создать):** `src/game/scenes/title-scene.test.ts` (Vitest, environment `node`)

`TitleScene` и `Starfield` canvas в конструкторе не трогают — создаются в Node. `Input`
— `new Input()` без `attach`. Seed фиксированный. `update` — только через `step()`.

```typescript
import { describe, expect, it } from 'vitest';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';
import { TitleScene } from './title-scene';

describe('TitleScene', () => {
  it('stays on the title without start', () => {
    const title = new TitleScene(createRng(1));
    const input = new Input();
    expect(step(title, input)).toBe(title);
    expect(step(title, input, 60)).toBe(title);
  });

  it('switches to PlayScene on start', () => {
    const title = new TitleScene(createRng(1));
    const input = new Input();
    input.press('start');
    expect(step(title, input)).toBeInstanceOf(PlayScene);
  });

  it('consumes the start press after the tick', () => {
    const input = new Input();
    input.press('start');
    step(new TitleScene(createRng(1)), input);
    expect(input.pressed('start')).toBe(false);
  });
});
```

Сценарии:

- Основное: без Enter — тот же объект (`toBe`), в т.ч. за много тиков; с Enter —
  экземпляр `PlayScene`.
- Граничное (опциональное по анализу, дешёвое): `step()` гасит `pressed('start')`
  через `endTick()` — защищает хелпер, на котором стоят тесты задач 002–004.
- `step()` отдельного тест-файла не получает — покрыт тестами сцены (по `design.md`).
- «Звёзды не прыгают» unit-тестом здесь не закрепляется (`starfield` приватный,
  `play-scene.test.ts` — в задаче 003); гарантия — передача экземпляра + проверка глазами.

## 5. Ручная проверка

`npm run dev`, открыть страницу:

- Титул: `GALAXY`, мигающее `PRESS ENTER`, звёзды.
- Enter → экран со звёздами, надписей нет.
- В момент перехода звёзды не прыгают и не меняют раскладку; мигание продолжается плавно.
- Повторный Enter / удержание Enter на игровом экране ничего не делает.

## 6. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

Раздел «Игра» привести к виду:

```markdown
## Игра

- `starfield.ts` — фон из звёзд.
- `scenes/title-scene.ts` — заглушка титульного экрана; по `start` (Enter) возвращает
  `PlayScene`, передавая свой `rng` и тот же экземпляр `Starfield` — звёзды
  продолжаются без скачка.
- `scenes/play-scene.ts` — игровая сцена (пока только звёздный фон). `Starfield`
  принимает снаружи или создаёт из `rng`.
- `scenes/scene-test-utils.ts` — только для тестов: `step(scene, input, n)` прогоняет
  тики как `main.ts` (`update` → смена сцены → `input.endTick()`). Тесты сцен вызывают
  `update` только через него.

Граф импортов: `title-scene → {play-scene, starfield}`, `play-scene → starfield`;
`scene-test-utils → config` (типы `Scene`/`Input` — `import type`). Циклов нет;
`engine` ничего не знает о `game`.
```

README в `src/game/` / `src/game/scenes/` нет — создавать не требуется. `game-design.md`
не меняется (механик эта задача не вводит).

## 7. Проверки

`npm run format` (затем `format:check`), `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` — всё зелёное.

## Сводка по файлам

| Действие  | Файл                                           |
| --------- | ---------------------------------------------- |
| Создать   | `src/game/scenes/play-scene.ts`                |
| Изменить  | `src/game/scenes/title-scene.ts`               |
| Создать   | `src/game/scenes/scene-test-utils.ts`          |
| Создать   | `src/game/scenes/title-scene.test.ts`          |
| Изменить  | `second-brain/architecture/overview.md`        |
| Не менять | `src/main.ts`, `src/engine/*`, `src/config.ts` |

## Архитектура и паттерны

- Переход сцен — через возврат следующей сцены из `update` (интерфейс `Scene`, цикл в
  `main.ts`); движок и `main.ts` не трогаются.
- Детерминизм: `Rng` передаётся снаружи и дальше по цепочке сцен; время — только `dt`.
- Логика отдельно от рендера: тесты сцен — без canvas, `render` не вызывается.
- `import type` для `Rng`/`Input`/`Scene`; классы-конструкторы — значением.
- Тесты сцен — только через `step()`, чтобы `pressed()` гас как в реальном цикле.
- Без циклов импортов: `play-scene` не знает о `title-scene`.

## Открытые вопросы

нет (в `analyze.md` открытых вопросов нет; игровых чисел задача не вводит).

## Ссылки

- `second-brain/tasks/tasks/001-play-scene/analyze.md`
- `second-brain/tasks/tasks/001-play-scene/description.md`
- `CLAUDE.md`
- `second-brain/architecture/overview.md`
- `second-brain/features/001-player-ship/design.md` — «Модули и файлы», «Интерфейсы»,
  «Тестирование», «Нарезка» п. 1
- `second-brain/features/001-player-ship/dev-review-2.md` — граф импортов

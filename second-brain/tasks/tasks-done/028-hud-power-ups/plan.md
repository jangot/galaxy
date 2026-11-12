# План реализации: Улучшения в панели

Показать полученные улучшения пули (`S` — быстрая пуля, `D` — две пули) в строке значений
верхней панели: два фиксированных слота между уровнем и жизнями, иконка — спрайт капсулы
того же вида из `CAPSULE_SPRITES`. Источник — `Player.powerUps`; значки не гаснут до конца
игры (гибель и смена уровня их не трогают). Новое состояние не появляется.

## 1. Модель панели: поле, зона, слоты

**Файл (изменить):** `src/game/hud.ts`

- Импорт типов: `import type { PowerUpKind, PowerUps } from './bonus';` (только типы —
  граф `hud → {config, font}` по значениям не меняется).
- `HudView` — новое поле `powerUps`.
- После `LIVES_ZONE` — зона, порядок слотов и x слотов. Ширина зоны выводится из шага
  жизней и предела иконки (как `LIVES_ZONE_WIDTH`), x — константа из `design.md`.
- `POWER_UPS_ZONE` — в `HUD_ZONES`.
- `hudView` берёт `battle.player.powerUps` (неизменяемый снимок: `grantPowerUp` заменяет
  объект, поэтому ссылку отдавать безопасно).
- Док-комментарии `HudView` и `hudView` дополнить.

```typescript
import type { PowerUpKind, PowerUps } from './bonus';

/** Data shown by the HUD; a pure snapshot built from the battle each frame. */
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Total lives including the ship on the field. */
  readonly lives: number;
  /** Enabled power-ups; each one lights its own fixed slot until the game ends. */
  readonly powerUps: PowerUps;
}

// ... after LIVES_ZONE:

/** Power-up slots left to right; every PowerUpKind has exactly one slot. */
export const POWER_UP_SLOT_KINDS: readonly PowerUpKind[] = ['fastShot', 'doubleShot'];

const POWER_UPS_ZONE_WIDTH = LIFE_ICON_STEP + LIFE_ICON_MAX_SIZE; // 18: two slots

/**
 * x = 156...173, y = 14...21: value row between the level (ends at 147) and the lives
 * (start at 200). No label: the label row above stays empty.
 */
export const POWER_UPS_ZONE: HudZone = {
  x: 156,
  y: HUD_VALUE_Y,
  width: POWER_UPS_ZONE_WIDTH,
  height: LIFE_ICON_MAX_SIZE,
};

/** Fixed slot x per power-up: an icon never moves when the other one arrives. */
export const POWER_UP_SLOT_X: Readonly<Record<PowerUpKind, number>> = {
  fastShot: POWER_UPS_ZONE.x,
  doubleShot: POWER_UPS_ZONE.x + LIFE_ICON_STEP,
};

/** All section zones, for the overlap test; a new section adds its zone here. */
export const HUD_ZONES: readonly HudZone[] = [SCORE_ZONE, LEVEL_ZONE, LIVES_ZONE, POWER_UPS_ZONE];

/** Builds the HUD snapshot from the battle: level, score, lives and power-ups. */
export function hudView(battle: Battle): HudView {
  return {
    level: battle.level,
    score: battle.score,
    lives: battle.player.lives,
    powerUps: battle.player.powerUps,
  };
}
```

`POWER_UP_SLOT_KINDS` — небольшое отступление от `analyze.md` (там только
`POWER_UP_SLOT_X`): нужен фиксированный порядок обхода без приведения
`Object.keys(...) as PowerUpKind[]`; полноту списка проверяет тест (шаг 3). Порядок на
вывод не влияет — слоты не пересекаются.

## 2. Рендер: секция `drawPowerUps`

**Файл (изменить):** `src/game/hud-render.ts`

- Импорт значения `CAPSULE_SPRITES` из `./bonus-art`; из `./hud` — `POWER_UP_SLOT_KINDS`,
  `POWER_UP_SLOT_X`, `POWER_UPS_ZONE`; тип `PowerUps` — `import type` из `./bonus`.
- `drawHud` вызывает `drawPowerUps` после `drawLives`; док `drawHud` — «score, level,
  lives, power-ups sections».
- Private `drawPowerUps`: для каждого включённого вида — спрайт капсулы в его слоте, верх
  зоны; выключенный — ничего. Своей палитры и копии спрайта нет: правка цвета/буквы в
  `bonus-art.ts` меняет и капсулу на поле, и значок.

```typescript
import type { PowerUps } from './bonus';
import { CAPSULE_SPRITES } from './bonus-art';

export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawScore(ctx, view.score);
  drawLevel(ctx, view.level);
  drawLives(ctx, view.lives);
  drawPowerUps(ctx, view.powerUps);
}

/** Each enabled power-up as its capsule sprite in its fixed slot; a disabled one leaves it empty. */
function drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUps): void {
  for (const kind of POWER_UP_SLOT_KINDS) {
    if (powerUps[kind]) {
      drawSprite(ctx, CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
    }
  }
}
```

Сцена (`play-scene.ts:61`, `drawHud(ctx, hudView(this.battle))`), цикл и ввод не
меняются. Не более 2 × 64 `fillRect` за кадр.

## 3. Тесты модели

**Файл (изменить):** `src/game/hud.test.ts` (Vitest, environment `node`)

- Импорты: `NO_POWER_UPS` и тип `PowerUpKind` из `./bonus`, `CAPSULE_SPRITES` из
  `./bonus-art`, `POWER_UPS_ZONE`, `POWER_UP_SLOT_KINDS`, `POWER_UP_SLOT_X` из `./hud`.
- **Обязательная правка:** `toEqual` в `'shows the battle level %i, …'` (стр. 46–50) —
  добавить `powerUps: NO_POWER_UPS` (иначе тест упадёт в рантайме; `typecheck` это не
  ловит). Название теста дополнить «and no power-ups».

Новые сценарии в `describe('hudView')`:

```typescript
it.each(['fastShot', 'doubleShot'] as const)("follows the player's power-up %s", (kind) => {
  const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
  battle.player.grantPowerUp(kind);
  expect(hudView(battle).powerUps).toEqual({ ...NO_POWER_UPS, [kind]: true });
});

it('shows both power-ups and keeps them after a hit', () => {
  const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
  battle.player.grantPowerUp('fastShot');
  battle.player.grantPowerUp('doubleShot');
  battle.player.hit();
  expect(hudView(battle).powerUps).toEqual({ fastShot: true, doubleShot: true });
});
```

Новые сценарии в `describe('layout')`:

- `POWER_UPS_ZONE` входит в `HUD_ZONES` (`expect(HUD_ZONES).toContain(POWER_UPS_ZONE)`) —
  тогда существующие «integer coordinates inside the HUD strip» и «no overlapping zones»
  охватывают новую секцию.
- Зона в строке значений: `POWER_UPS_ZONE.y === HUD_VALUE_Y`, высота
  `>= LIFE_ICON_MAX_SIZE`.

Новые сценарии в `describe('capacity')` (или отдельный `describe('power-up icons')`):

- `POWER_UP_SLOT_KINDS` покрывает все виды ровно по разу:
  `[...POWER_UP_SLOT_KINDS].sort()` равно `Object.keys(NO_POWER_UPS).sort()`.
- Каждый слот: x целое; `x >= POWER_UPS_ZONE.x`;
  `x + LIFE_ICON_MAX_SIZE <= POWER_UPS_ZONE.x + POWER_UPS_ZONE.width`.
- Слоты не пересекаются: для соседей в `POWER_UP_SLOT_KINDS` разница x
  `>= LIFE_ICON_MAX_SIZE`.
- Иконка влезает: для каждого `kind` из `POWER_UP_SLOT_KINDS` —
  `CAPSULE_SPRITES[kind].width` и `.height` `<= LIFE_ICON_MAX_SIZE`. Проверка по спрайту
  (а не через `CAPSULE_SIZE`) — строже и без импорта `capsule.ts`; равенство
  `CAPSULE_SIZE` и размера спрайта уже проверено в `bonus-art.test.ts`.

## 4. Тесты рендера

**Файл (изменить):** `src/game/hud-render.test.ts` (Vitest, environment `node`)

- Импорты: `NO_POWER_UPS` и тип `PowerUps` из `./bonus`, `CAPSULE_SPRITES` из
  `./bonus-art`, `POWER_UPS_ZONE`, `POWER_UP_SLOT_KINDS`, `POWER_UP_SLOT_X` из `./hud`.
- Литералы `HudView`:
  - `BASE` (стр. 27) → `{ level: 1, score: 0, lives: 3, powerUps: NO_POWER_UPS }`;
  - `max` (стр. 70) → добавить `powerUps: { fastShot: true, doubleShot: true }` (тест
    «draws only inside the HUD strip and its zones» охватит иконки);
  - `labels({ level: 12, score: 4567, lives: 1 })` (стр. 170) → добавить
    `powerUps: { fastShot: true, doubleShot: true }` (подписи не зависят и от улучшений;
    фильтр по зонам счёта/уровня иконки не задевает).
- `'a %s change touches only its own zone'` — новая строка:
  `['powerUps', { ...BASE, powerUps: { fastShot: true, doubleShot: true } }, POWER_UPS_ZONE]`.

Новые сценарии:

```typescript
const ALL: PowerUps = { fastShot: true, doubleShot: true };

/** Reference output: capsule sprites of the enabled kinds in their slots. */
function iconCalls(powerUps: PowerUps): FillCall[] {
  const { ctx, calls } = recorder();
  for (const kind of POWER_UP_SLOT_KINDS) {
    if (powerUps[kind])
      drawSprite(ctx, CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
  }
  return calls;
}

it('draws nothing in the power-ups zone without power-ups', () => {
  expect(draw(BASE).filter((c) => inZone(c, POWER_UPS_ZONE))).toEqual([]);
});

it.each([
  ['fastShot', { ...NO_POWER_UPS, fastShot: true }],
  ['doubleShot', { ...NO_POWER_UPS, doubleShot: true }],
  ['both', ALL],
] as const)('draws only the enabled power-ups, each in its slot (%s)', (_name, powerUps) => {
  const calls = draw({ ...BASE, powerUps }).filter((c) => inZone(c, POWER_UPS_ZONE));
  expect(calls.length).toBeGreaterThan(0);
  expect(sortedKeys(calls)).toEqual(sortedKeys(iconCalls(powerUps)));
});

it('keeps the doubleShot icon in place with or without fastShot', () => {
  const only = draw({ ...BASE, powerUps: { ...NO_POWER_UPS, doubleShot: true } });
  const both = draw({ ...BASE, powerUps: ALL });
  const fastOnly = draw({ ...BASE, powerUps: { ...NO_POWER_UPS, fastShot: true } });
  // both = doubleShot alone + fastShot alone, as multisets (outside the zone nothing changes)
  expect(sortedKeys(minus(both, fastOnly))).toEqual(sortedKeys(minus(only, draw(BASE))));
});
```

Тесты не зашивают цвета капсул — только «пиксели иконки = пиксели `CAPSULE_SPRITES`»
(цвета ждут утверждения на приёмке 027).

Существующие тесты, которые не меняются и должны пройти: «places the text exactly at
the zone positions» (`lives: 0`, `BASE.powerUps = NO_POWER_UPS` → иконок нет); «uses
label, value and icon colors» (иконки улучшений — на строке значений вне зон счёта,
уровня и жизней); «draws %i lives icons» (фильтр по `LIVES_ZONE`).

## 5. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 6. Ручная проверка

`npm run dev` → игра. Значки появляются только после поимки капсулы `S`/`D`; dev-способа
выдать улучшение нет (астероид — раз за уровень через 5–15 с, вид капсулы случаен), так
что проверка может занять несколько уровней. Смотреть:

- без улучшений между `LEVEL` и жизнями пусто, подписи над местом нет;
- после `S` — синий значок в левом слоте (x 156), после `D` — зелёный в правом (x 166);
  `D` без `S` стоит в правом слоте, при получении второго значки не сдвигаются;
- значки читаются при обычном масштабе, не сливаются с номером уровня и иконками жизней;
- значки остаются после гибели корабля и смены уровня; новая игра (Enter после
  `GAME OVER`) — значков нет;
- цвет и буква значка совпадают с капсулой на поле.

На стадии `do` создать `second-brain/tasks/tasks/028-hud-power-ups/acceptance.md` с этим
чек-листом (прогон фичи приёмкой глазами не останавливается).

## 7. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- Абзац `hud.ts` (стр. ~323): `HudView { level, score, lives, powerUps }` (`powerUps` —
  `battle.player.powerUps`); в раскладку — `POWER_UPS_ZONE` (156, 14, 18×8; без подписи),
  `POWER_UP_SLOT_KINDS`, `POWER_UP_SLOT_X` (`fastShot` 156, `doubleShot` 166, шаг
  `LIFE_ICON_STEP`).
- Абзац `hud-render.ts` (стр. ~333): секции счёт → уровень → жизни → улучшения; иконки
  улучшений — `CAPSULE_SPRITES[kind]` в фиксированном слоте, только для включённых.
- Граф импортов (стр. ~372): `hud → {config, font}` (`Battle`, `PowerUpKind`, `PowerUps` —
  type); `hud-render → {art, bonus-art, font, hud, sprite}` (`HudView`, `HudZone`,
  `PowerUps` — type).

**Файл (изменить):** `second-brain/game-design.md`

- «Экран», абзац HUD (стр. ~17): между уровнем и жизнями — значки полученных улучшений
  (`S`, `D` — копии капсул, фиксированные места, без подписи).
- «Астероиды и бонусы» (стр. ~86): «Иконки улучшений в панели — задача 028» → «Полученные
  улучшения видны в панели значками до конца игры».

Запись фичи (`second-brain/features/006-…`, `features/README.md`) не трогать — по
указанию оркестратора. README в `src/game/` нет.

## Сводка по файлам

| Действие | Файл                                                       |
| -------- | ---------------------------------------------------------- |
| Изменить | `src/game/hud.ts`                                          |
| Изменить | `src/game/hud-render.ts`                                   |
| Изменить | `src/game/hud.test.ts`                                     |
| Изменить | `src/game/hud-render.test.ts`                              |
| Изменить | `second-brain/architecture/overview.md`                    |
| Изменить | `second-brain/game-design.md`                              |
| Создать  | `second-brain/tasks/tasks/028-hud-power-ups/acceptance.md` |

## Архитектура и паттерны

- Рецепт новой секции панели (фича 004): поле `HudView` + зона в `HUD_ZONES` + private
  `drawX` в `drawHud`; существующие тесты зон охватывают секцию автоматически.
- Логика отдельно от рендера: `hud.ts` без canvas, `hud-render.ts` только рисует снимок.
- Один источник вида: иконка = `CAPSULE_SPRITES[kind]`, без копии палитры.
- Целочисленные координаты, константы раскладки выведены из `LIFE_ICON_STEP` /
  `LIFE_ICON_MAX_SIZE`.
- `import type` для `PowerUpKind`, `PowerUps`; `rng` и `dt` не используются —
  детерминизм не затронут; граница engine/game не затронута.

## Открытые вопросы

Блокирующих нет.

- Из `analyze.md`, не в рамках задачи: dev-параметр выдачи улучшений/бонуса (напр.
  `?powerUps=SD`) упростил бы приёмку глазами 027 и 028 — при желании владельца отдельная
  задача (предложение есть в `acceptance.md` задачи 027).

## Ссылки

- `second-brain/tasks/tasks/028-hud-power-ups/analyze.md`
- CLAUDE.md
- `second-brain/features/006-asteroid-bonuses/design.md` («HUD», «Рендер», «Нарезка», п. 4)
- `second-brain/features/004-hud/design.md` (рецепт новой секции)
- `second-brain/architecture/overview.md` (абзацы `hud.ts`, `hud-render.ts`, граф импортов)
- `second-brain/tasks/tasks/027-capsule-bonuses/acceptance.md`

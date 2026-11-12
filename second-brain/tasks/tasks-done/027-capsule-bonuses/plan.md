# План реализации: Капсула и бонусы

Разбитый астероид оставляет капсулу 8×8 с буквой бонуса (`L` / `S` / `D`), она падает
1 px/тик; корабль в `active` или `invulnerable` её ловит, и `Battle` применяет бонус
(жизнь / быстрая пуля / две пули) или, если бонус бесполезен, начисляет ровно 500 очков.
План опирается на код рабочего дерева после 024–026 (базовый прогон: 28 файлов, 866
тестов — зелёные) и следует `design.md` фичи 006 (пункт 3 нарезки).

## 1. Сущность `Capsule`

**Файл (создать):** `src/game/capsule.ts`

Без состояний, по образцу `EnemyShot` (`isOffscreen`) и `Asteroid` (`width`/`height` —
структурно `Rect`). Импорт `config` и `import type { BonusKind }`.

```typescript
import { SCREEN_HEIGHT } from '../config';
import type { BonusKind } from './bonus';

/** Hitbox side, px. Equals the sprite size (CAPSULE_SPRITES, checked in bonus-art.test.ts). */
export const CAPSULE_SIZE = 8;
/** Downward speed, px/s: 1 px/tick (ADR 002). */
export const CAPSULE_SPEED = 60;

/**
 * A bonus dropped by a broken asteroid (В4): falls straight down, carries its kind.
 * No states: it is on the field while BonusField holds it (caught or offscreen - dropped).
 * Shots pass through it; only the ship catches it. Does not move on the tick it drops.
 */
export class Capsule {
  readonly width = CAPSULE_SIZE;
  readonly height = CAPSULE_SIZE;

  /** x is fixed (falls straight down); integer x/y from the floored asteroid position. */
  constructor(
    readonly kind: BonusKind,
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y += CAPSULE_SPEED * dt;
  }

  /** True once the whole capsule is below the bottom edge of the screen. */
  get isOffscreen(): boolean {
    return this.y >= SCREEN_HEIGHT;
  }
}
```

## 2. Капсула в `BonusField`

**Файл (изменить):** `src/game/bonus-field.ts`

- Импорт: `ASTEROID_SIZE` из `./asteroid` (модуль уже импортирован), `Capsule`,
  `CAPSULE_SIZE` из `./capsule`, `import type { BonusKind } from './bonus'` (рядом с уже
  импортируемым `BONUS_KINDS`).
- Модульная константа сдвига (целая: оба размера чётные):

```typescript
/** The capsule is centered in the asteroid's rectangle: (12 - 8) / 2 = 2 px. */
const CAPSULE_DROP_OFFSET = (ASTEROID_SIZE - CAPSULE_SIZE) / 2;
```

- Поле `private dropped: Capsule | null = null;` и геттер:

```typescript
get capsule(): Capsule | null {
  return this.dropped;
}
```

- `update` — после астероида двигает капсулу и убирает ушедшую; «поле пусто» = нет ни
  астероида, ни капсулы:

```typescript
update(dt: number, spawning: boolean): void {
  if (this.current) {
    this.current.update(dt);
    if (this.current.state === 'gone') this.current = null;
  }
  if (this.dropped) {
    this.dropped.update(dt);
    if (this.dropped.isOffscreen) this.dropped = null;
  }
  if (!spawning) return;
  this.ticks++;
  if (this.tick !== null && this.ticks >= this.tick && this.isEmpty) {
    this.current = this.spawn();
    this.tick = null;
  }
}

/** No asteroid (flying or exploding) and no capsule: a new asteroid may spawn. */
private get isEmpty(): boolean {
  return this.current === null && this.dropped === null;
}
```

- `hitAsteroid` — при разбитии создаёт капсулу; возврат прежний. Поведение при уже
  лежащей капсуле (замечание 2 анализа): **новая капсула заменяет старую** — самое
  простое, разбитый астероид всегда отдаёт свой бонус. Недостижимо через API: астероид
  появляется только на пустом поле, а капсула — только из своего астероида (закреплено
  инвариант-симуляцией, шаг 9). Отдельного теста нет (воспроизвести нельзя без лазейки).

```typescript
/**
 * Hits the flying asteroid. On break drops a capsule of asteroid.bonus centered in its
 * floored rectangle (it does not move this tick) and returns true; no asteroid / not
 * flying - false. A capsule still on the field would be replaced; unreachable: an asteroid
 * spawns only on an empty field (see the invariant test in bonus-field.test.ts).
 */
hitAsteroid(): boolean {
  const asteroid = this.current;
  if (asteroid === null || !asteroid.hit()) return false;
  this.dropped = new Capsule(
    asteroid.bonus,
    Math.floor(asteroid.x) + CAPSULE_DROP_OFFSET,
    Math.floor(asteroid.y) + CAPSULE_DROP_OFFSET,
  );
  return true;
}

/** Removes the capsule and returns its kind; null if there is none. */
takeCapsule(): BonusKind | null {
  const capsule = this.dropped;
  this.dropped = null;
  return capsule?.kind ?? null;
}
```

- Комментарии-контракты: док класса («What bonus things are on the field: one asteroid
  per level at a random 'playing' tick; a broken asteroid drops a capsule. At most one
  of them on the field: the next asteroid waits for an empty field. Own rng; …» — порядок
  `rng` прежний, капсула `rng` не вызывает); док `update` («Moves the asteroid and the
  capsule, drops a gone asteroid / an offscreen capsule; … A busy field (asteroid or
  capsule) delays the spawn …»); убрать «(Capsule - task 027.)».

## 3. Спрайты капсул

**Файл (изменить):** `src/game/bonus-art.ts`

`import type { BonusKind } from './bonus'`; `CAPSULE_SPRITES:
Readonly<Record<BonusKind, Sprite>>` — по одному 8×8 на вид: скруглённая рамка
(`B`), плашка (`F`), буква 4×5 (`L`) в строках 1…5, строка 6 — плашка. Рисованные
вручную, не из `font-art.ts` (дизайн, «HUD»). Общий хелпер — модульная функция,
палитра на вид. Черновик (цвета стартовые — замечание 4 анализа: выбрать в `/do`,
финальная оценка на приёмке; буква — не `SHOT_COLOR` `#ffffff`, не `ENEMY_SHOT_COLOR`):

```typescript
/** Plate, 8×8: frame B, fill F, letter L (4×5). */
function capsuleSprite(letterRows: readonly string[], fill: string, frame: string): Sprite {
  return parseSprite(['.BBBBBB.', ...letterRows, 'BFFFFFFB', '.BBBBBB.'], {
    B: frame,
    F: fill,
    L: CAPSULE_LETTER_COLOR,
  });
}

const CAPSULE_LETTER_COLOR = '#fff2c0'; // warm white, not the shot white

/**
 * Capsules, 8×8: a framed colored plate with the bonus letter (L - life, S - fast shot,
 * D - double shot). Their size is the capsule hitbox (CAPSULE_SIZE) and the HUD icon size
 * (task 028), see bonus-art.test.ts. Colors are a first pass, the owner approves them.
 */
export const CAPSULE_SPRITES: Readonly<Record<BonusKind, Sprite>> = {
  life: capsuleSprite(
    ['BFLFFFFB', 'BFLFFFFB', 'BFLFFFFB', 'BFLFFFFB', 'BFLLLLFB'],
    '#d8433a', // red plate
    '#7a1a14',
  ),
  fastShot: capsuleSprite(
    ['BFFLLLFB', 'BFLFFFFB', 'BFFLLFFB', 'BFFFFLFB', 'BFLLLFFB'],
    '#3a72d8', // blue plate
    '#142f7a',
  ),
  doubleShot: capsuleSprite(
    ['BFLLLFFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLLLFFB'],
    '#3aa84a', // green plate
    '#145a1e',
  ),
};
```

(Строки: 1 рамка + 5 букв + 1 плашка + 1 рамка = 8.) Объявить `CAPSULE_LETTER_COLOR`
до функции/использования (константа модуля, `const` до вызова на загрузке).

## 4. Очки за бесполезный бонус

**Файл (изменить):** `src/game/score.ts`

```typescript
/**
 * Instead of a useless bonus (L at MAX_LIVES, a power-up already on): flat, no level bonus
 * (feature 006, В8). Goes through Battle.addScore, so extra-life thresholds apply.
 */
export const BONUS_FALLBACK_POINTS = 500;
```

## 5. Ловля капсулы в коллизиях

**Файл (изменить):** `src/game/collisions.ts`

Часть (б) после (а); `Capsule` структурно `Rect` — нового импорта не нужно (поле видно
через `import type { BonusField }`). Проверка — `player.state !== 'down'` (не
`canBeHit`: `invulnerable` тоже ловит).

```typescript
export function resolveBonusCollisions(player: Player, field: BonusField): BonusEvents {
  // (a) first: a capsule dropped by this hit is checked in (b) the same tick.
  const asteroidBroken = hitAsteroid(player, field);
  return { asteroidBroken, collected: catchCapsule(player, field) };
}

/** The ship (active or invulnerable, not down) overlapping the capsule takes it. */
function catchCapsule(player: Player, field: BonusField): BonusKind | null {
  const { capsule } = field;
  if (capsule === null || player.state === 'down') return null;
  if (!overlaps(shipRect(player), capsule)) return null;
  return field.takeCapsule();
}
```

Комментарии: `BonusEvents.collected` — «The bonus caught by the ship this tick, null if
none»; док `resolveBonusCollisions` — добавить: «Then, while the ship is not down
(active or invulnerable), a capsule overlapping it is taken (field.takeCapsule()); a
capsule dropped by this tick's hit is checked too, so an asteroid broken at the ship's
height gives its bonus at once. Shots (player and enemy) pass through the capsule.»
Фразу «The ship, enemies and enemy shots never interact with the asteroid» оставить.

## 6. Применение бонуса в `Battle`

**Файл (изменить):** `src/game/battle.ts`

- Импорты: `import type { BonusKind } from './bonus'`; `MAX_LIVES` в импорт из
  `./player`; `BONUS_FALLBACK_POINTS` в импорт из `./score`.
- Ветка бонусов в `update` (убрать комментарий «collected is always null until capsules
  exist (task 027)»):

```typescript
if (this.bonusField && this.currentPhase !== 'over') {
  const { asteroidBroken, collected } = resolveBonusCollisions(this.player, this.bonusField);
  if (asteroidBroken) this.addScore(asteroidPoints(this.currentLevel));
  if (collected !== null) this.applyBonus(collected);
}
```

- Новый private-метод (форма — как в дизайне: полезность решает `Battle` по состоянию
  на момент применения, не по возврату `grantPowerUp`):

```typescript
/**
 * A caught capsule (owner decisions В6, В8): life - addLife() below MAX_LIVES; a power-up -
 * turned on if it is off. Useless (L at MAX_LIVES, the power-up already on) -
 * BONUS_FALLBACK_POINTS instead. Decided by the state at this moment: after the kills and
 * the asteroid points of the tick (an extra life just won by them makes L useless).
 */
private applyBonus(kind: BonusKind): void {
  if (kind === 'life') {
    if (this.player.lives < MAX_LIVES) this.player.addLife();
    else this.addScore(BONUS_FALLBACK_POINTS);
    return;
  }
  if (this.player.powerUps[kind]) this.addScore(BONUS_FALLBACK_POINTS);
  else this.player.grantPowerUp(kind);
}
```

- Комментарии-контракты:
  - класс-док: «… one asteroid per level, worth asteroidPoints when shot down; it drops a
    capsule, and the ship catching it gets the bonus (applyBonus) or
    BONUS_FALLBACK_POINTS instead of a useless one; a new level draws its spawn tick.»;
  - `score`: «… by a shot-down asteroid (asteroidPoints) and BONUS_FALLBACK_POINTS for a
    useless caught bonus, during 'playing' or 'cleared'.»;
  - `update`: «… bonus collisions, asteroid points and the caught bonus (playing and
    cleared; …)»; порядок начислений тика — убийства → астероид → капсула;
  - `addScore`: «Runs after resolveCollisions; within the tick the order is kills ->
    asteroid -> capsule bonus, so a ship lost this tick is charged first …» (переписать
    нынешнюю длинную строку с «(asteroid points after the kills of the tick)», заодно
    уложить её в ширину Prettier).

## 7. Рендер капсулы

**Файл (изменить):** `src/game/battle-render.ts`

Импорт `CAPSULE_SPRITES` рядом с `ASTEROID_SPRITE`. Капсула — сразу после астероида
(поверх его взрыва), до вражеских выстрелов. Отдельная функция не нужна — `import type
{ Capsule }` тогда тоже не нужен:

```typescript
const capsule = battle.bonuses?.capsule;
if (capsule) {
  drawSprite(ctx, CAPSULE_SPRITES[capsule.kind], Math.floor(capsule.x), Math.floor(capsule.y));
}
```

Док `drawBattle`: «back to front: the asteroid, the capsule (over the asteroid's
explosion: it drops out of the debris), enemy shots, … The asteroid and the capsule are
the back layer: every shot, enemy and the ship are drawn over them.»

## 8. Тесты: `capsule`, `bonus-art`, `score`

**Файл (создать):** `src/game/capsule.test.ts` (Vitest, environment `node`)

- `new Capsule('life', 10, 20)`: `kind`, `x`, `y`, `width = height = CAPSULE_SIZE = 8`;
- `update(TICK_SECONDS)` — `y` +1 ровно, `x` не меняется; 3 тика — +3;
- `isOffscreen`: `y = SCREEN_HEIGHT − 1` — `false`, `SCREEN_HEIGHT` — `true`;
- `isAllowedSpeed(CAPSULE_SPEED)` и `CAPSULE_SPEED * TICK_SECONDS === 1` (ADR 002).

**Файл (изменить):** `src/game/bonus-art.test.ts` — `describe('CAPSULE_SPRITES')`:

- `Object.keys(CAPSULE_SPRITES)` в порядке `BONUS_KINDS` (`toEqual([...BONUS_KINDS])`) —
  спрайт у каждого вида;
- `it.each(BONUS_KINDS)`: 8×8 и `= CAPSULE_SIZE`; есть непрозрачные пиксели; нет
  `SHOT_COLOR` и `ENEMY_SHOT_COLOR` (капсула под выстрелами);
- спрайты попарно различаются (`pixels` не равны) — буква/цвет отличает вид.

**Файл (изменить):** `src/game/score.test.ts` — `BONUS_FALLBACK_POINTS` — 500, > 0,
кратно 10.

## 9. Тесты `BonusField`

**Файл (изменить):** `src/game/bonus-field.test.ts`

Импорты: `CAPSULE_SIZE` из `./capsule`, `LEVEL_PAUSE_TICKS` из `./battle` (только в
тесте; продуктовый `bonus-field` от `battle` не зависит). Заглушка `counting()` (0.5)
даёт `dir = 1`, `offset = 59`, `bonus = BONUS_KINDS[1]`; `queued` — для заданного вида.

**Переписать ломающийся тест** «delays the spawn while the asteroid explodes» (замечание
1 анализа; ожидание меняется по дизайну, код не «чинится»): сразу после `hitAsteroid()`
снять капсулу `expect(f.takeCapsule()).toBe(a.bonus)`, дальше как сейчас — поле занято
только взрывом, новый астероид — в `update`, где взрыв закончился.

Новые сценарии:

- **выпадение:** астероид после появления (`x`, `y = −12`), дробный X — сдвинуть
  `a.x = 100.5`, `a.y = 50`; `hitAsteroid()` → `true`, `f.capsule` — `x = 102`,
  `y = 52`, `kind = a.bonus`, `width = CAPSULE_SIZE`; капсула по центру прямоугольника
  астероида (`x + 2`, `y + 2`); `rng` не вызван (`calls()` не изменился);
- **вид = `asteroid.bonus`** для каждого вида: `queued(0, 0, 0, v)` с
  `v = (i + 0.5) / BONUS_KINDS.length` → `capsule.kind === BONUS_KINDS[i]`;
- **без попадания капсулы нет:** `f.capsule === null` до разбития; повторный
  `hitAsteroid()` по взрывающемуся — `false`, капсула та же (`toBe`);
- **падение:** в тике разбития не двигается (её создают после `update`); `step(f)` —
  `y + 1`, `x` прежний; астероид при этом тикает взрыв;
- **уход за низ:** капсулу (`y` публичный) поставить на `SCREEN_HEIGHT − 1`, `step` →
  `f.capsule === null`; на `SCREEN_HEIGHT − 2` — ещё есть;
- **`takeCapsule`:** с капсулой — возвращает вид и `f.capsule === null`; второй вызов и
  без капсулы — `null`; `takeCapsule()` не трогает астероид (взрыв продолжается);
- **поле занято капсулой:** окно `ONE_TICK`, выпустить, разбить в тике появления
  (капсула `y = −10`), `startLevel()`; `step(f, true, EXPLOSION_TICKS)` — астероид убран,
  нового нет (`spawnTick === 1`, `calls()` прежний); шагать до `y = SCREEN_HEIGHT − 1`
  (`step(f, true, SCREEN_HEIGHT − 1 − (−10) − EXPLOSION_TICKS)`), нового всё ещё нет;
  следующий `step` — капсула убрана и в этом же `update` новый астероид
  (`f.asteroid.y === −ASTEROID_SIZE`, `spawnTick === null`);
- **`spawning = false`** капсулу двигает (как астероид): `step(f, false)` → `y + 1`;
- **инвариант-симуляция** (дизайн, «Тестирование»): поле с `counting()` и `ONE_TICK`;
  функция `lifetime(hitAfter: number | null): number` — `startLevel`, `step` до
  появления, затем `hitAfter` шагов (если не `null`), `hitAsteroid()` → `true`, затем
  шаги до `asteroid === null && capsule === null` (с защитой от бесконечного цикла:
  предел, например, 10 000 шагов — `throw`); возвращает число `update` от появления до
  пустого поля. Перебор `k = 0 … FLIGHT_TICKS − 1` (астероид ещё `flying` — проверить
  `hit` = `true`) и прогон без попадания; `max < LEVEL_PAUSE_TICKS +
ASTEROID_SPAWN_MIN_TICKS` (= 390). Формулу не писать. Оценка по коду (для
  самопроверки, не в тест): без попадания — 252; худший — попадание у самого низа
  (`k = 251`: капсула выпадает на `y = 241`, убирается в следующем `update`, взрыв
  ещё 16) ≈ 267; ранние — капсула падает ≈ 250.

Существующие тесты, остающиеся верными без правок: «hits only a flying asteroid and
drops it after the explosion» (проверяет только астероид), детерминизм по seed,
отложенное появление при летящем астероиде.

## 10. Тесты коллизий

**Файл (изменить):** `src/game/collisions.test.ts`, `describe('resolveBonusCollisions')`

Хелпер (рядом с `fieldWithAsteroid`):

```typescript
/** A field with a capsule over the default ship (x = 120 … 134, y = 208 … 223). */
function fieldWithCapsuleAt(y: number): BonusField {
  const field = fieldWithAsteroid(122, 100);
  field.hitAsteroid(); // capsule at x = 124, y = 102
  field.capsule!.y = y;
  return field;
}
```

Сценарии (импорт `BONUS_KINDS` не нужен: заглушка `() => 0` даёт `'life'`):

- **`active` ловит:** `new Player()`, капсула на `SHIP_Y` → `{ asteroidBroken: false,
collected: 'life' }`, `field.capsule === null`;
- **`invulnerable` ловит:** `hit()` + `DOWN_TICKS` × `update(IDLE)` (как в тесте тарана
  стр. ~326) → `collected: 'life'`;
- **`down` — нет:** `hit()` → `collected: null`, капсула на месте (`toBe` та же);
- **касание краем — нет:** капсула на `SHIP_Y − CAPSULE_SIZE` (низ = верх корабля) —
  `null`, остаётся; на `SHIP_Y − CAPSULE_SIZE + 1` — взята;
- **сбит у корабля — взят в том же вызове:** `fieldWithAsteroid(122, 200)`,
  `playerWithShot(204)` → `{ asteroidBroken: true, collected: 'life' }`, капсулы нет,
  выстрел снят (капсула `y = 202`, `202 + 8 > 208`);
- **выстрел сквозь капсулу:** капсула на `y = 100` в столбце 127 (`x` 124…131), астероид
  уже `exploding`, `playerWithShot(102)` → выстрел остаётся (`onlyShot(player)` — тот
  же), капсула на месте, `collected: null`;
- существующие тесты (`collected: null` при капсуле на y ≈ 102) остаются верными —
  перепроверить прогоном.

## 11. Тесты боя

**Файл (изменить):** `src/game/battle.test.ts`, `describe('Battle asteroid')` (или
новый `describe('Battle capsule')` рядом)

Импорты (к уже имеющимся `BONUS_KINDS`, `MAX_LIVES`, `START_LIVES`, `SHIP_Y`):
`BONUS_FALLBACK_POINTS` (`./score`), `FAST_SHOT_SPEED` (`./shot`), `CAPSULE_SIZE`
(`./capsule`), `DOWN_TICKS` (`./player`), `SCREEN_HEIGHT` (`../config`), типы
`BonusKind` (`./bonus`) и `Rng` (`../engine/rng`).

Хелперы (числа — по коду: корабль `x = 120`, выстрел в тике огня `x = 127`, `y = 204`;
`asteroidOverShot` ставит астероид на `(122, 194)`, после `update` он `(121.5, 195)`,
выстрел `200`, капсула выпадает на `(123, 197)` и касается корабля через 4 тика, на
`y = 201`):

```typescript
/** Bonus rng: spawn tick 300, dir -1, offset 0, then the given kind; 0 afterwards. */
function kindRng(kind: BonusKind): Rng {
  let calls = 0;
  const pick = (BONUS_KINDS.indexOf(kind) + 0.5) / BONUS_KINDS.length;
  return () => (++calls === 4 ? pick : 0);
}

/** Puts the asteroid over the fresh shot low enough that its capsule drops onto the ship. */
function asteroidAtShip(asteroid: Asteroid, shot: Shot): void {
  asteroid.x = shot.x - 5;
  asteroid.y = shot.y - 6; // after this tick: asteroid 199, shot 200, capsule 201
}

/** Breaks the asteroid over a fresh shot, then idles until the ship catches the capsule. */
function catchCapsule(battle: Battle): void {
  asteroidOverShot(spawnAsteroid(battle), fire(battle));
  battle.update(TICK_SECONDS, IDLE);
  expect(battle.bonuses!.capsule).not.toBeNull();
  for (let i = 0; i < 10 && battle.bonuses!.capsule; i++) battle.update(TICK_SECONDS, IDLE);
  expect(battle.bonuses!.capsule).toBeNull();
}

/** asteroidPoints is exactly 4500 here: + BONUS_FALLBACK_POINTS reaches 5000. */
const ASTEROID_4500_LEVEL = 441;
```

`catchCapsule` в фазе `cleared` вызывать нельзя (`spawnAsteroid` гоняет до тика 300 —
для `cleared` сценарий собирается вручную, как «can be shot down in cleared»).

Сценарии:

- **капсула выпадает и падает:** после разбития через `update` капсула `(123, 197)`,
  `kind = asteroid.bonus`; ещё тик — `y = 198`; не задевает корабль, пока не дошла;
- **`life`:** `catchCapsule(bonusBattle())` → `lives === START_LIVES + 1`, счёт 100;
- **`life` при 5 жизнях:** `bonusBattle({ lives: MAX_LIVES })` → `lives === 5`, счёт
  `100 + BONUS_FALLBACK_POINTS`;
- **`fastShot`:** `bonuses: { rng: kindRng('fastShot') }` → `powerUps.fastShot`; следующий
  выстрел — `speed === FAST_SHOT_SPEED`; счёт 100;
- **`doubleShot`:** → `powerUps.doubleShot`; два `fire`-тика подряд (через тик IDLE) —
  два выстрела в полёте;
- **повторное улучшение:** `player.grantPowerUp('fastShot')` до ловли `fastShot` →
  счёт `600`, `powerUps` прежние (`toEqual`); то же для `doubleShot` (`it.each`);
- **улучшения переживают гибель:** после ловли `fastShot` → `player.hit()`, `run(battle,
DOWN_TICKS)` → `state === 'invulnerable'`, `powerUps.fastShot` на месте, новый
  выстрел быстрый;
- **и смену уровня:** после ловли — `wave.enemies[0]!.kill()`, `run(EXPLOSION_TICKS +
LEVEL_PAUSE_TICKS)` → `level === 2`, `battle.player` тот же объект, `powerUps` на месте;
- **гибель в тике касания — не взята:** разбить, затем `capsule.y = SHIP_Y − CAPSULE_SIZE`
  (касается со следующего `update`), `ramShip(battle)`, `update` → `state === 'down'`,
  `lives === START_LIVES − 1`, капсула на месте (`y = SHIP_Y − CAPSULE_SIZE + 1`); затем
  `run(battle, SCREEN_HEIGHT)` → капсулы нет, жизней по-прежнему `START_LIVES − 1`
  (корабль `down` 60 тиков, а капсула за это время уходит за низ);
- **ловится в `cleared`:** `spawnAsteroid`, `kill()` врага, `run(EXPLOSION_TICKS)` →
  `cleared`; `asteroidOverShot(asteroid, fire(battle))`, `update`, затем до 10 тиков IDLE
  → капсула взята, `lives + 1`, фаза ещё `cleared`;
- **в `over` не ловится, долетает:** `bonusBattle({ lives: 1 })`, разбить (как выше),
  `player.hit()`, на каждом тике задержки держать капсулу на `y = 100` (по образцу «is
  not hit in over»), `run` до `over`; затем `capsule.y = SHIP_Y`, `update` → капсула на
  месте, `y = SHIP_Y + 1`; `run` до ухода → `capsule === null`, счёт 100, `lives === 0`;
- **500 очков пересекают порог:** тест-предпосылка `asteroidPoints(ASTEROID_4500_LEVEL)
=== 4500` (и `asteroidPoints(440) < 4500`); затем `startLevel: ASTEROID_4500_LEVEL`,
  `kindRng('fastShot')`, `grantPowerUp('fastShot')` заранее, `catchCapsule` → счёт 5000,
  `lives === START_LIVES + 1`;
- **`L` при 4 жизнях, когда астероид того же тика дал 5-ю (порядок астероид →
  капсула):** `bonusBattle({ startLevel: ASTEROID_5000_LEVEL, lives: 4 })`, `fire`,
  `asteroidAtShip`, один `update` → в этом же тике капсула взята (`capsule === null`),
  счёт `5000 + 500`, `lives === MAX_LIVES`;
- **сбит у корабля — взят в том же тике** покрыт предыдущим; отдельно с `life` при
  3 жизнях на уровне 1: один `update` → `lives === 4`, счёт 100.

Порядок «убийства → астероид» уже закреплён тестами 026 («an enemy goes first …»),
«астероид → капсула» — сценарием с `L` при 4 жизнях.

Существующие тесты (`a shot breaks the asteroid…`, `asteroid points give an extra life
at 5000`, `can be shot down in cleared`, `does not touch the battle rng`) — капсула
выпадает на y ≈ 197 и тесты кончаются раньше касания; перепроверить прогоном.

## 12. Тесты рендера

**Файл (изменить):** `src/game/battle-render.test.ts`

Импорт `CAPSULE_SPRITES`.

- в `describe('drawBattle asteroid')`: `asteroidBattle()`, `asteroid.x = 100.5`,
  `asteroid.y = 50`, `battle.bonuses!.hitAsteroid()` → вызовы: `explosionCalls(asteroid,
EXPLOSION_FRAMES[0])` → `spriteCalls(CAPSULE_SPRITES[asteroid.bonus], 102, 52)` →
  враги → корабль (капсула поверх взрыва, по `Math.floor`);
- капсула после того, как астероид убран (`run(battle, EXPLOSION_TICKS)`): только
  `spriteCalls` капсулы (y + 16) → враги → корабль;
- спрайт берётся по `capsule.kind` (заглушка `() => 0` → `life`, ожидание —
  `CAPSULE_SPRITES[asteroid.bonus]`); спрайты остальных видов — `bonus-art.test.ts`;
- в `describe`, где виден `battleWithEnemyShot`: `battleWithEnemyShot(FIRE,
asteroidBattle())`, затем `battle.bonuses!.hitAsteroid()` → порядок: взрыв астероида →
  капсула → вражеский выстрел → выстрел игрока → враги → корабль.

## 13. Ручная проверка

`npm run dev` (при желании `?level=N`). Дождаться астероида (5–15 с), сбить:

- из взрыва выпадает цветная плашка 8×8 с буквой, падает строго вниз, выстрелы
  (свои и вражеские) рисуются поверх и пролетают сквозь;
- подхватить кораблём: `S` — новые пули заметно быстрее; `D` — можно выпустить вторую
  пулю, пока летит первая; `L` — +1 иконка жизни в панели;
- пропустить капсулу — уходит за низ, следующий астероид на следующем уровне;
- погибнуть после улучшения — после возрождения пули те же; смена уровня — тоже;
- читаемость букв `L`/`S`/`D` на 8×8, отличимость плашек от фона, астероида, вражеских
  выстрелов. Итог — `acceptance.md` задачи (в `/do`).

## 14. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` (на русском):

- «Игрок»: «не больше одного своего выстрела» → «без улучшений — не больше одного
  своего выстрела; с улучшением «две пули» — до двух; «быстрая пуля» — 360 px/с»;
- новый пункт «**Астероиды и бонусы** (решено, фича 006, В1–В9)»: раз за уровень в
  случайный момент 5–15 с `playing` сверху падает астероид 12×12 наискосок (60 вниз,
  30 вбок px/с), безопасен, ни с чем, кроме выстрелов игрока, не взаимодействует; сбит
  одним выстрелом — 100 очков с надбавкой уровня и капсула 8×8 (`L` / `S` / `D`,
  равновероятно), падает 60 px/с; ловится кораблём (и мигающим после возрождения);
  бонусы до конца игры, не складываются; бесполезный — 500 очков; астероид и капсула
  переживают смену уровня; не больше одного бонусного предмета на поле. Иконки
  улучшений в панели — задача 028;
- «Очки»: + астероид 100 с надбавкой уровня; 500 за бесполезный бонус (без надбавки,
  участвует в порогах доп. жизни);
- «Жизни»: + капсула `L` даёт жизнь до предела 5 (на пределе — 500 очков).

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском):

- `shot.ts` — `Shot(x, y, speed = SHOT_SPEED)`, `speed` фиксирован при вылете,
  `FAST_SHOT_SPEED = 360` (6 px/тик, улучшение `fastShot`);
- `ship.ts` — `spawnShot(speed = SHOT_SPEED)`;
- `player.ts` — переписать «агрегат корабль + единственный выстрел» и автомат
  Ready/InFlight: `shots` (0…`maxShots` в полёте, старший первый, `readonly Shot[]`),
  `maxShots` (1, с `doubleShot` — 2), огонь при `shots.length < maxShots`, иначе
  игнор без буфера; `removeShot(shot)` — заменяет массив (безопасно в цикле),
  неизвестный игнорируется, слот — со следующего `update`; `powerUps` (`PowerUps`),
  `grantPowerUp(kind)` — `true`/`false`, в любом состоянии, `hit()` улучшения не снимает;
  новые выстрелы — `FAST_SHOT_SPEED` при `fastShot`;
- новые абзацы: `bonus.ts` (`PowerUpKind`, `BonusKind`, `BONUS_KINDS`, `PowerUps`,
  `NO_POWER_UPS`; без импортов); `asteroid.ts` (размер 12, скорости 60/30, `DRIFT_TOTAL`,
  `SPAWN_OFFSET_MAX = 118`, старт `y = −12`, автомат `flying → exploding → gone`,
  `hit()`, `stateTicks`, `bonus`); `capsule.ts` (`CAPSULE_SIZE = 8`, `CAPSULE_SPEED = 60`,
  `kind`, `x` фиксирован, `isOffscreen`, без состояний); `bonus-field.ts` (окно
  300…900, `SpawnWindow`, `startLevel`, `update(dt, spawning)` — двигает астероид и
  капсулу, «пусто» = ни того ни другого, отложенное появление, порядок `rng`,
  `hitAsteroid` — капсула по центру (+2), замена при занятом (недостижимо),
  `takeCapsule`); `bonus-art.ts` (`ASTEROID_SPRITE` 12×12, `CAPSULE_SPRITES` 8×8 —
  рамка, плашка, буква; цвета стартовые); `test-shots.ts` (только для тестов:
  `onlyShot(player)` — выстрел или `null`, бросает при двух и более) — рядом с
  `test-levels.ts`/`test-evasion.ts` (замечание 3 анализа);
- `score.ts` — `BONUS_FALLBACK_POINTS = 500`;
- `collisions.ts` — снять «`collected` пока всегда `null` (капсула — задача 027)»;
  часть (б): корабль не `down` (в т.ч. `invulnerable`), пересекает капсулу —
  `takeCapsule()`, капсула, выпавшая в (а), проверяется в том же вызове; выстрелы
  сквозь капсулу пролетают;
- `battle.ts` — `score` (+500 за бесполезный бонус); порядок тика — после
  `asteroidPoints` `applyBonus(collected)`; правило `applyBonus`; порядок начислений
  убийства → астероид → капсула; «летящий астероид остаётся» → «астероид и капсула
  остаются»;
- `battle-render.ts` — слой капсулы (`CAPSULE_SPRITES[kind]` по `Math.floor`) после
  астероида, до вражеских выстрелов;
- граф импортов: `bonus-field → {engine/rng, asteroid, bonus, capsule}`;
  `capsule → config` (`BonusKind` — type); `bonus-art → sprite` (`BonusKind` — type);
  `battle → {…}` (+ `BonusKind` — type); `test-shots` уже в графе; циклов нет.

`src/game/README.md` и `src/game/scenes/README.md` отсутствуют — не создавать. Запись
фичи в `second-brain/features/` не трогать. ADR не меняются (скорость 1 px/тик —
ADR 002, уже покрыта).

## 15. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`;
`npx prettier --write` по изменённым `.md`.

## Сводка по файлам

| Действие | Файл                                                                   |
| -------- | ---------------------------------------------------------------------- |
| Создать  | `src/game/capsule.ts`                                                  |
| Создать  | `src/game/capsule.test.ts`                                             |
| Изменить | `src/game/bonus-field.ts`                                              |
| Изменить | `src/game/bonus-field.test.ts`                                         |
| Изменить | `src/game/bonus-art.ts`                                                |
| Изменить | `src/game/bonus-art.test.ts`                                           |
| Изменить | `src/game/score.ts`                                                    |
| Изменить | `src/game/score.test.ts`                                               |
| Изменить | `src/game/collisions.ts`                                               |
| Изменить | `src/game/collisions.test.ts`                                          |
| Изменить | `src/game/battle.ts`                                                   |
| Изменить | `src/game/battle.test.ts`                                              |
| Изменить | `src/game/battle-render.ts`                                            |
| Изменить | `src/game/battle-render.test.ts`                                       |
| Изменить | `second-brain/game-design.md`                                          |
| Изменить | `second-brain/architecture/overview.md`                                |
| Создать  | `second-brain/tasks/tasks/027-capsule-bonuses/acceptance.md` (в `/do`) |

Не меняются: `src/engine/`, сцены, `hud.ts`/`hud-render.ts` (иконки — 028),
`player.ts`.

## Архитектура и паттерны

- Граница engine/game: `src/engine/` не трогается.
- Логика отдельно от рендера: `Capsule`/`BonusField`/коллизии/`applyBonus` тестируются
  без canvas; рендер — рекордером `canvas-test-utils.ts`.
- Детерминизм: капсула не вызывает ни `rng` боя, ни `rng` поля (вид уже в астероиде) —
  старые тесты с seed не сдвигаются; время — тиками `dt`, скорость 1 px/тик (ADR 002),
  координаты целые.
- Порядок «всё двигается → потом коллизии»: капсула создаётся в коллизиях после
  `field.update` и в тике выпадения не движется (как новый астероид / выстрел).
- `collisions` видит поле только через `import type` — циклов нет; `Capsule` — по
  структуре `Rect`, как `Asteroid`/`Enemy`.
- Правило «вместо бонуса — очки» живёт в `Battle` (очки — его), начисление через
  единственный `addScore` — пороги доп. жизни без особых случаев.
- Не больше одной капсулы и одной AABB-проверки корабля за тик — нагрузки нет.

## Открытые вопросы

Вопросов к владельцу и архитектору нет. Замечания анализа учтены: тест «delays the spawn
while the asteroid explodes» переписан (шаг 9); `hitAsteroid` при лежащей капсуле —
замена, задокументирована (шаг 2); абзац `test-shots.ts` в overview (шаг 14); цвета
капсул — стартовые в `/do`, финал — приёмка глазами (шаг 3).

## Ссылки

- `second-brain/tasks/tasks/027-capsule-bonuses/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/006-asteroid-bonuses/design.md` (п. 3 нарезки, «Capsule»,
  «BonusField», «Поток тика», «Применение бонуса», «Рендер», «Тестирование»,
  «Крайние случаи»), `discussion.md`
- `second-brain/architecture/overview.md`, `second-brain/game-design.md`
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/tasks/tasks-done/024-multi-shot/`, `025-asteroid-model/`,
  `026-asteroid-in-battle/`

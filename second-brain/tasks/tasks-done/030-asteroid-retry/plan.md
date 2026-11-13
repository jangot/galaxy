# План реализации: Повторный пролёт несбитого астероида

Астероид, ушедший за нижний край несбитым, через случайные 300…900 тиков фазы `playing`
(то же окно `spawnWindow`) прилетает снова с тем же бонусом, новыми `dir` и `offset`.
Повторов сколько угодно, пока не сбит. `startLevel` отменяет ожидающий повтор. Вся логика
сосредоточена в `BonusField` (`tick` заменяется записью `pending`). Плюс поле
`bonuses.retryBonus` в dev-снимке, doc-комментарии, тесты, документы и `acceptance.md`.

Код: ветка `main`, коммит `2d43b1d`. План следует согласованному
`second-brain/features/007-asteroid-retry/design.md` (раунд 3) и `analyze.md` без
отступлений.

## 1. `BonusField`: запись ожидания, повтор, новый порядок `update`

**Файл (изменить):** `src/game/bonus-field.ts`

`asteroid.ts`, `capsule.ts`, импорты движка не меняются. Константы новые не вводятся.

### 1.1. Тип и поле ожидания

Над классом объявить неэкспортируемый интерфейс, поле `tick` заменить на `pending`:

```typescript
/** What waits to fly out: a new asteroid of the level or a retry of an unshot one. */
interface PendingAsteroid {
  /** Level tick ('playing' ticks) on which it may fly out (still waits for an empty field). */
  readonly tick: number;
  /** null - a new asteroid, the bonus is drawn at spawn; otherwise a retry with this bonus. */
  readonly bonus: BonusKind | null;
}

// в классе вместо `private tick: number | null = null;`
private pending: PendingAsteroid | null = null;
```

### 1.2. Doc-комментарий класса (`:28-33`)

```typescript
/**
 * What bonus things are on the field: one asteroid per level at a random 'playing' tick; an
 * unshot one that leaves below the screen comes back with the same bonus after a fresh delay
 * from the spawn window (counted in 'playing' ticks from the leaving update), again and again
 * until it is shot down or the level changes. A broken asteroid drops a capsule. At most one
 * of them on the field: the next asteroid (new or retry) waits for an empty field. One thing
 * waits at a time (pending). Own rng; call order is fixed: startLevel - 1 call (spawn tick);
 * new asteroid spawn - dir, offset, bonus; an unshot asteroid leaving while nothing waits -
 * 1 call (retry delay); retry spawn - dir, offset. The capsule never calls the rng (its kind
 * is the asteroid's bonus).
 */
```

### 1.3. Геттеры

```typescript
/**
 * Level tick of the next asteroid (new or retry); null when nothing waits (spawned already,
 * hit down, or before the first startLevel). For tests and dev snapshots.
 */
get spawnTick(): number | null {
  return this.pending?.tick ?? null;
}

/** Bonus of the waiting retry; null when nothing waits or a new asteroid waits. For tests / QA. */
get retryBonus(): BonusKind | null {
  return this.pending?.bonus ?? null;
}
```

`levelTicks`, `asteroid`, `capsule` — без изменений.

### 1.4. `startLevel` (`:79-86`)

```typescript
/**
 * A new level begins: draws its spawn tick (1 rng call). Whatever waited is dropped - an
 * unspawned asteroid or a waiting retry of the last level (owner decision В4). A flying one
 * stays.
 */
startLevel(): void {
  this.ticks = 0;
  this.pending = { tick: this.drawWindowTicks(), bonus: null };
}
```

### 1.5. `update` (`:88-110`) — порядок из «Потока тика» design.md

```typescript
/**
 * Moves the asteroid and the capsule, drops a gone asteroid / an offscreen capsule. An
 * asteroid that went gone straight from flying left unshot (a hit one passes through
 * exploding); if nothing waits, it schedules its retry: spawnTick = levelTicks + a delay
 * from the spawn window (1 rng call), in any phase. Then, only if spawning, counts the level
 * tick (before scheduling, so the delay counts from this update and the retry never flies
 * out in it) and spawns. Scheduling goes before the spawn check on purpose: when an old
 * asteroid leaves in the very update a new one of the level flies out, pending is still
 * busy with the new one, so no retry and no extra rng call (checked by 'delays the spawn
 * while the field is busy with a flying asteroid'). A busy field (asteroid or capsule)
 * delays the spawn (spawnTick kept, checked every spawning update); since what left is
 * dropped first, the next asteroid may appear in the very update the old thing leaves.
 * The new asteroid does not move on its spawn tick.
 */
update(dt: number, spawning: boolean): void {
  let escaped: BonusKind | null = null;
  if (this.current) {
    const wasFlying = this.current.state === 'flying';
    this.current.update(dt);
    if (this.current.state === 'gone') {
      if (wasFlying) escaped = this.current.bonus;
      this.current = null;
    }
  }
  if (this.dropped) {
    this.dropped.update(dt);
    if (this.dropped.isOffscreen) this.dropped = null;
  }
  if (spawning) this.ticks++;
  if (escaped !== null && this.pending === null) {
    this.pending = { tick: this.ticks + this.drawWindowTicks(), bonus: escaped };
  }
  if (!spawning) return;
  if (this.pending !== null && this.ticks >= this.pending.tick && this.isEmpty) {
    this.current = this.spawn(this.pending.bonus);
    this.pending = null;
  }
}
```

Важно: `escaped` снимается до `this.current = null`; `ticks++` стоит выше `return`;
назначение повтора (шаг 4) — до проверки вылета (шаг 6).

### 1.6. `isEmpty` — doc уточнить

`/** No asteroid (flying or exploding) and no capsule: the next asteroid may spawn. */`

### 1.7. `spawn(bonus)` и `drawWindowTicks()` (`:141-147`)

```typescript
/** rng order: dir, offset, then bonus only when not given (a retry keeps its bonus, В3). */
private spawn(bonus: BonusKind | null): Asteroid {
  const dir = this.rng() < 0.5 ? -1 : 1;
  const offset = randomInt(this.rng, 0, ASTEROID_SPAWN_OFFSET_MAX + 1);
  const kind = bonus ?? BONUS_KINDS[randomInt(this.rng, 0, BONUS_KINDS.length)]!;
  return new Asteroid(dir, offset, kind);
}

/** One rng call: a tick count in the spawn window, inclusive. Used by startLevel and the retry. */
private drawWindowTicks(): number {
  return randomInt(this.rng, this.spawnWindow.minTicks, this.spawnWindow.maxTicks + 1);
}
```

`hitAsteroid`, `takeCapsule`, конструктор — без изменений.

## 2. `Battle`: только doc-комментарии

**Файл (изменить):** `src/game/battle.ts` (логика не меняется)

- Класс, `:49-51`: заменить «one asteroid per level, worth asteroidPoints…» на
  ```typescript
  * Optional bonus field (opts.bonuses, own rng): one asteroid per level (an unshot one that
  * leaves comes back with the same bonus after a delay from the spawn window, until shot down
  * or the level changes), worth asteroidPoints when shot down; it drops a capsule, and the
  * ship catching it gets the bonus (applyBonus) or BONUS_FALLBACK_POINTS instead of a useless
  * one; a new level draws its spawn tick and cancels a waiting retry.
  ```
- `update`, `:110-111`: «bonus field (moves; counts the level tick and spawns only in
  playing)» →
  «bonus field (moves; an asteroid that left unshot schedules its retry; counts the level
  tick and spawns, new asteroid or retry, only in playing)».

## 3. Dev-снимок: `bonuses.retryBonus`

**Файл (изменить):** `src/game/dev-snapshot.ts`

Тип (`:66-78`):

```typescript
    readonly capsule: { readonly kind: BonusKind; readonly x: number; readonly y: number } | null;
    /** Level tick of the next asteroid, new or retry (BonusField.spawnTick); null - nothing waits. */
    readonly spawnTick: number | null;
    /** Bonus of the waiting retry of an unshot asteroid; null - no retry waits. */
    readonly retryBonus: BonusKind | null;
    readonly levelTicks: number;
```

Сборка (`:117-133`): после `spawnTick: bonuses.spawnTick,` добавить
`retryBonus: bonuses.retryBonus,`. `dev-hooks.ts` не меняется (отдаёт снимок как есть).

## 4. Тесты `BonusField`

**Файл (изменить):** `src/game/bonus-field.test.ts` (Vitest, environment `node`)

Не трогать: `:126` (`calls the rng in the order dir, offset, bonus on spawn`), `:204`
(`delays the spawn while the field is busy with a flying asteroid` — сторож порядка 4 → 6),
`:250` (`keeps a delayed spawn waiting while not spawning`) и остальные — они остаются
зелёными (проверено в `analyze.md`).

### 4.1. Хелперы (рядом с `step`)

```typescript
/** Retry delay of the degenerate window used below. */
const D = 7;
const D_TICKS = { minTicks: D, maxTicks: D };

/** Steps the flying asteroid until it leaves below the screen; returns it. */
function flyAway(f: BonusField, spawning = true): Asteroid {
  const a = f.asteroid!;
  expect(a.state).toBe('flying');
  step(f, spawning, FLIGHT_TICKS);
  expect(a.state).toBe('gone');
  expect(f.asteroid).toBeNull();
  return a;
}
```

Импорт `import type { Asteroid } from './asteroid';` (рядом с существующим импортом из
`./asteroid`).

### 4.2. Переписать `:101`

Новое название: `'spawns on the update where levelTicks reaches spawnTick and flies until it leaves'`.

```typescript
const { rng, calls } = queued(0, 0.75, 0, 0, 0); // tick 300; dir, offset, bonus; retry delay 300
const f = new BonusField(rng);
f.startLevel();
step(f, true, 299);
expect(f.asteroid).toBeNull();
expect(f.levelTicks).toBe(299);
expect(calls()).toBe(1);

step(f);
const a = f.asteroid!;
expect(a).not.toBeNull();
expect(a.y).toBe(-ASTEROID_SIZE);
expect(a.state).toBe('flying');
expect(f.spawnTick).toBeNull();
expect(calls()).toBe(4);

for (let i = 0; i < FLIGHT_TICKS - 1; i++) {
  step(f);
  expect(f.asteroid).toBe(a);
}
expect(calls()).toBe(4);
step(f); // leaves: the retry delay is drawn
expect(f.asteroid).toBeNull();
expect(f.levelTicks).toBe(300 + FLIGHT_TICKS);
expect(calls()).toBe(5);
expect(f.spawnTick).not.toBeNull();
```

### 4.3. Новый `describe('BonusField retry', ...)`

Сценарии (окна: `D_TICKS` для точных моментов, `ONE_TICK` — для быстроты, игровое — для
границ задержки):

1. **Точный момент повтора** (`D_TICKS`, `counting(0.5)`): `startLevel`, `step(f, true, D)`
   → астероид `a`; `flyAway(f)` → `L = f.levelTicks` (`=== D + FLIGHT_TICKS`),
   `spawnTick === L + D`, `retryBonus === a.bonus`. `step(f, true, D - 1)` → астероида нет.
   `step(f)` → астероид `b !== a`, `b.bonus === a.bonus`, `b.y === -ASTEROID_SIZE`,
   `b.state === 'flying'`, `spawnTick === null`, `retryBonus === null`.
2. **Порядок `rng` повтора и сохранение бонуса** (`ONE_TICK`):
   ```typescript
   // startLevel; spawn: dir -1, offset 0, bonus fastShot; retry delay; retry: dir 1, offset max
   const { rng, calls } = queued(0, 0, 0, 0.5, 0, 0.75, ALMOST_ONE);
   const f = new BonusField(rng, ONE_TICK);
   f.startLevel();
   step(f);
   const a = f.asteroid!;
   expect(a.dir).toBe(-1);
   expect(a.x).toBe(SCREEN_WIDTH - ASTEROID_SIZE);
   expect(a.bonus).toBe('fastShot');
   expect(a.bonus).not.toBe(BONUS_KINDS[0]);
   expect(calls()).toBe(4);
   flyAway(f);
   expect(calls()).toBe(5);
   expect(f.retryBonus).toBe('fastShot');
   step(f); // spawnTick = L + 1
   const b = f.asteroid!;
   expect(b).not.toBe(a);
   expect(calls()).toBe(7); // dir, offset only; a bonus draw would throw on call #8
   expect(b.dir).toBe(1);
   expect(b.x).toBe(ASTEROID_SPAWN_OFFSET_MAX);
   expect(b.bonus).toBe('fastShot');
   step(f, true, 10);
   expect(calls()).toBe(7);
   ```
3. **Задержка из игрового окна** — `it.each([[0, ASTEROID_SPAWN_MIN_TICKS], [ALMOST_ONE, ASTEROID_SPAWN_MAX_TICKS]])`:
   `queued(0, 0, 0, 0, v)`, окно по умолчанию; `startLevel`, `step(f, true, 300)`,
   `flyAway(f)` → `spawnTick === f.levelTicks + delay` (`552 + 300` / `552 + 900`).
4. **Без ограничения** (`D_TICKS`, `counting(0.5)`): после первого вылета цикл из 3
   итераций: `flyAway(f)` → `retryBonus === bonus`; `step(f, true, D)` → на поле новый
   объект (`!== предыдущего`) с тем же `bonus`.
5. **Сбитый не повторяется** (`ONE_TICK`, `counting()`): `step` → `a`; `hitAsteroid()`;
   `takeCapsule()`; `before = calls()`; `step(f, true, EXPLOSION_TICKS)` → астероида нет,
   `spawnTick === null`, `retryBonus === null`; `step(f, true, 1000)` → астероида нет,
   `calls() === before`.
6. **Таймер стоит при `spawning = false` во время ожидания** (`D_TICKS`): `flyAway(f)`,
   `L = levelTicks`; `step(f, false, 100)` → `levelTicks === L`, `spawnTick === L + D`,
   астероида нет; `step(f, true, D - 1)` → нет; `step(f)` → есть.
7. **Ушёл при `spawning = false`** (`D_TICKS`, `counting()`): `step(f, true, D)` → `a`;
   `before = calls()`; `flyAway(f, false)` → `levelTicks === D` (без прироста),
   `spawnTick === D + D`, `retryBonus === a.bonus`, `calls() === before + 1`;
   `step(f, true, D - 1)` → нет; `step(f)` → повтор на поле.
8. **`startLevel` отменяет ожидающий повтор** (`D_TICKS`, `counting()`): `flyAway(f)`;
   `before = calls()`; `f.startLevel()` → `calls() === before + 1`, `retryBonus === null`,
   `spawnTick === D`, `levelTicks === 0`; `step(f, true, D)` → на поле новый астероид,
   `calls() === before + 4` (бонус вытянут из `rng` — значит, это новый астероид уровня,
   а не повтор).

## 5. Интеграционный тест `Battle`

**Файл (изменить):** `src/game/battle.test.ts`, в `describe('Battle asteroid')` после
теста `'does not count ticks or spawn in cleared; …'`.

Нужные импорты уже есть (`SCREEN_HEIGHT`, `ASTEROID_SIZE`, `ASTEROID_SPAWN_MIN_TICKS`,
`LEVEL_PAUSE_TICKS`, `EXPLOSION_TICKS`, `clearWave`). Бонус не проверяем (при `rng = 0`
совпал бы и без сохранения — `discussion.md`, раунд 2, п. 5).

```typescript
it('brings an unshot asteroid back after the delay; a level change cancels the wait', () => {
  const flight = SCREEN_HEIGHT + ASTEROID_SIZE;
  // rng = 0: retry delay = the window's low end.
  const battle = bonusBattle();
  const first = spawnAsteroid(battle); // update 300
  run(battle, flight);
  expect(first.state).toBe('gone');
  const field = battle.bonuses!;
  expect(field.asteroid).toBeNull();
  expect(field.levelTicks).toBe(ASTEROID_SPAWN_MIN_TICKS + flight);
  expect(field.spawnTick).toBe(field.levelTicks + ASTEROID_SPAWN_MIN_TICKS);
  run(battle, ASTEROID_SPAWN_MIN_TICKS - 1);
  expect(field.asteroid).toBeNull();
  run(battle, 1);
  expect(field.asteroid).not.toBeNull();
  expect(field.asteroid).not.toBe(first);

  let calls = 0;
  const rng = () => {
    calls++;
    return 0;
  };
  const other = bonusBattle({ bonuses: { rng } });
  spawnAsteroid(other);
  run(other, flight);
  const waiting = other.bonuses!;
  expect(waiting.retryBonus).not.toBeNull();
  clearWave(other); // the enemy dies while the retry waits
  expect(other.level).toBe(2);
  expect(other.phase).toBe('playing');
  expect(waiting.asteroid).toBeNull();
  expect(waiting.retryBonus).toBeNull();
  expect(waiting.spawnTick).toBe(300);
  expect(waiting.levelTicks).toBe(0);
  expect(calls).toBe(6); // constructor 1 + spawn 3 + retry delay 1 + startLevel 1
});
```

Примечание: `clearWave` прогоняет `EXPLOSION_TICKS + LEVEL_PAUSE_TICKS`; за
`EXPLOSION_TICKS` фазы `playing` `levelTicks` дорастает до `552 + EXPLOSION_TICKS < 852`,
повтор не вылетает. `ONE_CORNER_ENEMY` на уровне 2 продлевается `levelConfig` (пассивный).
Если `bonusBattle({ bonuses })` из-за порядка спреда не подменит `rng` — спред
`...opts` стоит после `bonuses`, подменит.

## 6. Тест dev-снимка

**Файл (изменить):** `src/game/dev-snapshot.test.ts`

- В `'describes a fresh battle'` добавить `expect(b.bonuses!.retryBonus).toBeNull();`.
- Новый тест после `'shows the asteroid once it spawns'`:

```typescript
it('shows the bonus of a waiting retry once an unshot asteroid leaves', () => {
  const scene = sceneWithAsteroid();
  const before = battleOf(scene).bonuses!;
  expect(before.retryBonus).toBeNull();
  step(scene, new Input(), SCREEN_HEIGHT + ASTEROID_SIZE);
  const after = battleOf(scene).bonuses!;
  expect(after.asteroid).toBeNull();
  expect(after.retryBonus).toBe(before.asteroid!.bonus);
  expect(after.spawnTick).toBeGreaterThanOrEqual(after.levelTicks + ASTEROID_SPAWN_MIN_TICKS);
  expect(after.spawnTick).toBeLessThanOrEqual(after.levelTicks + ASTEROID_SPAWN_MAX_TICKS);
});
```

Импорты: `SCREEN_HEIGHT` из `../config`, `ASTEROID_SIZE` из `./asteroid`.

## 7. Ручная проверка и `acceptance.md`

**Файл (создать):** `second-brain/tasks/tasks/030-asteroid-retry/acceptance.md`

Unit-тесты закрывают механику; глазами — сам повтор на экране и ощущение частоты
(вкусовое, владельцу). Содержание файла (на русском):

```markdown
# Приёмка: повторный пролёт несбитого астероида

Код готов, проверки зелёные. Утвердить владельцу: ощущение частоты повтора (5–15 с после
ухода — не слишком ли часто/редко).

## Кейс 1. Несбитый астероид прилетает снова (`/qa`, `window.__galaxy`)

1. `npm run dev`, открыть `http://localhost:5173/?seed=1&paused=1&lives=5`, дождаться
   `window.__galaxy`.
2. Начать игру: `press('start'); step(1); release('start')`.
3. `state().battle.bonuses.spawnTick` → `step` до него; `bonuses.asteroid` не `null`,
   запомнить `bonus`, `dir`, `x`.
4. Не стрелять. `step(252)` (полёт до нижнего края) → `asteroid === null`,
   `retryBonus` равен запомненному `bonus`, `spawnTick` в пределах
   `levelTicks + 300 … levelTicks + 900`.
5. `step(spawnTick - levelTicks - 1)` → астероида нет; `step(1)` → астероид снова на поле
   с тем же `bonus`; `dir`/`x` — как выпал `rng`; `retryBonus === null`, `spawnTick === null`.
6. Глазами: астероид виден сверху тем же спрайтом, падает наискосок.

## Кейс 2. Сбитый не возвращается

Сбить астероид (или повтор): после взрыва `spawnTick === null`, `retryBonus === null`
до конца уровня.

## Кейс 3. Смена уровня отменяет повтор

В ожидании повтора (`retryBonus` не `null`) добить волну: после `cleared` и паузы на новом
уровне `retryBonus === null`, `levelTicks === 0`, `spawnTick` — новый в 300…900.
```

Если игрок гибнет за время ожидания (враги атакуют неподвижный корабль) — таймер
продолжает идти в `playing`, кейс не ломается; `lives=5` даёт запас.

Ручная проверка разработчиком на стадии `do` не выполняется — только перечисление для
владельца/`/qa`.

## 8. Обновление документации (second-brain — на русском)

**Файл (изменить):** `second-brain/architecture/overview.md`, абзац `bonus-field.ts`
(`:289-302`). Переписать середину:

- `startLevel()` — тик появления уровня (1 вызов `rng`) в запись ожидания `pending`;
  ожидающее (непоявившийся астероид или повтор прошлого уровня) отменяется, летящий
  астероид остаётся.
- `update(dt, spawning)` — двигает астероид и капсулу, убирает `gone`-астероид и ушедшую
  капсулу. Астероид, ставший `gone` прямо из `flying` (ушёл несбитым), при пустом
  `pending` назначает повтор: `pending = { tick: levelTicks + d, bonus }`, `d` из того же
  окна (1 вызов `rng`, в любой фазе). Затем при `spawning` — `levelTicks++` и вылет
  (новый: `rng` `dir`, `offset`, `bonus`; повтор: `dir`, `offset`, бонус сохранён) на
  пустое поле. Порядок: прирост тика → назначение → вылет (почему — doc `update`).
- Геттеры: добавить `retryBonus`; `spawnTick` — тик следующего вылета (нового или
  повтора), `null`, когда ничего не ждёт.

**Файл (изменить):** `second-brain/architecture/dev-hooks.md`

- Снимок, `:69-71`: `spawnTick` (тик уровня следующего вылета — нового астероида или
  повтора; `null`, когда ничего не ждёт), новое `retryBonus` (бонус ожидающего повтора
  несбитого астероида; `null` — повтор не ждёт), `levelTicks`.
- Таблица констант: строка «задержка повтора | 300 … 900 | тиков `playing` от ухода
  несбитого астероида».
- Рецепты: «**Повтор астероида:** `?seed=…&paused=1&lives=5` → начать игру, `step` до
  `bonuses.spawnTick`, не стрелять, `step(252)` → `retryBonus` не `null`, `step` до нового
  `spawnTick` → астероид с тем же `bonus`».

**Файл (изменить):** `second-brain/game-design.md`, пункт «Астероиды и бонусы»
(`:78-88`) — заменить целиком формулировкой из раздела «Правка game-design.md» design.md
без выделения жирным внутри текста (жирное — только название пункта):

```markdown
- **Астероиды и бонусы** (решено, фича 006, В1–В9; повтор — фича 007, В1–В4): раз за
  уровень в случайный момент 5–15 с фазы `playing` сверху падает астероид 12×12
  наискосок (60 px/с вниз, 30 px/с вбок); он безопасен и ни с чем, кроме выстрелов
  игрока, не взаимодействует. Несбитый астероид, ушедший за нижний край, прилетает
  снова через случайные 5–15 с фазы `playing` — с тем же бонусом, но с новой случайной
  стороной и смещением; повторы без ограничения, пока не сбит, в пределах уровня. При
  смене уровня ожидающий повтор отменяется (астероид прошлого уровня, улетевший
  несбитым уже на новом, тоже не возвращается — у нового уровня свой астероид). Сбит
  одним выстрелом — 100 очков с надбавкой уровня и капсула 8×8 с буквой `L` / `S` / `D`
  (равновероятно), падает строго вниз 60 px/с, выстрелы пролетают сквозь неё. Капсулу
  ловит корабль (и мигающий после возрождения, но не сбитый); не поймал — пропала.
  `L` — доп. жизнь, `S` — быстрая пуля, `D` — две пули; улучшения — до конца игры,
  переживают гибель и смену уровня, не складываются. Бесполезный бонус (`L` при 5
  жизнях, уже полученное улучшение) — 500 очков. Астероид и капсула переживают смену
  уровня; на поле не больше одного бонусного предмета (следующий астероид ждёт пустого
  поля). Полученные улучшения видны в панели значками до конца игры.
```

README в `src/` нет — обновлять нечего. Запись фичи `second-brain/features/` не трогать.

После правок: `npx prettier --write` по изменённым `.md` и `.ts` (`format:check` проверяет
весь репозиторий), затем `npm run format:check && npm run lint && npm run typecheck &&
npm test && npm run build`.

## Сводка по файлам

| Действие | Файл                                                        |
| -------- | ----------------------------------------------------------- |
| Изменить | `src/game/bonus-field.ts`                                   |
| Изменить | `src/game/bonus-field.test.ts`                              |
| Изменить | `src/game/battle.ts` (только doc-комментарии)               |
| Изменить | `src/game/battle.test.ts`                                   |
| Изменить | `src/game/dev-snapshot.ts`                                  |
| Изменить | `src/game/dev-snapshot.test.ts`                             |
| Изменить | `second-brain/architecture/overview.md`                     |
| Изменить | `second-brain/architecture/dev-hooks.md`                    |
| Изменить | `second-brain/game-design.md`                               |
| Создать  | `second-brain/tasks/tasks/030-asteroid-retry/acceptance.md` |

Не меняются: `asteroid.ts`, `capsule.ts`, `collisions.ts`, `battle-render.ts`,
`play-scene.ts`, `dev-hooks.ts`, движок.

## Архитектура и паттерны

- Граница engine/game не затрагивается: всё в `src/game/`.
- Логика отдельно от отрисовки: повтор — обычный `Asteroid`, рендер не меняется.
- Детерминизм: только инжектированный `rng` поля (отдельный от `rng` боя), время — счётчик
  тиков `playing`. Сценарии без ухода несбитым дают ту же последовательность `rng`, что в
  006; уход — ровно +1 вызов.
- Одна запись `pending` делает правило «ждёт не больше одного» структурным.
- `import type` для `Asteroid` в тесте; без новых констант.

## Открытые вопросы

Нет. Решения владельца В1–В4 — в design.md; в `analyze.md` открытых вопросов нет.
Отступление от формулировок дизайна одно, техническое: в `acceptance.md` и рецептах
снимок берётся через `state()` (так называется метод в `dev-hooks.md`), а не
`snapshot()`, как написано в design.md.

## Ссылки

- `second-brain/tasks/tasks/030-asteroid-retry/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/007-asteroid-retry/design.md`, `discussion.md`, `dev-review*.md`
- `second-brain/architecture/overview.md`, `second-brain/architecture/dev-hooks.md`
- `second-brain/game-design.md`

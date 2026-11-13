# План реализации: Щит вместо запаса жизней — логика (часть 2)

Продолжение `plan.md`: тесты, документы, `acceptance.md`, финальный поиск и проверки.

Общие правила перевода тестов (из design.md, «Правило перевода значений» и «Правило
разбиения кейсов»): `lives: k` → `shield: k − 1`; кейсы «на пределе» → `MAX_SHIELD`; после
`hit()` — по смыслу кейса: «попадание засчитано» — умолчания и `invulnerable` +
`START_SHIELD − 1`; «гибель / `down` / game over / взрыв» — `shield: 0` и `down`;
«неуязвимый» — `hit()` при `shield > 0`, без `update × DOWN_TICKS`. Имена кейсов
(`it(...)`) и комментарии с `lives`/`life` — переименовать (их ловит финальный поиск).
Если после удаления цикла по `DOWN_TICKS` константа/импорт (`IDLE`, `SHIP_START_X`, …)
становится неиспользуемой — удалить (линтер).

## 12. `player.test.ts`

**Файл (изменить):** `src/game/player.test.ts` (Vitest, environment `node`)

- Импорт: `INVULNERABLE_TICKS, MAX_SHIELD, Player, readIntent, START_SHIELD` (без
  `DOWN_TICKS`, `MAX_LIVES`, `START_LIVES`); `SHIP_START_X` из `./ship` — убрать, если не
  используется.
- Помощник `downPlayer()` (`:44–49`) заменить двумя:

```typescript
/** A player off center (x = 40) with no shield, just hit: down for good. */
function downPlayer(): Player {
  const player = new Player(new Ship(40), 0);
  player.hit();
  return player;
}

/** A player off center (x = 40) just hit with the default shield: invulnerable in place. */
function shieldHitPlayer(): Player {
  const player = new Player(new Ship(40));
  player.hit();
  return player;
}
```

- `:292` «can be granted while down» — `downPlayer()` (новый) — без изменений.
- `:298` «hit() keeps the power-ups»: убрать `run(player, DOWN_TICKS)` — сразу после `hit()`
  `state === 'invulnerable'`, улучшения те же, два быстрых выстрела.
- `:346` «while down all shots in flight keep flying…»: `doublePlayer()` строит с
  умолчаниями → в этом кейсе нужен `down`: `const player = new Player(undefined, 0);
player.grantPowerUp('doubleShot');` (или параметр `doublePlayer(shield = START_SHIELD)`).
- Блок `Player ship state` (`:362–480`) переписать:
  - «hit() puts the ship down in place» — `downPlayer()` (`shield: 0`), ожидания те же.
  - «ignores the intent while down» — без изменений (новый `downPlayer()`).
  - «keeps the shot on hit() and lets it fly while down…» — `new Player(new Ship(40), 0)`.
  - **Новый** «hit() with a shield: shield − 1, invulnerable in place» —
    `shieldHitPlayer()`: `state === 'invulnerable'`, `stateTicks === 0`,
    `shield === START_SHIELD − 1`, `canBeHit === false`, `canBeTargeted === true`,
    `ship.x === 40`.
  - **Новый** «keeps the shot in flight on a shield hit» — выстрел до `hit()` остаётся тем
    же объектом и летит.
  - «stays down for DOWN_TICKS − 1» / «respawns invulnerable…» / «applies the respawn
    tick's intent…» — **удалить**; вместо них **новый** «stays down for good, whatever
    the ticks» — `downPlayer()`, `run(player, 5000, RIGHT_FIRE)`: `state === 'down'`,
    `stateTicks === 5000`, `ship.x === 40`, выстрелов нет (большой литерал, не
    `DOWN_TICKS`).
  - «moves and fires while invulnerable» — `shieldHitPlayer()`, без `run(DOWN_TICKS)`;
    `ship.x === 40 + STEP`.
  - «becomes active INVULNERABLE_TICKS after the respawn» → «… after a shield hit»:
    `shieldHitPlayer()`, `run(INVULNERABLE_TICKS − 1)` → `invulnerable`, `stateTicks ===
INVULNERABLE_TICKS − 1`; ещё 1 → `active`, `stateTicks === 0`, `canBeHit`.
  - «hit() while down does not restart the timer» — `downPlayer()`, `run(10)`, `hit()` →
    `down`, `stateTicks === 10`, `shield === 0`.
  - «hit() while invulnerable does nothing» — `shieldHitPlayer()`, `run(10)`, `hit()` →
    `invulnerable`, `stateTicks === 10`, `shield === START_SHIELD − 1` (не `− 2`), `x`
    тот же; `run(INVULNERABLE_TICKS − 10)` → `active`.
  - «can be hit again once active» — `shieldHitPlayer()`, `run(INVULNERABLE_TICKS)` →
    `active`; `hit()` → `invulnerable`, `shield === START_SHIELD − 2`.
- Блок `Player lives` (`:482–595`) → `describe('Player shield')`:
  - «starts with START_SHIELD = 2 and is not lost» (`START_SHIELD === 2`, `shield`,
    `isLost === false`).
  - «accepts the starting shield in the constructor» — `MAX_SHIELD`, `0`.
  - `it.each([-1, 1.5, NaN, MAX_SHIELD + 1])('rejects %s shield with a RangeError')` (`0`
    из списка убрать — теперь допустим).
  - «addShield grows the shield up to MAX_SHIELD and returns false at the cap»: с
    `MAX_SHIELD − 1` — `true`, `MAX_SHIELD`; ещё раз — `false`, `MAX_SHIELD`;
    `MAX_SHIELD === 5`.
  - «keeps the state and stateTicks on addShield in active and invulnerable»: `run(3)`,
    `addShield()` → `active`, `stateTicks 3`; `hit()`, `run(5)` → `invulnerable`,
    `stateTicks 5`; `addShield()` → то же, `shield === START_SHIELD + 1` (2 + 1 − 1 + 1).
  - «addShield does nothing while down» (вместо «brings the respawn back…»): `downPlayer()`,
    `run(10)`, `addShield()` → `false`, `shield === 0`, `isLost`, `down`,
    `stateTicks === 10`; `run(5000)` → всё ещё `down`.
  - «takes a level on the hit() call itself» — умолчания: `shield === START_SHIELD − 1`,
    `invulnerable`.
  - «respawns on tick DOWN_TICKS while lives are left…» (`:559`) — **удалить** (возрождения
    нет; «щит после удара» покрыт кейсами выше).
  - «takes no level on hit() while invulnerable or down» — `hit()` дважды подряд →
    `START_SHIELD − 1`; `downPlayer()` + `hit()` → `shield === 0`, `down`.
  - «a hit at shield 1 drops it to 0 and still gives invulnerable» — `new Player(undefined,
1)`, `hit()` → `shield === 0`, `invulnerable`, `isLost === false`.
  - «survives START_SHIELD hits and is lost on the next one» — цикл: `hit()`,
    `run(INVULNERABLE_TICKS)` ×2 → `active`, `shield === 0`; третий `hit()` → `down`,
    `isLost`.
  - «survives MAX_SHIELD hits from the max and is lost on the 6th» — то же от
    `MAX_SHIELD`, 5 пережитых, 6-й → `down`.
  - «stays down for good after the fatal hit» (бывший `:570–583`) — `new Player(new
Ship(40), 0)`, `hit()`, `run(1000, RIGHT_FIRE)` → `down`, `canBeHit/canBeTargeted ===
false`, `x === 40`, выстрелов нет, `stateTicks === 1000`, `shield === 0`.
  - «lets the shot in flight fly on after the fatal hit» — `new Player(new Ship(40), 0)`,
    остальное как сейчас.

## 13. `battle.test.ts`

**Файл (изменить):** `src/game/battle.test.ts`

- Импорт `:16`: `import { MAX_SHIELD, START_SHIELD } from './player';` (`INVULNERABLE_TICKS`
  — если нужен в новых кейсах).
- `overBattle()` (`:45–52`): «with a single life» → «with no shield»; `shield: 0`.
- `Battle ram`:
  - `:239` «a diver touching the ship explodes and puts the ship down» → «… and takes a
    shield level»: умолчания, `invulnerable`, `shield === START_SHIELD − 1`. **Новый**
    рядом — «… with no shield puts the ship down»: та же сцена с `{ levels: RAM_LEVEL,
shield: 0 }`, `down`, враг `exploding` («гибнут оба»).
  - `:253` «gives the wave no target while the ship is down» — `{ levels: RAM_LEVEL,
shield: 0 }`, остальное как есть.
  - **Новый** «keeps the ship targeted while invulnerable»: умолчания, тот же вылет, `hit()`
    → `canBeTargeted === true` (короткий кейс на `player`, без проверки траектории).
- `Battle enemy shots`, `:287` «an enemy shot puts the ship down through update()» →
  «… takes a shield level through update()»: цикл до `state !== 'active'`, ожидать
  `invulnerable`, `shield === START_SHIELD − 1`, выстрелов `0`, враг `diving`.
- `describe('Battle lives and game over')` → `'Battle shield and game over'`:
  - `:310` «passes opts.shield to the player»: умолчание `START_SHIELD`; `{ shield: 0 }` →
    `0`; `{ shield: MAX_SHIELD }` → `MAX_SHIELD`; `RangeError` для `-1` и `MAX_SHIELD + 1`.
  - `:316` — `shield: 0`; имя «… after the fatal hit».
  - `:327` «does not enter over while lives are left» → «a shield hit does not end the
    game»: `shield: 1`, `hit()`, `run(GAME_OVER_DELAY_TICKS)` → `playing`, `invulnerable`,
    `shield === 0`. Добавить: `run(INVULNERABLE_TICKS)` → `active`, всё ещё `playing`.
  - `:336` «ends the game, not the level, when the last ship rams…» — `shield: 0`; имя
    «… when the unshielded ship rams the last enemy».
  - `:354` «has no collisions in over» — `shield === 0` вместо `lives === 0`; комментарий
    про `down` верен.
- Комментарий `:405–407`: «Extra-life tests…» / `EXTRA_LIFE_FIRST` → «Shield threshold
  tests…» / `EXTRA_SHIELD_FIRST`.
- `:440` «adds in-flight points for a ram» — умолчания, ожидать `invulnerable` (смысл —
  очки за таран, гибель не нужна).
- `describe('Battle extra lives')` → `'Battle shield thresholds'`:
  - `:480` «gives a shield level when the score crosses 5000» — `START_SHIELD + 1`.
  - `:488` «does not go over MAX_SHIELD» — `shield: MAX_SHIELD`.
  - `:499` «charges a lost ship before the extra life» → «charges the hit before the
    threshold: max → max − 1 → max»: `shield: MAX_SHIELD`, таран → `invulnerable`,
    `score 5000`, `shield === MAX_SHIELD`.
  - **Новый** «a ram at shield 0 that crosses a threshold still ends the game»: `{ levels:
[passiveLevel(['S..........'])], startLevel: STRIKER_RAM_5000_LEVEL, shield: 0 }`, таран
    → `down`, `score 5000`, `shield === 0`, `run(GAME_OVER_DELAY_TICKS)` → `over`.
  - `:512–535` **перевернуть по В7**: «a threshold crossed while down does not cancel game
    over»: `shield: 0`, выстрел → `hit()` → `isLost`; выстрел долетает → `score 5000`,
    `shield === 0`, `isLost === true`; `run(GAME_OVER_DELAY_TICKS − 2)` → `down`, не `over`;
    `run(1)` → `over` (счёт: тик попадания выстрела — `stateTicks 1`, затем
    `GAME_OVER_DELAY_TICKS − 2` → 59, ещё 1 → 60 = `GAME_OVER_DELAY_TICKS`).
- `:603` детерминизм-снимок: `lives: b.player.lives` → `shield: b.player.shield`.
- `Battle asteroid`: `:652` → `shield === START_SHIELD`; `:742` «is not hit in over» —
  `shield: 0`; `:764` «asteroid points give an extra life at 5000» → «… a shield level at
  5000», `START_SHIELD + 1`.
- `Battle capsule`:
  - `:817` → `START_SHIELD`; `:820` «life: +1 life» → «shield: +1 level»,
    `START_SHIELD + 1`; `:827` «shield at MAX_SHIELD: BONUS_FALLBACK_POINTS instead» —
    `shield: MAX_SHIELD`; `:863` → `START_SHIELD`.
  - `:866` «power-ups survive the loss of a ship» → «power-ups survive a shield hit»:
    `hit()` без `run(DOWN_TICKS)`, сразу `invulnerable`, `fastShot`, быстрый выстрел.
  - `:887` «a ship lost on the touching tick…» → **только `shield: 0`** (`bonusBattle({
shield: 0 })`): `down`, `shield === 0` (оба места), капсула падает мимо.
  - **Новый** рядом — «a shield hit and the capsule on the same tick: −1, then +1»: та же
    сцена с умолчаниями (капсула вида `BONUS_KINDS[0] = 'shield'`, `capsule.y = SHIP_Y −
CAPSULE_SIZE`, `ramShip`, один `update`) → `invulnerable`, `shield === START_SHIELD`,
    `bonuses.capsule === null`, `score === 100 + killPoints({ kind: 'drone', inFlight:
true }, 1)` (астероид + таран).
  - `:905` «is caught in cleared» → `START_SHIELD + 1`.
  - `:920` «is not caught in over» — `shield: 0`; `:938` `shield === 0`.
  - `:946` «BONUS_FALLBACK_POINTS cross a shield threshold» → `START_SHIELD + 1`.
  - `:957` → `START_SHIELD + 1`.
  - `:968` «applies the bonus after the asteroid points: L is useless once they gave the max
    shield» — `shield: MAX_SHIELD − 1` (открытый вопрос 1 analyze.md: «на шаг ниже
    максимума»), ожидание `MAX_SHIELD`.

## 14. `collisions.test.ts`

**Файл (изменить):** `src/game/collisions.test.ts`

- Импорт `:9`: `import { Player, START_SHIELD } from './player';`; `const IDLE` (`:17`)
  удалить — после правок не используется.
- «Попадание засчитано» → `state === 'invulnerable'` и `player.shield === START_SHIELD −
1`: `:254`, `:263`, `:304` (1 px overlap), `:341`, `:364` («reports a ram as an in-flight
  kill» — таран в щит даёт `Kill { inFlight: true }`), `:372`, `:409`, `:418` (`p3`), `:461`,
  `:473` (выстрел и таран в одном тике — **один** уровень: `START_SHIELD − 1`), `:557`.
- «Неуязвимый / сбитый» `:324` «no ram while the ship is down or invulnerable» и `:443`
  «enemy shots pass through…»:

```typescript
const down = new Player(undefined, 0);
down.hit();
const invulnerable = new Player();
invulnerable.hit();
expect(invulnerable.state).toBe('invulnerable');
// ... the loop as now, plus: expect(player.shield).toBe(shield) with
// const shield = player.shield before resolveCollisions
```

- **Новые** (гибель): «a ram at shield 0 puts the ship down, the rammer explodes» и «an
  enemy shot at shield 0 puts the ship down» — `new Player(undefined, 0)`, ожидать `down`.
- `:665` «the ship never interacts with the asteroid» — `player.shield === START_SHIELD`.
- `:677` комментарий «kind 'life'» → «kind 'shield'»; все `collected: 'life'` → `'shield'`
  (`:683`, `:694`, `:716`, `:726`).
- `:688` «the invulnerable ship catches it too» — `player.hit()` без цикла `DOWN_TICKS`.
- `:698` «the ship that is down does not catch it» — `new Player(undefined, 0)`.

## 15. `battle-render.test.ts`

**Файл (изменить):** `src/game/battle-render.test.ts`

- Импорт `:16`: `import { INVULNERABLE_TICKS } from './player';`; `GAME_OVER_DELAY_TICKS`
  — из `./battle` (`import { Battle, GAME_OVER_DELAY_TICKS } from './battle';`).
- Помощник `newBattle()` (`:50–52`) — опции:

```typescript
function newBattle(opts: BattleOptions = {}): Battle {
  return new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, ...opts });
}
```

(`import type { BattleOptions } from './battle';`).

- `:256` «the ship explosion ends before the respawn» → «… ends before game over»:
  `expect(EXPLOSION_TICKS).toBeLessThan(GAME_OVER_DELAY_TICKS)`.
- `:260`, `:269`, `:279`, `:293` (взрыв кадр 0, кадр 1, последний кадр и пусто, выстрел при
  сбитом корабле) — `newBattle({ shield: 0 })`; ожидания без изменений.
- `:309` «blinks the invulnerable ship at SHIP_START_X» → «blinks the ship where it was
  hit: shown, hidden, shown»: `ship.x = 40`, `hit()` (умолчания), без `run(DOWN_TICKS)`;
  `invulnerable`, `stateTicks 0`; `shipCalls(40, SHIP_Y)` → пусто через `BLINK_TICKS` →
  снова `shipCalls(40, SHIP_Y)`.
- `:323` «draws the ship again once active…» — `hit()` с умолчаниями,
  `run(INVULNERABLE_TICKS − 1)` вместо `DOWN_TICKS + INVULNERABLE_TICKS − 1`; дальше как
  есть (`SHIP_START_X` — корабль по умолчанию там и стоял).
- Комментарий `:503`: «gives a 'life' asteroid» → «gives a 'shield' asteroid».
- `drawShip` не меняется; полные списки `fillRect` с кораблём не трогаются (дуга — 032).

## 16. `score.test.ts`, `bonus.test.ts`, `asteroid.test.ts`, `capsule.test.ts`

- `src/game/score.test.ts`: импорт `EXTRA_SHIELD_EVERY, EXTRA_SHIELD_FIRST,
extraShieldsEarned`; `describe('extra lives')` → `'shield thresholds'`; вызовы —
  переименовать, значения те же.
- `src/game/bonus.test.ts:6`: `['shield', 'fastShot', 'doubleShot']`.
- `src/game/asteroid.test.ts` (8 мест) и `src/game/capsule.test.ts` (4 места): `'life'` →
  `'shield'`.

## 17. `hud.test.ts`, `hud-render.test.ts`

**Файл (изменить):** `src/game/hud.test.ts`

- Импорт `:31`: `import { MAX_SHIELD, START_SHIELD } from './player';`.
- `:50` «…the player's shield and no power-ups»: `shield: START_SHIELD`.
- `:62` «follows the player's shield»: `hit()` → `START_SHIELD − 1`; `{ shield: 5 }` → `5`.
- `:169` «has an icon slot for every shield level up to MAX_SHIELD»:
  `LIVES_ICON_SLOTS >= MAX_SHIELD`.
- `:173` «fits all lives icon slots» → «fits all icon slots»; `:181`
  `describe('lives icon')` → `describe('ship icon')`. Константы `LIVES_*`/`LIFE_ICON_*` —
  без изменений (033).

**Файл (изменить):** `src/game/hud-render.test.ts`

- Фикстуры: `BASE` `lives: 3` → `shield: 3`; `:87` `shield: LIVES_ICON_SLOTS`; `:106`
  `['shield', { ...BASE, shield: 2 }, LIVES_ZONE]`; `:117` `shield: 0`; `:188` `shield: 1`.
- `:138` «draws %i ship icons (the shield level) from the right edge», параметр `shield`.
- `:152` «draws at most LIVES_ICON_SLOTS icons» — `shield: LIVES_ICON_SLOTS + 2`.

## 18. `dev-params.test.ts`, `dev-snapshot.test.ts`

**Файл (изменить):** `src/game/dev-params.test.ts`

- `livesOf` → `const shieldOf = (v: string) => parseDevParams(`?shield=${v}`).shield;`.
- Умолчания и `NO_DEV_PARAMS`: `shield: undefined`.
- «parses shield in 0..MAX_SHIELD»: `'0'` → `0`, `'2'` → `2`, `'5'` → `5`.
- `it.each(['6', '-1', '2.5', 'x', ''])('ignores shield %j')`.
- **Новый** «no longer reads ?lives»: `parseDevParams('?lives=1').shield` —
  `undefined`, и результат `toEqual` умолчаниям.
- «combines all parameters»: `?seed=7&paused=1&level=3&shield=5` → `shield: 5`.

**Файл (изменить):** `src/game/dev-snapshot.test.ts`

- `:48`: `expect(b.shield).toBe(START_SHIELD)` (импорт из `./player`).
- `:65–72` — вариант «удар по щиту» (выбор исполнителя по design.md; `down` и `over`
  уже покрывает кейс `:74`): «shows a shield hit: one level less, the ship blinking» —
  `b.shield === START_SHIELD − 1`, `b.player.state === 'invulnerable'`.
- `:75`: `{ shield: 0 }`.
- Если есть проверка вида капсулы в снимке — `'shield'`.

## 19. Сцены

**Файл (изменить):** `src/game/scenes/play-scene.test.ts`

- `:29` комментарий «one life» → «no shield»; `:34`, `:206`: `{ levels: ONE_CORNER_ENEMY,
shield: 0 }`.
- `:311`: `scene.battle.player.shield` vs `refBattle.player.shield`.

**Файл (изменить):** `src/game/scenes/title-scene.test.ts`

- Импорт `:5`: `import { MAX_SHIELD, START_SHIELD } from '../player';`.
- Комментарий `:21`: «Expected about 300 ticks: 2 × invulnerable 120 + 60.» (лимит 600 —
  без изменений).
- `:104`: `next.battle.player.shield === START_SHIELD`.
- `:118` «starts the game with the given shield and keeps it across a restart»:
  `{ shield: 0 }`, ожидания `0`.
- `:127` «combines the start level and shield»: `{ startLevel: 2, shield: MAX_SHIELD }` →
  `MAX_SHIELD`.

## 20. Тесты: итоговые сценарии (сводно)

- Основное: удар со щитом → `−1`, `invulnerable` на месте, выстрелы и улучшения целы;
  удар без щита → `down` навсегда, `over` через `GAME_OVER_DELAY_TICKS`; рост от `L` и
  порогов; `L` на максимуме → +500.
- Граничные: `shield 1 → 0` даёт `invulnerable`; конструктор `0` и `MAX_SHIELD` допустимы,
  `-1`/`MAX_SHIELD + 1`/дробь — `RangeError`; `addShield` на максимуме и в `down` —
  `false`; таран на максимуме через порог — `max → max−1 → max`; таран при `0` через
  порог — `over`; порог в `down` — `over` (В7); удар и `L` в одном тике; удар в
  `invulnerable`/`down` — no-op без продления таймера; `?shield=0` парсится.

## 21. Документы (second-brain, по-русски)

**Файл (изменить):** `second-brain/game-design.md` — точные формулировки из раздела
«Правка game-design.md» design.md:

- «Пикирование» (`:39`) — фрагмент про `drone` и возродившийся корабль.
- «Поражение игрока» (`:48–57`) — пункт целиком.
- «Очки» (`:63–65`) — фрагмент про пороги.
- «Жизни» (`:72–77`) → пункт «Щит» целиком.
- «Астероиды и бонусы» (`:88–91`) — три фрагмента.
- Пункт HUD (`:18–22`) — **не трогать** (033).

**Файл (изменить):** `second-brain/architecture/overview.md`:

- `:30–45`: `GameStart` — `'startLevel' | 'shield'`, `{ startLevel, shield }`,
  `parseDevParams` — `shield` (`0 … MAX_SHIELD` или `undefined`).
- `:84–85`: `SHIP_START_X` — «точка старта»; «жизни — в верхней панели» → «щит — в верхней
  панели».
- `:104–118`: абзац «Жизни…» и автомат — заменить на щит: `START_SHIELD = 2`,
  `MAX_SHIELD = 5`, `Player(ship?, shield?)` — `0…MAX_SHIELD`, иначе `RangeError`; геттеры
  `shield`, `isLost` (`state === 'down'`); `addShield(): boolean`; автомат `active →
hit()` (`shield > 0`: `− 1`) `→ invulnerable → INVULNERABLE_TICKS → active`, `shield = 0`
  → `down` (конечное); без возрождения и переноса в `SHIP_START_X`.
- `:256–258`: `EXTRA_SHIELD_FIRST/EVERY`, `extraShieldsEarned`, «без предела по щиту».
- `:277`: `BonusKind` — `shield | PowerUpKind`.
- `:314–328`: `BattleOptions.shield`, умолчание `START_SHIELD`; `addScore` →
  `player.addShield()`, «порог в `down` `over` не отменяет»; `applyBonus` — `shield`:
  `if (!addShield()) addScore(BONUS_FALLBACK_POINTS)`; `GAME_OVER_DELAY_TICKS = 60`
  литералом в `battle.ts`.
- `:347–349`: `HudView { level, score, shield, powerUps }`, `battle.player.shield`.
- `:354–362`: зоны не переписывать (033); дописать одно предложение: «до 033 иконки в
  `LIVES_ZONE` показывают уровень щита (`drawLives(ctx, view.shield)`)».
- `:58` (`LIFE_ICON_SPRITE` «иконка жизни») — «иконка корабля для HUD (до 033 — уровень
  щита)».

**Файл (изменить):** `second-brain/architecture/dev-hooks.md` — все упоминания `lives`:

- `:14` пример URL: `…&level=3&shield=0`.
- `:21` строка таблицы: `shield=N` | десятичное целое `0 … 5` (`MAX_SHIELD`) | игнор →
  `START_SHIELD` (2).
- `:25–26`: «`level` и `shield` сохраняются … с тем же уровнем и щитом».
- `:62`: поле снимка `shield`.
- Таблица констант `:99–107`: строку `DOWN_TICKS` удалить; `INVULNERABLE_TICKS` —
  «неуязвимость после удара по щиту»; `GAME_OVER_DELAY_TICKS` — «от гибели (удар без
  щита) до `over`»; `MAX_LIVES` → `MAX_SHIELD` 5 «максимум щита»; `EXTRA_LIFE_FIRST` →
  `EXTRA_SHIELD_FIRST` 5000 «первый порог очков за уровень щита»; добавить
  `START_SHIELD` 2.
- Рецепты `:111–119`: «Щит на пределе: `?…&shield=5` … если в капсуле `shield` — поймать:
  `shield` остаётся 5, `score` +500»; «Повтор астероида» — `shield=5`; «Быстрый game over:
  `?paused=1&shield=0` … новая игра — снова без щита».
- `:124`: `setLives` → `setShield`.
- Итог проверить: `grep -n "lives\|жизн" second-brain/architecture/dev-hooks.md` — пусто.

`.claude/agents/tester.md` — **не трогать** (правит основная сессия с согласия владельца
после задачи).

## 22. `acceptance.md`

**Файл (создать):** `second-brain/tasks/tasks/031-shield-logic/acceptance.md` (формат —
как `tasks-done/030-asteroid-retry/acceptance.md`):

- Вступление: код готов, проверки зелёные; утвердить владельцу ощущение передышки 2 с
  («не слишком ли быстро снимается щит», точка подстройки — `INVULNERABLE_TICKS`).
- **Обязательная оговорка:** иконки кораблей справа в панели — временно **уровень щита**
  (до 033), не жизни: на старте 2 иконки, после двух ударов — 0 при живом корабле,
  третий удар — game over. Это не баг. Дуги над кораблём нет (032).
- Кейс 1 — удар не убивает: `?seed=1&paused=1` → старт → дождаться удара (или
  подставиться); `state().battle.shield === 1`, `player.state === 'invulnerable'`, `x` не
  изменился; глазами — корабль мигает на месте, управляется и стреляет; через 120 тиков
  `active`.
- Кейс 2 — третий удар со старта — game over: после двух ударов `shield === 0`, третий →
  `down`, взрыв, через 60 тиков `scene === 'over'`.
- Кейс 3 — быстрый game over: `?paused=1&shield=0` → первый удар → `down` → `over`; Enter →
  титул, новая игра снова с `shield === 0`.
- Кейс 4 — капсула `L`: `+1` (иконок стало больше); при `?shield=5` — `shield` 5, `score`
  +500.
- Пометка: до правки `tester.md` основной сессией `/qa` описывает `?lives=N`, который
  больше не читается.

## 23. Финальный поиск

```bash
grep -rnE "'life'|lives|Lives|START_LIVES|MAX_LIVES|DOWN_TICKS|addLife|EXTRA_LIFE|extraLives|respawn|\blife\b" src
```

Допустимые совпадения: `src/game/scenes/title-scene.ts:32` («The factory lives here»).
`LIVES_ZONE`, `LIVES_ZONE_WIDTH`, `LIVES_ICON_SLOTS`, `LIFE_ICON_*`, `LIFE_ICON_SPRITE`,
`drawLives` поиском выше (регистр) не ловятся, кроме `drawLives` по `Lives` — он
допустим (033). Всё остальное — исправить.

## 24. Проверки

`npm run format` (затем `format:check`), `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` — все зелёные. Базовый прогон до задачи: 32 файла, 992 теста.

## 25. Ручная проверка

`npm run dev`, открыть `http://localhost:5173/`:

- старт — корабль по центру, справа в панели 2 иконки;
- попасть под выстрел — корабль не взрывается, мигает ~2 с там, где был, управляется и
  стреляет; иконок 1;
- второй удар — 0 иконок, корабль жив и мигает; третий — взрыв и `GAME OVER` через ~1 с;
- `?shield=0` — первый же удар завершает игру; `?shield=5` — 5 иконок;
- капсула `L` добавляет иконку; при 5 — +500 очков.

## Сводка по файлам

| Действие | Файл                                                      |
| -------- | --------------------------------------------------------- |
| Изменить | `src/game/player.ts`                                      |
| Изменить | `src/game/battle.ts`                                      |
| Изменить | `src/game/score.ts`                                       |
| Изменить | `src/game/bonus.ts`                                       |
| Изменить | `src/game/bonus-art.ts`                                   |
| Изменить | `src/game/collisions.ts` (комментарии)                    |
| Изменить | `src/game/ship.ts` (комментарии)                          |
| Изменить | `src/game/art.ts` (только комментарий `:32`)              |
| Изменить | `src/game/hud.ts`                                         |
| Изменить | `src/game/hud-render.ts`                                  |
| Изменить | `src/game/dev-params.ts`                                  |
| Изменить | `src/game/dev-snapshot.ts`                                |
| Изменить | `src/game/scenes/title-scene.ts`                          |
| Изменить | `src/main.ts`                                             |
| Изменить | `src/game/player.test.ts`                                 |
| Изменить | `src/game/battle.test.ts`                                 |
| Изменить | `src/game/collisions.test.ts`                             |
| Изменить | `src/game/battle-render.test.ts`                          |
| Изменить | `src/game/score.test.ts`                                  |
| Изменить | `src/game/bonus.test.ts`                                  |
| Изменить | `src/game/asteroid.test.ts`                               |
| Изменить | `src/game/capsule.test.ts`                                |
| Изменить | `src/game/hud.test.ts`                                    |
| Изменить | `src/game/hud-render.test.ts`                             |
| Изменить | `src/game/dev-params.test.ts`                             |
| Изменить | `src/game/dev-snapshot.test.ts`                           |
| Изменить | `src/game/scenes/play-scene.test.ts`                      |
| Изменить | `src/game/scenes/title-scene.test.ts`                     |
| Изменить | `second-brain/game-design.md`                             |
| Изменить | `second-brain/architecture/overview.md`                   |
| Изменить | `second-brain/architecture/dev-hooks.md`                  |
| Создать  | `second-brain/tasks/tasks/031-shield-logic/acceptance.md` |

Не менять: `battle-render.ts`, `play-scene.ts`, `dev-hooks.ts`, `bonus-field.ts`,
`.claude/agents/tester.md`, `second-brain/features/`.

## Архитектура и паттерны

- Граница engine/game не задета: всё в `src/game/`.
- Логика без canvas: щит — целое в агрегате `Player`, переходы — в его автомате; `Battle`
  только зовёт `addShield()`; рендер читает состояние и не меняется.
- Детерминизм: `Player` не использует `rng`, порядок `BONUS_KINDS` прежний; время — тики
  (`stateTicks`, `INVULNERABLE_TICKS`, `GAME_OVER_DELAY_TICKS`).
- Правило тика (счёт → таймерный переход → действие) сохранено; «одно попадание за тик» —
  через `canBeHit` (после удара `invulnerable`, как раньше `down`).
- `import type` для типов (`BattleOptions` в тесте рендера); неиспользуемые импорты после
  удаления `DOWN_TICKS` — убрать.
- Циклов импортов нет: `art.ts` правится только в комментарии.

## Открытые вопросы

Блокирующих нет (В1–В9 закрыты в design.md). Уточнения analyze.md решены по правилам
дизайна:

1. `battle.test.ts:968–975` — `shield: MAX_SHIELD − 1`, ожидание `MAX_SHIELD` (шаг 13).
2. Кейсы «кладёт корабль» с умолчаниями — разобраны по кейсам в шагах 13–15: смысл
   «попадание засчитано» → `invulnerable` + `START_SHIELD − 1`; где смысл — гибель/`down`/
   взрыв/прицел в `down` — `shield: 0`; для покрытия гибели добавлены парные кейсы с
   `shield: 0`.
3. `player.test.ts` `downPlayer()` — два помощника: `downPlayer()` (`shield: 0`, `down`)
   и `shieldHitPlayer()` (`x = 40`, `invulnerable`, проверка «на месте») (шаг 12).
4. `dev-snapshot.test.ts:65–72` — выбран вариант «удар по щиту» (`invulnerable`,
   `START_SHIELD − 1`): `down`/`over` покрывает соседний кейс `:74`.
5. `art.ts:32` — правка только комментария (отступление от analyze.md, см. шаг 6) ради
   чистого финального поиска.

Вне задачи (основная сессия): правка `.claude/agents/tester.md` (`?lives=N` →
`?shield=N`, `0…5`) с согласия владельца.

## Ссылки

- `second-brain/tasks/tasks/031-shield-logic/analyze.md`, `description.md`, `plan.md`
- `CLAUDE.md`
- `second-brain/features/008-ship-shield/design.md` («Сущности и состояния», «Интерфейсы»,
  «Затрагиваемые тесты по задачам», «Правка game-design.md», «Нарезка на задачи», п. 1)
- `second-brain/features/008-ship-shield/discussion.md`, `dev-review.md`, `dev-review-2.md`
- `second-brain/architecture/overview.md`, `second-brain/architecture/dev-hooks.md`
- `second-brain/game-design.md`

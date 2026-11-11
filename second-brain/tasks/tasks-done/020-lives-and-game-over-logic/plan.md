# План реализации: Жизни и конец игры в логике

Ввести конечный запас кораблей (`START_LIVES = 3`, общее число, включая корабль на поле) и
терминальную фазу боя `over`: каждая гибель списывает жизнь в тик попадания, возрождение —
только пока жизни есть, через `GAME_OVER_DELAY_TICKS` (60 тиков) после гибели последнего
корабля бой переходит в `over` (враги летают дальше, коллизий нет). Панель показывает
реальные жизни. Надписи `GAME OVER` нет — это задача 021.

Рамка — `second-brain/features/005-lives-score-game-over/design.md` (раунд 3, пункт 1
нарезки) и `analyze.md` задачи. Отступлений от дизайна нет. Код сверён на ветке
`feature/005-lives-score-game-over`, `9e7a20e`.

## 1. `Player`: жизни, списание, возрождение только при жизнях

**Файл (изменить):** `src/game/player.ts`

1. Экспорт константы рядом с `DOWN_TICKS`:

   ```typescript
   /** Total lives at the start, including the ship on the field (owner decision В4). */
   export const START_LIVES = 3;
   ```

2. Private-поле и конструктор с проверкой (только нижняя граница и целое; верхняя —
   задача 023 вместе с `MAX_LIVES`):

   ```typescript
   private livesLeft: number;

   /** lives: total including the ship on the field; an integer >= 1, throws RangeError otherwise. */
   constructor(ship: Ship = new Ship(), lives: number = START_LIVES) {
     if (!Number.isInteger(lives) || lives < 1) {
       throw new RangeError(`lives must be an integer >= 1, got ${lives}`);
     }
     this.ship = ship;
     this.livesLeft = lives;
   }
   ```

3. Геттеры (после `stateTicks`):

   ```typescript
   /** Total lives including the ship on the field; drops on the hit tick. */
   get lives(): number {
     return this.livesLeft;
   }

   /** No lives left: the ship stays down for good (stateTicks keeps growing). */
   get isLost(): boolean {
     return this.livesLeft === 0;
   }
   ```

4. `hit()` — списание внутри существующей ветки `active → down`:

   ```typescript
   /**
    * active -> down and lives - 1; ignored in any other state (no loss, does not restart the
    * timer, so a ram during invulnerable cannot extend it). The shot in flight is kept.
    */
   hit(): void {
     if (this.currentState !== 'active') return;
     this.livesLeft--;
     this.enter('down');
   }
   ```

5. `update` — условие возрождения дополняется `lives > 0`; порядок «счёт тика → переход →
   действие» не меняется:

   ```typescript
   if (this.currentState === 'down' && this.livesLeft > 0 && this.ticksInState >= DOWN_TICKS) {
   ```

   В «потерянном» `down` ветка не срабатывает, `controllable === false` — intent
   игнорируется, выстрел в полёте долетает (как сейчас).

6. JSDoc: строка 6 (`ShipState`) и комментарий класса (стр. 26-35) — автомат с
   изменениями:

   ```
   active --hit()--> down [lives - 1] --DOWN_TICKS, lives > 0--> invulnerable --INVULNERABLE_TICKS--> active.
   down with 0 lives (isLost): stays down for good, the battle ends the game.
   ```

   Нового `ShipState` нет.

## 2. `Battle`: `opts.lives`, фаза `over`, общий `phaseTicks`

**Файл (изменить):** `src/game/battle.ts`

1. Импорты: `import { DOWN_TICKS, Player, START_LIVES } from './player';`
   (`PlayerIntent` — по-прежнему `import type`).

2. Типы и константы:

   ```typescript
   /**
    * playing: the wave is alive; cleared: the pause before the next level's wave;
    * over: the last ship is lost - terminal, the wave keeps flying, no collisions.
    */
   export type BattlePhase = 'playing' | 'cleared' | 'over';
   /** From the last ship's hit to game over: the moment it would have respawned (В3: 1 s). */
   export const GAME_OVER_DELAY_TICKS = DOWN_TICKS;
   ```

   В `BattleOptions`:

   ```typescript
   /** Starting lives, default START_LIVES. Tests use 1 for a quick game over. Player validates it. */
   readonly lives?: number;
   ```

3. `player` — объявление поля и создание в конструкторе (инициализатор поля не видит
   `opts`). `Player` не использует `rng` — последовательность генератора не сдвигается:

   ```typescript
   readonly player: Player;
   private ticksInPhase = 0;
   // ...
   constructor(private readonly rng: Rng, opts: BattleOptions = {}) {
     this.player = new Player(undefined, opts.lives ?? START_LIVES);
     this.levels = opts.levels;
     this.currentLevel = opts.startLevel ?? 1;
     this.currentWave = this.createWave();
   }

   /** Ticks since entering the current phase, any phase: 0 after the update of the transition. */
   get phaseTicks(): number {
     return this.ticksInPhase;
   }
   ```

   Private `phaseTicks` переименовать в `ticksInPhase`.

4. `update` не меняется: коллизии уже под условием `currentPhase === 'playing'`, значит в
   `cleared` и `over` их нет. Поправить только JSDoc (`over` в списке, где нет коллизий).

5. `updatePhase` — переписать:

   ```typescript
   /**
    * Counts the tick, then checks in order (each transition sets phaseTicks = 0):
    * 1. playing | cleared -> over once the ship is lost and GAME_OVER_DELAY_TICKS have passed
    *    since its last hit; checked first, so the level never changes after the loss;
    * 2. playing -> cleared once every enemy is dead (enemy shots still in flight are removed);
    * 3. cleared -> playing with the next level's wave when phaseTicks reaches LEVEL_PAUSE_TICKS.
    * over is terminal. The new wave is drawn this tick at its start positions and first
    * updated next tick.
    */
   private updatePhase(): void {
     this.ticksInPhase++;
     if (this.currentPhase === 'over') return;
     if (this.player.isLost && this.player.stateTicks >= GAME_OVER_DELAY_TICKS) {
       this.enterPhase('over');
       return;
     }
     if (this.currentPhase === 'playing') {
       if (this.currentWave.isCleared) {
         this.enterPhase('cleared');
         this.currentWave.clearShots();
       }
       return;
     }
     if (this.ticksInPhase === LEVEL_PAUSE_TICKS) {
       this.currentLevel++;
       this.currentWave = this.createWave();
       this.enterPhase('playing');
     }
   }

   private enterPhase(phase: BattlePhase): void {
     this.currentPhase = phase;
     this.ticksInPhase = 0;
   }
   ```

   Тики переходов `cleared → playing` те же, что сейчас (вход в `cleared` ставит 0, затем
   `++` каждый тик и `=== LEVEL_PAUSE_TICKS`), — тесты `battle.test.ts:86-137` не правятся.

6. JSDoc класса (стр. 22-29): добавить «`playing | cleared` → (последний корабль потерян,
   `GAME_OVER_DELAY_TICKS`) → `over`, терминальная».

## 3. HUD: реальные жизни

**Файл (изменить):** `src/game/hud.ts`

- Удалить `PLACEHOLDER_LIVES` (стр. 23-24). `PLACEHOLDER_SCORE` остаётся до задачи 022.
- `hudView`:

  ```typescript
  /** Builds the HUD snapshot; the score is a placeholder until the scoring feature exists. */
  export function hudView(battle: Battle): HudView {
    return { level: battle.level, score: PLACEHOLDER_SCORE, lives: battle.player.lives };
  }
  ```

- Комментарий `LIVES_ICON_SLOTS`: «How many icons the lives zone holds; drawLives draws at
  most this many».

**Файл (изменить):** `src/game/hud-render.ts`

- Импортировать `LIVES_ICON_SLOTS` из `./hud` и ограничить число иконок:

  ```typescript
  /** Icons from the zone's right edge leftwards; icon 0 is the rightmost. At most LIVES_ICON_SLOTS. */
  function drawLives(ctx: CanvasRenderingContext2D, lives: number): void {
    const rightmostX = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width;
    const count = Math.min(lives, LIVES_ICON_SLOTS);
    for (let i = 0; i < count; i++) {
      drawSprite(ctx, LIFE_ICON_SPRITE, rightmostX - i * LIFE_ICON_STEP, LIVES_ZONE.y);
    }
  }
  ```

## 4. Тесты

Все — Vitest, environment `node`, без canvas (кроме `hud-render.test.ts` на
`canvas-test-utils`). Существующие тесты `player.test.ts`, `battle.test.ts`,
`collisions.test.ts` не меняются: трёх жизней хватает на каждый сценарий (максимум — два
`hit()`).

### 4.1. `src/game/player.test.ts` (изменить, новый `describe('Player lives')`)

Импорт `START_LIVES`. Сценарии:

- старт: `START_LIVES === 3`; `new Player().lives === START_LIVES`, `isLost === false`;
- конструктор принимает `lives`: `new Player(new Ship(), 5).lives === 5`;
- `it.each([0, -1, 1.5, NaN])` — `expect(() => new Player(new Ship(), v)).toThrow(RangeError)`;
- `hit()` из `active` списывает 1 в тот же вызов (`3 → 2`, без `update`);
- `hit()` в `down` (сразу после первого) и в `invulnerable` (после `DOWN_TICKS` обновлений)
  жизни не списывает;
- при `lives > 0` после `hit()` возрождение в тик `DOWN_TICKS` — как сейчас
  (`state === 'invulnerable'`, `lives` не меняется при возрождении);
- последняя жизнь: `new Player(new Ship(40), 1)`, `hit()` → `lives 0`, `isLost`;
  `run(player, DOWN_TICKS)` и далее `run(player, 1000, RIGHT_FIRE)` — `state === 'down'`,
  `canBeHit`/`canBeTargeted` false, `ship.x === 40` (не сброшен в `SHIP_START_X`, intent
  проигнорирован), `shot === null` (огонь проигнорирован), `stateTicks === DOWN_TICKS + 1000`;
- выстрел в полёте долетает у «потерянного» корабля: `lives 1`, `update(FIRE)`, `hit()`,
  выстрел движется (`y` убывает) и снимается за верхом экрана (`shot === null` после
  нужного числа тиков — по образцу существующего «keeps the shot on hit()…»).

### 4.2. `src/game/battle.test.ts` (изменить)

Импорт `GAME_OVER_DELAY_TICKS`, `START_LIVES`. Новый `describe('Battle lives and game over')`:

- **`opts.lives`:** `new Battle(rng).player.lives === START_LIVES`;
  `new Battle(rng, { lives: 1 }).player.lives === 1`; `{ lives: 0 }` бросает `RangeError`.
- **`over` ровно через `GAME_OVER_DELAY_TICKS`:** `ONE_CORNER_ENEMY`, `lives: 1`,
  `battle.player.hit()`; `run(battle, GAME_OVER_DELAY_TICKS - 1)` → `phase === 'playing'`,
  `player.state === 'down'`; `run(battle, 1)` → `phase === 'over'`, `phaseTicks === 0`.
- **Без последней жизни `over` не наступает:** `lives: 2`, `hit()`,
  `run(battle, GAME_OVER_DELAY_TICKS)` → `playing`, корабль `invulnerable`, `lives === 1`.
- **Таран последнего врага последним кораблём:** `ONE_CORNER_ENEMY`, `lives: 1`;
  `enemy.startDive(diveOrder())`; `enemy.x = ship.x + 2`, `enemy.y = SHIP_Y + 2` (запас на
  шаг отрыва этого тика, как в «Battle ram»); `battle.update` → `enemy.state === 'exploding'`,
  `player.isLost`. `run(battle, EXPLOSION_TICKS)` → `cleared`;
  `run(battle, GAME_OVER_DELAY_TICKS - EXPLOSION_TICKS - 1)` → ещё `cleared`;
  `run(battle, 1)` → `over`, `level === 1`. Запомнить `wave`; `run(battle, LEVEL_PAUSE_TICKS * 2)`
  → `phase === 'over'`, `level === 1`, `battle.wave` тот же экземпляр.
- **В `over` коллизий нет (поведенческий тест):** `ONE_CORNER_ENEMY`, `lives: 1`, `hit()`,
  `run(battle, GAME_OVER_DELAY_TICKS)` → `over`. Затем `enemy.startDive(diveOrder())`,
  наложить врага на корабль (как выше), `run(battle, 1)` → `enemy.isOut === true` (живой,
  не взорвался), `phase === 'over'`, `player.lives === 0`. Ограничение наблюдаемости
  (из analyze.md): в `over` корабль `down` (`canBeHit = false`), а выстрела игрока нет, так
  что через публичный API выключенные коллизии от включённых не отличить; тест фиксирует
  наблюдаемое поведение, API ради него не расширяется.
- **В `over` волна живёт:** после входа в `over` `formation.offset` меняется после
  `run(battle, 1)`.
- **Семантика `phaseTicks`:**
  - `new Battle(rng, { levels: TWO_LEVELS }).phaseTicks === 0`; `run(battle, 5)` → 5;
  - убить врага, `run(battle, EXPLOSION_TICKS)` → `cleared`, `phaseTicks === 0`;
    `run(battle, 1)` → 1;
  - `run(battle, LEVEL_PAUSE_TICKS - 1)` → `playing`, `level === 2`, `phaseTicks === 0`;
    `run(battle, 3)` → 3 (в `playing` считает с 0 после смены уровня);
  - в `over`: после перехода `phaseTicks === 0`, после `run(battle, 3)` → 3.

### 4.3. `src/game/hud.test.ts` (изменить)

- Убрать импорт `PLACEHOLDER_LIVES`; импортировать `START_LIVES` из `./player`.
- `it.each([1, 3])` — ожидать `lives: START_LIVES` вместо `PLACEHOLDER_LIVES`; переименовать
  в «shows the battle level %i, the placeholder score and the player's lives».
- Новый тест: после `battle.player.hit()` — `hudView(battle).lives === START_LIVES - 1`;
  с `{ lives: 5 }` — `5`.
- Тест «uses score 0 and 3 lives as placeholders» → «uses score 0 as a placeholder»
  (только `PLACEHOLDER_SCORE`).

### 4.4. `src/game/hud-render.test.ts` (изменить)

- Новый тест: «draws at most LIVES_ICON_SLOTS icons» —
  `expect(draw({ ...BASE, lives: LIVES_ICON_SLOTS + 2 })).toEqual(draw({ ...BASE, lives: LIVES_ICON_SLOTS }))`
  (вывод целиком совпадает: лишние иконки не рисуются ни внутри, ни вне `LIVES_ZONE`).
  Случай `0` уже покрыт `it.each([0, 1, 3, LIVES_ICON_SLOTS])`.

## 5. Ручная проверка

`npm run dev`, обычная игра (промежуточное состояние, без `acceptance.md`):

- в верхней панели 3 иконки; при гибели (выстрел или таран) иконка пропадает в момент
  взрыва;
- после 1-й и 2-й гибели корабль возрождается по центру и мигает, как раньше;
- после 3-й гибели иконок нет, корабль больше не появляется; враги продолжают летать и
  пикировать без цели; ошибок в консоли нет. Надписи `GAME OVER` нет — ожидаемо (021).

## 6. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` (на русском)

- «Экран» (стр. 19-21): жизни настоящие; заглушка — только счёт (0) до фичи очков.
- «Поражение игрока» (стр. 45-47): каждая гибель списывает жизнь в тик попадания; пока
  жизни есть — возрождение как раньше; после последней корабль не возвращается, через 1 с
  бой переходит в конец игры (враги летают дальше; надпись — задача 021). Ссылка на фичу
  005, В3/В4.
- «Жизни» (стр. 55): старт — 3, общее число, включая корабль на поле (решено, фича 005,
  В4); доп. жизнь за очки и предел — фича 005, задача 023; рекорд — позже (В5).

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `player.ts` (стр. ~67-85): `START_LIVES = 3`, конструктор `Player(ship?, lives?)`
  (`RangeError` на нецелом и < 1), геттеры `lives`, `isLost`; `hit()` списывает жизнь;
  `down → invulnerable` только при `lives > 0`, иначе корабль остаётся `down` навсегда.
- `battle.ts` (стр. ~215-223): `BattleOptions { startLevel?, levels?, lives? }`; `player`
  создаётся в конструкторе; `BattlePhase` + `'over'`; `GAME_OVER_DELAY_TICKS = DOWN_TICKS`;
  порядок проверок фаз (`over` первой); `over` — терминальная, коллизий нет, волна
  обновляется; публичный `phaseTicks` — общий счётчик всех фаз (0 после `update` перехода,
  +1 за каждый следующий).
- `hud.ts` (стр. ~235-243): `hudView` берёт `battle.player.lives`; заглушка — только
  `PLACEHOLDER_SCORE`.
- `hud-render.ts` (стр. ~245-247): `drawLives` рисует не больше `LIVES_ICON_SLOTS` иконок.

`README.md` в `src/` нет; корневой `README.md` жизни не описывает — не меняется.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/player.ts`                    |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/hud.ts`                       |
| Изменить | `src/game/hud-render.ts`                |
| Изменить | `src/game/player.test.ts`               |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/hud.test.ts`                  |
| Изменить | `src/game/hud-render.test.ts`           |
| Изменить | `second-brain/game-design.md`           |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `collisions.ts`, `battle-render.ts`, `scenes/*`, `test-levels.ts`, `src/engine/`.

Проверки: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

## Архитектура и паттерны

- Логика без canvas: жизни — в автомате `Player` (ресурс возрождения принадлежит тому,
  кто возрождает), фаза конца игры — в `Battle`; рендер не меняется («потерянный» корабль
  — обычный `down`, `drawShip` после `EXPLOSION_TICKS` ничего не рисует).
- Детерминизм: все тайминги — в тиках (`GAME_OVER_DELAY_TICKS`, `stateTicks`,
  `phaseTicks`); `Rng` не затрагивается, создание `Player` в конструкторе не меняет
  порядок вызовов генератора.
- Правило тиков как у `Player`/`Enemy`: вход в состояние/фазу ставит счётчик 0, каждый
  `update` сначала считает тик, потом проверяет переходы (`enterPhase` — по образцу
  `Player.enter`).
- `import type` для `PlayerIntent`/`Rng`/`LevelConfig`; `START_LIVES`, `DOWN_TICKS` —
  значения, обычный импорт. Граница engine/game не затрагивается.
- Без заделов под задачу 023: нет `addLife`, `MAX_LIVES`, верхней границы в конструкторе.

## Открытые вопросы

Нет (в `analyze.md` открытых вопросов нет; решения В3, В4 и по `phaseTicks` закрыты в
`design.md` / `discussion.md`).

## Ссылки

- `second-brain/tasks/tasks/020-lives-and-game-over-logic/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/005-lives-score-game-over/design.md` («Сущности и состояния»,
  «Фазы `Battle`», «Интерфейсы», «Тестирование», нарезка п. 1), `discussion.md`
- `second-brain/game-design.md`, `second-brain/architecture/overview.md`

# План реализации: Специальные враги raider

С 4-го уровня в верхнем ряду строя стоят группы `raider` по 2–3 (`R` в раскладке). Группа
вылетает целиком одним вылетом (один `sortieId`, общий `side`), каждый член целится в
X корабля со своим сдвигом по слоту (`aimOffsetX`). Якорь цели зажимается по размаху
группы (`groupMinOffsetX`/`groupMaxOffsetX`), поэтому у края экрана строй сдвигается
целиком и не сжимается. Члены стреляют `raiderShots` раз за вылет. Плюс уровни 4–5 в
`LEVELS` и решения владельца по фиче 002 в `game-design.md`.

Рамка — согласованный `design.md` фичи 002 («Интерфейсы», «Точные правила»: `side`
группы, лидер и `aimOffsetX`, «Цель `fixed` группы»; таблица `LEVELS`) и ответы
архитектора в `discussion.md` («Реализация: задача 013-raiders»). Отступлений от дизайна
нет.

Базовая линия: `npm test` — 345 тестов зелёные, `typecheck` чистый.

Порядок шагов ниже выбран так, чтобы `tsc` ломался как можно меньше раз: сначала типы
и данные (шаги 1–4), потом поведение (5–6), потом тесты (7–11).

## 1. Вид `raider`, символ `R`, группы в `parseLayout`, поле `raiderShots`

**Файл (изменить):** `src/game/levels.ts`

- `EnemyKind` — `'drone' | 'striker' | 'raider'`; убрать комментарий «arrives in task 013».
- `LayoutChar` — `'D' | 'S' | 'R' | '.'`; комментарий: `'R' raider`.
- `LevelConfig`:
  - комментарий `layout` — `'D' drone, 'S' striker, 'R' raider, '.' empty`;
  - комментарий `maxSorties` — дописать «a raider group is one sortie»;
  - новое обязательное поле `raiderShots` (после `diverShots`).
  - Doc-комментарий интерфейса «More fields arrive with later tasks» — убрать (полей
    больше не будет).
- `Slot` — новое обязательное поле `group: number | null`.
- `KIND_BY_CHAR` — `R: 'raider'` (без него `tsc` упадёт: `Record` исчерпывающий).
- `parseLayout` — нумерация групп: новая серия начинается на `R`, если предыдущий символ
  строки не `R` (в т. ч. `col = 0`, где `line[col - 1] === undefined`); счётчик сквозной
  по раскладке (row-major). Проверки ошибок не меняются.

```typescript
/** Enemy kinds. */
export type EnemyKind = 'drone' | 'striker' | 'raider';
/** Layout chars: 'D' drone, 'S' striker, 'R' raider, '.' empty cell. */
export type LayoutChar = 'D' | 'S' | 'R' | '.';

export interface LevelConfig {
  /** Rows top to bottom; 'D' drone, 'S' striker, 'R' raider, '.' empty. */
  readonly layout: readonly string[];
  // ...
  /** Max sorties out of the formation at the same time (a raider group is one sortie). */
  readonly maxSorties: number;
  /** Shots per dive for drone/striker, whole number >= 0; 0 = they do not shoot. */
  readonly diverShots: number;
  /** Shots per dive for each raider, whole number >= 0; > 0 when the layout has 'R'. */
  readonly raiderShots: number;
}

export interface Slot {
  readonly row: number;
  readonly col: number;
  readonly kind: EnemyKind;
  /** Raider group: id of an unbroken run of 'R' in a row, counted across the layout; null for others. */
  readonly group: number | null;
}

const EMPTY: LayoutChar = '.';
const RAIDER: LayoutChar = 'R';
const KIND_BY_CHAR: Readonly<Record<Exclude<LayoutChar, '.'>, EnemyKind>> = {
  D: 'drone',
  S: 'striker',
  R: 'raider',
};

// parseLayout, inside:
const slots: Slot[] = [];
let groups = 0;
layout.forEach((line, row) => {
  // ... length check as now
  [...line].forEach((ch, col) => {
    // ... EMPTY / kind lookup / unknown char as now
    // A run of 'R' is one group; a new run starts after any other char or at the row start.
    const group = kind === 'raider' ? (line[col - 1] === RAIDER ? groups - 1 : groups++) : null;
    slots.push({ row, col, kind, group });
  });
});
```

Doc-комментарий `parseLayout` дополнить строкой: «Slots of an unbroken run of 'R' in a
row share a group id (0, 1, … in row-major order); others get null.» Правила таблицы
(`R` только в верхнем ряду, группа 2–3) — не парсера, а теста `LEVELS` (дизайн,
«Альтернативы»).

## 2. Уровни 4–5 и `raiderShots` в `LEVELS`

**Файл (изменить):** `src/game/levels.ts`

`raiderShots: 0` в уровнях 1–3; добавить уровни 4–5 ровно по таблице «Таблица `LEVELS` —
точные строки» дизайна:

```typescript
  {
    layout: ['..RR..RR..', '.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 120,
    firstDiveDelayTicks: 120,
    diveIntervalTicks: 90,
    maxSorties: 3,
    diverShots: 2,
    raiderShots: 2,
  },
  {
    layout: ['.RRR..RRR.', '.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 180,
    firstDiveDelayTicks: 90,
    diveIntervalTicks: 60,
    maxSorties: 3,
    diverShots: 2,
    raiderShots: 3,
  },
```

Слотов: уровень 4 — 4 + 8 + 10 + 10 = 32, уровень 5 — 6 + 8 + 20 = 34.

## 3. Спрайт `RAIDER_SPRITE`

**Файл (изменить):** `src/game/enemy-art.ts`

Оригинальный спрайт; ограничения — нечётная ширина ≤ 13, высота 4…10 (≥ 8 не меняет
минимум в инварианте туннелирования), цвета не совпадают с `drone` (зелёный/бирюза),
`striker` (синий/пурпурный), `ENEMY_SHOT_COLOR` (`#ff5fd2`) и корпусом корабля
(`#ffd36b`/`#b884ff`). Стартовое предложение — 13×9, «крылатый налётчик»: серебристый
корпус, красные крылья-клешни, жёлтые глаза. Вид утверждает владелец глазами.

```typescript
/** Raider, 13×9: silver hull with red claw-like wings. Top row, flies out in groups of 2-3. */
export const RAIDER_SPRITE: Sprite = parseSprite(
  [
    '..R.......R..',
    '.RR..CCC..RR.',
    'RRR.CCCCC.RRR',
    'RRRCCYCYCCRRR',
    '.RRCCCCCCCRR.',
    '..RRCCCCCRR..',
    '....RCCCR....',
    '.....R.R.....',
    '....R...R....',
  ],
  {
    C: '#c8d0e8', // hull
    R: '#e8383c', // wings
    Y: '#ffe14f', // eyes
  },
);
```

Высота 9 (не новый минимум — у `drone` 8), ширина 13 (как `striker`): `ENEMY_KINDS
sprites` и инвариант туннелирования проходят автоматически.

## 4. `ENEMY_KINDS.raider` и новые поля `DiveOrder`

**Файл (изменить):** `src/game/enemy.ts`

- Импорт `RAIDER_SPRITE` из `./enemy-art`.
- `ENEMY_KINDS.raider = { sprite: RAIDER_SPRITE, aim: 'fixed' }`.
- `DiveOrder` — три обязательных поля (убрать «`aimOffsetX` comes in task 013»):

```typescript
export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  drone: { sprite: DRONE_SPRITE, aim: 'fixed' },
  striker: { sprite: STRIKER_SPRITE, aim: 'track' },
  raider: { sprite: RAIDER_SPRITE, aim: 'fixed' },
};

/**
 * Who launches a dive, which way it peels off, how many shots it may fire and, for a raider
 * group, where it aims relative to the ship. A solo dive has all three offsets at 0.
 */
export interface DiveOrder {
  readonly sortieId: number;
  readonly side: -1 | 1;
  /** Shots for this dive, whole number >= 0. */
  readonly shots: number;
  /** X offset of this member's target from the group's anchor, px; 0 for solo dives. */
  readonly aimOffsetX: number;
  /** Min aimOffsetX over the sortie's members (<= 0); 0 for solo dives. */
  readonly groupMinOffsetX: number;
  /** Max aimOffsetX over the sortie's members (>= 0); 0 for solo dives. */
  readonly groupMaxOffsetX: number;
}
```

После этого шага `tsc` падает на всех литералах `startDive({ … })` и `Slot` в тестах и на
приказе в `selectSortie` — чинится в шагах 6–8.

## 5. Цель `fixed` со сдвигом и якорем по размаху группы

**Файл (изменить):** `src/game/enemy.ts`

- Приватные поля `aimOffsetX`, `groupMinOffsetX`, `groupMaxOffsetX` (по умолчанию 0);
  `startDive` копирует их из приказа (как `shotsLeft`), `fixedAimX = null` — как сейчас.
- В первом тике `descend` вместо `this.fixedAimX = env.targetX` —
  `this.fixedAimX = this.fixedAim(env.targetX)`.
- Формула — «Точные правила», «Цель `fixed` группы»: `half = Math.floor(width / 2)`,
  `lo = half - groupMinOffsetX`, `hi = SCREEN_WIDTH - width + half - groupMaxOffsetX`,
  `anchor = clamp(targetX, lo, hi)`, `fixedAimX = anchor + aimOffsetX`; `null` → `null`.
  `track` (`striker`) по-прежнему берёт `env.targetX` и поля группы не читает.
- Зажим X позиции в `descend` остаётся (страховка).

```typescript
  private aimOffsetX = 0;
  private groupMinOffsetX = 0;
  private groupMaxOffsetX = 0;

  startDive(order: DiveOrder): void {
    if (this.currentState !== 'formation') return;
    this.currentSortieId = order.sortieId;
    this.side = order.side;
    this.shotsLeft = order.shots;
    this.aimOffsetX = order.aimOffsetX;
    this.groupMinOffsetX = order.groupMinOffsetX;
    this.groupMaxOffsetX = order.groupMaxOffsetX;
    this.fixedAimX = null;
    this.enter('diving');
  }

  // updateDiving, descend branch:
      if (this.ticksInState === PEEL_TICKS + 1) this.fixedAimX = this.fixedAim(env.targetX);

  /**
   * 'fixed' target for this descend: the ship's center X as the group's anchor, clamped so that
   * every member's target (anchor + its aimOffsetX) keeps its sprite on screen, plus this
   * member's offset. The whole group shifts together near an edge instead of squeezing.
   * A solo diver (offsets 0) is never clamped by it: the ship's center stays in [lo, hi].
   */
  private fixedAim(targetX: number | null): number | null {
    if (targetX === null) return null;
    const half = Math.floor(this.width / 2);
    const lo = half - this.groupMinOffsetX;
    const hi = SCREEN_WIDTH - this.width + half - this.groupMaxOffsetX;
    return clamp(targetX, lo, hi) + this.aimOffsetX;
  }
```

Doc-комментарий класса `Enemy` и `updateDiving`: «fixed: anchor + aimOffsetX, taken on tick
PEEL_TICKS + 1 (see fixedAim())». Комментарий поля `fixedAimX` — «target taken on the
first 'descend' tick (anchor + aimOffsetX)».

Проверено, что поведение одиночки не меняется: с `0/0` у `drone` (ширина 11) `[lo, hi] =
[5, 250]`, у `raider` (13) — `[6, 249]`; центр корабля в игре — `[7, 248]`. Существующие
тесты `enemy.test.ts` с `drone` и цели вне `[5, 250]` в первом тике `descend` не
используют (`aimAt(0)` — только в `peel`, после `null` или у `striker`).

## 6. Групповые кандидаты в `selectSortie`

**Файл (изменить):** `src/game/attack-director.ts`

- Импорт `CELL_WIDTH` из `./formation` (новая связь `attack-director → formation`, без
  циклов: `formation` импортирует только `config`).
- `Candidate` становится общим для одиночки и группы:

```typescript
interface Candidate {
  readonly row: number;
  /** Leftmost column of the candidate: the order key within a row. */
  readonly col: number;
  /** Ordered by column, left to right. A solo candidate has one member. */
  readonly members: readonly Enemy[];
  readonly side: -1 | 1;
  readonly shots: number;
}
```

- `edgeCandidates(enemies, cols, shots)` — как сейчас, но пропускает `raider`
  (`enemy.slot.group !== null` — у них свои групповые кандидаты) и возвращает
  `{ row, col: enemy.slot.col, members: [enemy], side, shots }`; `shots =
config.diverShots`.
- `groupCandidates(enemies, cols, shots)` — `shots = config.raiderShots`:

```typescript
/**
 * One candidate per raider group whose alive members are all in 'formation' (a group flies
 * out whole or not at all). Exploding/dead members are left out; a group with no alive
 * members gives nothing. side - by the center of the alive members (exact middle -> right).
 */
function groupCandidates(enemies: readonly Enemy[], cols: number, shots: number): Candidate[] {
  const groups = new Map<number, Enemy[]>();
  for (const enemy of enemies) {
    const { group } = enemy.slot;
    if (group === null || !enemy.isAlive) continue;
    const members = groups.get(group);
    if (members) members.push(enemy);
    else groups.set(group, [enemy]);
  }
  const candidates: Candidate[] = [];
  for (const members of groups.values()) {
    if (members.some((m) => m.state !== 'formation')) continue;
    members.sort((a, b) => a.slot.col - b.slot.col);
    const first = members[0]!.slot.col;
    const last = members[members.length - 1]!.slot.col;
    candidates.push({
      row: members[0]!.slot.row,
      col: first,
      members,
      side: first + last + 1 < cols ? -1 : 1,
      shots,
    });
  }
  return candidates;
}
```

- `selectSortie`: кандидаты = крайние + группы, отсортированные по `(row, col)` — «по
  рядам сверху вниз, внутри ряда по левому столбцу кандидата» (кандидаты ряда не
  пересекаются по столбцам, ничьих нет; порядок крайних в ряду «левый, затем правый»
  сохраняется). Приказы строятся одинаково для одиночки и группы: лидер — самый внешний
  член в сторону `side`; у одиночки он сам, поэтому все сдвиги 0.

```typescript
export function selectSortie(
  enemies: readonly Enemy[],
  cols: number,
  config: LevelConfig,
  sortieId: number,
  rng: Rng,
): Sortie | null {
  const candidates = [
    ...edgeCandidates(enemies, cols, config.diverShots),
    ...groupCandidates(enemies, cols, config.raiderShots),
  ].sort((a, b) => a.row - b.row || a.col - b.col);
  if (candidates.length === 0) return null;
  const pick = candidates[randomInt(rng, 0, candidates.length)]!;
  return { members: pick.members, orders: ordersFor(pick, sortieId) };
}

/**
 * Orders of a candidate's members. The leader is the outermost member towards side
 * (its own offset is 0); every member aims at the anchor + (its col - leader col) * CELL_WIDTH.
 */
function ordersFor({ members, side, shots }: Candidate, sortieId: number): DiveOrder[] {
  const leader = side === -1 ? members[0]! : members[members.length - 1]!;
  const offsets = members.map((m) => (m.slot.col - leader.slot.col) * CELL_WIDTH);
  const groupMinOffsetX = Math.min(...offsets);
  const groupMaxOffsetX = Math.max(...offsets);
  return offsets.map((aimOffsetX) => ({
    sortieId,
    side,
    shots,
    aimOffsetX,
    groupMinOffsetX,
    groupMaxOffsetX,
  }));
}
```

`DiveOrder` теперь нужен как тип в теле — он уже в `import type`. `rng` не вызывается,
если кандидатов нет (порядок проверок прежний). Doc-комментарий `selectSortie` — убрать
«Raider groups - task 013», описать групповых кандидатов, порядок `(row, левый столбец)`,
`shots` по виду (`diverShots`/`raiderShots`), сдвиги. Комментарий `Sortie` — «members are
ordered by column; members[i] gets orders[i]». `AttackDirector.update` не меняется: он уже
раздаёт `startDive` всем участникам, лимит считает различные `sortieId`.

## 7. Тестовые данные: `raiderShots` и хелпер приказа

**Файл (изменить):** `src/game/test-levels.ts`

- `PASSIVE` — `raiderShots: 0`; комментарий «fields added by tasks 007-013» уже верный.
- Общий хелпер приказа (ответ архитектора, п. 2в):

```typescript
import type { DiveOrder } from './enemy';

/** A solo dive order with zero defaults; `overrides` set single fields for a test. */
export function diveOrder(overrides: Partial<DiveOrder> = {}): DiveOrder {
  return {
    sortieId: 1,
    side: 1,
    shots: 0,
    aimOffsetX: 0,
    groupMinOffsetX: 0,
    groupMaxOffsetX: 0,
    ...overrides,
  };
}
```

Механическая замена во всех тестах: `startDive({ sortieId: 7, side: 1, shots: 0 })` →
`startDive(diveOrder({ sortieId: 7 }))` (поля, равные умолчанию, можно опускать; явные
значения не из умолчаний — оставить). Места: `enemy.test.ts` (24), `collisions.test.ts`
(5), `attack-director.test.ts` (2 вызова `startDive`), `wave.test.ts` (3),
`battle.test.ts` (2), `battle-render.test.ts` (1). Поведение этих тестов не меняется.
Тесты, сверяющие точные приказы `selectSortie`, пишут объекты полностью (без хелпера).

## 8. Тесты `levels`

**Файл (изменить):** `src/game/levels.test.ts` (Vitest, environment `node`)

- «parses kinds, skips empty cells…» — `group: null` в ожидаемых слотах.
- Из `it.each('throws on %s')` убрать кейс `'raider char before task 013'` (`X` остаётся).
- Новые тесты `parseLayout`:
  - `['RR.RR']` → `kind: 'raider'`, `group` 0, 0, 1, 1;
  - `['DRRD']` → `null, 0, 0, null` (серия рвётся любым другим символом, `D`/`S` — `null`);
  - `['R.R', '.RR']` → 0, 1, 2, 2 (нумерация сквозная row-major; серии в разных строках —
    разные группы);
  - `['RR', 'RR']` → 0, 0, 1, 1 (серия не переходит через конец строки).
- Новый `it.each(LEVELS…)('level %i raider rules')`:

```typescript
expect(Number.isInteger(config.raiderShots)).toBe(true);
expect(config.raiderShots).toBeGreaterThanOrEqual(0);
const raiders = parseLayout(config.layout).slots.filter((s) => s.kind === 'raider');
if (raiders.length > 0) expect(config.raiderShots).toBeGreaterThan(0);
const sizes = new Map<number | null, number>();
for (const s of raiders) {
  expect(s.row).toBe(0);
  sizes.set(s.group, (sizes.get(s.group) ?? 0) + 1);
}
for (const size of sizes.values()) {
  expect(size).toBeGreaterThanOrEqual(2);
  expect(size).toBeLessThanOrEqual(3);
}
```

- «has the agreed rows» — `toHaveLength(5)`, все 5 строк с `raiderShots` (1–3 — 0), счёт
  слотов: уровень 4 — 32, уровень 5 — 34; группы уровня 4 — cols 2–3 и 6–7, уровня 5 —
  1–3 и 6–8.
- Остальные инварианты (`isAllowedSpeed`, туннелирование по `Object.values(ENEMY_KINDS)`,
  выстрел быстрее пике, `swaySpeed < STEER_SPEED`) подхватят уровни 4–5 и `raider` сами:
  `180 / 60 = 3` px/тик, `4 + 3 = 7 < 4 + 8`, `240 > 180`, `30 < 60`.

## 9. Тесты `enemy`

**Файл (изменить):** `src/game/enemy.test.ts`

- `group: null` в 5 литералах `Slot` (строки ~23, 36, 46, 75, 79 — включая
  `newEnemy`/`newEnemyOf`).
- «%s starts in its slot» — добавить `'raider'` в список видов.
- «drone and striker look different» → «enemy kinds look different»: три спрайта
  попарно различаются по `pixels` (импорт `RAIDER_SPRITE`).
- «drone aims once, striker tracks» — плюс `ENEMY_KINDS.raider.aim === 'fixed'`.
- `KINDS` в `Enemy fire` и список в «%s peel does not depend on the target» — добавить
  `'raider'` (дешёво: те же сценарии).
- `startDive` — через `diveOrder(...)` (шаг 7).
- Новый `describe('Enemy group aim')`. Хелпер — члены группы одного вида в одном ряду
  общей `Formation(10, 1, 15)`, стартуют в одном тике:

```typescript
/** Raiders at the given columns of row 0, sharing one formation, all launched on one tick. */
function launchGroup(cols: readonly number[], side: -1 | 1): Enemy[] {
  const formation = new Formation(10, 1, 15);
  const leader = side === -1 ? cols[0]! : cols[cols.length - 1]!;
  const offsets = cols.map((c) => (c - leader) * CELL_WIDTH);
  const groupMinOffsetX = Math.min(...offsets);
  const groupMaxOffsetX = Math.max(...offsets);
  return cols.map((col, i) => {
    const e = new Enemy({ row: 0, col, kind: 'raider', group: 0 }, formation);
    e.startDive(diveOrder({ side, aimOffsetX: offsets[i]!, groupMinOffsetX, groupMaxOffsetX }));
    return e;
  });
}
```

Сценарии (каждый тик — `step` каждого члена с одним `env`; цель берётся в тике `P + 1`):

- **у правого края** — `launchGroup([1, 2, 3], -1)` (сдвиги 0/16/32), `targetX = 248`:
  `hi = SCREEN_WIDTH - w + floor(w/2) - 32`; гоним до ухода за низ; на каждом тике
  `descend` разница `x` соседних членов ровно `CELL_WIDTH`, все `x` в `[0, SCREEN_WIDTH -
w]`; на последнем тике `descend` центры равны `[hi, hi + 16, hi + 32]` (дистанции
  хватает: ~160 px по X при ~200 тиках `descend` на 60 px/с). Крайний правый член —
  точно `SCREEN_WIDTH - w` (над кораблём у края).
- **у левого края** — `launchGroup([6, 7, 8], 1)` (сдвиги −32/−16/0), `targetX = 7`:
  `lo = floor(w/2) + 32`; центры в конце `[lo - 32, lo - 16, lo]`, крайний левый `x = 0`;
  разница `x` сохраняется.
- **без зажима** — та же группа `[1, 2, 3], -1`, `targetX = 100`: центры стремятся к
  `100 / 116 / 132` (сдвиг без якоря).
- **`null` в тике `P + 1`** — `vx = 0` у всех членов весь `descend`, независимо от
  сдвигов (как у одиночки), даже если дальше `targetX` есть.
- **`track` не читает сдвиги** — `striker` с `diveOrder({ aimOffsetX: 32,
groupMinOffsetX: 0, groupMaxOffsetX: 32 })` и `afterPeel`-подобным стартом ведёт себя
  так же, как без них (сравнить `x` по тикам двух страйкеров при одном `targetX`).
- **новый вылет** — сдвиги прошлого приказа не переносятся: после возврата в строй
  `startDive(diveOrder())` целится ровно в `targetX` (можно на одиночном `raider`).

## 10. Тесты `attack-director`

**Файл (изменить):** `src/game/attack-director.test.ts`

- Точные приказы в существующих тестах («builds a one-member sortie», «puts the level's
  diverShots…») — дописать `aimOffsetX: 0, groupMinOffsetX: 0, groupMaxOffsetX: 0`.
- `startDive` — через `diveOrder(...)`.
- `CONFIG` для групп — `passiveLevel(['DD'], { diverShots: 1, raiderShots: 2 })`, чтобы
  проверять, что `shots` берётся по виду.
- Новые сценарии `selectSortie` (на волнах `enemiesOf(layout)`, rng `fixed(v)`):
  - **группа целиком:** `['.RRR..RRR.']` — 2 кандидата; `fixed(0)` → левая группа
    (`members` — cols 1, 2, 3 по порядку), все приказы `{ sortieId: 42, side: -1, shots: 2,
aimOffsetX: 0 | 16 | 32, groupMinOffsetX: 0, groupMaxOffsetX: 32 }`; `fixed(0.75)` →
    правая (cols 6, 7, 8; `side: 1`, сдвиги −32/−16/0, min −32, max 0). Сравнение
    `orders` — целыми объектами.
  - **`side` группы по центру:** `['RR.']` → −1, `['.RR']` → +1, `['RR']` (ровно посередине)
    → +1.
  - **`raider` не в крайних, порядок по левому столбцу:** `['RRD']` — ровно 2 кандидата:
    `fixed(0.25)` → группа (cols 0, 1; `side -1`; `shots 2`), `fixed(0.75)` → `D` col 2
    (одиночка ряда, `side +1`, `shots 1`, сдвиги 0). `['DRRD']` — 3 кандидата по порядку:
    `D0 (−1)`, группа `1–2 (+1)`, `D3 (+1)`. `['RR', 'DD']` — группа первой (ряд 0).
  - **член группы в полёте:** `['RRR']`, один член `startDive(diveOrder())` → группы нет;
    кандидатов нет → `null` и `rng` не вызывается (`counting()`).
  - **член убит:** `['RRR']`, `kill()` у col 2 → вылет cols 0, 1; `side` по живым
    `0 + 1 + 1 < 3` → −1; сдвиги 0/16, min 0, max 16. `kill()` у col 0 и col 2 (один
    выживший col 1) → вылет из одного, `side +1`, сдвиги 0/0/0, `shots = raiderShots`.
    Взрывающиеся (`exploding`) и `dead` — одинаково (`explodeToDeath`).
  - **вся группа мертва:** `['RR', 'D.']`, обе `R` убиты → единственный кандидат — `D`.
- Новый сценарий `AttackDirector`: **группа — один вылет в лимите.** `director(['RRR',
'DDD'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 1 })`, rng
  `fixed(0)` → на первом тике в полёте 3 врага с одним `sortieId`; ещё 5 тиков — новых
  вылетов нет (`out` = 3); убить одного члена — всё ещё нет (2 в полёте, тот же
  `sortieId`); убить остальных → следующий тик запускает новый вылет.
- Существующие «lists row edges…», «sends a lone enemy…», детерминизм по seed — без
  изменений (раскладки без `R`).

## 11. Тест волны: группа держит строй и даёт залп

**Файл (изменить):** `src/game/wave.test.ts`

Связка «директор → враги → выстрелы» без глаз (критерий «группы вылетают вместе,
держат строй и стреляют»):

- `new Wave(passiveLevel(['RRR'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1_000_000,
maxSorties: 1, raiderShots: 1 }), createRng(1))`, `update(TICK_SECONDS, 7)` (корабль у
  левого края) до ухода всех за низ;
- все три члена вылетают в одном тике (одинаковый `sortieId`);
- в тике первого выстрела `wave.shots` растёт с 0 до 3 сразу (залп);
- пока все `diving`, разница `x` соседних членов ровно `CELL_WIDTH` (группа `side +1`,
  сдвиги −32/−16/0 — якорь зажат слева, строй не сжимается).

## 12. Ручная проверка

`npm run dev`, затем:

- `?level=4` — сверху две пары `raider`; пары вылетают целиком в одном тике в свою
  сторону (левая — влево, правая — вправо), летят «звеном», не сливаясь, дают залп из 2
  выстрелов по 2 раза; ушедшие за низ возвращаются каждый в свой слот.
- Встать у правого и у левого края — группа сдвигается целиком, крайний член над
  кораблём, спрайты не накладываются, выстрелы идут разными столбцами.
- `?level=5` — тройки, пике быстрее (3 px/тик); отметить, не «дырявые» ли залпы из-за
  `MAX_ENEMY_SHOTS = 4` (подстройка — после просмотра владельцем, в задаче не трогаем).
- Пройти 1 → 5 подряд: заметный рост сложности; после 5-го повторяется 5-й.
- **Владелец утверждает спрайт `raider`** (цвет, силуэт, отличие от `drone`/`striker`,
  читаемость взрыва поверх красных крыльев).

## 13. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `levels.ts`: `EnemyKind` (`drone | striker | raider`), `LayoutChar` (`D`, `S`, `R`, `.`),
  `LevelConfig` + `raiderShots` (выстрелов за вылет у каждого `raider`, 0 у уровней 1–3),
  `Slot { row, col, kind, group }` (номер серии `R` в строке, сквозной row-major; у
  остальных `null`), `LEVELS` — пять уровней (дописать 4 и 5), убрать «`R` — до 013» из
  ошибок `parseLayout`.
- `enemy-art.ts`: `RAIDER_SPRITE` 13×9 (серебристый с красным; стартовый, утверждает
  владелец).
- `enemy.ts`: `ENEMY_KINDS.raider` — `fixed`; `DiveOrder { sortieId, side, shots,
aimOffsetX, groupMinOffsetX, groupMaxOffsetX }`; цель `fixed` — якорь (центр корабля,
  зажатый в `[floor(w/2) - min, SCREEN_WIDTH - w + floor(w/2) - max]`) + `aimOffsetX`.
- `attack-director.ts`: групповые кандидаты (целиком, если все живые в строю; `side` по
  центру живых; лидер — крайний в сторону `side`; сдвиги `(col - leader.col) *
CELL_WIDTH`; `shots = raiderShots`), `raider` не в крайних, порядок `(ряд, левый
столбец)`, `Sortie` — несколько участников по столбцам.
- `test-levels.ts`: `raiderShots = 0` в пассивных значениях; `diveOrder(overrides?)`.
- Граф импортов: `attack-director → {engine/rng, formation}`; `test-levels`
  (`LevelConfig`, `DiveOrder` — type).

**Файл (изменить):** `second-brain/game-design.md` (на русском) — решения владельца по
фиче 002 (список — `analyze.md`, «`game-design.md` — что внести»):

- пункт «Строй врагов» → решено (фича 002): ячейка 16 × 12, до 11 столбцов (уровни — 10),
  верх на y = 32, покачивание ±16 px, появляется сразу без влёта; виды по рядам: `drone`
  внизу, `striker` в середине, `raider` в верхнем ряду (В3, В9);
- пункт «Пикирование» → решено: вылетают крайние враги любого ряда по дуге наружу;
  `drone` — в точку, где был корабль, `striker` — преследует 1 px/тик, `raider` — группой
  2–3 в точку со своим сдвигом, у края экрана группа сдвигается целиком; уход за низ →
  возврат сверху в свой слот (В3, В4). «Командир с эскортом» — остаётся в плане
  отдельной фразой (`raider` — не то же самое);
- новый пункт «Вражеские выстрелы» (В2): 1 × 4, свой цвет, 240 px/с, не больше 4 на
  экране, интервал 20 тиков, выстрелов за вылет — по таблице уровня;
- новый пункт «Поражение игрока» (В5, В6): выстрел или таран (при таране гибнут оба), 1 с
  без корабля, затем 2 с мигания с неуязвимостью, уровень не перезапускается;
- пункт «Волны» → «Уровни» (В1, В7, В8): таблица `LEVELS` (5 уровней; рост: скорость →
  стрельба → группы `raider`), после конца таблицы повторяется последний, пауза 1,5 с без
  надписи;
- пункты «Очки», «Жизни», «Меню», HUD — не трогать (не решены фичей 002).

`README.md` в `src/game/` нет — не создаём. Запись фичи в `second-brain/features/` не
трогаем.

## Сводка по файлам

| Действие  | Файл                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| Изменить  | `src/game/levels.ts`                                                                        |
| Изменить  | `src/game/enemy-art.ts`                                                                     |
| Изменить  | `src/game/enemy.ts`                                                                         |
| Изменить  | `src/game/attack-director.ts`                                                               |
| Изменить  | `src/game/test-levels.ts`                                                                   |
| Изменить  | `src/game/levels.test.ts`                                                                   |
| Изменить  | `src/game/enemy.test.ts`                                                                    |
| Изменить  | `src/game/attack-director.test.ts`                                                          |
| Изменить  | `src/game/wave.test.ts`                                                                     |
| Изменить  | `src/game/collisions.test.ts` (только `diveOrder`)                                          |
| Изменить  | `src/game/battle.test.ts` (только `diveOrder`)                                              |
| Изменить  | `src/game/battle-render.test.ts` (только `diveOrder`)                                       |
| Изменить  | `second-brain/architecture/overview.md`                                                     |
| Изменить  | `second-brain/game-design.md`                                                               |
| Не менять | `src/game/wave.ts`, `src/game/battle-render.ts`, `src/game/battle.ts`, сцены, `src/engine/` |

Проверки в конце: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Граница engine/game не затрагивается; `rng` — только в `selectSortie` через
  `randomInt`, порядок кандидатов фиксирован сортировкой `(row, col)` — детерминизм по
  seed; при пустом списке `rng` не вызывается.
- Логика отдельно от рендера: `drawBattle` рисует `ENEMY_KINDS[kind].sprite` — `raider`
  подхватывается без правок рендера.
- Групповая логика только в момент выбора вылета (`selectSortie` — чистая функция);
  во время полёта `Enemy` не знает о соседях — строй держится за счёт одинаковых
  приказов (общий якорь → одинаковый `gap` → одинаковый шаг руления).
- Исчерпывающие `Record<EnemyKind, …>` / `Record<LayoutChar, …>` — `tsc` ловит
  пропущенный вид; новые поля `DiveOrder`/`Slot`/`LevelConfig` обязательные (забытый сдвиг
  в боевом коде не спрячется за умолчанием), в тестах — хелпер `diveOrder`.
- Целые px/тик (ADR 002/003): сдвиги кратны `CELL_WIDTH = 16`, скорости уровней 4–5
  проверены инвариантами таблицы.
- `import type` для `DiveOrder`, `Enemy`, `LevelConfig`; `CELL_WIDTH` — обычный импорт.

## Открытые вопросы

Вопросы из `analyze.md` закрыты архитектором (`discussion.md`, «Реализация: задача
013-raiders»): сжатие у края — решено полями `groupMinOffsetX`/`groupMaxOffsetX`; `side`
по живым, порядок по левому столбцу, обязательные поля + хелпер — подтверждены.
Остаются только пункты приёмки глазами (не блокируют реализацию):

1. Владелец утверждает спрайт `raider` (стартовое предложение — шаг 3).
2. Баланс залпов на уровне 5 (`MAX_ENEMY_SHOTS = 4` съедает часть выстрелов тройки) —
   подстройка после просмотра (`raiderShots`/`maxSorties` в `LEVELS` или
   `MAX_ENEMY_SHOTS`), в этой задаче не трогаем.

## Ссылки

- `second-brain/tasks/tasks/013-raiders/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Интерфейсы», «Точные правила»
  (`side` группы, лидер и `aimOffsetX`, «Цель `fixed` группы»), «Таблица `LEVELS` — точные
  строки», «Тестовые таблицы», «Появление API по задачам» (строка 013), нарезка п. 9
- `second-brain/features/002-enemies-and-levels/discussion.md` — «Реализация: задача
  013-raiders»
- `second-brain/architecture/overview.md`, `second-brain/game-design.md`
- `second-brain/decisions/002-integer-speeds.md`, `second-brain/decisions/003-slow-speeds-tick-timers.md`

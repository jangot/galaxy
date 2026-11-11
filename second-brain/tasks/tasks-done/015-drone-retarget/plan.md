# План реализации: Переприцеливание drone

`drone` по ходу пике раз в `DRONE_RETARGET_TICKS = 30` тиков (тики `descend` `d = 1, 31, 61, …`)
берёт цель заново и сворачивает к ней со скоростью 1 px/тик, без инерции и без зигзага (В1).
Механика уже есть после 014 (`steering.ts`, `Enemy.descend` вызывает `isRetargetTick` и `aimFor`
для всех видов), поэтому задача — смена профиля `drone`, тесты и документы. Код `descend`,
`steering.ts`, `Battle`, `Wave` не меняется (кроме одного комментария в `battle.ts`).

Уточнения объёма из `analyze.md` («Открытые вопросы», п. 1–2) приняты в промпте запуска: в 015
правим профиль `drone` в `second-brain/architecture/overview.md` и часть про `drone` в
комментарии `src/game/battle.ts:64` (часть про `striker` — в 016).

## 1. Константа и профиль `drone`

**Файл (изменить):** `src/game/enemy.ts`

Перед `ENEMY_KINDS` (стр. 16) — объявить константу (обязательно **до** объекта: он
вычисляется при загрузке модуля, иначе TDZ). Профиль `drone` — на константу, комментарий
профиля — новый. `striker` и `raider` не трогать.

```typescript
/**
 * Drone re-aim period in 'descend', ticks (0.5 s): it takes the ship's center anew on
 * descend ticks 1, 1 + N, 1 + 2N, ... Approved by the owner (feature 003, Q1).
 */
export const DRONE_RETARGET_TICKS = 30;

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  // Re-aims every DRONE_RETARGET_TICKS ticks and turns at once (no inertia, no zigzag).
  drone: {
    sprite: DRONE_SPRITE,
    steer: { retargetTicks: DRONE_RETARGET_TICKS, turnTicks: 0, maxVx: 1 },
  },
  // Re-aims every tick, no inertia.
  striker: { sprite: STRIKER_SPRITE, steer: { retargetTicks: 1, turnTicks: 0, maxVx: 1 } },
  // Aims once, on the first descend tick (group anchor + aimOffsetX).
  raider: { sprite: RAIDER_SPRITE, steer: { retargetTicks: null, turnTicks: 0, maxVx: 1 } },
};
```

Перенос строки `drone` — как сформирует Prettier (`printWidth` 100); проверка — `npm run format`.

## 2. Комментарий про `null`-цель в `Battle.update`

**Файл (изменить):** `src/game/battle.ts` (стр. 64, только комментарий)

Часть про `drone` («drones starting a descend keep no aim») станет неточной: без цели в 1-м
тике `drone` подхватит корабль на ближайшем переприцеливании, а потерявший цель посреди пике
перестаёт сворачивать. Часть про `striker` оставить дословно — её правит 016.

```typescript
// No target while the ship is down: strikers fly straight down; drones stop steering
// until a re-aim tick finds the ship again.
```

## 3. Тесты

**Файл (изменить):** `src/game/enemy.test.ts` (Vitest, environment `node`), блок
`describe('Enemy aim')`.

Импорт: добавить `DRONE_RETARGET_TICKS` в импорт из `./enemy` (алфавитный порядок —
перед `ENEMY_FIRE_INTERVAL_TICKS`). Комментарий `afterPeel` («x = 128 / 127, center 133»)
верен: `drone` (11 px) стоит на 128, `striker`/`raider` (13 px) — на 127.

Обозначение ниже: `N = DRONE_RETARGET_TICKS`; ожидания строить через константу, не через
литерал 30.

### 3.1. Тест профилей (стр. 447)

Переименовать и обновить ожидание `drone`:

```typescript
it('kind profiles: drone re-aims every DRONE_RETARGET_TICKS = 30 ticks, striker every tick, raider once', () => {
  expect(DRONE_RETARGET_TICKS).toBe(30);
  expect(ENEMY_KINDS.drone.steer).toEqual({
    retargetTicks: DRONE_RETARGET_TICKS,
    turnTicks: 0,
    maxVx: 1,
  });
  expect(ENEMY_KINDS.striker.steer).toEqual({ retargetTicks: 1, turnTicks: 0, maxVx: 1 });
  expect(ENEMY_KINDS.raider.steer).toEqual({ retargetTicks: null, turnTicks: 0, maxVx: 1 });
});
```

### 3.2. Перенос четырёх тестов «fixed …» на `raider`

Смысл «цель берётся один раз» теперь у `raider`. В каждом тесте `'drone'` → `'raider'`,
ожидаемые `x` сдвигаются на −1 (ширина 13 вместо 11, центр тот же — 133); центры не меняются.
Названия оставить («fixed …»), чтобы перенос читался в диффе.

- «fixed takes the target on the first descend tick and keeps it»: `afterPeel('raider',
aimAt(250))`, `x` 127; после тика с `aimAt(100)` — 126; далее `126 - i`, в конце 116.
- «fixed reaches its target and then flies straight down»: `i <= 10 ? 127 - i : 117`;
  `centerX` = 123 (без изменений).
- «fixed with no target on the first descend tick flies straight down»: `x` = 127 все 30
  тиков. (На `drone` при `N = 30` этот тест упал бы — на `d = 31` прицел.)
- «fixed does not reuse the target of the previous sortie»: `newEnemyOf('raider')`, `x` 127
  после peel второго вылета и 127 все 10 тиков.

```typescript
it('fixed takes the target on the first descend tick and keeps it', () => {
  const enemy = afterPeel('raider', aimAt(250));
  expect(enemy.x).toBe(127);
  step(enemy, 1, aimAt(100));
  expect(enemy.x).toBe(126);
  for (let i = 1; i <= 10; i++) {
    step(enemy, 1, aimAt(250));
    expect(enemy.x).toBe(126 - i);
  }
  expect(enemy.x).toBe(116);
});
```

(Остальные три — аналогично, только `kind` и числа `x`.)

### 3.3. Новые тесты `drone`

Геометрия: `afterPeel('drone')` — `x = 128`, центр 133; `aimFor` у одиночного `drone` зажимает
цель в `[5, 250]` — цели 0/100/200 не зажимаются (0 → 5, на знак `vx` не влияет). Пике ряда 1
при `diveSpeed` 60 длится ~190 тиков `descend`, так что тики `1 … 2N + 1` — заведомо в
`descend`.

**a) Цель держится `N` тиков, на `1 + N` — новая, `vx` меняет знак:**

```typescript
it('drone keeps its target for DRONE_RETARGET_TICKS ticks, then takes a new one', () => {
  const N = DRONE_RETARGET_TICKS;
  const enemy = afterPeel('drone');
  expect(enemy.x).toBe(128);
  step(enemy, 1, aimAt(200)); // d = 1: aims right
  expect(enemy.vx).toBe(1);
  expect(enemy.x).toBe(129);
  for (let d = 2; d <= N; d++) {
    step(enemy, 1, aimAt(0)); // the ship went left, but the old aim holds
    expect(enemy.vx).toBe(1);
    expect(enemy.x).toBe(128 + d);
  }
  step(enemy, 1, aimAt(0)); // d = 1 + N: re-aim
  expect(enemy.vx).toBe(-1);
  expect(enemy.x).toBe(127 + N);
});
```

Проверка чисел: после `d = N` `x = 128 + N = 158`, центр 163 < 200 — `drone` ещё не дошёл до
старой цели, поэтому `vx = +1` держится до конца окна; на `d = 1 + N` — `x = 157`.

**b) Подхват после `null` в 1-м тике (В3):**

```typescript
it('drone with no target on the first descend tick picks the ship up on the next re-aim', () => {
  const N = DRONE_RETARGET_TICKS;
  const enemy = afterPeel('drone');
  step(enemy, 1, aimAt(null)); // d = 1: the ship is down
  expect(enemy.x).toBe(128);
  for (let d = 2; d <= N; d++) {
    step(enemy, 1, aimAt(100)); // the ship is back, not a re-aim tick yet
    expect(enemy.vx).toBe(0);
    expect(enemy.x).toBe(128);
  }
  step(enemy, 1, aimAt(100)); // d = 1 + N: picks the ship up
  expect(enemy.vx).toBe(-1);
  expect(enemy.x).toBe(127);
  step(enemy, 1, aimAt(null)); // not a re-aim tick: keeps the new aim
  expect(enemy.x).toBe(126);
});
```

**c) Потеря цели посреди пике (следствие правила `null → null`, см. analyze.md):**

```typescript
it('drone stops steering when the ship is down on a re-aim tick', () => {
  const N = DRONE_RETARGET_TICKS;
  const enemy = afterPeel('drone');
  step(enemy, N, aimAt(0)); // d = 1 ... N: flies left
  expect(enemy.x).toBe(128 - N);
  step(enemy, 1, aimAt(null)); // d = 1 + N: no target
  expect(enemy.vx).toBe(0);
  for (let i = 0; i < 10; i++) {
    const y = enemy.y;
    step(enemy, 1, aimAt(0));
    expect(enemy.x).toBe(128 - N);
    expect(enemy.y).toBe(y + 1);
  }
});
```

Проверка чисел: `x = 128 − 30 = 98`, центр 103 > 5 — цель 0 (зажата в 5) не достигнута,
`vx = −1` все `N` тиков; `diveSpeed` 60 → `y` +1 за тик.

### 3.4. Что не меняется (проверено в analyze.md)

«measures the gap from the center of its own sprite» (5 тиков), «Enemy fire», «Enemy dive»
(`targetX: null`), «Enemy group aim», `battle.test.ts`, `wave.test.ts`, `levels.test.ts`
(«ENEMY_KINDS steer»: `retargetTicks` целое ≥ 1, `maxVx` 1 < 2), `steering.test.ts` — без
правок. Если что-то из них упадёт — разбираться, а не подгонять ожидания.

## 4. Проверки

`npm run format`, затем `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## 5. Ручная проверка

`npm run dev`:

- `?level=1`: нижние `drone` после дуги летят к месту корабля; если отвести корабль в
  сторону, примерно раз в полсекунды `drone` поворачивает к новому месту (за пике 6–7 раз).
  Зигзага вокруг корабля нет — стоящий под ним корабль `drone` настигает по прямой.
- `?level=5` (`diveSpeed` 180): за пике 2–3 прицела; уход одним рывком в начале пике больше
  не спасает — `drone` доворачивает.
- Корабль сбит, пока `drone` пикирует: `drone` перестаёт сворачивать и идёт вниз; если
  корабль возродился, пока `drone` ещё в пике, — на ближайшем прицеле `drone` поворачивает
  к нему.
- `striker` и `raider` ведут себя как до задачи.

## 6. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` — «Пикирование» (стр. 30-31). Заменить
«`drone` летит в точку, где был корабль в начале пике;» на:

```markdown
`drone` летит в точку, где был корабль, и раз в 0,5 с (30 тиков) берёт цель заново и
сворачивает к ней, без зигзага (фича 003, В1); если в начале пике корабля нет, `drone` идёт
прямо вниз и подхватывает возродившийся корабль на ближайшем переприцеливании (В3);
```

Фразы про `striker` и `raider` не трогать (`striker` правит 016).

**Файл (изменить):** `second-brain/architecture/overview.md` — стр. 116-117, профиль `drone`:
`` `drone {null, 0, 1}` `` → `` `drone {DRONE_RETARGET_TICKS = 30, 0, 1}` ``. Остальное
(`striker`, `raider`, описание `descend`) верно и не меняется.

Код-комментарии: `enemy.ts` (шаг 1) и `battle.ts` (шаг 2). `README.md` в `src/game/` нет.

## Сводка по файлам

| Действие | Файл                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| Изменить | `src/game/enemy.ts` (константа, профиль `drone`, комментарий)                     |
| Изменить | `src/game/battle.ts` (только комментарий, часть про `drone`)                      |
| Изменить | `src/game/enemy.test.ts` (профили, 4 «fixed …» → `raider`, 3 новых теста `drone`) |
| Изменить | `second-brain/game-design.md` («Пикирование»)                                     |
| Изменить | `second-brain/architecture/overview.md` (профиль `drone`)                         |

## Архитектура и паттерны

- Поведение вида задаётся данными (`SteerSpec` в `ENEMY_KINDS`), а не ветками в `Enemy` —
  как согласовано в дизайне фичи 003; `descend` не меняется.
- Детерминизм (ADR 002/003): период в тиках, `vx` целый, X без `dt`; `Rng` не нужен.
- Логика отдельно от рендера: всё проверяется юнит-тестами через `update(TICK_SECONDS, env)`
  с `targetX` от теста.
- Граница engine/game не затронута.

## Открытые вопросы

К владельцу — нет. Уточнения объёма из `analyze.md` (п. 1 — `overview.md`, п. 2 — комментарий
`battle.ts`) приняты в промпте запуска и включены в шаги 2 и 6.

Замечание для 016: она тоже правит тест профилей и «Пикирование» в `game-design.md`, и
переносит механические тесты со `striker` на `drone` — их окна должны укладываться в `N` тиков
(есть в дизайне); при слиянии 015 и 016 возможен текстовый конфликт в этих местах.

## Ссылки

- `second-brain/tasks/tasks/015-drone-retarget/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/003-enemy-flight/design.md` (профили, «Правила тика descend»,
  «Тестирование», нарезка п. 2), `discussion.md` (В1, В3)
- `second-brain/architecture/overview.md`, `second-brain/game-design.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- Код: `src/game/enemy.ts`, `src/game/steering.ts`, `src/game/enemy.test.ts`, `src/game/battle.ts`

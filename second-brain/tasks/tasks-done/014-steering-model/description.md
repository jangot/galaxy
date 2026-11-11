# Задача: Модель руления пикирующих врагов

## Суть задачи

Ввести единую модель бокового полёта врага в фазе `descend`: чистый модуль
`src/game/steering.ts` (переприцеливание, желаемая боковая скорость, шаг инерции) и
профиль `SteerSpec` у каждого вида в `ENEMY_KINDS` вместо нынешнего `Aim`. Профили в этой
задаче **воспроизводят текущее поведение** — в игре ничего не меняется. Задача готовит
механизм для 015 (`drone`) и 016 (`striker`).

## Детали и требования

- `src/game/steering.ts` — без импортов: `SteerSpec`, `SteerState`, `isRetargetTick`,
  `desiredVx`, `turn` (сигнатуры и правила — `design.md`, «Интерфейсы» и «Правила тика
  descend»).
- `enemy.ts`: `EnemyKindSpec.steer: SteerSpec` вместо `aim`; профили
  `drone {null, 0, 1}`, `striker {1, 0, 1}`, `raider {null, 0, 1}`
  (`retargetTicks`, `turnTicks`, `maxVx`).
- Состояние на вылет (сброс только в `startDive`): `aimX` (было `fixedAimX`), `steerVx`,
  `turnCounter`. Публичный геттер `vx` считается от состояния: `steerVx` в
  `diving`/`descend`, иначе 0.
- `aimFor(targetX)` (было `fixedAim`) — для всех видов (у одиночек сдвиги 0, зажим ничего
  не меняет).
- Продолжение `vx` дуги в 1-м тике `descend` (при `turnTicks = 0` на поведение не влияет).
- X в `descend` — целые px за тик, без `dt` (ADR 002/003); вертикаль — `diveSpeed · dt`
  без изменений; упор в край экрана обнуляет `vx`.
- Комментарий `SteerSpec` («whole px PER TICK, no dt»); комментарий `STEER_SPEED` —
  теперь только `returning`.
- `levels.test.ts`: для каждого вида `maxVx` целое ≥ 1 и `< SHIP_SPEED · TICK_SECONDS`,
  `retargetTicks` — `null` или целое ≥ 1, `turnTicks` — целое ≥ 0.
- Обновить `second-brain/architecture/overview.md` (модель полёта, «X в `descend` —
  px/тик без `dt`»).

## Критерии готовности

- `steering.test.ts` — функции на произвольных профилях (см. «Тестирование» в дизайне).
- Все существующие тесты проходят, кроме двух заменённых: тест `aim` (→ тест профилей) и
  «track does not read the group offsets».
- Глазами игра не меняется.
- Проходят `format:check`, `lint`, `typecheck`, `test`, `build`.

## Контекст

- Фича 003: `second-brain/features/003-enemy-flight/design.md`, пункт 1 нарезки;
  разбор — `dev-review.md`, `discussion.md`.
- Код: `src/game/enemy.ts`, `src/game/enemy.test.ts`, `src/game/levels.test.ts`.
- ADR 002/003 (целые px/тик, фиксированный `dt`).

## Зависимости

- Код `raider` (задача 013-raiders) уже в `main`; 013 ждёт только приёмки глазами.

## Открытые вопросы

Нет.

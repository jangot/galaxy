# Задача: Астероид в бою

## Суть задачи

Встроить астероид в игру: раз за уровень он падает наискосок, его можно сбить выстрелом
и получить очки. Капсулы пока нет (задача 027).

## Детали и требования

Архитектура (`second-brain/features/006-asteroid-bonuses/design.md`, пункт 2б нарезки):

- `ASTEROID_SPRITE` в `bonus-art.ts` (новый).
- `resolveBonusCollisions` — пока только выстрел ↔ астероид, `collected` всегда
  `null`; `import type` для `BonusField`. Вызывается после коллизий с врагами
  (враги в приоритете), в фазах `playing` и `cleared`.
- `BattleOptions.bonuses`; без него астероидов нет совсем (старые тесты не меняются).
  Шаги тика по дизайну, `startLevel` в конструкторе `Battle` и на переходе
  `cleared → playing`.
- `PlayScene`: rng бонусов из производного seed —
  `createRng((battleSeed ^ BONUS_SEED_SALT) >>> 0)`, соль `0x9e3779b9`; rng сцены не
  трогать; `opts?.bonuses ?? { rng }`.
- Рендер: астероид — самый задний слой боя, под всеми выстрелами.
- Строка в ADR 003: «Применение: снос астероида (фича 006)». ADR 004 не трогать.
- Комментарии: `Battle.score` (очки ещё и за астероид, в т. ч. в `cleared`), порядок
  тика в `Battle.update`.

## Критерии готовности

- Тесты: попадание по астероиду даёт `asteroidPoints`; враг в приоритете при общем
  тике; астероид не взаимодействует с кораблём; сцена с заглушкой rng даёт астероид на
  заданном тике; для данного seed сцены звёзды и бой «как до фичи».
- Проходят `format:check`, `lint`, `typecheck`, `test`, `build`.
- Глазами (без отдельной приёмки): раз за уровень падает наискосок, сбивается, даёт
  очки, сквозь корабль проходит, выстрелы видны поверх.

## Контекст

- Фича 006: `second-brain/features/006-asteroid-bonuses/design.md` (пункт 2б), `discussion.md`.
- Код: `src/game/battle.ts`, `collisions.ts`, `battle-render.ts`,
  `scenes/play-scene.ts`; ADR 003.

## Зависимости

Зависит от 025-asteroid-model.

## Открытые вопросы

- ~~В1 (к архитектору, с analyze): править строки `battle`, `collisions`, `battle-render`, `play-scene` и граф импортов в `architecture/overview.md` в 026 (рекомендация) или всё в 027.~~
  **Закрыт** архитектором: вариант (а) — в 026 обновить описания `battle.ts`,
  `battle-render.ts`, `collisions.ts`, `play-scene.ts` и граф импортов целиком по коду
  (с рёбрами к новым модулям); абзацы `asteroid.ts`, `bonus-field.ts`, `bonus-art.ts` — в 027. См. `second-brain/features/006-asteroid-bonuses/discussion.md`, «Реализация:
  задача 026-asteroid-in-battle», и `plan.md`, шаг 10.

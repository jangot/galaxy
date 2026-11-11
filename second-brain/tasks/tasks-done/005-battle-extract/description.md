# Задача: Выделение Battle и battle-render

## Суть задачи

Первая задача фичи 002 — подготовительный рефакторинг без изменения поведения. Логика боя выносится из `PlayScene` в агрегат `Battle` (без ввода и canvas), отрисовка — в `battle-render`. Это фундамент, на который дальше ложатся враги.

## Детали и требования

- `battle.ts`: пока только `Player`; `new Battle()` — без `rng`, без волны и без `BattleOptions`.
- `battle-render.ts`: корабль и выстрел — перенос из сцены.
- `PlayScene` держит `battle` вместо `player`; `play-scene.test.ts` переходит на `scene.battle.player`.
- `canvas-test-utils.ts`: общий `recorder()` (вынести из `sprite.test.ts`).

Точные интерфейсы, числа и порядок тика — в дизайне фичи (см. «Контекст»).

## Критерии готовности

- Все тесты фичи 001 зелёные; `battle-render.test.ts` на фейковом ctx — корабль и выстрел рисуются.
- Глазами: в игре ничего не изменилось.
- Все проверки проходят: `format:check`, `lint`, `typecheck`, `test`, `build`.
- Игра остаётся рабочей; новые модули дописаны в `second-brain/architecture/overview.md`.

## Контекст

Фича 002 «Враги и уровни»: `second-brain/features/002-enemies-and-levels/design.md` — пункт 1 нарезки. Также `discussion.md` той же папки.

## Зависимости

нет (опирается на фичу 001)

## Открытые вопросы

нет

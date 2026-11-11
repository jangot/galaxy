# Задача: Игровая сцена и переход с титула

## Суть задачи

Первая задача фичи 001 (корабль игрока). Добавить игровую сцену `PlayScene` — пока
только звёздный фон, без корабля — и переход в неё с титульного экрана по Enter.
Звёзды переходят в новую сцену как есть, без скачка. Плюс тестовый хелпер `step()`,
повторяющий цикл `main.ts`, — на нём будут строиться тесты сцен во всех задачах фичи.

## Детали и требования

- `TitleScene`: хранить `rng` в поле (`private readonly rng`), `_input` → `input`,
  тип возврата `update` — `Scene | void`; по `input.pressed('start')` возвращать
  `new PlayScene(this.rng, this.starfield)`.
- `PlayScene`: принимает `rng` и `Starfield`, обновляет и рисует звёзды; без надписей.
- `src/game/scenes/scene-test-utils.ts`: `step(scene, input, n = 1): Scene` — `update`
  → смена сцены → `input.endTick()`, как в `main.ts`. Отдельный модуль, не тест-файл.
- `main.ts` и `src/engine/*` не меняются.
- `second-brain/architecture/overview.md`: `PlayScene`, переход сцен; граф импортов —
  с прямыми зависимостями `play-scene` (замечание из `dev-review-2.md`).

## Критерии готовности

- `title-scene.test.ts` через `step()`: Enter → `PlayScene`, без Enter — остаётся титул.
- Проходят `format:check`, `lint`, `typecheck`, `test`, `build`.
- Глазами: Enter переводит на экран со звёздами без надписей, звёзды не прыгают.

## Контекст

Фича `second-brain/features/001-player-ship/`, согласованный `design.md` — пункт 1
нарезки; разделы «Модули и файлы», «Интерфейсы», «Тестирование».

## Зависимости

нет

## Открытые вопросы

нет

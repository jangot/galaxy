# Задача: рекорд — хранилище и показ `HI`

## Суть задачи

Лучший счёт сохраняется между сессиями в `localStorage` и показывается в верхней панели
колонкой `HI` рядом со `SCORE`. Хранилище изолировано в движке (обёртка, которая никогда
не бросает), логика рекорда — в игре; `Battle` о рекорде не знает. Панель пока в прежнем
виде (без плиты) — плита и окна будут в 035, но раскладка по X уже окончательная.

## Детали и требования

- `src/engine/storage.ts`: `KeyValueStorage`, `safeStorage(getBacking)` (ловит исключения
  доступа к `window.localStorage`, чтения и записи), `memoryStorage()` для тестов.
- `src/game/high-score.ts`: ключ `galaxy.highScore`; `parseHighScore` — всё, кроме чистых
  цифр в пределах безопасного целого, → 0; `HighScoreStore`: кэш в памяти (сломанное
  хранилище — рекорд живёт до перезагрузки), `refresh()` в начале игры подхватывает
  больший рекорд из другой вкладки и не понижает, `submit(score)` пишет только при росте,
  `best = max(score, сохранённое)` и в хранилище пишется то же число.
- Запись — сразу при каждом росте рекорда (В3), в т. ч. в недоигранной игре.
- `HudView` + `highScore = max(best, score)` и `newRecord = score > рекорд на старте игры`;
  `HudRecord`, `hudView(battle, record)` — второй аргумент обязательный, в тестах
  `NO_RECORD`.
- Подпись `HI` (В2), 6 цифр с ведущими нулями. Раскладка колонками (В1): `SCORE` 8…55 ·
  `HI` 64…111 · `LEVEL` 120…159 · улучшения 168…185 · щит 200…247 (`LEVEL` — на 12 px
  правее центра экрана, это окончательно).
- Новый рекорд: значение `HI` цветом `HUD_RECORD_COLOR` (жёлтый) до конца игры, без мигания
  (В4); ничья — не рекорд. В первой игре (рекорд 0) подсветка — с первого очка, при счёте 0
  — нет.
- `HighScoreStore` создаётся один раз в `main.ts`, проходит `TitleScene → PlayScene → exit →
TitleScene`; в обеих сценах `readonly records` (для тестов). `PlayScene`:
  `recordAtStart` после `refresh`, `submit(battle.score)` после `battle.update`, метод
  `hudRecord()` — для отрисовки и снимка.
- `dev-snapshot`: `highScore: { best, newRecord } | null` (`null` на заставке), через
  `hudView(scene.battle, scene.hudRecord())`.
- Существующие тесты с меняющимися ожиданиями (строки «034» в таблице «Тестирования»
  дизайна) — правятся ожидания, проверки не ослабляются.
- `HI` на заставке и сброс рекорда — не делаем (В9).

## Критерии готовности

- Тесты по разделу «Тестирование» дизайна для 034: `storage.test`, `high-score.test`,
  `hud.test`, `hud-render.test`, `play-scene.test`, `title-scene.test`, `art.test`,
  `dev-snapshot.test`; полный набор проверок зелёный.
- В браузере: `HI` рядом со `SCORE`, растёт при обгоне и желтеет; рекорд переживает
  перезагрузку и рестарт; в приватном окне / при запрещённом хранилище игра работает,
  рекорд — до перезагрузки.
- `acceptance.md` оговаривает, что `LEVEL` правее центра — это окончательная раскладка, а
  плита появится в 035.
- Документы: `second-brain/architecture/overview.md` (`storage.ts`, `high-score.ts`,
  параметры сцен), `second-brain/architecture/dev-hooks.md` (`highScore` в `state()`,
  ключ хранилища и как сбросить рекорд). `game-design.md` уже обновлён.

## Контекст

- Фича 009: `second-brain/features/009-high-score-ship-panel/design.md` — пункт 1 нарезки;
  решения владельца — README фичи (В1–В9), `discussion.md`.
- Модули: `src/game/hud.ts`, `hud-render.ts`, `art.ts`, `scenes/play-scene.ts`,
  `scenes/title-scene.ts`, `dev-snapshot.ts`, `src/main.ts`.
- `game-design.md`: «Экран» (HUD), «Рекорд».

## Зависимости

нет (база — фича 008, задачи 031–033 завершены)

## Открытые вопросы

нет

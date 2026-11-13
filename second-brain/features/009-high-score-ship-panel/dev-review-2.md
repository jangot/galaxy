# Отзыв разработчика — раунд 2

Код: ветка `feature/008-ship-shield`, коммит `733c43a`. `npm test` — зелёный (33 файла,
1019 тестов).

## Блокеры

нет

## Рекомендации

1. **`TitleScene` не объявляет `readonly records`, а тест на него опирается.** В
   «Тестировании» `title-scene.test.ts` сравнивает `records` «по ссылке через
   `scene.records`», в том числе у `TitleScene`, полученной через `exit`. В «Интерфейсах»
   у `TitleScene` указан только конструктор; сейчас у неё публичен лишь `starfield`
   (`src/game/scenes/title-scene.ts:14-15`), `rng`/`start` — `private readonly`
   (`:19-21`). Предложение: добавить в интерфейс `TitleScene`
   `/** Exposed for tests. */ readonly records: HighScoreStore;` — по образцу
   `starfield` и того, как тест уже проверяет его проводку
   (`title-scene.test.ts:76-102`).

2. **Таблица меняющихся тестов неполна и местами указывает не на те строки.** Сверил
   с кодом:
   - номера строк: `hud-render.test.ts:113-120` → фактически `:114-125` («a change
     touches only its own zone»); `:121-128` → `:127-135` («places the text and the gauge
     exactly»); `hud.test.ts:145` — тест `:145-149`, `toEqual` на `:148`.
   - **не перечислены (035)**: `hud.test.ts:205-208` — `SHIELD_SEGMENT_Y` `toBe(16)` →
     станет 14 при `HUD_VALUE_Y = 12`; `hud-render.test.ts:162-178` — точные пиксели шкалы
     `[200, 16, 8, 4]…` → `y = 14`; `hud-render.test.ts:213-215` «draws nothing in the
     power-ups zone without power-ups» — при В7 = б в зоне рисуются погасшие лампы, тест
     переворачивается (рисует `CAPSULE_OFF_SPRITES` в обоих слотах);
     `hud-render.test.ts:217-225` «draws only the enabled power-ups» — эталон `iconCalls`
     (`:75-82`) должен включать погасшие спрайты выключенных слотов.
   - **не перечислены (034, typecheck)**: литералы `HudView` в `hud-render.test.ts:36`
     (`BASE`), `:98` (`max`), `:210` — без `highScore`/`newRecord` не скомпилируются.
   - `hud-render.test.ts:180-199` «uses label, value and gauge colors» фильтрует по
     диапазону Y, а не по зонам: если какой-то вызов плиты (боковая кромка, заклёпка)
     начнётся в y = 3…9, он попадёт в `labelRow` и тест упадёт. Предложение: в 035
     применять ту же «отрезку `draw(drawPanel).length`», что и в `:99-111`, ко всем тестам,
     фильтрующим по координатам/цвету, — оговорить в строке таблицы.
     Тест «keeps the doubleShot icon in place» (`:227-233`) с погасшими лампами проходит
     без правок (разности мультимножеств совпадают) — проверил вручную.

3. **«Палитра `CAPSULE_OFF_SPRITES`» в `art.test.ts`.** У `Sprite` нет поля палитры —
   только `pixels` (`src/game/sprite.ts:2-6`), а цвета капсул объявлены в `bonus-art.ts`
   (`:30-37`), не в `art.ts`. Предложение: в тесте брать цвета погасшей лампы как
   множество не-`null` из `CAPSULE_OFF_SPRITES[kind].pixels` (тест импортирует
   `bonus-art.ts` — это тест, ограничение «`art.ts` импортирует только `sprite.ts`» не
   задевает) или поместить тест различимости в `bonus-art.test.ts`. Требование «отличаться
   от `SHIELD_GAUGE_EMPTY_COLOR`» для лампы избыточно (они в разных окнах), но безвредно.

## Вопросы

- К архитектору: нет.
- К владельцу: нет.

## Подтверждено

- Правки раунда 2 внесены корректно и согласованы с кодом:
  - `hudRecord()` и `readonly records` у `PlayScene` — `snapshotScene` уже ветвится по
    `scene instanceof PlayScene` (`src/game/dev-snapshot.ts:145-148`), `highScore` кладётся
    на верхний уровень снимка; единственный `toEqual` на снимок заставки —
    `dev-snapshot.test.ts:39` (в таблице есть); `dev-hooks.ts` использует только тип.
  - `submit`: `best = max(score, stored)`, `true` по `score > best` до записи; связка с
    `newRecord = score > atStart` и `highScore = max(best, score)` непротиворечива.
  - `valueRow`/`HUD_WINDOWS`: при `HUD_VALUE_Y = 12`, `HUD_ICON_SIZE = 8`,
    `HUD_WINDOW_PAD = 1` окна y = 11…20; подписи 3…9 (`GLYPH_HEIGHT = 7`), низ подписи 9 <
    11; скос 22…23 не задет; тест `hud.test.ts:151-153` (подписи над значениями: 3 + 7 ≤ 12) проходит. Для `SHIELD_ZONE`/`POWER_UPS_ZONE` `valueRow` = зона.
  - По X: `HI_ZONE` 64…111 (ширина `max(textWidth('HI'), 48)` = 48), окна 7…56, 63…112,
    119…160, 167…186, 199…248 — зазоры 6/6/6/12 px; тест непересечения зон
    (`hud.test.ts:110-123`) проходит. Тесты, привязанные к `LEVEL_ZONE.x` относительно
    (`hud-render.test.ts:132`, `:137-148`, `hud.test.ts:166-172`), сдвиг на 120 переживают.
  - Зазор до взрыва на апексе — 5 px, совпадает с `hud.test.ts:125-130`.
  - `NO_RECORD` и обязательный `record` — `hudView` вызывается только в
    `play-scene.ts:63` и `hud.test.ts`; других потребителей нет.
- Ответы на вопросы раунда 1 (подсветка на первом запуске, сдвиг `LEVEL` в 034) приняты,
  отражены в «Сценариях» п. 1 и в нарезке (оговорка в `acceptance.md`).
- 35 вызовов `new PlayScene`/`new TitleScene` в `src/` — дефолт `records` их закрывает.
- Решения владельца В1–В9 перенесены в дизайн без расхождений с `discussion.md`.

## Предлагаемая нарезка на задачи

Согласен с нарезкой дизайна (034 — рекорд и `HI`, 035 — панель) с уточнением: в таблицу
«Существующие тесты, ожидания которых меняются» добавить строки из рекомендации 2 —
034: литералы `HudView` в `hud-render.test.ts`; 035: `hud.test.ts:205-208`,
`hud-render.test.ts:162-178`, `:213-215`, `:217-225` и отрезку плиты в `:180-199`.

# Анализ: Шкала щита в панели

## Общее описание функциональности

Фича 008 заменила запас кораблей щитом (`player.shield`, `0…MAX_SHIELD = 5`, старт
`START_SHIELD = 2`). В задаче 031 HUD временно показывает уровень щита старыми иконками
кораблей (`drawLives` рисует `shield` иконок `LIFE_ICON_SPRITE` от правого края зоны).
Задача 033 заменяет это постоянной шкалой (В9):

- справа в строке значений панели, в зоне прежних иконок (x = 200…247, y = 14…21) —
  5 прямоугольных сегментов 8×4 с шагом 10, по вертикали по центру строки значений
  (y = 16…19);
- залиты первые `shield` сегментов слева направо (сегмент `i` залит при `i < shield`),
  все одним цветом — `SHIELD_COLORS[shield]` (цвет текущего уровня, как дуга над
  кораблём из 032); остальные — `SHIELD_GAUGE_EMPTY_COLOR` (тёмно-серый, первый проход
  `#3c3c3c`);
- при `shield = 0` все 5 сегментов пустые (шкала видна всегда, в отличие от иконок);
- подписи нет; фона панели нет (как у остальных секций).

В игре: старт — 2 жёлтых сегмента из 5; удар — сегмент гаснет и вся шкала сразу
перекрашивается в цвет нового уровня (в тот же тик, что и дуга); капсула `L` / порог очков —
сегмент загорается, шкала «зеленеет». Шкала **не мигает** вместе с кораблём во время
неуязвимости — HUD показывает значение, а не состояние корабля (дизайн мигание в панели не
предусматривает).

Попутно — переименования, убирающие «жизни» из HUD: `LIFE_ICON_MAX_SIZE`/`LIFE_ICON_STEP` →
`HUD_ICON_SIZE`/`HUD_ICON_STEP` (их же используют значки улучшений), `LIVES_ZONE` →
`SHIELD_ZONE`, `drawLives` → `drawShield`; удаляются `LIFE_ICON_SPRITE` и
`LIVES_ICON_SLOTS`. Плюс документы: раздел HUD в `game-design.md`, `overview.md`.

## Модели данных и состояние

Новых сущностей и состояния нет: шкала — чистая функция от `HudView.shield` (уже есть с 031,
`hud.ts:10`, берётся из `battle.player.shield` в `hudView`).

Константы (по «Интерфейсам» design.md):

| Константа                  | Где         | Значение / смысл                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `HUD_ICON_SIZE`            | `hud.ts`    | 8 — было `LIFE_ICON_MAX_SIZE`; предел значка и высота зон строки значений       |
| `HUD_ICON_STEP`            | `hud.ts`    | 10 — было `LIFE_ICON_STEP`; шаг значков улучшений и сегментов шкалы             |
| `SHIELD_SEGMENT_WIDTH`     | `hud.ts`    | 8                                                                               |
| `SHIELD_SEGMENT_HEIGHT`    | `hud.ts`    | 4                                                                               |
| `SHIELD_ZONE`              | `hud.ts`    | `{ x: 200, y: 14, width: 48, height: 8 }` — та же область, что `LIVES_ZONE`     |
| `shieldSegmentX(i)`        | `hud.ts`    | `SHIELD_ZONE.x + i * HUD_ICON_STEP` (0-based, слева направо): 200, 210, …, 240  |
| y сегмента                 | `hud.ts`    | `HUD_VALUE_Y + (HUD_ICON_SIZE − SHIELD_SEGMENT_HEIGHT) / 2` = 16 (строки 16…19) |
| `SHIELD_GAUGE_EMPTY_COLOR` | `art.ts`    | тёмно-серый, первый проход `#3c3c3c`; утверждается на приёмке                   |
| `SHIELD_COLORS`            | `art.ts`    | уже есть (032): `[null, красный, жёлтый, жёлто-зел., светло-зел., зелёный]`     |
| `MAX_SHIELD`               | `player.ts` | 5 — число сегментов; `hud.ts`/`hud-render.ts` импортируют его (цикла нет)       |

Ширина зоны: `(MAX_SHIELD − 1) * HUD_ICON_STEP + SHIELD_SEGMENT_WIDTH = 4·10 + 8 = 48` —
совпадает с прежней `LIVES_ZONE_WIDTH`, `x = 256 − 8 − 48 = 200`. Значит
`POWER_UPS_ZONE` (156…173) и непересечение `HUD_ZONES` не затрагиваются. y сегмента в
дизайне задан словами («по центру строки значений»); отдельная ли это константа
(`SHIELD_SEGMENT_Y`) или выражение внутри — решение плана.

## Связанные модули и сущности

| Модуль / сущность   | Назначение                                          | Файлы                                                   |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Модель панели       | `HudView`, зоны, раскладка, `hudView(battle)`       | `src/game/hud.ts`, `hud.test.ts`                        |
| Отрисовка панели    | `drawHud` и секции `drawScore/Level/Lives/PowerUps` | `src/game/hud-render.ts`, `hud-render.test.ts`          |
| Пиксель-арт и цвета | `SHIELD_COLORS`, `LIFE_ICON_SPRITE`, цвета HUD      | `src/game/art.ts`, `art.test.ts`                        |
| Щит игрока          | `MAX_SHIELD`, `START_SHIELD`, `player.shield`       | `src/game/player.ts`                                    |
| Значки улучшений    | используют `LIFE_ICON_STEP/MAX_SIZE` для раскладки  | `src/game/hud.ts` (`POWER_UPS_ZONE`, `POWER_UP_SLOT_X`) |
| Сцена игры          | вызывает `drawHud(ctx, hudView(battle))` поверх боя | `src/game/scenes/play-scene.ts:61` (не меняется)        |
| Тестовый мок canvas | `recorder()` пишет `fillRect` + `fillStyle`         | `src/game/canvas-test-utils.ts`                         |

## Точки встраивания

- **Рендер:** `drawHud` в `hud-render.ts:30–35` — вызов `drawLives(ctx, view.shield)`
  заменяется на `drawShield(ctx, view.shield)`. Порядок секций и их независимость
  сохраняются. Сегмент — один `fillRect` 8×4 (как прямоугольники в
  `battle-render.ts:37,46`, `game-over-render.ts:32`), не спрайт: сегменту не нужна форма,
  а спрайт каждого цвета потребовал бы ещё одной таблицы в `art.ts`. Итог — 5 вызовов
  `fillRect` на кадр (было до 5×27 по 1×1).
- **Раскладка:** `hud.ts:37–101` — переименование констант, `SHIELD_ZONE` в `HUD_ZONES`
  вместо `LIVES_ZONE`, новые `SHIELD_SEGMENT_*` и `shieldSegmentX`.
- **Цвета:** `art.ts` — новая `SHIELD_GAUGE_EMPTY_COLOR`, удаление `LIFE_ICON_SPRITE`
  (`art.ts:32–36`). `SHIP_PALETTE` остаётся — его использует `SHIP_SPRITE`. Правило
  «`art.ts` импортирует только `sprite.ts`» не нарушается.
- **Сцена / цикл / ввод** — не затрагиваются. `dev-snapshot` и dev-хуки — не затрагиваются
  (`shield` в снимке уже есть с 031).

## Файлы и места в коде

| Файл                                                          | Что содержит                                                                                                                                                                                                                                                                                      | Что изменить                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/hud.ts`                                             | `HudView` (комментарий «until task 033», `:10`), `LIFE_ICON_*` (`:37–40`), `LIVES_ICON_SLOTS` (`:41–45`), `LIVES_ZONE` (`:68–76`), `POWER_UPS_ZONE`/`POWER_UP_SLOT_X` на `LIFE_ICON_*` (`:81–98`), `HUD_ZONES` (`:101`)                                                                           | `HUD_ICON_SIZE/STEP`; удалить `LIVES_ICON_SLOTS`; `SHIELD_SEGMENT_WIDTH/HEIGHT`, `SHIELD_ZONE` (ширина от `MAX_SHIELD`), `shieldSegmentX`; значки улучшений на `HUD_ICON_*`; комментарии (`HudView.shield`, «icons y = 14…21» у `HUD_VALUE_Y`, «shield icons (start at 200)» у `POWER_UPS_ZONE`). Новый импорт `MAX_SHIELD` из `./player`                                                                                 |
| `src/game/hud-render.ts`                                      | импорт `LIFE_ICON_SPRITE`, `LIFE_ICON_STEP`, `LIVES_*` (`:1–21`); `drawLives` (`:60–70`); doc `drawHud` (`:25–29`)                                                                                                                                                                                | `drawShield`: `MAX_SHIELD` сегментов, `i < shield` — `SHIELD_COLORS[shield]`, иначе `SHIELD_GAUGE_EMPTY_COLOR`; обновить импорты и комментарии                                                                                                                                                                                                                                                                            |
| `src/game/art.ts`                                             | `LIFE_ICON_SPRITE` (`:32–36`), `SHIELD_COLORS` (`:45–52`)                                                                                                                                                                                                                                         | удалить `LIFE_ICON_SPRITE`; добавить `SHIELD_GAUGE_EMPTY_COLOR`                                                                                                                                                                                                                                                                                                                                                           |
| `src/game/player.ts`                                          | комментарий `MAX_SHIELD` (`:18`): «LIVES_ICON_SLOTS >= MAX_SHIELD is checked by a test»                                                                                                                                                                                                           | переписать: число сегментов шкалы = `MAX_SHIELD` (имя `LIVES_ICON_SLOTS` исчезает)                                                                                                                                                                                                                                                                                                                                        |
| `src/game/hud.test.ts`                                        | импорт `LIFE_ICON_SPRITE` (`:4`), `LIFE_ICON_*`/`LIVES_*` (`:20–23`); кейсы «icon slot for every shield level» (`:169–171`), «fits all icon slots» (`:173–178`), `describe('ship icon')` (`:181–188`), значки улучшений на `LIFE_ICON_MAX_SIZE` (`:135`, `:199`, `:206`, `:211–212`)              | по таблице «033»: `SHIELD_ZONE`, `HUD_ICON_*`; «все `MAX_SHIELD` сегментов в зоне» (`shieldSegmentX(MAX_SHIELD − 1) + SHIELD_SEGMENT_WIDTH <= SHIELD_ZONE.x + width`, y-диапазон сегмента внутри зоны); `SHIELD_ZONE` в `HUD_ZONES`; кейс «ship icon» убрать (предел 8×8 для значков улучшений уже проверяют `:210–213`)                                                                                                  |
| `src/game/hud-render.test.ts`                                 | `LIFE_ICON_SPRITE`, `ICON_PIXELS` (`:82`); кейсы иконок (`:138–158`), «max» с `LIVES_ICON_SLOTS` (`:87`), «shield change → own zone» с `LIVES_ZONE` (`:106`), «places the text exactly» с `shield: 0` (`:111–118`), «colors in their places» (`:176–179`), комментарий о красном кокпите (`:183`) | `drawShield`: при `shield = k` (0, 1, 2, 5) — ровно `k` прямоугольников `SHIELD_COLORS[k]` и `MAX_SHIELD − k` `SHIELD_GAUGE_EMPTY_COLOR` в позициях `shieldSegmentX(i)`, все в `SHIELD_ZONE`. **Кейс `:111` сломается:** при `shield = 0` теперь рисуются 5 пустых сегментов — дополнить ожидание ими или сравнивать только текстовые зоны. Кейс «at most LIVES_ICON_SLOTS» удалить или заменить (см. «Открытые вопросы») |
| `src/game/art.test.ts`                                        | проверки `SHIELD_COLORS`/`SHIELD_SPRITES` (032)                                                                                                                                                                                                                                                   | по желанию — `SHIELD_GAUGE_EMPTY_COLOR` отличается от всех `SHIELD_COLORS` (пустой сегмент не путается с залитым); в таблице «033» дизайна не требуется                                                                                                                                                                                                                                                                   |
| `second-brain/game-design.md`                                 | «Экран → HUD» (`:17–23`) — ещё про иконки и жизни                                                                                                                                                                                                                                                 | заменить пункт целиком текстом из «Правки game-design.md» design.md                                                                                                                                                                                                                                                                                                                                                       |
| `second-brain/architecture/overview.md`                       | `art.ts` (`:58–60`, `LIFE_ICON_SPRITE`), `hud.ts` (`:362–367`, `LIVES_ZONE`, `LIFE_ICON_*`, «между уровнем и жизнями»), `hud-render.ts` (`:369–373`, «жизни», `drawLives`, «до 033»)                                                                                                              | описать `SHIELD_GAUGE_EMPTY_COLOR`, `SHIELD_ZONE`, сегменты, `shieldSegmentX`, `HUD_ICON_*`, `drawShield`; убрать временные пометки «до 033»                                                                                                                                                                                                                                                                              |
| `second-brain/tasks/tasks/033-hud-shield-gauge/acceptance.md` | —                                                                                                                                                                                                                                                                                                 | создать: шкала по ударам/капсулам/`?shield=N`, цвет пустых сегментов — оценка владельца                                                                                                                                                                                                                                                                                                                                   |

После правок поиск по `src/`: не должно остаться `LIFE_ICON`, `LIVES_ZONE`,
`LIVES_ICON_SLOTS`, `drawLives`, «until task 033» (сейчас все вхождения — в `hud.ts`,
`hud-render.ts`, `art.ts`, их тестах и `player.ts:18`). Исключение — `title-scene.ts:32`
(«The factory lives here») — глагол, не трогать.

## Тестируемость

Покрывается unit-тестами без canvas (мок `recorder()`):

- `hud.test.ts` — раскладка: `SHIELD_ZONE` целочисленная, в полосе HUD, не пересекается с
  остальными (существующие кейсы `layout` по `HUD_ZONES`); все `MAX_SHIELD` сегментов
  помещаются в зону по x и y; `shieldSegmentX` целые, шаг `HUD_ICON_STEP`, сегменты не
  перекрываются (`SHIELD_SEGMENT_WIDTH <= HUD_ICON_STEP`); значки улучшений — на
  `HUD_ICON_*`.
- `hud-render.test.ts` — `drawShield` через `drawHud`: число и цвет прямоугольников для
  `shield = 0…5`, точные координаты (`shieldSegmentX(i)`, y = 16, 8×4); при `shield = 0`
  все пустые; изменение щита меняет только `SHIELD_ZONE` (существующий кейс «own zone»);
  всё в полосе HUD и в зонах (кейс «max» с `shield: MAX_SHIELD`).
- Детерминизм не затрагивается: шкала — чистая функция от `shield`, `Rng`/`dt` не участвуют.

Только глазами (приёмка / `/qa`): читаемость шкалы на звёздном фоне, цвет пустых сегментов,
смена цвета по ударам и капсулам синхронно с дугой.

## Зависимости и ограничения

- Зависит от 031 (`HudView.shield`, `MAX_SHIELD`) и 032 (`SHIELD_COLORS`) — оба в рабочем
  дереве; текущие тесты `hud*.test.ts` зелёные (55 тестов).
- Разрешение 256×240: шкала строго в прежней зоне 200…247 × 14…21, раскладка панели не
  сдвигается; `HUD_HEIGHT = 24` и предел ≤ 28 не меняются.
- Импорты: `hud.ts` → `player.ts` допустим (дизайн, «Импорты»), `player` от HUD не зависит.
  `art.ts` по-прежнему импортирует только `sprite.ts` — `SHIELD_GAUGE_EMPTY_COLOR` литерал.
- Производительность: 5 `fillRect` на кадр — меньше, чем было.
- Риск: тесты, сравнивающие полный список вызовов `drawHud`, ожидали «при `shield = 0`
  справа пусто» — теперь там всегда 5 сегментов (см. кейс `hud-render.test.ts:111`).
- `SHIELD_COLORS[1]` (`#ff3b3b`) ≠ `HUD_LABEL_COLOR` (`#ff5a3c`), так что фильтр «красные
  подписи» больше не ловит пиксели щита; комментарий про кокпит (`:183`) устаревает.

## Открытые вопросы

Вопросов владельцу, блокирующих план, нет. Вкусовое — на приёмку (зафиксировано в
`description.md`): цвет пустых сегментов (`#3c3c3c`, первый проход).

Решения уровня плана (не к владельцу, дизайн их не фиксирует):

1. **`shield` вне `0…MAX_SHIELD` в `drawShield`.** Старый `drawLives` зажимал число иконок
   (`Math.min`), и есть кейс «draws at most LIVES_ICON_SLOTS». `Player` гарантирует диапазон
   (конструктор бросает `RangeError`, `addShield` не превышает максимум), `HudView.shield`
   задокументирован как `0…MAX_SHIELD`. Рекомендация: рисовать ровно `MAX_SHIELD`
   сегментов, залитые — `i < shield`; кейс «at most» заменить на «всегда `MAX_SHIELD`
   сегментов». Цвет при `shield > MAX_SHIELD` (`SHIELD_COLORS[6] = undefined`) не
   поддерживается — вход вне контракта.
2. **y сегмента** — отдельная экспортируемая константа (`SHIELD_SEGMENT_Y = 16`, удобно в
   тестах) или выражение в `drawShield`. Рекомендация — константа в `hud.ts` рядом с
   `SHIELD_SEGMENT_*`.
3. **Проверка `SHIELD_GAUGE_EMPTY_COLOR` ∉ `SHIELD_COLORS`** в `art.test.ts` — дешёвая и
   защищает приёмочную подстройку цвета; рекомендация — добавить.

Отдельных задач выносить не нужно.

## Ссылки на документацию

- `CLAUDE.md`
- `second-brain/game-design.md` — «Экран → HUD»
- `second-brain/features/008-ship-shield/design.md` — «Модули и файлы», «Интерфейсы»,
  «Пиксель-арт и цвета», «Тестирование» (таблица «033»), «Правка game-design.md», «Нарезка
  на задачи» п. 3
- `second-brain/features/008-ship-shield/discussion.md` — В9
- `second-brain/architecture/overview.md` — `art.ts`, `hud.ts`, `hud-render.ts`
- `second-brain/tasks/tasks/032-shield-on-ship/` — `SHIELD_COLORS`, формат `acceptance.md`

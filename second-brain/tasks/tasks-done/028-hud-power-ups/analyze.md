# Анализ: Улучшения в панели

## Общее описание функциональности

Последняя задача фичи 006 (пункт 4 нарезки `design.md`). Игрок уже может поймать
капсулу `S` (быстрая пуля) или `D` (две пули) — задача 027, код готов. Сейчас взятое
улучшение никак не видно. Задача — показать его в верхней панели значком: маленькая
копия капсулы, которую игрок поймал (игрок узнаёт то, что взял).

Как выглядит: в строке значений панели (y 14…21), между номером уровня и иконками жизней,
два фиксированных места — слева `S`, правее `D`. Пока улучшения нет — место пустое
(ничего не рисуется, подписи нет). Значок появляется в тот же кадр, когда улучшение
включено, и не гаснет до конца игры: ни гибель, ни смена уровня его не убирают (В6).
Новая игра — новый `Battle` → новый `Player` → `NO_POWER_UPS` → значков нет.

Фиксированные слоты, а не «подряд»: значок `D` не сдвигается, если `S` нет, и наоборот —
иконка не прыгает, когда приходит второе улучшение.

## Модели данных и состояние

Новое состояние не появляется: источник — уже существующий `Player.powerUps`
(`src/game/player.ts:87`), неизменяемый снимок `PowerUps { fastShot, doubleShot }`
(`src/game/bonus.ts`). `grantPowerUp` заменяет объект (`{ ...current, [kind]: true }`),
а не мутирует его, поэтому отдавать ссылку в `HudView` безопасно.

| Что                | Значение                                                        | Где             |
| ------------------ | --------------------------------------------------------------- | --------------- |
| `HudView.powerUps` | `PowerUps` (снимок из `battle.player.powerUps`)                 | `hud.ts`        |
| `POWER_UPS_ZONE`   | `{ x: 156, y: 14, width: 18, height: 8 }` — строка значений     | `hud.ts`        |
| `POWER_UP_SLOT_X`  | `Record<PowerUpKind, number>`: `fastShot` 156, `doubleShot` 166 | `hud.ts`        |
| Шаг слотов         | `LIFE_ICON_STEP = 10` (иконка 8 + зазор 2) — как у жизней       | `hud.ts` (есть) |
| Иконка             | `CAPSULE_SPRITES[kind]`, 8×8                                    | `bonus-art.ts`  |
| Предел иконки      | `LIFE_ICON_MAX_SIZE = 8` (решение владельца по фиче 004)        | `hud.ts` (есть) |

Геометрия (проверено по `hud.ts`): `LEVEL_ZONE` — x 108…147, `LIVES_ZONE` — x 200…247,
y 14…21. Зона улучшений x 156…173: 8 px от уровня, 26 px до жизней; слот `fastShot`
156…163, `doubleShot` 166…173; ширина 18 = 10 + 8. Высота 8 = `LIFE_ICON_MAX_SIZE`,
низ 21 < `HUD_HEIGHT = 24`. Строка подписей над зоной (y 4…10) остаётся пустой.

Цвет иконок. Иконка берётся из `CAPSULE_SPRITES` напрямую, без своей палитры и копии
спрайта: цвета капсул ещё ждут утверждения на приёмке 027 (`acceptance.md`, п. 1), и
правка цвета/буквы в `bonus-art.ts` должна менять и капсулу на поле, и значок в панели
одним местом. Нынешние цвета (на момент анализа): `S` — синяя плашка `#3a72d8`, рамка
`#142f7a`; `D` — зелёная `#3aa84a` / `#145a1e`; буква `#fff2c0`. С цветами панели
(`HUD_LABEL_COLOR = #ff5a3c`, `HUD_VALUE_COLOR = #ffffff`) не совпадают — фильтры по цвету
в `hud-render.test.ts` не задеты (см. «Тестируемость»). Тесты задачи не должны
зашивать конкретные цвета капсул — только «пиксели иконки = пиксели `CAPSULE_SPRITES`».

## Связанные модули и сущности

| Модуль / сущность | Назначение                                                          | Файлы                              |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Модель панели     | `HudView`, зоны, `HUD_ZONES`, `hudView(battle)`                     | `src/game/hud.ts`                  |
| Рендер панели     | `drawHud` → `drawScore` / `drawLevel` / `drawLives`                 | `src/game/hud-render.ts`           |
| Типы улучшений    | `PowerUpKind`, `PowerUps`, `NO_POWER_UPS`                           | `src/game/bonus.ts`                |
| Улучшения игрока  | `Player.powerUps`, `grantPowerUp`; `hit()` их не трогает            | `src/game/player.ts`               |
| Применение бонуса | `Battle.applyBonus` → `grantPowerUp` / +500                         | `src/game/battle.ts:160-165`       |
| Спрайты капсул    | `CAPSULE_SPRITES: Record<BonusKind, Sprite>`, 8×8                   | `src/game/bonus-art.ts`            |
| Размер капсулы    | `CAPSULE_SIZE = 8` (= размер спрайта, проверено в `bonus-art.test`) | `src/game/capsule.ts`              |
| Отрисовка спрайта | `drawSprite(ctx, sprite, x, y)` — 1×1 `fillRect` на пиксель         | `src/game/sprite.ts`               |
| Тестовый рекордер | `recorder()` → `FillCall[]`                                         | `src/game/canvas-test-utils.ts`    |
| Сцена             | `drawHud(ctx, hudView(this.battle))` после `drawBattle`             | `src/game/scenes/play-scene.ts:61` |

## Точки встраивания

- **Модель:** `hudView(battle)` добавляет `powerUps: battle.player.powerUps`. Это
  единственное место, где `HudView` строится из боя; других потребителей `HudView`, кроме
  `play-scene.ts:61` и тестов, нет (проверено `grep`).
- **Зоны:** `POWER_UPS_ZONE` добавляется в `HUD_ZONES` — тогда существующие тесты
  «зоны внутри полосы», «зоны не пересекаются» (`hud.test.ts`) и «рисует только в своих
  зонах» (`hud-render.test.ts`) автоматически охватывают новую секцию.
- **Рендер:** `drawHud` вызывает `drawPowerUps(ctx, view.powerUps)` после `drawLives`
  (порядок из `design.md`, «Рендер»). Для каждого включённого вида —
  `drawSprite(CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y)`; выключенный —
  ничего.
- **Сцена, цикл, ввод:** не меняются. `PlayScene` уже рисует `drawHud(hudView(battle))`
  каждый кадр; HUD рисуется после боя — поверх астероида, пролетающего над строем.
- **Импорты:** `hud.ts` получает `import type { PowerUpKind, PowerUps } from './bonus'`
  (только типы); `hud-render.ts` — значение `CAPSULE_SPRITES` из `bonus-art.ts`.
  Граница engine/game не затрагивается; циклов нет (`bonus-art → {bonus (type), sprite}`).

## Файлы и места в коде

| Файл                                           | Что содержит                                    | Что изменить / создать                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/hud.ts`                              | `HudView`, зоны, `HUD_ZONES`, `hudView`         | поле `powerUps` в `HudView`; `POWER_UPS_ZONE`, `POWER_UP_SLOT_X`; зона в `HUD_ZONES`; `hudView` берёт `battle.player.powerUps`; док-комментарии `HudView` / `hudView` («level, score and lives») дополнить                                                                                              |
| `src/game/hud-render.ts`                       | `drawHud` и секции                              | `drawPowerUps` (private, как остальные секции); вызов в `drawHud` после жизней; док `drawHud` («score, level, lives sections») дополнить                                                                                                                                                                |
| `src/game/hud.test.ts`                         | `hudView`, раскладка, вместимость               | `toEqual` в `hudView` (строка ~45) — добавить `powerUps: NO_POWER_UPS` (иначе падает в рантайме, `typecheck` это не ловит); тесты: `hudView` следует `player.powerUps`, переживает `hit()`; слоты внутри зоны и не пересекаются; иконка капсулы ≤ `LIFE_ICON_MAX_SIZE` и ≤ шага; зона в строке значений |
| `src/game/hud-render.test.ts`                  | рекордер `drawHud`                              | литералы `HudView`: `BASE` (стр. 27), `max` (стр. ~70), `labels({ level: 12, … })` (стр. ~170) — `powerUps`; `max` — с обоими улучшениями; строка `powerUps` в «a change touches only its own zone»; тесты слотов (см. «Тестируемость»)                                                                 |
| `src/game/bonus-art.ts`                        | `CAPSULE_SPRITES`                               | не менять (комментарий уже упоминает «HUD icon size (task 028)»)                                                                                                                                                                                                                                        |
| `second-brain/architecture/overview.md`        | абзацы `hud.ts`, `hud-render.ts`, граф импортов | `HudView { level, score, lives, powerUps }`, `POWER_UPS_ZONE` / `POWER_UP_SLOT_X`; `drawHud` — четыре секции, иконки улучшений = `CAPSULE_SPRITES`; граф: `hud → {config, font}` (`Battle`, `PowerUpKind`, `PowerUps` — type), `hud-render → {art, bonus-art, font, hud, sprite}`                       |
| `second-brain/game-design.md`                  | «Экран» (HUD), «Астероиды и бонусы»             | «Иконки улучшений в панели — задача 028» → описание: значки `S`/`D` между уровнем и жизнями, горят до конца игры; в абзаце HUD — упомянуть улучшения                                                                                                                                                    |
| `second-brain/tasks/tasks/028-…/acceptance.md` | —                                               | создать на стадии `do` (приёмка глазами, см. ниже)                                                                                                                                                                                                                                                      |

Запись фичи (`second-brain/features/006-…`, `features/README.md`) этой задачей не
трогается — по указанию оркестратора.

## Тестируемость

Всё, кроме вида, покрывается unit-тестами без canvas (рекордер `fillRect`).

`hud.test.ts`:

- `hudView` нового боя — `powerUps` равно `NO_POWER_UPS`;
- после `battle.player.grantPowerUp('fastShot')` / `'doubleShot'` — `hudView(battle).powerUps`
  отражает их (оба, по отдельности);
- после `battle.player.hit()` улучшения в `hudView` остаются (В6);
- раскладка: `POWER_UPS_ZONE` входит в `HUD_ZONES` (существующий тест непересечения и
  «целые координаты внутри полосы» его охватывают); оба слота — целые, внутри зоны,
  не пересекаются друг с другом (шаг ≥ ширины иконки); зона в строке значений
  (`y = HUD_VALUE_Y`, высота ≥ `LIFE_ICON_MAX_SIZE`);
- вместимость: каждый `CAPSULE_SPRITES[kind]` для `PowerUpKind` ≤ `LIFE_ICON_MAX_SIZE` по
  обеим сторонам (дизайн формулирует через `CAPSULE_SIZE <= LIFE_ICON_MAX_SIZE`; проверка
  по спрайту строже и не требует импорта `capsule.ts` — какую выбрать, решит план;
  `CAPSULE_SIZE` = размер спрайта уже проверен в `bonus-art.test.ts`).

`hud-render.test.ts`:

- без улучшений в `POWER_UPS_ZONE` ничего не рисуется;
- `fastShot` / `doubleShot` / оба — вызовы в зоне ровно равны (как мультимножество)
  `drawSprite(CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y)` для
  включённых видов: «рисуются только полученные, каждый в своём слоте»;
- фиксированность слотов: вызовы `doubleShot` одинаковы с `fastShot` и без него;
- «изменение затрагивает только свою зону» — новая строка
  `['powerUps', { ...BASE, powerUps: { fastShot: true, doubleShot: true } }, POWER_UPS_ZONE]`;
- «рисует только внутри полосы и зон» — `max`-вид с обоими улучшениями;
- существующие фильтры по цвету не ломаются: «labels the same» фильтрует
  `HUD_LABEL_COLOR` в зонах счёта/уровня; «value text» — по зонам счёта/уровня; «icons» —
  по `LIVES_ZONE`. Иконки улучшений вне этих зон, их цвета не совпадают с цветами панели.
- `'places the text exactly at the zone positions'` сравнивает весь вывод при `lives: 0`
  — проходит, пока `BASE.powerUps = NO_POWER_UPS`.

Только глазами (`acceptance.md`): значки читаются в панели при обычном масштабе, не
сливаются с номером уровня и иконками жизней, место (между уровнем и жизнями, без подписи)
устраивает; цвета значков совпадают с капсулами на поле (одна правка — в
`CAPSULE_SPRITES`).

## Зависимости и ограничения

- Зависимости выполнены в рабочем дереве (не закоммичены): 024 (`PowerUps`,
  `Player.powerUps`, `grantPowerUp`), 027 (`CAPSULE_SPRITES`). 027 ещё в `tasks/` —
  ждёт приёмки цветов; на код 028 это не влияет (иконки берут спрайт по ссылке).
- Разрешение 256×240, целочисленные координаты: все x/y слотов — целые константы.
- Производительность: не более 2 × 64 `fillRect` за кадр — пренебрежимо.
- Детерминизм не затрагивается: `rng` и `dt` не используются.
- Риск: `toEqual` в `hud.test.ts` (`hudView` → `{ level, score, lives }`) — тип объекта
  не проверяется `typecheck`, тест упадёт в рантайме, если не дополнить `powerUps`. В
  описании задачи упомянуты только литералы `hud-render.test.ts`.
- Проверить приёмку глазами напрямую трудно: нет dev-способа выдать бонус
  (`acceptance.md` 027: вид капсулы случаен, астероид — раз за уровень через 5–15 с).

## Открытые вопросы

Блокирующих нет — дизайн (`design.md`, «HUD») закрывает место, слоты, вид иконки,
отсутствие подписи и «не гаснут».

- Не вопрос задачи, а наблюдение: для приёмки глазами (и 027, и 028) пригодился бы
  dev-параметр выдачи улучшений/бонуса (напр. `?bonus=S` или `?powerUps=SD`). В рамках 028
  его не делать; при желании владельца — отдельная задача (предложение уже есть в
  `acceptance.md` задачи 027).

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md («Экран», «Астероиды и бонусы»)
- second-brain/features/006-asteroid-bonuses/design.md («HUD», «Рендер», «Интерфейсы»,
  «Тестирование», «Нарезка на задачи», п. 4)
- second-brain/features/004-hud/design.md (рецепт новой секции, свободные места панели)
- second-brain/architecture/overview.md (абзацы `hud.ts`, `hud-render.ts`, граф импортов)
- second-brain/tasks/tasks/027-capsule-bonuses/acceptance.md (цвета капсул на утверждении)

# Отзыв разработчика — раунд 2

Код: ветка `main`, коммит `deb1a83`. `npm test` (9 тестов) и `npm run typecheck` — зелёные.

## Блокеры

нет

## Рекомендации

1. **Граф импортов в «Модулях и файлах» неполный (только документация).** Указано
   `title-scene → play-scene → player → ship → {art, shot}`, но по «Поток тика» и
   «Интерфейсам» `play-scene` сам импортирует `starfield`, `art` (`SHIP_SPRITE`,
   `SHOT_COLOR`), `sprite` (`drawSprite`) и `shot` (`SHOT_WIDTH`/`SHOT_HEIGHT` для
   `fillRect`). Циклов от этого не появляется (`art → sprite`, `shot` ни от кого из
   игровых модулей не зависит), на реализацию не влияет. Предложение: дописать эти
   рёбра, чтобы граф совпадал с тем, что попадёт в `overview.md`. Необязательно.

## Вопросы

- К архитектору: нет.
- К владельцу: нет.

## Подтверждено

- **Правило целых px/тик.** Проверено в Node: `120 * (1/60) === 2` и `240 * (1/60) === 4`
  — `true`; 1000 тиков `x += 1 * 120 * (1/60)` с зажимом от `x = 120` дают ровно `241`;
  выстрел от `y = 204` становится `isOffscreen` (`y + 4 <= 0`) ровно на 52-м тике при
  `y = -4` — совпадает с дизайном. `TICK_SECONDS = 1 / TICKS_PER_SECOND`
  (`src/config.ts:6-7`) — то же значение, что берёт `main.ts`, так что инварианты
  `Number.isInteger(SPEED * TICK_SECONDS)` проверяют именно игровой шаг. Зажим
  `new Ship(1)` + `move=-1` → `-1` → `0`, `new Ship(240)` + `move=1` → `242` → `241` —
  `toBe` корректен.
- **`scene-test-utils.ts`.** Не попадает под `include: ['src/**/*.test.ts']`
  (`vite.config.ts:6-7`) — Vitest не запустит его как тест-файл; входит в
  `tsconfig.json` `include: ["src"]` и в `eslint .` — значит, проходит typecheck и
  линт как обычный код; из `main.ts` не импортируется — в бандл не попадёт. Сигнатура
  `step(scene, input, n = 1): Scene` повторяет `src/main.ts:20-24` один в один и
  совместима с `Scene.update(): Scene | void` (`src/engine/scene.ts:6`). Импорт из
  отдельного модуля вместо тест-файла — верное решение.
- **Правки `TitleScene`.** `constructor(private readonly rng: Rng)` — parameter
  property, тот же приём уже используется в `Input` (`src/engine/input.ts:24`) и
  `Starfield` (`src/game/starfield.ts:19-26`); в `tsconfig` нет `erasableSyntaxOnly`,
  так что это разрешено. Поле `rng` будет читаться в `update` (`new PlayScene(this.rng,
...)`) — `noUnusedLocals` не сработает. Переименование `_input` → `input` и возврат
  `Scene | void` (сейчас `src/game/scenes/title-scene.ts:16`) — ровно то, что нужно;
  `starfield` остаётся `private readonly` и инициализируется в теле конструктора из
  `rng` — с parameter property это работает.
- **Переименование в `art.ts`.** Путаница `sprite.ts`/`sprites.ts` снята; `art → sprite`
  и `ship → art` (вывод `SHIP_WIDTH = SHIP_SPRITE.width`) — без циклов.
- **Решения владельца В1–В7** согласованы с числами в дизайне: `SHIP_Y = 208` + 16 =
  224 < 240; старт `Math.floor((256 - 15) / 2) = 120`; `muzzleX = x + 7`,
  `muzzleY = 204`; выстрел 1×4 белый; `fire = input.pressed('fire')` — edge, без
  повтора по autorepeat (`src/engine/input.ts:41-44`), удержание не стреляет.
- **Тесты.** Сценарии `player.test.ts` с прямой установкой (`shot.y = -SHOT_HEIGHT + 1`
  → после тика `-7`, за экраном) и `play-scene.test.ts` через `step()` с удержанием
  «огня» дольше 52 тиков реализуемы на текущем `Input` (`press`/`endTick`) без canvas.
  `drawSprite` на фейковом ctx — достаточно `fillStyle`/`fillRect`.
- Пункты раунда 1 закрыты в `discussion.md` полностью; возвращаться не к чему.

## Предлагаемая нарезка на задачи

Согласен с нарезкой из `design.md` без изменений:

1. Игровая сцена и переход с титула (+ `scene-test-utils.ts`, `title-scene.test.ts`).
2. Спрайты и корабль на месте (`sprite.ts`, `art.ts`, `Ship` без движения; утверждение
   вида владельцем — В7).
3. Движение корабля (`Ship.update`, `MoveDir`, `PlayerIntent`/`readIntent`, `Player`).
4. Выстрел (`Shot`, `SHOT_COLOR`, `spawnShot`, автомат выстрела в `Player`).

Дизайн готов к постановке задач.

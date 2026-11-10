# Galaxy — CLAUDE.md

Браузерная аркада в жанре fixed shooter в стиле 8-битной приставки (NES/Денди):
строй пришельцев наверху, пикирующие атаки, корабль игрока внизу. Игра **оригинальная**
— своё название, свои спрайты и звуки; скриншоты в `second-brain/references/` — только
ориентир по жанру и общему ощущению, не макет для копирования.

## Стек и команды

- TypeScript (strict), Vite, Canvas 2D, Vitest, ESLint (flat config), Prettier. Пакетник — **npm**.
- Логическое разрешение 256×240, целочисленное масштабирование (`src/engine/screen.ts`).
- Фиксированный шаг симуляции 60 тиков/с (`src/engine/loop.ts`).

| Команда                           | Что делает                             |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | dev-сервер Vite                        |
| `npm run typecheck`               | `tsc --noEmit`                         |
| `npm run lint`                    | ESLint                                 |
| `npm test`                        | Vitest (unit-тесты `src/**/*.test.ts`) |
| `npm run build`                   | typecheck + сборка в `dist/`           |
| `npm run format` / `format:check` | Prettier                               |

Полный набор проверок перед коммитом: `format:check`, `lint`, `typecheck`, `test`, `build`.

## Структура

- `src/engine/` — движок без знания об игре: цикл, ввод, экран, RNG, интерфейс сцены.
- `src/game/` — игровая логика: сущности, сцены (`scenes/`), фон.
- `src/config.ts` — глобальные константы (разрешение, частота тиков).
- `second-brain/` — база знаний и задачи (см. ниже).

## Конвенции кода

- Логика игры — детерминированная: случайность только через `Rng` из `src/engine/rng.ts`
  (seed передаётся снаружи), время — только через `dt` тика. Это делает логику тестируемой.
- Логику (движение, коллизии, состояния) держать отдельно от отрисовки, чтобы покрывать
  тестами без canvas.
- Тесты — рядом с кодом: `foo.ts` → `foo.test.ts`.
- Код, комментарии в коде, README, коммиты, PR — **на английском**. Документы в
  `second-brain/` — на русском.
- `import type` для типов (линтер требует). Неиспользуемые аргументы — с префиксом `_`.

## Процесс работы (second-brain)

Порядок источников: **сперва `second-brain/`, потом код**.

- `second-brain/game-design.md` — что за игра, механики, что уже решено.
- `second-brain/architecture/` — заметки по архитектуре; `decisions/` — ADR.
- `second-brain/features/` — реестр фич (`README.md` — таблица).
- `second-brain/tasks/tasks/` — активные задачи, `tasks-done/` — завершённые.
  Папка задачи: `{NNN}-{описание}` (напр. `003-player-ship`), внутри
  `description.md` → `analyze.md` → `plan.md`.

Конвейер скилов: `/new-task` → `/analyze` → `/plan-implementation` → `/do` → `/fix-tests`
→ `/commit` → `/pr-review`. `/chain` и `/do-chain` прогоняют стадии субагентами.
`/feature` и `/feature-review` — работа с записями фич.

Коммиты — только по явной просьбе (скил `/commit` и есть такая просьба).

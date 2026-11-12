import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from './config';
import { Input } from './engine/input';
import { GameLoop } from './engine/loop';
import { createRng } from './engine/rng';
import type { Scene } from './engine/scene';
import { setupScreen } from './engine/screen';
import { NO_DEV_PARAMS, parseDevParams } from './game/dev-params';
import { TitleScene } from './game/scenes/title-scene';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#screen canvas not found');

const ctx = setupScreen(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);
const input = new Input();
input.attach(window);

// Dev only: ?seed / ?paused / ?level / ?lives (second-brain/architecture/dev-hooks.md).
const params = import.meta.env.DEV ? parseDevParams(window.location.search) : NO_DEV_PARAMS;
const rng = createRng(params.seed ?? Date.now());
let scene: Scene = new TitleScene(rng, { startLevel: params.startLevel, lives: params.lives });
/** Simulation ticks since page load: from the loop and from __galaxy.step(). */
let ticks = 0;

/** One fixed tick: update -> switch scene -> endTick (the order matters for `pressed`). */
function tick(): void {
  const next = scene.update(TICK_SECONDS, input);
  if (next) scene = next;
  input.endTick();
  ticks++;
}

function render(): void {
  scene.render(ctx);
}

const loop = new GameLoop(TICK_SECONDS, { update: tick, render }, { paused: params.paused });
loop.start();

// Dev only: window.__galaxy for the QA agent (second-brain/architecture/dev-hooks.md).
if (import.meta.env.DEV) {
  import('./game/dev-hooks')
    .then(({ createDevHooks }) => {
      window.__galaxy = createDevHooks({
        tick,
        render,
        input,
        loop,
        getScene: () => scene,
        getTicks: () => ticks,
      });
    })
    .catch((err: unknown) => console.error('dev hooks failed to load', err));
}

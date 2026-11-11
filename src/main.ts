import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from './config';
import { Input } from './engine/input';
import { GameLoop } from './engine/loop';
import { createRng } from './engine/rng';
import type { Scene } from './engine/scene';
import { setupScreen } from './engine/screen';
import { parseStartLevel } from './game/levels';
import { TitleScene } from './game/scenes/title-scene';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#screen canvas not found');

const ctx = setupScreen(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);
const input = new Input();
input.attach(window);

const rng = createRng(Date.now());
// Dev only: ?level=N starts from level N (anything but an integer >= 1 means level 1).
const startLevel = import.meta.env.DEV
  ? parseStartLevel(new URLSearchParams(window.location.search).get('level'))
  : undefined;
let scene: Scene = new TitleScene(rng, startLevel);

new GameLoop(TICK_SECONDS, {
  update(dt) {
    const next = scene.update(dt, input);
    if (next) scene = next;
    input.endTick();
  },
  render() {
    scene.render(ctx);
  },
}).start();

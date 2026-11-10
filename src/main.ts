import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from './config';
import { Input } from './engine/input';
import { GameLoop } from './engine/loop';
import { createRng } from './engine/rng';
import type { Scene } from './engine/scene';
import { setupScreen } from './engine/screen';
import { TitleScene } from './game/scenes/title-scene';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#screen canvas not found');

const ctx = setupScreen(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);
const input = new Input();
input.attach(window);

const rng = createRng(Date.now());
let scene: Scene = new TitleScene(rng);

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

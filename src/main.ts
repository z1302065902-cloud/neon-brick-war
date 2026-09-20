import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = new Game(canvas);
game.start();
window.__NEON_BRICK__ = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}

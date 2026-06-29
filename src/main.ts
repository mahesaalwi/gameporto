import './style.css';
import { GameEngine } from './core/GameEngine';
/**
 * Application Bootstrapper
 * PRD: src/main.ts - Application entry point.
 */

// Get the app container
const app = document.querySelector<HTMLDivElement>('#app')!;
app.style.cssText = `
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: fixed;
  top: 0;
  left: 0;
`;

// Initialize and start the game engine
async function bootstrap(): Promise<void> {
  const engine = new GameEngine(app);

  try {
    await engine.init();
    engine.start();
  } catch (error) {
    console.error('[GameEngine] Fatal initialization error:', error);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.remove();
    app.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #050510;
        color: #ff0044;
        font-family: 'Courier New', monospace;
        text-align: center;
        padding: 2rem;
      ">
        <div>
          <h1 style="font-size: 2rem; margin-bottom: 1rem;">⚠ SYSTEM ERROR</h1>
          <p style="color: #888;">Failed to initialize the neural link.</p>
          <p style="color: #666; font-size: 0.8rem; margin-top: 1rem;">
            Error: ${error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button onclick="location.reload()" style="
            margin-top: 1.5rem;
            padding: 0.8rem 2rem;
            background: #ff0044;
            border: none;
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            letter-spacing: 2px;
          ">RETRY CONNECTION</button>
        </div>
      </div>
    `;
  }
}

bootstrap();

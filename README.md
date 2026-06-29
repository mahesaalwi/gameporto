# GamePorto 🎮

Welcome to **GamePorto**, an interactive, 3D web-based portfolio experience built like a fully playable game! Explore a beautifully crafted cyberpunk world, collect treasure boxes to discover my portfolio data, and face off against a boss monster to unlock the final achievements.

## ✨ Features

- **Immersive 3D World:** Explore a stunning, neon-lit cyberpunk map.
- **Third-Person Controller:** Smooth, GTA-style character controller with a responsive chase camera and varied combat animations.
- **Physics-Driven Gameplay:** Powered by Rapier3D for accurate collision detection, gravity, jumping, and character movement.
- **Interactive UI & Collectibles:** Discover hidden treasure boxes that reveal detailed portfolio information (About, Expertise, Tools, Experience) with slick, holographic UI popups.
- **Boss Encounter:** A final boss fight mechanic that dynamically reacts to the player's interactions.
- **Performance Optimized:** Built with efficient resource management, fixed physics timesteps, and anti-clipping collision layers.

## 🛠️ Tech Stack & Tools

This project is built using modern web development tools and libraries:

### Core Languages
- **TypeScript** - Strongly typed Javascript for scalable and robust logic.
- **HTML5 & CSS3** - Semantic structure and modern styling.

### Frameworks & Libraries
- **[Three.js](https://threejs.org/)** - For rendering the 3D graphics, models, and environments.
- **[@dimforge/rapier3d-compat](https://rapier.rs/)** - Fast and deterministic physics engine for collision and gravity.
- **[Vite](https://vitejs.dev/)** - Next-generation frontend tooling for lightning-fast HMR and optimized production builds.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Ensure you have **Node.js** (v16+ recommended) and **npm** installed on your system.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mahesaalwi/gameporto.git
   cd gameporto
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the local server address (usually `http://localhost:5173`).

## 📦 Build for Production

To create a production-ready build of the portfolio:

```bash
npm run build
```
This will compile the TypeScript code and bundle all assets into the `dist` directory. The built project is highly optimized for performance.

## 🎮 How to Play

- **Movement:** Use `W`, `A`, `S`, `D` keys.
- **Camera:** Use the `Mouse` or touch controls to orbit the camera around the player.
- **Action:** Press `SPACE` to interact or attack!
- **Objective:** Find the 4 floating treasure chests scattered around the map to read my portfolio data.

---

*Crafted with passion to bridge the gap between web development and interactive gaming.*

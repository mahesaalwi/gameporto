import { globalEvents } from '../utils/EventEmitter';
import type { TreasureType } from '../entities/TreasureBox';
import portfolioData from '../data/portfolio.json';
import { GAME_CONSTANTS } from '../data/constants';

/**
 * UIManager - Manages all HTML/CSS overlay UI elements.
 */
export class UIManager {
  private overlay: HTMLDivElement;
  private loadingScreen: HTMLDivElement;
  private popupContainer: HTMLDivElement;
  private bossUI: HTMLDivElement;
  private clientsUI: HTMLDivElement;
  private instructionsUI: HTMLDivElement;
  private powerUpUI: HTMLDivElement;
  private fadeOverlay: HTMLDivElement;
  private introDialogue: HTMLDivElement;

  private boundHandlers: Map<string, (...args: unknown[]) => void> = new Map();
  private loadProgressInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.overlay = this.createDiv('game-ui-overlay');
    this.loadingScreen = this.createLoadingScreen();
    this.popupContainer = this.createPopupContainer();
    this.bossUI = this.createBossUI();
    this.clientsUI = this.createClientsUI();
    this.instructionsUI = this.createInstructionsUI();
    this.powerUpUI = this.createPowerUpUI();
    this.fadeOverlay = this.createDiv('fade-overlay');
    this.introDialogue = this.createIntroDialogue();

    this.overlay.appendChild(this.fadeOverlay);
    document.body.appendChild(this.overlay);
    this.setupEventListeners();
  }

  private createDiv(id: string, className: string = ''): HTMLDivElement {
    const div = document.createElement('div');
    div.id = id;
    if (className) div.className = className;
    return div;
  }

  private setupEventListeners(): void {
    const onTreasureOpen = (type: unknown) => this.showTreasurePopup(type as TreasureType);
    const onBossEncounter = () => this.showBossEncounter();
    const onClientsShow = () => this.showClients();
    const onPowerUpCollected = (type: unknown) => this.showPowerUpNotification(type as TreasureType);

    globalEvents.on('treasure:open', onTreasureOpen);
    globalEvents.on('boss:encounter', onBossEncounter);
    globalEvents.on('clients:show', onClientsShow);
    globalEvents.on('powerup:collected', onPowerUpCollected);

    this.boundHandlers.set('treasure:open', onTreasureOpen);
    this.boundHandlers.set('boss:encounter', onBossEncounter);
    this.boundHandlers.set('clients:show', onClientsShow);
    this.boundHandlers.set('powerup:collected', onPowerUpCollected);
  }

  public dispose(): void {
    // Cleanup events
    const onTreasureOpen = this.boundHandlers.get('treasure:open');
    if (onTreasureOpen) globalEvents.off('treasure:open', onTreasureOpen);
    
    const onBossEncounter = this.boundHandlers.get('boss:encounter');
    if (onBossEncounter) globalEvents.off('boss:encounter', onBossEncounter);
    
    const onClientsShow = this.boundHandlers.get('clients:show');
    if (onClientsShow) globalEvents.off('clients:show', onClientsShow);
    
    const onPowerUpCollected = this.boundHandlers.get('powerup:collected');
    if (onPowerUpCollected) globalEvents.off('powerup:collected', onPowerUpCollected);
    
    this.boundHandlers.clear();
    
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }

  private createLoadingScreen(): HTMLDivElement {
    const screen = this.createDiv('loading-screen');
    const strings = GAME_CONSTANTS.UI.STRINGS;
    
    screen.innerHTML = `
      <div class="loading-content">
        <div class="loading-title glitch-anim">${strings.LOADING_TITLE}</div>
        <div class="loading-sub">${strings.LOADING_SUB}</div>
        <div class="loading-bar-container">
          <div id="loading-bar" class="loading-bar-fill"></div>
        </div>
        <div class="loading-desc">${strings.LOADING_DESC}</div>
      </div>
    `;
    document.body.appendChild(screen);

    let progress = 0;
    this.loadProgressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        if (this.loadProgressInterval) {
          clearInterval(this.loadProgressInterval);
          this.loadProgressInterval = null;
        }
      }
      const bar = document.getElementById('loading-bar');
      if (bar) bar.style.width = `${progress}%`;
    }, 200);

    return screen;
  }

  private createIntroDialogue(): HTMLDivElement {
    const ui = this.createDiv('intro-dialogue');
    ui.innerHTML = `
      <div class="dialogue-box">
        <div class="dialogue-avatar"></div>
        <div class="dialogue-content">
          <h3 class="dialogue-name">Kaze</h3>
          <p id="intro-text" class="dialogue-text"></p>
          <div class="dialogue-prompt">▼ Press Space to start</div>
        </div>
      </div>
    `;

    const closeHandler = (e: KeyboardEvent | MouseEvent) => {
      if (ui.classList.contains('visible')) {
        if (e instanceof MouseEvent || (e instanceof KeyboardEvent && e.code === 'Space')) {
          ui.classList.remove('visible');
          setTimeout(() => { ui.style.display = 'none'; }, 500);
          window.removeEventListener('keydown', closeHandler);
          ui.removeEventListener('click', closeHandler);
        }
      }
    };
    window.addEventListener('keydown', closeHandler);
    ui.addEventListener('click', closeHandler);
    this.overlay.appendChild(ui);
    return ui;
  }

  public playFadeIn(): void {
    this.fadeOverlay.classList.add('fade-out');
    setTimeout(() => { this.fadeOverlay.style.display = 'none'; }, 1500);
  }

  public showIntroDialogue(): void {
    this.introDialogue.style.display = 'flex';
    setTimeout(() => this.introDialogue.classList.add('visible'), 50);

    const typeWriter = (text: string, element: HTMLElement, speed = 30) => {
      element.innerHTML = '';
      let i = 0;
      const type = () => {
        if (i < text.length) {
          element.innerHTML += text.charAt(i);
          i++;
          setTimeout(type, speed);
        }
      };
      type();
    };

    const textEl = document.getElementById('intro-text');
    if (textEl) {
      typeWriter("Yo! Welcome to my interactive portfolio. Use W,A,S,D to move around and find the treasure boxes to see my skills and experience. Have fun!", textEl);
    }
  }

  public hideLoading(): void {
    if (this.loadProgressInterval) {
      clearInterval(this.loadProgressInterval);
      this.loadProgressInterval = null;
    }
    setTimeout(() => {
      this.loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        this.loadingScreen.style.display = 'none';
        this.instructionsUI.classList.add('visible');
        setTimeout(() => this.instructionsUI.classList.remove('visible'), 5000);
      }, 800);
    }, 500);
  }

  private createPopupContainer(): HTMLDivElement {
    const container = this.createDiv('popup-container');
    this.overlay.appendChild(container);
    return container;
  }

  private showTreasurePopup(type: TreasureType): void {
    const data = portfolioData[type];
    if (!data) return;

    const accentColor = '#' + (GAME_CONSTANTS.UI.POWER_UP_COLORS[type] || 0xffffff).toString(16).padStart(6, '0');
    let content = '';

    if (type === 'about') {
      const about = data as typeof portfolioData.about;
      content = `
        <div class="popup-header-centered">
          <div class="popup-icon">🧑‍💻</div>
          <h2 class="popup-title">${about.name}</h2>
          <p class="popup-accent" style="color: ${accentColor}">${about.title}</p>
          <p class="popup-tagline">"${about.tagline}"</p>
        </div>
        <div class="popup-section">
          <p class="popup-bio">${about.bio}</p>
        </div>
        <div class="popup-meta-row">
          <span class="popup-meta-pill">📍 ${about.location}</span>
          <span class="popup-meta-pill">✉️ ${about.email}</span>
        </div>
      `;
    } else if (type === 'expertise') {
      const expertise = data as typeof portfolioData.expertise;
      content = `
        <div class="popup-header-bar" style="--accent: ${accentColor}">
          <div class="popup-bar-line" style="background: ${accentColor}"></div>
          <h2 class="popup-title">${expertise.title}</h2>
        </div>
        <div class="popup-grid">
          ${expertise.items.map(item => `
            <div class="popup-card" style="--accent: ${accentColor}">
              <div class="popup-card-header">
                <span class="popup-card-icon">${item.icon}</span>
                <h3>${item.name}</h3>
              </div>
              <p>${item.description}</p>
            </div>
          `).join('')}
        </div>
      `;
    } else if (type === 'tools') {
      const tools = data as typeof portfolioData.tools;
      const categories = [...new Set(tools.items.map(t => t.category))];
      content = `
        <div class="popup-header-bar" style="--accent: ${accentColor}">
          <div class="popup-bar-line" style="background: ${accentColor}"></div>
          <h2 class="popup-title">${tools.title}</h2>
        </div>
        ${categories.map(cat => `
          <div class="popup-category">
            <span class="popup-category-label">${cat}</span>
            <div class="popup-category-line"></div>
          </div>
          <div class="popup-tags">
            ${tools.items.filter(t => t.category === cat).map(tool => `
              <span class="popup-tag" style="--accent: ${accentColor}">${tool.name}</span>
            `).join('')}
          </div>
        `).join('')}
      `;
    } else if (type === 'experience') {
      const experience = data as typeof portfolioData.experience;
      content = `
        <div class="popup-header-bar" style="--accent: ${accentColor}">
          <div class="popup-bar-line" style="background: ${accentColor}"></div>
          <h2 class="popup-title">${experience.title}</h2>
        </div>
        <div class="popup-timeline" style="--accent: ${accentColor}">
          ${experience.items.map(item => `
            <div class="popup-timeline-item">
              <div class="popup-timeline-dot" style="border-color: ${accentColor}; box-shadow: 0 0 12px ${accentColor}60"></div>
              <span class="popup-period">${item.period}</span>
              <h3 class="popup-role">${item.role}</h3>
              <div class="popup-company" style="color: ${accentColor}">${item.company}</div>
              <p class="popup-desc">${item.description}</p>
            </div>
          `).join('')}
        </div>
      `;
    }

    this.popupContainer.innerHTML = `
      <div class="popup-content">
        <button id="popup-close" class="popup-close-btn">✕</button>
        ${content}
      </div>
    `;

    this.popupContainer.classList.add('visible');
    
    const closeBtn = document.getElementById('popup-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.popupContainer.classList.remove('visible'));
    
    // Click outside to close
    this.popupContainer.addEventListener('click', (e) => {
      if (e.target === this.popupContainer) this.popupContainer.classList.remove('visible');
    });
  }

  private createBossUI(): HTMLDivElement {
    const ui = this.createDiv('boss-ui');
    ui.innerHTML = `
      <div class="boss-warning pulse-anim">⚠ BOSS ENCOUNTER ⚠</div>
      <div class="boss-sub">Press SPACE to attack!</div>
    `;
    this.overlay.appendChild(ui);
    return ui;
  }

  private showBossEncounter(): void {
    this.bossUI.classList.add('visible');
    setTimeout(() => this.bossUI.classList.remove('visible'), 3000);
  }

  private createClientsUI(): HTMLDivElement {
    const ui = this.createDiv('clients-ui');
    const clients = portfolioData.clients;
    
    ui.innerHTML = `
      <div class="clients-content">
        <div class="clients-header">BOSS DEFEATED</div>
        <h2 class="clients-title">${clients.title}</h2>
        <div class="clients-grid">
          ${clients.logos.map(c => `<div class="client-card" style="color: ${c.color}; border-color: ${c.color}30">${c.name}</div>`).join('')}
        </div>
        <button id="clients-close" class="clients-btn">CONTINUE EXPLORING</button>
      </div>
    `;
    this.overlay.appendChild(ui);
    return ui;
  }

  private showClients(): void {
    this.clientsUI.classList.add('visible');
    const closeBtn = document.getElementById('clients-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.clientsUI.classList.remove('visible'));
  }

  private createInstructionsUI(): HTMLDivElement {
    const ui = this.createDiv('instructions-ui');
    ui.innerHTML = `
      <div class="instructions-content">
        <div class="instructions-main">🎮 Use <strong>WASD</strong> to move | <strong>SPACE</strong> to attack</div>
        <div class="instructions-sub">Find treasure chests to discover portfolio data. Defeat the boss to unlock client logos!</div>
      </div>
    `;
    this.overlay.appendChild(ui);
    return ui;
  }

  private createPowerUpUI(): HTMLDivElement {
    const ui = this.createDiv('powerup-ui');
    this.overlay.appendChild(ui);
    return ui;
  }

  private showPowerUpNotification(type: TreasureType): void {
    this.powerUpUI.innerHTML = `<div class="powerup-content type-${type}">${type.toUpperCase()} POWER-UP ACQUIRED! (+DMG)</div>`;
    this.powerUpUI.classList.add('visible');
    setTimeout(() => this.powerUpUI.classList.remove('visible'), 4000);
  }
}

import { AssetLoader } from '@shared/asset-loader';
import { Engine } from '@shared/engine';
import { MapLayer } from '@shared/map-layer';
import { Sprite, Sprites } from '@shared/sprite';
import { Tiles } from '@shared/tile';
import { XmlLoader } from '@shared/xml-loader';

const GAME_TILE_SIZE = 512;
Engine.tileWidth = GAME_TILE_SIZE;
Engine.tileHeight = GAME_TILE_SIZE;

interface HobbitTextures {
  down: HTMLImageElement;
  right: HTMLImageElement;
  up: HTMLImageElement;
  left: HTMLImageElement;
}

interface WorldEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  sprite?: Sprite;
  texture?: HTMLImageElement;
  isItem?: boolean;
  posture?: number;
  name?: string;
}

interface LightningStrike {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  points: { x: number; y: number }[];
  lifetime: number;
  maxLifetime: number;
}

class GameApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private tiles!: Tiles;
  private sprites!: Sprites;
  private mapLayer!: MapLayer;

  private hobbitTextures!: HobbitTextures;

  private player = {
    x: 2300,
    y: 2300,
    width: 256,
    height: 512,
    baseSpeed: 10,
    facing: 'down' as 'down' | 'up' | 'left' | 'right',
    inventory: [] as WorldEntity[],
  };

  private worldEntities: WorldEntity[] = [];
  private bgAudio: HTMLAudioElement | null = null;
  private audioStarted: boolean = false;
  private audioCtx: AudioContext | null = null;

  private camera = {
    x: 2300,
    y: 2300,
    zoom: 0.5,
    follow: true,
  };

  private keysDown: Set<string> = new Set();
  private mouse = { x: -1000, y: -1000 };
  private showInventory: boolean = false;

  private touchMovement = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;
  private touchMode: 'auto' | 'on' | 'off' = 'auto';

  // Canvas pointer navigation (drag to pan, pinch to zoom)
  private activeCanvasPointers: Map<number, { x: number; y: number }> = new Map();
  private canvasDragStart: { x: number; y: number; camX: number; camY: number } | null = null;
  private canvasHasDragged = false;
  private initialPinchDist: number | null = null;
  private initialPinchZoom = 0.5;

  private activeLightnings: LightningStrike[] = [];
  private screenFlash: number = 0; // alpha for white flash

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.initTouchControls();
    this.bindEvents();
  }

  public async init(): Promise<void> {
    const statusMsg = document.getElementById('status-msg');
    try {
      if (statusMsg) statusMsg.textContent = 'Loading game assets...';

      // 1. Load tiles & sprites definitions
      const data = await AssetLoader.loadCoreGameData();
      this.tiles = data.tiles;
      this.sprites = data.sprites;

      // 2. Load Hobbit character textures (256x512 native)
      const [hDown, hRight, hUp, hLeft] = await Promise.all([
        AssetLoader.loadImage('/assets/characters/hobbit/hobitti_edesta.png'),
        AssetLoader.loadImage('/assets/characters/hobbit/hobitti_oikealta.png'),
        AssetLoader.loadImage('/assets/characters/hobbit/hobitti_takaa.png'),
        AssetLoader.loadImage('/assets/characters/hobbit/hobitti_vasemmalta.png'),
      ]);
      this.hobbitTextures = { down: hDown, right: hRight, up: hUp, left: hLeft };

      // 3. Load audio
      this.bgAudio = await AssetLoader.loadAudio('/assets/sounds/ropemid.wav');
      if (this.bgAudio) {
        this.bgAudio.loop = true;
      }

      await this.loadMap('/assets/data/Default.xml');

      if (statusMsg) {
        statusMsg.textContent = 'WASD to move · Space for lightning · Drag to pan';
        setTimeout(() => {
          if (statusMsg) statusMsg.style.display = 'none';
        }, 5000);
      }

      requestAnimationFrame(() => this.loop());
    } catch (err) {
      console.error('Failed to init game:', err);
      if (statusMsg) statusMsg.textContent = 'Error loading game. Check console.';
    }
  }

  private async loadMap(url: string): Promise<void> {
    const xml = await AssetLoader.loadText(url);
    const mapData = XmlLoader.parseMapXml(xml);

    this.mapLayer = new MapLayer(mapData.sizeX, mapData.sizeY);
    for (let j = 0; j < mapData.rows.length; j++) {
      const row = mapData.rows[j];
      for (let i = 0; i < row.tiles.length; i++) {
        const t = row.tiles[i];
        const tileObj = this.tiles.getTileWithId(t.id);
        this.mapLayer.setTile(i, j, tileObj, t.posture);
      }
    }

    this.worldEntities = [];
    for (const s of mapData.sprites) {
      const spriteObj = this.sprites.getSpriteWithId(s.spriteId);
      const sizePx = spriteObj.size * Engine.basicWidth;
      this.worldEntities.push({
        x: s.positionX,
        y: s.positionY,
        width: sizePx,
        height: sizePx,
        sprite: spriteObj,
        texture: spriteObj.texture ?? undefined,
        isItem: spriteObj.isItem,
        posture: s.posture ?? 0,
        name: `Item ${spriteObj.id}`,
      });
    }

    this.player.x = 2300;
    this.player.y = 2300;
    this.camera.x = 2300;
    this.camera.y = 2300;
  }

  public strikeLightningInFront(): void {
    const strikeOffset = 250;
    let targetX = this.player.x;
    let targetY = this.player.y;
    if (this.player.facing === 'up') targetY -= strikeOffset;
    else if (this.player.facing === 'down') targetY += strikeOffset;
    else if (this.player.facing === 'left') targetX -= strikeOffset;
    else if (this.player.facing === 'right') targetX += strikeOffset;
    this.strikeLightning(targetX, targetY);
  }

  private initTouchControls(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const savedMode = localStorage.getItem('rope_touch_mode') as 'auto' | 'on' | 'off' | null;
    if (urlParams.get('touch') === '1' || urlParams.get('touch') === 'on') {
      this.touchMode = 'on';
    } else if (savedMode === 'on' || savedMode === 'off' || savedMode === 'auto') {
      this.touchMode = savedMode;
    } else {
      this.touchMode = 'auto';
    }

    const modeToggleBtn = document.getElementById('touch-mode-toggle');
    const updateToggleBtnText = () => {
      if (modeToggleBtn) {
        modeToggleBtn.textContent = `Touch: ${this.touchMode.charAt(0).toUpperCase() + this.touchMode.slice(1)}`;
      }
    };
    updateToggleBtnText();

    if (modeToggleBtn) {
      modeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.touchMode === 'auto') this.touchMode = 'on';
        else if (this.touchMode === 'on') this.touchMode = 'off';
        else this.touchMode = 'auto';
        localStorage.setItem('rope_touch_mode', this.touchMode);
        updateToggleBtnText();
        this.applyTouchVisibility();
      });
    }

    this.applyTouchVisibility();
    window.addEventListener('resize', () => this.applyTouchVisibility());

    // Virtual Joystick logic
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');

    if (joystickZone && joystickBase && joystickThumb) {
      joystickZone.addEventListener('contextmenu', (e) => e.preventDefault());
      joystickZone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

      const onPointerDown = (e: PointerEvent) => {
        if (this.joystickPointerId !== null) return;
        this.joystickPointerId = e.pointerId;
        joystickZone.classList.add('active');
        try {
          joystickZone.setPointerCapture(e.pointerId);
        } catch {}
        this.startAudio();
        this.updateJoystickPosition(e, joystickBase, joystickThumb);
        e.preventDefault();
        e.stopPropagation();
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerId === this.joystickPointerId) {
          this.updateJoystickPosition(e, joystickBase, joystickThumb);
          e.preventDefault();
          e.stopPropagation();
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.pointerId === this.joystickPointerId) {
          this.resetJoystick(joystickZone, joystickThumb);
          try {
            joystickZone.releasePointerCapture(e.pointerId);
          } catch {}
          this.joystickPointerId = null;
          e.preventDefault();
          e.stopPropagation();
        }
      };

      joystickZone.addEventListener('pointerdown', onPointerDown);
      joystickZone.addEventListener('pointermove', onPointerMove);
      joystickZone.addEventListener('pointerup', onPointerUp);
      joystickZone.addEventListener('pointercancel', onPointerUp);

      window.addEventListener('pointerup', (e) => {
        if (e.pointerId === this.joystickPointerId) {
          this.resetJoystick(joystickZone, joystickThumb);
          this.joystickPointerId = null;
        }
      });
      window.addEventListener('pointercancel', (e) => {
        if (e.pointerId === this.joystickPointerId) {
          this.resetJoystick(joystickZone, joystickThumb);
          this.joystickPointerId = null;
        }
      });
      window.addEventListener('blur', () => {
        this.resetJoystick(joystickZone, joystickThumb);
        this.joystickPointerId = null;
        this.keysDown.clear();
      });
    }

    // Touch Action Buttons
    const bindButton = (id: string, action: () => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.startAudio();
        btn.classList.add('pressed');
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {}
        action();
      };

      const onUp = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('pressed');
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch {}
      };

      btn.addEventListener('pointerdown', onDown);
      btn.addEventListener('pointerup', onUp);
      btn.addEventListener('pointercancel', onUp);
    };

    bindButton('btn-lightning', () => this.strikeLightningInFront());
    bindButton('btn-inventory', () => {
      this.showInventory = !this.showInventory;
      this.updateInventoryBtnUI();
    });
    bindButton('btn-zoom-in', () => { this.camera.zoom = Math.min(1.0, this.camera.zoom + 0.25); });
    bindButton('btn-zoom-out', () => { this.camera.zoom = Math.max(0.25, this.camera.zoom - 0.25); });

    this.updateCameraFollowUI();
    this.updateInventoryBtnUI();
  }

  public updateCameraFollowUI(): void {
    this.updateCanvasCursor();
  }

  public updateCanvasCursor(isDragging: boolean = false): void {
    if (isDragging) {
      this.canvas.style.cursor = 'grabbing';
    } else if (!this.camera.follow) {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  public updateInventoryBtnUI(): void {
    const btn = document.getElementById('btn-inventory');
    if (btn) {
      btn.classList.toggle('active', this.showInventory);
    }
  }

  private applyTouchVisibility(): void {
    const touchControlsEl = document.getElementById('touch-controls');
    if (!touchControlsEl) return;

    let shouldShow = false;
    if (this.touchMode === 'on') {
      shouldShow = true;
    } else if (this.touchMode === 'off') {
      shouldShow = false;
    } else {
      // auto mode: coarse pointer, touch capability, hover none, or small viewport
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      const isHoverNone = window.matchMedia('(hover: none)').matches;
      const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const isSmallScreen = window.innerWidth <= 1024 || window.innerHeight <= 650;
      shouldShow = isCoarse || isHoverNone || hasTouch || isSmallScreen;
    }

    if (shouldShow) {
      touchControlsEl.classList.remove('touch-hidden');
    } else {
      touchControlsEl.classList.add('touch-hidden');
    }
  }

  private updateJoystickPosition(e: PointerEvent, base: HTMLElement, thumb: HTMLElement): void {
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2;

    const rawDx = e.clientX - centerX;
    const rawDy = e.clientY - centerY;
    const dist = Math.hypot(rawDx, rawDy);

    let clampedX = rawDx;
    let clampedY = rawDy;
    if (dist > maxRadius) {
      clampedX = (rawDx / dist) * maxRadius;
      clampedY = (rawDy / dist) * maxRadius;
    }

    thumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    this.touchMovement.x = clampedX / maxRadius;
    this.touchMovement.y = clampedY / maxRadius;
  }

  private resetJoystick(zone: HTMLElement, thumb: HTMLElement): void {
    zone.classList.remove('active');
    thumb.style.transform = 'translate(0px, 0px)';
    this.touchMovement.x = 0;
    this.touchMovement.y = 0;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
      this.startAudio();

      if (e.code === 'KeyF' || e.code === 'KeyZ') {
        this.camera.follow = !this.camera.follow;
        this.updateCameraFollowUI();
      }

      if (e.code === 'KeyI') {
        this.showInventory = !this.showInventory;
        this.updateInventoryBtnUI();
      }

      if (e.code === 'PageUp' || e.code === 'Equal') {
        this.camera.zoom = Math.min(1.0, this.camera.zoom + 0.25);
      }
      if (e.code === 'PageDown' || e.code === 'Minus') {
        this.camera.zoom = Math.max(0.25, this.camera.zoom - 0.25);
      }

      // 'P' picks up nearby items
      if (e.code === 'KeyP') {
        this.pickupNearbyItem();
      }

      // Space bar triggers Lightning strike in front of player
      if (e.code === 'Space') {
        this.strikeLightningInFront();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    // Pointer events on canvas: supports touch-drag panning, pinch zoom, and tap lightning
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvas) return;
      this.startAudio();

      const rect = this.canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const clickY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

      // Tap on or outside inventory modal to close
      if (this.showInventory) {
        const invW = 380;
        const invH = 240;
        const invX = (this.canvas.width - invW) / 2;
        const invY = (this.canvas.height - invH) / 2;

        const isInside = clickX >= invX && clickX <= invX + invW && clickY >= invY && clickY <= invY + invH;
        const isCloseBtn = clickX >= invX + invW - 40 && clickX <= invX + invW && clickY >= invY && clickY <= invY + 45;

        if (!isInside || isCloseBtn) {
          this.showInventory = false;
          this.updateInventoryBtnUI();
          return;
        }
      }

      this.activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activeCanvasPointers.size === 1) {
        this.canvasDragStart = { x: e.clientX, y: e.clientY, camX: this.camera.x, camY: this.camera.y };
        this.canvasHasDragged = false;
        this.initialPinchDist = null;
      } else if (this.activeCanvasPointers.size === 2) {
        const [p1, p2] = Array.from(this.activeCanvasPointers.values());
        this.initialPinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.initialPinchZoom = this.camera.zoom;
        this.canvasHasDragged = true;
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.activeCanvasPointers.has(e.pointerId)) {
        this.activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;

      // Two-finger pinch-to-zoom
      if (this.activeCanvasPointers.size === 2 && this.initialPinchDist !== null) {
        const [p1, p2] = Array.from(this.activeCanvasPointers.values());
        const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const ratio = currentDist / this.initialPinchDist;
        this.camera.zoom = Math.min(1.0, Math.max(0.25, Math.round(this.initialPinchZoom * ratio * 20) / 20));
        return;
      }

      // One-finger screen drag panning (Z-mode / free drag)
      if (this.activeCanvasPointers.size === 1 && this.canvasDragStart) {
        const dx = e.clientX - this.canvasDragStart.x;
        const dy = e.clientY - this.canvasDragStart.y;
        if (!this.canvasHasDragged && Math.hypot(dx, dy) > 8) {
          this.canvasHasDragged = true;
          this.camera.follow = false;
          this.updateCameraFollowUI();
        }
        if (this.canvasHasDragged) {
          this.updateCanvasCursor(true);
          this.camera.x = this.canvasDragStart.camX - dx / this.camera.zoom;
          this.camera.y = this.canvasDragStart.camY - dy / this.camera.zoom;
        }
      }
    });

    const onCanvasPointerEnd = (e: PointerEvent) => {
      this.updateCanvasCursor(false);
      if (this.activeCanvasPointers.size === 1 && !this.canvasHasDragged && !this.showInventory) {
        // Clean tap/click: strike lightning at world coordinate
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const clickScreenX = (e.clientX - rect.left) * scaleX;
        const clickScreenY = (e.clientY - rect.top) * scaleY;

        const centeredX = clickScreenX - this.canvas.width / 2;
        const centeredY = clickScreenY - this.canvas.height / 2;
        const worldX = this.camera.x + centeredX / this.camera.zoom;
        const worldY = this.camera.y + centeredY / this.camera.zoom;

        this.strikeLightning(worldX, worldY);
      }

      this.activeCanvasPointers.delete(e.pointerId);
      if (this.activeCanvasPointers.size < 2) {
        this.initialPinchDist = null;
      }
      if (this.activeCanvasPointers.size === 0) {
        this.canvasDragStart = null;
        this.canvasHasDragged = false;
      }
    };

    this.canvas.addEventListener('pointerup', onCanvasPointerEnd);
    this.canvas.addEventListener('pointercancel', onCanvasPointerEnd);
  }

  private startAudio(): void {
    if (!this.audioStarted && this.bgAudio) {
      this.bgAudio.play().catch(() => {});
      this.audioStarted = true;
    }
  }

  public strikeLightning(targetX: number, targetY: number): void {
    const startX = targetX + (Math.random() - 0.5) * 100;
    const startY = targetY - 1200;

    // Generate procedural jagged bolt points
    const segments = 12;
    const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const interpX = startX + (targetX - startX) * t;
      const interpY = startY + (targetY - startY) * t;
      const jitter = (Math.random() - 0.5) * 60;
      points.push({ x: interpX + jitter, y: interpY });
    }
    points.push({ x: targetX, y: targetY });

    this.activeLightnings.push({
      targetX,
      targetY,
      startX,
      startY,
      points,
      lifetime: 14,
      maxLifetime: 14,
    });

    this.screenFlash = 0.45; // trigger dramatic screen flash
    this.playThunderSound();
  }

  private playThunderSound(): void {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Procedural synthetic thunder crackle & boom
      const duration = 1.2;
      const bufferSize = this.audioCtx.sampleRate * duration;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        const env = Math.exp((-i / bufferSize) * 5);
        data[i] = lastOut * 3.5 * env;
      }

      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, this.audioCtx.currentTime + duration);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.7, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      noise.start();
    } catch {
      // AudioContext might be blocked before first user click
    }
  }

  private pickupNearbyItem(): void {
    const pickupRadius = 150;
    for (let i = this.worldEntities.length - 1; i >= 0; i--) {
      const ent = this.worldEntities[i];
      if (!ent.isItem) continue;

      const dist = Math.hypot(this.player.x - ent.x, this.player.y - ent.y);
      if (dist < pickupRadius) {
        this.player.inventory.push(ent);
        this.worldEntities.splice(i, 1);
        console.log(`Picked up: ${ent.name}`);
        break;
      }
    }
  }

  private isTileWalkable(worldX: number, worldY: number): boolean {
    if (!this.mapLayer) return true;
    const cell = Engine.vectorToCell(worldX, worldY);
    if (cell.x < 0 || cell.x >= this.mapLayer.width || cell.y < 0 || cell.y >= this.mapLayer.height) {
      return false; // Out of bounds is impassable
    }
    const tile = this.mapLayer.getTile(cell.x, cell.y);
    if (!tile) return false;
    return tile.slowFactor > 0;
  }

  private getEntityObstacleBox(ent: WorldEntity): { left: number; right: number; top: number; bottom: number } | null {
    const id = ent.sprite?.id;
    if (id === '02') {
      return {
        left: ent.x + ent.width * 0.32,
        right: ent.x + ent.width * 0.68,
        top: ent.y + ent.height * 0.65,
        bottom: ent.y + ent.height * 0.90,
      };
    }
    if (id === '03' || id === '04' || id === '05') {
      return {
        left: ent.x + ent.width * 0.15,
        right: ent.x + ent.width * 0.85,
        top: ent.y + ent.height * 0.35,
        bottom: ent.y + ent.height * 0.85,
      };
    }
    return null;
  }

  private canWalkTo(posX: number, posY: number, radiusX: number, radiusY: number): boolean {
    const feetY = posY + this.player.height / 2 - 40;
    const pLeft = posX - radiusX;
    const pRight = posX + radiusX;
    const pTop = feetY - radiusY;
    const pBottom = feetY + radiusY;

    if (
      !this.isTileWalkable(pLeft, feetY) ||
      !this.isTileWalkable(pRight, feetY) ||
      !this.isTileWalkable(posX, pTop) ||
      !this.isTileWalkable(posX, pBottom)
    ) {
      return false;
    }

    const curFeetY = this.player.y + this.player.height / 2 - 40;
    const curLeft = this.player.x - radiusX;
    const curRight = this.player.x + radiusX;
    const curTop = curFeetY - radiusY;
    const curBottom = curFeetY + radiusY;

    for (const ent of this.worldEntities) {
      const box = this.getEntityObstacleBox(ent);
      if (!box) continue;

      const collidesNext = pLeft < box.right && pRight > box.left && pTop < box.bottom && pBottom > box.top;
      if (collidesNext) {
        const collidesCur = curLeft < box.right && curRight > box.left && curTop < box.bottom && curBottom > box.top;
        if (collidesCur) {
          const obsCenterX = (box.left + box.right) / 2;
          const obsCenterY = (box.top + box.bottom) / 2;
          const curDist = Math.hypot(this.player.x - obsCenterX, curFeetY - obsCenterY);
          const nextDist = Math.hypot(posX - obsCenterX, feetY - obsCenterY);
          if (nextDist <= curDist) {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    return true;
  }

  private update(deltaMs: number): void {
    let kdx = 0;
    let kdy = 0;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kdx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kdx += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) kdy -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) kdy += 1;

    if (kdx !== 0 && kdy !== 0) {
      const len = Math.hypot(kdx, kdy);
      kdx /= len;
      kdy /= len;
    }

    let dx = kdx + this.touchMovement.x;
    let dy = kdy + this.touchMovement.y;
    const mag = Math.hypot(dx, dy);

    if (mag > 0.05) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.player.facing = dx > 0 ? 'right' : 'left';
      } else {
        this.player.facing = dy > 0 ? 'down' : 'up';
      }

      if (mag > 1.0) {
        dx /= mag;
        dy /= mag;
      }
    } else {
      dx = 0;
      dy = 0;
    }

    let currentSpeed = this.player.baseSpeed;
    const feetY = this.player.y + this.player.height / 2 - 40;
    if (this.mapLayer) {
      const cell = Engine.vectorToCell(this.player.x, feetY);
      const tile = this.mapLayer.getTile(cell.x, cell.y);
      if (tile && tile.slowFactor > 0) {
        currentSpeed = (tile.slowFactor / 10) * this.player.baseSpeed;
      }
    }

    const feetRadiusX = 40;
    const feetRadiusY = 20;

    const nextX = this.player.x + dx * currentSpeed;
    const nextY = this.player.y + dy * currentSpeed;

    const canMoveX = dx === 0 || this.canWalkTo(nextX, this.player.y, feetRadiusX, feetRadiusY);
    const canMoveY = dy === 0 || this.canWalkTo(this.player.x, nextY, feetRadiusX, feetRadiusY);

    if (canMoveX) {
      this.player.x = nextX;
    }
    if (canMoveY) {
      this.player.y = nextY;
    }

    // Auto re-engage camera follow if player begins moving
    if ((canMoveX || canMoveY) && (dx !== 0 || dy !== 0) && !this.camera.follow) {
      this.camera.follow = true;
      this.updateCameraFollowUI();
    }

    // Auto-pickup items if stepping near them (convenient for mobile and desktop)
    if (canMoveX || canMoveY) {
      for (let i = this.worldEntities.length - 1; i >= 0; i--) {
        const ent = this.worldEntities[i];
        if (!ent.isItem) continue;
        const dist = Math.hypot(this.player.x - ent.x, this.player.y - ent.y);
        if (dist < 90) {
          this.player.inventory.push(ent);
          this.worldEntities.splice(i, 1);
          break;
        }
      }
    }

    // Map boundary clamping
    if (this.mapLayer) {
      const mapPixelWidth = this.mapLayer.width * GAME_TILE_SIZE;
      const mapPixelHeight = this.mapLayer.height * GAME_TILE_SIZE;
      this.player.x = Math.max(128, Math.min(mapPixelWidth - 128, this.player.x));
      this.player.y = Math.max(256, Math.min(mapPixelHeight - 256, this.player.y));
    }

    // 4. Update Camera (smoothly tracks player when follow is active; free when panned)
    if (this.camera.follow) {
      this.camera.x += (this.player.x - this.camera.x) * 0.1;
      this.camera.y += (this.player.y - this.camera.y) * 0.1;
    }

    // 5. Update Lightnings
    for (let i = this.activeLightnings.length - 1; i >= 0; i--) {
      const bolt = this.activeLightnings[i];
      bolt.lifetime--;
      if (bolt.lifetime <= 0) {
        this.activeLightnings.splice(i, 1);
      }
    }

    if (this.screenFlash > 0) {
      this.screenFlash -= 0.05;
      if (this.screenFlash < 0) this.screenFlash = 0;
    }

    if (this.sprites) {
      for (const sprite of this.sprites.listOfSprites) {
        sprite.update(deltaMs);
      }
    }
  }

  private lastTime: number = 0;
  private loop(timestamp: number = 0): void {
    const deltaMs = this.lastTime ? Math.min(100, timestamp - this.lastTime) : 16.6;
    this.lastTime = timestamp;

    this.update(deltaMs);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private render(): void {
    const { width, height } = this.canvas;

    // Use terrain grass green background to eliminate dark seam bleed
    this.ctx.fillStyle = '#469b00';
    this.ctx.fillRect(0, 0, width, height);

    if (!this.mapLayer) return;

    this.ctx.save();
    // Center camera on screen with zoom transform
    this.ctx.translate(width / 2, height / 2);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    // Visible world rectangle for culling
    const halfViewW = width / 2 / this.camera.zoom;
    const halfViewH = height / 2 / this.camera.zoom;
    const viewLeft = this.camera.x - halfViewW;
    const viewRight = this.camera.x + halfViewW;
    const viewTop = this.camera.y - halfViewH;
    const viewBottom = this.camera.y + halfViewH;

    // 1. Draw Map Tiles with Rotation (+1 px overlap to kill subpixel gap)
    for (let y = 0; y < this.mapLayer.height; y++) {
      for (let x = 0; x < this.mapLayer.width; x++) {
        const destX = x * GAME_TILE_SIZE;
        const destY = y * GAME_TILE_SIZE;

        if (
          destX + GAME_TILE_SIZE < viewLeft ||
          destX > viewRight ||
          destY + GAME_TILE_SIZE < viewTop ||
          destY > viewBottom
        ) {
          continue;
        }

        const tile = this.mapLayer.getTile(x, y);
        const posture = this.mapLayer.getPosture(x, y);

        if (tile && tile.texture && tile.texture.complete) {
          this.ctx.save();
          this.ctx.translate(destX + GAME_TILE_SIZE / 2, destY + GAME_TILE_SIZE / 2);
          this.ctx.rotate((posture * Math.PI) / 2);
          // +1px bleed completely eliminates black subpixel seams
          this.ctx.drawImage(
            tile.texture,
            -GAME_TILE_SIZE / 2,
            -GAME_TILE_SIZE / 2,
            GAME_TILE_SIZE + 1,
            GAME_TILE_SIZE + 1
          );
          this.ctx.restore();
        }
      }
    }

    // 2. Y-Sorted Draw Queue (Character + World Sprites)
    // Ordering logic: if center point of A is above center point of B, A is drawn behind B.
    // If center points are equal, tie-break deterministically (by centerX then unique ID).
    type Renderable = {
      centerY: number;
      centerX: number;
      id: string;
      draw: (ctx: CanvasRenderingContext2D) => void;
    };

    const drawList: Renderable[] = [];

    // Add Player to draw list (Anchored at feet ground contact for natural RPG depth sorting)
    const playerFeetY = this.player.y + this.player.height / 2 - 40;
    drawList.push({
      centerY: playerFeetY,
      centerX: this.player.x,
      id: 'player',
      draw: (ctx) => {
        const tex = this.hobbitTextures[this.player.facing];
        if (tex && tex.complete) {
          ctx.drawImage(
            tex,
            Math.round(this.player.x - this.player.width / 2),
            Math.round(this.player.y - this.player.height / 2),
            this.player.width,
            this.player.height
          );
        }
      },
    });

    // Add World Entities to draw list
    for (let i = 0; i < this.worldEntities.length; i++) {
      const ent = this.worldEntities[i];
      if (
        ent.x + ent.width < viewLeft ||
        ent.x > viewRight ||
        ent.y + ent.height < viewTop ||
        ent.y > viewBottom
      ) {
        continue;
      }

      // Ground contact sorting anchor
      let entSortY = ent.y + ent.height / 2;
      const id = ent.sprite?.id;
      if (id === '02') {
        // Tree trunk ground base
        entSortY = ent.y + ent.height * 0.80;
      } else if (id === '03' || id === '04' || id === '05') {
        // Rock ground base
        entSortY = ent.y + ent.height * 0.65;
      }

      const entCenterX = ent.x + ent.width / 2;

      drawList.push({
        centerY: entSortY,
        centerX: entCenterX,
        id: `entity_${ent.sprite?.id ?? ''}_${i}`,
        draw: (ctx) => {
          const tex = ent.sprite?.texture ?? ent.texture;
          if (tex && tex.complete) {
            if (ent.posture) {
              ctx.save();
              ctx.translate(Math.round(ent.x + ent.width / 2), Math.round(ent.y + ent.height / 2));
              ctx.rotate((ent.posture * Math.PI) / 2);
              ctx.drawImage(tex, -Math.round(ent.width / 2), -Math.round(ent.height / 2), ent.width, ent.height);
              ctx.restore();
            } else {
              ctx.drawImage(tex, Math.round(ent.x), Math.round(ent.y), ent.width, ent.height);
            }
          }
        },
      });
    }

    // Deterministic center-point depth sort
    drawList.sort((a, b) => {
      if (a.centerY !== b.centerY) {
        return a.centerY - b.centerY;
      }
      if (a.centerX !== b.centerX) {
        return a.centerX - b.centerX;
      }
      return a.id.localeCompare(b.id);
    });

    for (const item of drawList) {
      item.draw(this.ctx);
    }

    // 3. Draw Active Lightning Strikes
    for (const bolt of this.activeLightnings) {
      const alpha = bolt.lifetime / bolt.maxLifetime;

      this.ctx.save();
      this.ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.9})`;
      this.ctx.lineWidth = 10;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
      for (let i = 1; i < bolt.points.length; i++) {
        this.ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
      }
      this.ctx.stroke();

      this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
      for (let i = 1; i < bolt.points.length; i++) {
        this.ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
      }
      this.ctx.stroke();

      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      this.ctx.beginPath();
      this.ctx.arc(bolt.targetX, bolt.targetY, 40 * alpha, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    this.ctx.restore();

    // 4. Dramatic Screen Flash Effect
    if (this.screenFlash > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.screenFlash})`;
      this.ctx.fillRect(0, 0, width, height);
    }

    // 5. Render In-Game UI Overlay
    this.renderUI();
  }

  private renderUI(): void {
    if (this.showInventory) {
      const invW = 380;
      const invH = 240;
      const invX = (this.canvas.width - invW) / 2;
      const invY = (this.canvas.height - invH) / 2;

      // Subtle backdrop shadow
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Modal surface (Pastel zen slate)
      this.ctx.fillStyle = 'rgba(21, 25, 30, 0.95)';
      this.ctx.strokeStyle = 'rgba(141, 164, 184, 0.25)';
      this.ctx.lineWidth = 1.5;

      this.ctx.beginPath();
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.roundRect(invX, invY, invW, invH, 12);
      } else {
        this.ctx.rect(invX, invY, invW, invH);
      }
      this.ctx.fill();
      this.ctx.stroke();

      // Header title: Quiet, minimal "Inventory"
      this.ctx.fillStyle = '#dbe2e6';
      this.ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
      this.ctx.fillText('Inventory', invX + 24, invY + 36);

      // Close '×' icon at top right
      this.ctx.fillStyle = '#8da4b8';
      this.ctx.font = '300 20px sans-serif';
      this.ctx.fillText('×', invX + invW - 32, invY + 34);

      // Subtle divider line
      this.ctx.strokeStyle = 'rgba(141, 164, 184, 0.12)';
      this.ctx.beginPath();
      this.ctx.moveTo(invX + 20, invY + 48);
      this.ctx.lineTo(invX + invW - 20, invY + 48);
      this.ctx.stroke();

      if (this.player.inventory.length === 0) {
        // Minimalist empty state
        this.ctx.fillStyle = '#647380';
        this.ctx.font = '14px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
        this.ctx.fillText('Empty', invX + 24, invY + 84);
      } else {
        let slotX = invX + 24;
        let slotY = invY + 64;
        for (const item of this.player.inventory) {
          this.ctx.fillStyle = 'rgba(28, 34, 43, 0.9)';
          this.ctx.strokeStyle = 'rgba(141, 164, 184, 0.2)';
          this.ctx.lineWidth = 1;

          this.ctx.beginPath();
          if (typeof this.ctx.roundRect === 'function') {
            this.ctx.roundRect(slotX, slotY, 60, 60, 8);
          } else {
            this.ctx.rect(slotX, slotY, 60, 60);
          }
          this.ctx.fill();
          this.ctx.stroke();

          if (item.texture && item.texture.complete) {
            this.ctx.drawImage(item.texture, slotX + 4, slotY + 4, 52, 52);
          }

          slotX += 70;
          if (slotX + 60 > invX + invW - 20) {
            slotX = invX + 24;
            slotY += 70;
          }
        }
      }
    }
  }
}

// Start Game App
window.addEventListener('DOMContentLoaded', () => {
  const game = new GameApp();
  game.init();
});

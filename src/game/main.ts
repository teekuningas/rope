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
    border: 50,
  };

  private keysDown: Set<string> = new Set();
  private mouse = { x: -1000, y: -1000 };
  private mouseInsideCanvas: boolean = false;
  private showInventory: boolean = false;

  private activeLightnings: LightningStrike[] = [];
  private screenFlash: number = 0; // alpha for white flash

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

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

      await this.loadMap('/assets/data/UusiMaailma.xml');

      if (statusMsg) {
        statusMsg.textContent = 'WASD / Arrows to move | Space to strike Lightning! | F for camera follow';
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
        name: `Item ${spriteObj.id}`,
      });
    }

    this.player.x = 2300;
    this.player.y = 2300;
    this.camera.x = 2300;
    this.camera.y = 2300;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
      this.startAudio();

      if (e.code === 'KeyF') {
        this.camera.follow = !this.camera.follow;
      }

      if (e.code === 'KeyI') {
        this.showInventory = !this.showInventory;
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
        const strikeOffset = 250;
        let targetX = this.player.x;
        let targetY = this.player.y;
        if (this.player.facing === 'up') targetY -= strikeOffset;
        else if (this.player.facing === 'down') targetY += strikeOffset;
        else if (this.player.facing === 'left') targetX -= strikeOffset;
        else if (this.player.facing === 'right') targetX += strikeOffset;
        this.strikeLightning(targetX, targetY);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    this.canvas.addEventListener('mouseenter', () => {
      this.mouseInsideCanvas = true;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouseInsideCanvas = false;
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseInsideCanvas = true;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
    });

    this.canvas.addEventListener('click', (e) => {
      this.startAudio();

      // Strike lightning at mouse world position
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
    });
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
    let dx = 0;
    let dy = 0;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) {
      dx -= 1;
      this.player.facing = 'left';
    }
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) {
      dx += 1;
      this.player.facing = 'right';
    }
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) {
      dy -= 1;
      this.player.facing = 'up';
    }
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) {
      dy += 1;
      this.player.facing = 'down';
    }

    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
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

    // Map boundary clamping
    if (this.mapLayer) {
      const mapPixelWidth = this.mapLayer.width * GAME_TILE_SIZE;
      const mapPixelHeight = this.mapLayer.height * GAME_TILE_SIZE;
      this.player.x = Math.max(128, Math.min(mapPixelWidth - 128, this.player.x));
      this.player.y = Math.max(256, Math.min(mapPixelHeight - 256, this.player.y));
    }

    // 4. Update Camera
    if (this.camera.follow) {
      this.camera.x += (this.player.x - this.camera.x) * 0.1;
      this.camera.y += (this.player.y - this.camera.y) * 0.1;
    } else if (this.mouseInsideCanvas) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      const camSpeed = 14 / this.camera.zoom;

      if (this.mouse.x >= 0 && this.mouse.x < this.camera.border) this.camera.x -= camSpeed;
      if (this.mouse.x <= w && this.mouse.x > w - this.camera.border) this.camera.x += camSpeed;
      if (this.mouse.y >= 0 && this.mouse.y < this.camera.border) this.camera.y -= camSpeed;
      if (this.mouse.y <= h && this.mouse.y > h - this.camera.border) this.camera.y += camSpeed;
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
            ctx.drawImage(tex, Math.round(ent.x), Math.round(ent.y), ent.width, ent.height);
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
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;

      const invW = 400;
      const invH = 260;
      const invX = (this.canvas.width - invW) / 2;
      const invY = (this.canvas.height - invH) / 2;

      this.ctx.fillRect(invX, invY, invW, invH);
      this.ctx.strokeRect(invX, invY, invW, invH);

      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = 'bold 18px sans-serif';
      this.ctx.fillText('Inventory (Press I to close)', invX + 20, invY + 35);

      if (this.player.inventory.length === 0) {
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText('Backpack empty. Walk near an item & press P.', invX + 20, invY + 70);
      } else {
        let slotX = invX + 20;
        let slotY = invY + 60;
        for (const item of this.player.inventory) {
          this.ctx.fillStyle = '#1e293b';
          this.ctx.fillRect(slotX, slotY, 64, 64);
          this.ctx.strokeStyle = '#475569';
          this.ctx.strokeRect(slotX, slotY, 64, 64);

          if (item.texture && item.texture.complete) {
            this.ctx.drawImage(item.texture, slotX + 4, slotY + 4, 56, 56);
          }

          slotX += 74;
          if (slotX + 64 > invX + invW - 20) {
            slotX = invX + 20;
            slotY += 74;
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

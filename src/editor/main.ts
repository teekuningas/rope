import { AssetLoader } from '@shared/asset-loader';
import { Camera2D } from '../core/camera';
import { Engine } from '@shared/engine';
import { MapLayer } from '@shared/map-layer';
import { Sprite, SpriteLayer, Sprites } from '@shared/sprite';
import { Tile, Tiles } from '@shared/tile';
import { MapData } from '@shared/types';
import { XmlLoader } from '@shared/xml-loader';

Engine.tileWidth = 512;
Engine.tileHeight = 512;

class MapEditorApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private tiles!: Tiles;
  private sprites!: Sprites;
  private mapLayer!: MapLayer;
  private spriteLayer!: SpriteLayer;

  private mapName: string = 'Default';
  private camera: Camera2D = new Camera2D();
  private keysDown: Set<string> = new Set();

  private activeMode: 'tile' | 'sprite' = 'tile';
  private selectedTile: Tile | null = null;
  private selectedSprite: Sprite | null = null;
  private tilePosture: number = 0;
  private spritePosture: number = 0;
  private snapToCenter: boolean = true;

  private mouse = { x: 0, y: 0, isDown: false, button: 0 };
  private isMiddleDragging: boolean = false;
  private dragStart = { x: 0, y: 0 };

  private keyboardCursor = { x: 0, y: 0 };
  private useKeyboardCursor: boolean = false;

  constructor() {
    this.canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindKeyboard();
    this.bindMouse();
    this.bindUI();
  }

  public async init(): Promise<void> {
    try {
      const data = await AssetLoader.loadCoreGameData();
      this.tiles = data.tiles;
      this.sprites = data.sprites;

      this.populatePalettes();

      // Select first tile by default (skip '01' karttakehys if possible)
      const firstTile = this.tiles.listOfTiles.find((t) => t.id !== '01') ?? this.tiles.listOfTiles[0];
      this.selectTile(firstTile);
      this.updateSnapUI();

      // Default editor zoom: 0.25 (displays 512px tiles at 128px on screen)
      this.camera.zoom = 0.25;

      // Load initial sample map
      await this.loadMapFromUrl('/assets/data/Default.xml');

      // Center camera on map
      this.centerCameraOnMap();

      // Start loop
      requestAnimationFrame(() => this.loop());
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      alert('Error initializing editor. Check browser console.');
    }
  }

  private resizeCanvas(): void {
    const container = this.canvas.parentElement;
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      this.camera.setViewport(container.clientWidth, container.clientHeight);
    }
  }

  private centerCameraOnMap(): void {
    if (this.mapLayer) {
      this.camera.x = (this.mapLayer.width * Engine.tileWidth) / 2;
      this.camera.y = (this.mapLayer.height * Engine.tileHeight) / 2;
    }
  }

  private selectTile(tile: Tile): void {
    this.activeMode = 'tile';
    this.selectedTile = tile;
    this.updatePreview();

    document.querySelectorAll('#palette-tiles .palette-item').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-id') === tile.id);
    });
    document.querySelectorAll('#palette-sprites .palette-item').forEach((el) => {
      el.classList.remove('selected');
    });
  }

  private selectSprite(sprite: Sprite): void {
    this.activeMode = 'sprite';
    this.selectedSprite = sprite;
    if (!sprite.canRotate) {
      this.spritePosture = 0;
    }
    this.updatePreview();

    document.querySelectorAll('#palette-sprites .palette-item').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-id') === sprite.id);
    });
    document.querySelectorAll('#palette-tiles .palette-item').forEach((el) => {
      el.classList.remove('selected');
    });
  }

  private rotateSelection(): void {
    if (this.activeMode === 'tile') {
      this.tilePosture = (this.tilePosture + 1) % 4;
      this.updatePreview();
    } else if (this.activeMode === 'sprite' && this.selectedSprite) {
      if (this.selectedSprite.canRotate) {
        this.spritePosture = (this.spritePosture + 1) % 4;
        this.updatePreview();
      }
    }
  }

  private toggleSnap(): void {
    this.snapToCenter = !this.snapToCenter;
    this.updateSnapUI();
  }

  private updateSnapUI(): void {
    const btn = document.getElementById('btn-snap');
    if (btn) {
      btn.classList.toggle('active', this.snapToCenter);
      btn.textContent = this.snapToCenter ? 'Snap: Center' : 'Snap: Free';
    }
  }

  private updatePreview(): void {
    const previewImg = document.getElementById('active-preview-img') as HTMLImageElement;
    const nameLabel = document.getElementById('active-item-name')!;
    const rotLabel = document.getElementById('active-item-rotation')!;
    const rotateBtn = document.getElementById('btn-rotate') as HTMLButtonElement | null;

    if (this.activeMode === 'tile' && this.selectedTile) {
      if (this.selectedTile.texture) {
        previewImg.src = this.selectedTile.texture.src;
      }
      previewImg.style.transform = `rotate(${this.tilePosture * 90}deg)`;
      nameLabel.textContent = this.selectedTile.name || `Tile ${this.selectedTile.id}`;
      rotLabel.textContent = `${this.tilePosture * 90}°`;
      if (rotateBtn) {
        rotateBtn.disabled = false;
        rotateBtn.title = 'Rotate (R)';
      }
    } else if (this.activeMode === 'sprite' && this.selectedSprite) {
      if (this.selectedSprite.texture) {
        previewImg.src = this.selectedSprite.texture.src;
      }
      const prefix = this.selectedSprite.isItem ? 'Item' : 'Sprite';
      nameLabel.textContent = `${prefix} ${this.selectedSprite.id}`;

      if (this.selectedSprite.canRotate) {
        previewImg.style.transform = `rotate(${this.spritePosture * 90}deg)`;
        rotLabel.textContent = `${this.spritePosture * 90}° (Size ${this.selectedSprite.size})`;
        if (rotateBtn) {
          rotateBtn.disabled = false;
          rotateBtn.title = 'Rotate (R)';
        }
      } else {
        previewImg.style.transform = 'none';
        rotLabel.textContent = `Fixed (Size ${this.selectedSprite.size})`;
        if (rotateBtn) {
          rotateBtn.disabled = true;
          rotateBtn.title = 'This sprite cannot be rotated';
        }
      }
    }
  }

  private populatePalettes(): void {
    const tilesContainer = document.getElementById('palette-tiles')!;
    tilesContainer.innerHTML = '';
    for (const tile of this.tiles.listOfTiles) {
      if (tile.id === '01') continue;

      const item = document.createElement('div');
      item.className = 'palette-item';
      item.setAttribute('data-id', tile.id);

      if (tile.texture) {
        const img = document.createElement('img');
        img.src = tile.texture.src;
        item.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = tile.name || tile.id;
      item.appendChild(label);

      item.addEventListener('click', () => this.selectTile(tile));
      tilesContainer.appendChild(item);
    }

    const spritesContainer = document.getElementById('palette-sprites')!;
    spritesContainer.innerHTML = '';
    for (const sprite of this.sprites.listOfSprites) {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.setAttribute('data-id', sprite.id);

      if (sprite.texture) {
        const img = document.createElement('img');
        img.src = sprite.texture.src;
        item.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = `ID ${sprite.id}`;
      item.appendChild(label);

      item.addEventListener('click', () => this.selectSprite(sprite));
      spritesContainer.appendChild(item);
    }
  }

  public newMap(name: string, width: number, height: number): void {
    this.mapName = name;
    document.getElementById('current-map-title')!.textContent = name;
    document.getElementById('status-map-size')!.textContent = `${width} × ${height}`;

    const defaultTile = this.tiles.listOfTiles.find((t) => t.id === '02') ?? this.tiles.listOfTiles[0];
    this.mapLayer = new MapLayer(width, height, defaultTile);
    this.spriteLayer = new SpriteLayer();
    this.centerCameraOnMap();
  }

  public async loadMapFromUrl(url: string): Promise<void> {
    const xml = await AssetLoader.loadText(url);
    this.loadMapFromXml(xml);
  }

  public loadMapFromXml(xmlString: string): void {
    const mapData = XmlLoader.parseMapXml(xmlString);
    this.mapName = mapData.name || 'Untitled';
    document.getElementById('current-map-title')!.textContent = this.mapName;
    document.getElementById('status-map-size')!.textContent = `${mapData.sizeX} × ${mapData.sizeY}`;

    this.mapLayer = new MapLayer(mapData.sizeX, mapData.sizeY);
    for (let j = 0; j < mapData.rows.length; j++) {
      const row = mapData.rows[j];
      for (let i = 0; i < row.tiles.length; i++) {
        const t = row.tiles[i];
        const tileObj = this.tiles.getTileWithId(t.id);
        this.mapLayer.setTile(i, j, tileObj, t.posture);
      }
    }

    this.spriteLayer = new SpriteLayer();
    for (const s of mapData.sprites) {
      const spriteObj = this.sprites.getSpriteWithId(s.spriteId);
      this.spriteLayer.add(s.positionX, s.positionY, spriteObj, s.posture ?? 0);
    }

    this.centerCameraOnMap();
  }

  public saveMap(): void {
    const mapData: MapData = {
      name: this.mapName,
      sizeX: this.mapLayer.width,
      sizeY: this.mapLayer.height,
      rows: [],
      sprites: [],
    };

    for (let j = 0; j < this.mapLayer.height; j++) {
      const tilesInRow = [];
      for (let i = 0; i < this.mapLayer.width; i++) {
        tilesInRow.push({
          id: this.mapLayer.getTile(i, j)?.id ?? '01',
          posture: this.mapLayer.getPosture(i, j),
        });
      }
      mapData.rows.push({ tiles: tilesInRow });
    }

    for (const unit of this.spriteLayer.layer) {
      mapData.sprites.push({
        spriteId: unit.sprite.id,
        positionX: unit.position.x,
        positionY: unit.position.y,
        posture: unit.posture,
      });
    }

    const xml = XmlLoader.serializeMapXml(mapData);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.mapName || 'Map'}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);

      // Rotate posture with 'R'
      if (e.code === 'KeyR') {
        this.rotateSelection();
      }

      // Toggle grid snapping with 'G'
      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) {
        this.toggleSnap();
      }

      // Laptop Mouse Simulation: Arrow keys navigate map cells
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
        this.useKeyboardCursor = true;
        if (e.code === 'ArrowLeft' && this.keyboardCursor.x > 0) this.keyboardCursor.x--;
        if (e.code === 'ArrowRight' && this.keyboardCursor.x < (this.mapLayer?.width ?? 1) - 1) this.keyboardCursor.x++;
        if (e.code === 'ArrowUp' && this.keyboardCursor.y > 0) this.keyboardCursor.y--;
        if (e.code === 'ArrowDown' && this.keyboardCursor.y < (this.mapLayer?.height ?? 1) - 1) this.keyboardCursor.y++;
        this.updateCoordsStatus();
      }

      // Space or Enter: place tile/sprite at keyboard cursor
      if (e.code === 'Space' || e.code === 'Enter') {
        if (this.useKeyboardCursor) {
          e.preventDefault();
          this.applyToolAtCell(this.keyboardCursor.x, this.keyboardCursor.y);
        }
      }

      // Delete or Backspace: delete sprite at keyboard cursor
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (this.useKeyboardCursor) {
          e.preventDefault();
          this.deleteSpriteAtCell(this.keyboardCursor.x, this.keyboardCursor.y);
        }
      }

      // Tab toggles between Tiles and Sprites tabs
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.activeMode === 'tile') {
          (document.getElementById('tab-sprites') as HTMLButtonElement).click();
        } else {
          (document.getElementById('tab-tiles') as HTMLButtonElement).click();
        }
      }

      // Number keys 1-9 select item from current palette
      if (e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 9) {
          const containerId = this.activeMode === 'tile' ? '#palette-tiles' : '#palette-sprites';
          const items = document.querySelectorAll(`${containerId} .palette-item`);
          if (items[num - 1]) {
            (items[num - 1] as HTMLElement).click();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  private bindMouse(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      this.useKeyboardCursor = false;
      this.mouse.isDown = true;
      this.mouse.button = e.button;

      if (e.button === 1) {
        // Middle button pan
        this.isMiddleDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        // Left click: place tile or sprite
        this.applyToolAtMouse(e);
      } else if (e.button === 2) {
        // Right click: delete sprite under cursor
        this.deleteSpriteAtMouse();
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
      this.isMiddleDragging = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.useKeyboardCursor = false;
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;

      if (this.isMiddleDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.camera.pan(-dx, -dy);
        this.dragStart = { x: e.clientX, y: e.clientY };
      } else if (this.mouse.isDown && this.mouse.button === 0 && this.activeMode === 'tile') {
        // Paint drag for tiles
        this.applyToolAtMouse(e);
      }

      this.updateCoordsStatus();
    });

    // Smooth mouse wheel / trackpad zoom
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const zoomDelta = -e.deltaY * 0.001;
        this.camera.zoomBy(zoomDelta);
      },
      { passive: false }
    );
  }

  private updateCoordsStatus(): void {
    let worldX = 0;
    let worldY = 0;
    let cell = { x: 0, y: 0 };

    if (this.useKeyboardCursor) {
      cell = this.keyboardCursor;
      worldX = cell.x * Engine.tileWidth;
      worldY = cell.y * Engine.tileHeight;
    } else {
      const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
      worldX = world.x;
      worldY = world.y;
      cell = Engine.vectorToCell(worldX, worldY);
    }

    const coordsLabel = document.getElementById('status-coords');
    if (coordsLabel) {
      coordsLabel.textContent = `${cell.x}, ${cell.y}`;
    }
  }

  private applyToolAtMouse(e?: MouseEvent): void {
    if (!this.mapLayer) return;
    const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
    const cell = Engine.vectorToCell(world.x, world.y);

    if (this.activeMode === 'tile' && this.selectedTile) {
      this.applyToolAtCell(cell.x, cell.y);
    } else if (this.activeMode === 'sprite' && this.selectedSprite) {
      const sizePx = this.selectedSprite.size * Engine.basicWidth;
      const posture = this.selectedSprite.canRotate ? this.spritePosture : 0;
      const useSnap = e?.shiftKey ? !this.snapToCenter : this.snapToCenter;

      let posX: number;
      let posY: number;
      if (useSnap && cell.x >= 0 && cell.x < this.mapLayer.width && cell.y >= 0 && cell.y < this.mapLayer.height) {
        posX = cell.x * Engine.tileWidth + (Engine.tileWidth - sizePx) / 2;
        posY = cell.y * Engine.tileHeight + (Engine.tileHeight - sizePx) / 2;
      } else {
        posX = world.x - sizePx / 2;
        posY = world.y - sizePx / 2;
      }

      this.spriteLayer.add(posX, posY, this.selectedSprite, posture);
    }
  }

  private applyToolAtCell(cellX: number, cellY: number): void {
    if (!this.mapLayer) return;
    if (cellX >= 0 && cellX < this.mapLayer.width && cellY >= 0 && cellY < this.mapLayer.height) {
      if (this.activeMode === 'tile' && this.selectedTile) {
        this.mapLayer.setTile(cellX, cellY, this.selectedTile, this.tilePosture);
      } else if (this.activeMode === 'sprite' && this.selectedSprite) {
        const sizePx = this.selectedSprite.size * Engine.basicWidth;
        const posX = cellX * Engine.tileWidth + (Engine.tileWidth - sizePx) / 2;
        const posY = cellY * Engine.tileHeight + (Engine.tileHeight - sizePx) / 2;
        const posture = this.selectedSprite.canRotate ? this.spritePosture : 0;
        this.spriteLayer.add(posX, posY, this.selectedSprite, posture);
      }
    }
  }

  private deleteSpriteAtCell(cellX: number, cellY: number): void {
    if (!this.spriteLayer) return;

    for (let i = this.spriteLayer.layer.length - 1; i >= 0; i--) {
      const unit = this.spriteLayer.layer[i];
      const sizePx = unit.sprite.size * Engine.basicWidth;
      const cell = Engine.vectorToCell(unit.position.x + sizePx / 2, unit.position.y + sizePx / 2);
      if (cell.x === cellX && cell.y === cellY) {
        this.spriteLayer.remove(unit);
        break;
      }
    }
  }

  private deleteSpriteAtMouse(): void {
    if (!this.spriteLayer) return;
    const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);

    for (let i = this.spriteLayer.layer.length - 1; i >= 0; i--) {
      const unit = this.spriteLayer.layer[i];
      const sizePx = unit.sprite.size * Engine.basicWidth;
      if (
        world.x >= unit.position.x &&
        world.x <= unit.position.x + sizePx &&
        world.y >= unit.position.y &&
        world.y <= unit.position.y + sizePx
      ) {
        this.spriteLayer.remove(unit);
        break;
      }
    }
  }

  private bindUI(): void {
    const tabTiles = document.getElementById('tab-tiles')!;
    const tabSprites = document.getElementById('tab-sprites')!;
    const paletteTiles = document.getElementById('palette-tiles')!;
    const paletteSprites = document.getElementById('palette-sprites')!;

    tabTiles.addEventListener('click', () => {
      tabTiles.classList.add('active');
      tabSprites.classList.remove('active');
      paletteTiles.style.display = 'grid';
      paletteSprites.style.display = 'none';
      if (this.selectedTile) this.selectTile(this.selectedTile);
    });

    tabSprites.addEventListener('click', () => {
      tabSprites.classList.add('active');
      tabTiles.classList.remove('active');
      paletteSprites.style.display = 'grid';
      paletteTiles.style.display = 'none';
      if (this.selectedSprite) this.selectSprite(this.selectedSprite);
      else if (this.sprites.listOfSprites.length > 0) {
        this.selectSprite(this.sprites.listOfSprites[0]);
      }
    });

    const btnSnap = document.getElementById('btn-snap');
    if (btnSnap) {
      btnSnap.addEventListener('click', () => this.toggleSnap());
    }

    document.getElementById('btn-rotate')!.addEventListener('click', () => this.rotateSelection());
    document.getElementById('btn-save-map')!.addEventListener('click', () => this.saveMap());

    const fileInput = document.getElementById('file-input-map') as HTMLInputElement;
    document.getElementById('btn-open-map')!.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const text = await file.text();
        this.loadMapFromXml(text);
      }
    });
    const newDialog = document.getElementById('dialog-new-map') as HTMLDialogElement;
    document.getElementById('btn-new-map')!.addEventListener('click', () => {
      newDialog.showModal();
    });
    document.getElementById('btn-cancel-new-map')!.addEventListener('click', () => {
      newDialog.close();
    });
    document.getElementById('form-new-map')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (document.getElementById('input-map-name') as HTMLInputElement).value.trim();
      const w = parseInt((document.getElementById('input-map-width') as HTMLInputElement).value, 10);
      const h = parseInt((document.getElementById('input-map-height') as HTMLInputElement).value, 10);
      this.newMap(name, w, h);
      newDialog.close();
    });
  }

  private updateCamera(): void {
    const camSpeed = 16 / this.camera.zoom;
    if (this.keysDown.has('KeyA')) {
      this.camera.x -= camSpeed;
    }
    if (this.keysDown.has('KeyD')) {
      this.camera.x += camSpeed;
    }
    if (this.keysDown.has('KeyW')) {
      this.camera.y -= camSpeed;
    }
    if (this.keysDown.has('KeyS')) {
      this.camera.y += camSpeed;
    }
  }

  private lastTime: number = 0;
  private loop(timestamp: number = 0): void {
    const deltaMs = this.lastTime ? Math.min(100, timestamp - this.lastTime) : 16.6;
    this.lastTime = timestamp;

    if (this.sprites) {
      for (const sprite of this.sprites.listOfSprites) {
        sprite.update(deltaMs);
      }
    }

    this.updateCamera();
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private render(): void {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, width, height);

    if (!this.mapLayer) return;

    this.ctx.save();
    // Centralized Camera2D viewport transformation
    this.camera.applyTransform(this.ctx);

    const bounds = this.camera.getVisibleBounds();

    // 1. Draw Map Tiles
    for (let y = 0; y < this.mapLayer.height; y++) {
      for (let x = 0; x < this.mapLayer.width; x++) {
        const destX = x * Engine.tileWidth;
        const destY = y * Engine.tileHeight;

        // Viewport frustum culling
        if (
          destX + Engine.tileWidth < bounds.x ||
          destX > bounds.x + bounds.width ||
          destY + Engine.tileHeight < bounds.y ||
          destY > bounds.y + bounds.height
        ) {
          continue;
        }

        const tile = this.mapLayer.getTile(x, y);
        const posture = this.mapLayer.getPosture(x, y);

        if (tile && tile.texture && tile.texture.complete) {
          this.ctx.save();
          this.ctx.translate(destX + Engine.tileWidth / 2, destY + Engine.tileHeight / 2);
          this.ctx.rotate((posture * Math.PI) / 2);
          this.ctx.drawImage(
            tile.texture,
            -Engine.tileWidth / 2,
            -Engine.tileHeight / 2,
            Engine.tileWidth + 1,
            Engine.tileHeight + 1
          );
          this.ctx.restore();
        }

        // Draw tile grid outline
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1 / this.camera.zoom;
        this.ctx.strokeRect(destX, destY, Engine.tileWidth, Engine.tileHeight);
      }
    }

    // 2. Draw Sprites (Sorted deterministically by center Y coordinate)
    if (this.spriteLayer) {
      const sortedUnits = [...this.spriteLayer.layer].sort((a, b) => {
        const aSize = a.sprite.size * Engine.basicWidth;
        const bSize = b.sprite.size * Engine.basicWidth;
        const aCenterY = a.position.y + aSize / 2;
        const bCenterY = b.position.y + bSize / 2;
        if (aCenterY !== bCenterY) return aCenterY - bCenterY;
        const aCenterX = a.position.x + aSize / 2;
        const bCenterX = b.position.x + bSize / 2;
        if (aCenterX !== bCenterX) return aCenterX - bCenterX;
        return a.sprite.id.localeCompare(b.sprite.id);
      });

      for (const unit of sortedUnits) {
        const sprite = unit.sprite;
        const sizePx = sprite.size * Engine.basicWidth;

        if (
          unit.position.x + sizePx < bounds.x ||
          unit.position.x > bounds.x + bounds.width ||
          unit.position.y + sizePx < bounds.y ||
          unit.position.y > bounds.y + bounds.height
        ) {
          continue;
        }

        if (sprite.texture && sprite.texture.complete) {
          if (unit.posture) {
            this.ctx.save();
            this.ctx.translate(unit.position.x + sizePx / 2, unit.position.y + sizePx / 2);
            this.ctx.rotate((unit.posture * Math.PI) / 2);
            this.ctx.drawImage(sprite.texture, -sizePx / 2, -sizePx / 2, sizePx, sizePx);
            this.ctx.restore();
          } else {
            this.ctx.drawImage(sprite.texture, unit.position.x, unit.position.y, sizePx, sizePx);
          }
        }
      }
    }

    // 3. Draw Map Boundary Frame
    this.ctx.strokeStyle = '#ef4444';
    this.ctx.lineWidth = 3 / this.camera.zoom;
    this.ctx.strokeRect(0, 0, this.mapLayer.width * Engine.tileWidth, this.mapLayer.height * Engine.tileHeight);

    // 4. Draw Cursor Hint / Placement Preview
    let targetWorldX = 0;
    let targetWorldY = 0;

    if (this.useKeyboardCursor) {
      targetWorldX = this.keyboardCursor.x * Engine.tileWidth + Engine.tileWidth / 2;
      targetWorldY = this.keyboardCursor.y * Engine.tileHeight + Engine.tileHeight / 2;
    } else {
      const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
      targetWorldX = world.x;
      targetWorldY = world.y;
    }

    if (this.activeMode === 'tile' && this.selectedTile?.texture?.complete) {
      const cell = Engine.vectorToCell(targetWorldX, targetWorldY);
      const destX = cell.x * Engine.tileWidth;
      const destY = cell.y * Engine.tileHeight;

      this.ctx.save();
      this.ctx.globalAlpha = 0.6;
      this.ctx.translate(destX + Engine.tileWidth / 2, destY + Engine.tileHeight / 2);
      this.ctx.rotate((this.tilePosture * Math.PI) / 2);
      this.ctx.drawImage(
        this.selectedTile.texture,
        -Engine.tileWidth / 2,
        -Engine.tileHeight / 2,
        Engine.tileWidth,
        Engine.tileHeight
      );
      this.ctx.restore();

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 3 / this.camera.zoom;
      this.ctx.strokeRect(destX, destY, Engine.tileWidth, Engine.tileHeight);
    } else if (this.activeMode === 'sprite' && this.selectedSprite?.texture?.complete) {
      const sizePx = this.selectedSprite.size * Engine.basicWidth;
      const posture = this.selectedSprite.canRotate ? this.spritePosture : 0;
      const cell = Engine.vectorToCell(targetWorldX, targetWorldY);
      const isInside = cell.x >= 0 && cell.x < this.mapLayer.width && cell.y >= 0 && cell.y < this.mapLayer.height;

      let posX: number;
      let posY: number;
      if (this.snapToCenter && isInside) {
        posX = cell.x * Engine.tileWidth + (Engine.tileWidth - sizePx) / 2;
        posY = cell.y * Engine.tileHeight + (Engine.tileHeight - sizePx) / 2;

        // Subtle tile snapped frame indicator
        this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        this.ctx.lineWidth = 1.5 / this.camera.zoom;
        this.ctx.strokeRect(cell.x * Engine.tileWidth, cell.y * Engine.tileHeight, Engine.tileWidth, Engine.tileHeight);
      } else {
        posX = targetWorldX - sizePx / 2;
        posY = targetWorldY - sizePx / 2;
      }

      this.ctx.save();
      this.ctx.globalAlpha = 0.65;
      if (posture) {
        this.ctx.translate(posX + sizePx / 2, posY + sizePx / 2);
        this.ctx.rotate((posture * Math.PI) / 2);
        this.ctx.drawImage(this.selectedSprite.texture, -sizePx / 2, -sizePx / 2, sizePx, sizePx);
      } else {
        this.ctx.drawImage(this.selectedSprite.texture, posX, posY, sizePx, sizePx);
      }
      this.ctx.restore();

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.ctx.strokeRect(posX, posY, sizePx, sizePx);
    }

    this.ctx.restore();
  }
}

// Start on DOM content loaded
window.addEventListener('DOMContentLoaded', () => {
  const editor = new MapEditorApp();
  editor.init();
});

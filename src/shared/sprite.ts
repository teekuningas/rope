import { Rectangle } from './types';

export class Sprite {
  protected _texture: HTMLImageElement | null;
  protected _size: number;
  protected _spriteId: string;
  protected _isItem: boolean;

  public get texture(): HTMLImageElement | null {
    return this._texture;
  }

  public get id(): string {
    return this._spriteId;
  }

  public get size(): number {
    return this._size;
  }

  public get isItem(): boolean {
    return this._isItem;
  }

  constructor(
    texture: HTMLImageElement | null,
    size: number,
    spriteId: string,
    isItem: boolean = false
  ) {
    this._texture = texture;
    this._size = size;
    this._spriteId = spriteId;
    this._isItem = isItem;
  }

  public getId(): string {
    return this._spriteId;
  }

  public update(_deltaTime: number): void {}

  public draw(ctx: CanvasRenderingContext2D, frame: Rectangle): void {
    if (this.texture && this.texture.complete) {
      ctx.drawImage(this.texture, frame.x, frame.y, frame.width, frame.height);
    }
  }
}

export class Animation {
  private textures: HTMLImageElement[];
  private frameCount: number;
  private currentFrame: number = 0;
  private frameTimer: number = 0;
  private frameDuration: number = 1000;

  public set framesPerSecond(fps: number) {
    const validFps = Math.max(1, Math.min(60, fps));
    this.frameDuration = 1000 / validFps;
  }

  public get currentTexture(): HTMLImageElement | null {
    return this.textures[this.currentFrame] ?? null;
  }

  constructor(textures: HTMLImageElement[], fps: number = 5) {
    this.textures = textures;
    this.frameCount = textures.length;
    this.framesPerSecond = fps;
  }

  public update(deltaMs: number): void {
    if (this.frameCount <= 1) return;
    this.frameTimer += deltaMs;
    if (this.frameTimer >= this.frameDuration) {
      this.frameTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % this.frameCount;
    }
  }

  public reset(): void {
    this.currentFrame = 0;
    this.frameTimer = 0;
  }
}

export class AnimatedSprite extends Sprite {
  private animation: Animation;

  constructor(textures: HTMLImageElement[], size: number, spriteId: string, fps: number, isItem: boolean = false) {
    super(textures[0] ?? null, size, spriteId, isItem);
    this.animation = new Animation(textures, fps);
  }

  public override get texture(): HTMLImageElement | null {
    return this.animation.currentTexture;
  }

  public override update(deltaMs: number): void {
    this.animation.update(deltaMs);
  }
}

export class SpriteUnit {
  private _location: { x: number; y: number };
  private _sprite: Sprite;

  constructor(x: number, y: number, sprite: Sprite) {
    this._location = { x, y };
    this._sprite = sprite;
  }

  public get position(): { x: number; y: number } {
    return this._location;
  }

  public set position(pos: { x: number; y: number }) {
    this._location = pos;
  }

  public get sprite(): Sprite {
    return this._sprite;
  }
}

export class SpriteLayer {
  public layer: SpriteUnit[] = [];

  constructor() {
    this.layer = [];
  }

  public add(x: number, y: number, sprite: Sprite): SpriteUnit {
    const unit = new SpriteUnit(x, y, sprite);
    this.layer.push(unit);
    return unit;
  }

  public remove(unit: SpriteUnit): void {
    const idx = this.layer.indexOf(unit);
    if (idx !== -1) {
      this.layer.splice(idx, 1);
    }
  }

  public getSpriteUnitLayer(): SpriteUnit[] {
    return this.layer;
  }
}

export class Sprites {
  private _sprites: Sprite[] = [];

  public get listOfSprites(): Sprite[] {
    return this._sprites;
  }

  constructor() {
    this._sprites = [];
  }

  public add(sprite: Sprite): void {
    this._sprites.push(sprite);
  }

  public getSpriteWithId(id: string): Sprite {
    const found = this._sprites.find((s) => s.id === id);
    return found ?? this._sprites[0];
  }
}

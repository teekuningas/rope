import { Camera2D } from './camera';
import { Rectangle } from './math';

export class CanvasRenderer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public clear(color: string = '#000000'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  public begin(camera?: Camera2D): void {
    this.ctx.save();
    if (camera) {
      camera.applyTransform(this.ctx);
    }
  }

  public end(): void {
    this.ctx.restore();
  }

  public drawTexture(
    image: HTMLImageElement | null,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number = 0,
    alpha: number = 1.0
  ): void {
    if (!image || !image.complete) return;

    this.ctx.save();
    if (alpha < 1.0) {
      this.ctx.globalAlpha = alpha;
    }

    if (rotation !== 0) {
      // Rotate around image center
      this.ctx.translate(x + width / 2, y + height / 2);
      this.ctx.rotate(rotation);
      this.ctx.drawImage(image, -width / 2, -height / 2, width, height);
    } else {
      this.ctx.drawImage(image, x, y, width, height);
    }

    this.ctx.restore();
  }

  public strokeRect(rect: Rectangle, color: string = '#ffffff', lineWidth: number = 1): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.restore();
  }

  public fillRect(rect: Rectangle, color: string): void {
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.restore();
  }
}

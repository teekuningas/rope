import { Point, Rectangle } from './math';

export class Camera2D {
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1.0;
  public minZoom: number = 0.25;
  public maxZoom: number = 2.5;

  public viewportWidth: number = 1024;
  public viewportHeight: number = 768;

  constructor(viewportWidth: number = 1024, viewportHeight: number = 768) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  public setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public follow(targetX: number, targetY: number, smooth: number = 0.1): void {
    this.x += (targetX - this.x) * smooth;
    this.y += (targetY - this.y) * smooth;
  }

  public pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  public setZoom(zoom: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  public zoomBy(delta: number): void {
    this.setZoom(this.zoom + delta);
  }

  public screenToWorld(screenX: number, screenY: number): Point {
    const centeredX = screenX - this.viewportWidth / 2;
    const centeredY = screenY - this.viewportHeight / 2;
    return {
      x: this.x + centeredX / this.zoom,
      y: this.y + centeredY / this.zoom,
    };
  }

  public worldToScreen(worldX: number, worldY: number): Point {
    const offsetX = (worldX - this.x) * this.zoom;
    const offsetY = (worldY - this.y) * this.zoom;
    return {
      x: this.viewportWidth / 2 + offsetX,
      y: this.viewportHeight / 2 + offsetY,
    };
  }

  public getVisibleBounds(): Rectangle {
    const halfW = this.viewportWidth / 2 / this.zoom;
    const halfH = this.viewportHeight / 2 / this.zoom;
    return {
      x: this.x - halfW,
      y: this.y - halfH,
      width: halfW * 2,
      height: halfH * 2,
    };
  }

  public applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}

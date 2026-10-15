import { Point, Rectangle } from './types';

export class Engine {
  public static tileWidth: number = 512;
  public static tileHeight: number = 512;

  public static get basicWidth(): number {
    return Math.floor(this.tileWidth / 4);
  }

  public static pointInsideRectangle(point: Point, rect: Rectangle): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  constructor(tileWidth: number = 512, tileHeight: number = 512) {
    Engine.tileWidth = tileWidth;
    Engine.tileHeight = tileHeight;
  }

  public static vectorToCell(x: number, y: number): Point {
    return {
      x: Math.floor(x / this.tileWidth),
      y: Math.floor(y / this.tileHeight),
    };
  }

  public static cellToVector(cellX: number, cellY: number): { x: number; y: number } {
    return {
      x: cellX * this.tileWidth,
      y: cellY * this.tileHeight,
    };
  }
}

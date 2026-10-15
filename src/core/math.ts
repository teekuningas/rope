export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Vector2 {
  public x: number;
  public y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  public set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public length(): number {
    return Math.hypot(this.x, this.y);
  }

  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  public normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  public static zero(): Vector2 {
    return new Vector2(0, 0);
  }
}

export class MathHelper {
  public static toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  public static toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }

  public static clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  public static pointInRect(p: Point, r: Rectangle): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  }

  public static snapToCellCenter(
    cellX: number,
    cellY: number,
    tileWidth: number,
    tileHeight: number,
    itemWidth: number,
    itemHeight: number
  ): Point {
    return {
      x: cellX * tileWidth + (tileWidth - itemWidth) / 2,
      y: cellY * tileHeight + (tileHeight - itemHeight) / 2,
    };
  }
}


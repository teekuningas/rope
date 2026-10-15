import { Tile } from './tile';
import { Engine } from './engine';
import { Rectangle } from './types';

export interface TileInfo {
  tile: Tile;
  posture: number; // 0, 1, 2, 3 (90-degree steps)
}

export class MapLayer {
  private map: TileInfo[][];
  private _width: number;
  private _height: number;

  public get width(): number {
    return this._width;
  }

  public get height(): number {
    return this._height;
  }

  constructor(width: number, height: number, defaultTile?: Tile) {
    this._width = width;
    this._height = height;
    this.map = [];

    for (let y = 0; y < height; y++) {
      this.map[y] = [];
      for (let x = 0; x < width; x++) {
        this.map[y][x] = {
          tile: defaultTile ?? new Tile(),
          posture: 0,
        };
      }
    }
  }

  public getRectangle(x: number, y: number): Rectangle {
    const vector = Engine.cellToVector(x, y);
    return {
      x: vector.x,
      y: vector.y,
      width: Engine.tileWidth,
      height: Engine.tileHeight,
    };
  }

  public getPosture(x: number, y: number): number {
    if (y < 0 || y >= this._height || x < 0 || x >= this._width) {
      return 0;
    }
    return this.map[y][x].posture;
  }

  public getTile(x: number, y: number): Tile | null {
    if (y < 0 || y >= this._height || x < 0 || x >= this._width) {
      return null;
    }
    return this.map[y][x].tile;
  }

  public setTile(x: number, y: number, tile: Tile, posture: number = 0): void {
    if (y >= 0 && y < this._height && x >= 0 && x < this._width) {
      this.map[y][x] = {
        tile,
        posture,
      };
    }
  }
}

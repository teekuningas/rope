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

export interface TileData {
  id: string;
  textureName: string;
  slowFactor: number;
}

export interface TilesData {
  tiles: TileData[];
}

export interface SpriteData {
  spriteId: string;
  textureName: string;
  size: number;
  isItem: boolean;
}

export interface SpritesData {
  sprites: SpriteData[];
}

export interface MapRowTile {
  id: string;
  posture: number; // 0, 1, 2, 3 (multiples of 90 degrees)
}

export interface MapRow {
  tiles: MapRowTile[];
}

export interface SpriteMapData {
  spriteId: string;
  positionX: number;
  positionY: number;
}

export interface MapData {
  name: string;
  sizeX: number;
  sizeY: number;
  rows: MapRow[];
  sprites: SpriteMapData[];
}

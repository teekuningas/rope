export class Tile {
  public texture: HTMLImageElement | null;
  public slowFactor: number;
  public id: string;
  public name: string;

  constructor(
    texture: HTMLImageElement | null = null,
    slowFactor: number = 1,
    id: string = '00',
    name: string = ''
  ) {
    this.texture = texture;
    this.slowFactor = slowFactor;
    this.id = id;
    this.name = name;
  }

  public getId(): string {
    return this.id;
  }
}

export class Tiles {
  private tiles: Tile[] = [];

  constructor() {
    this.tiles = [];
  }

  public get listOfTiles(): Tile[] {
    return this.tiles;
  }

  public add(tile: Tile): void {
    this.tiles.push(tile);
  }

  public getTileWithId(id: string): Tile {
    const found = this.tiles.find((t) => t.id === id);
    return found ?? this.tiles[0];
  }
}

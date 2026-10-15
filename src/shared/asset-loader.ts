import { Tiles, Tile } from './tile';
import { Sprites, Sprite, AnimatedSprite } from './sprite';
import { XmlLoader } from './xml-loader';

export class AssetLoader {
  private static imageCache: Map<string, HTMLImageElement> = new Map();

  public static async loadText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.statusText}`);
    }
    return await res.text();
  }

  public static async loadImage(url: string): Promise<HTMLImageElement> {
    const cached = this.imageCache.get(url);
    if (cached) return cached;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`Could not load image at ${url}`);
        resolve(img); // resolve anyway to avoid crashing the whole game on a missing texture
      };
      img.src = url;
    });
  }

  public static async loadAudio(url: string): Promise<HTMLAudioElement> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.oncanplaythrough = () => resolve(audio);
      audio.onerror = () => {
        console.warn(`Could not load audio at ${url}`);
        resolve(audio);
      };
      // Start loading
      audio.load();
    });
  }

  public static async loadCoreGameData(baseUrl: string = '/assets/'): Promise<{
    tiles: Tiles;
    sprites: Sprites;
  }> {
    const tilesXmlText = await this.loadText(`${baseUrl}data/Tiles.xml`);
    const spritesXmlText = await this.loadText(`${baseUrl}data/Sprites.xml`);

    const tilesData = XmlLoader.parseTilesXml(tilesXmlText);
    const spritesData = XmlLoader.parseSpritesXml(spritesXmlText);

    const tiles = new Tiles();
    for (const tData of tilesData.tiles) {
      const imgUrl = `${baseUrl}tiles/${tData.textureName.toLowerCase()}.png`;
      const img = await this.loadImage(imgUrl);
      const tile = new Tile(img, tData.slowFactor, tData.id, tData.textureName);
      tiles.add(tile);
    }

    const sprites = new Sprites();
    for (const sData of spritesData.sprites) {
      if (sData.spriteId === '02') {
        const [puu1, puu2] = await Promise.all([
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}.png`),
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}2.png`),
        ]);
        sprites.add(new AnimatedSprite([puu1, puu2], sData.size, sData.spriteId, 1, false, sData.canRotate));
      } else if (sData.spriteId === '07') {
        const [p1, p2, p3, p4] = await Promise.all([
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}.png`),
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}2.png`),
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}3.png`),
          this.loadImage(`${baseUrl}sprites/${sData.textureName.toLowerCase()}4.png`),
        ]);
        sprites.add(new AnimatedSprite([p1, p2, p3, p4], sData.size, sData.spriteId, 20, false, sData.canRotate));
      } else {
        const imgUrl = `${baseUrl}sprites/${sData.textureName.toLowerCase()}.png`;
        const img = await this.loadImage(imgUrl);
        const sprite = new Sprite(img, sData.size, sData.spriteId, sData.isItem, sData.canRotate);
        sprites.add(sprite);
      }
    }

    return { tiles, sprites };
  }
}

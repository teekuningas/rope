export class AssetManager {
  private static imageCache: Map<string, HTMLImageElement> = new Map();

  public static async loadText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load text asset at ${url}: ${res.statusText}`);
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
        resolve(img);
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
      audio.load();
    });
  }
}

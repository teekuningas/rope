import { TilesData, TileData, SpritesData, SpriteData, MapData, MapRow, MapRowTile, SpriteMapData } from './types';

export class XmlLoader {
  private static parser = new DOMParser();

  public static parseTilesXml(xmlString: string): TilesData {
    const doc = this.parser.parseFromString(xmlString, 'application/xml');
    const tileNodes = doc.querySelectorAll('tiles > Item');
    const tiles: TileData[] = [];

    tileNodes.forEach((node) => {
      const id = node.querySelector('ID')?.textContent?.trim() ?? '';
      const textureName = node.querySelector('textureName')?.textContent?.trim() ?? '';
      const slowFactorStr = node.querySelector('slowFactor')?.textContent?.trim() ?? '0';
      tiles.push({
        id,
        textureName,
        slowFactor: parseInt(slowFactorStr, 10) || 0,
      });
    });

    return { tiles };
  }

  public static parseSpritesXml(xmlString: string): SpritesData {
    const doc = this.parser.parseFromString(xmlString, 'application/xml');
    const spriteNodes = doc.querySelectorAll('sprites > Item');
    const sprites: SpriteData[] = [];

    spriteNodes.forEach((node) => {
      const spriteId = node.querySelector('spriteId')?.textContent?.trim() ?? '';
      const textureName = node.querySelector('textureName')?.textContent?.trim() ?? '';
      const sizeStr = node.querySelector('size')?.textContent?.trim() ?? '1';
      const isItemStr = node.querySelector('isItem')?.textContent?.trim()?.toLowerCase() ?? 'false';
      const isItem = isItemStr === 'true';
      const canRotateNode = node.querySelector('canRotate');
      const canRotate = canRotateNode !== null
        ? canRotateNode.textContent?.trim()?.toLowerCase() === 'true'
        : isItem;

      sprites.push({
        spriteId,
        textureName,
        size: parseInt(sizeStr, 10) || 1,
        isItem,
        canRotate,
      });
    });

    return { sprites };
  }

  public static parseMapXml(xmlString: string): MapData {
    const doc = this.parser.parseFromString(xmlString, 'application/xml');
    const asset = doc.querySelector('Asset');

    const name = asset?.querySelector('name')?.textContent?.trim() ?? 'Untitled';
    const sizeX = parseInt(asset?.querySelector('size_x')?.textContent?.trim() ?? '10', 10);
    const sizeY = parseInt(asset?.querySelector('size_y')?.textContent?.trim() ?? '10', 10);

    const rows: MapRow[] = [];
    const rowNodes = asset?.querySelectorAll('rows > Item');

    rowNodes?.forEach((rowNode) => {
      const tileNodes = rowNode.querySelectorAll('tiles > Item');
      const tiles: MapRowTile[] = [];
      tileNodes.forEach((tileNode) => {
        const id = tileNode.querySelector('id')?.textContent?.trim() ?? '01';
        const postureStr = tileNode.querySelector('posture')?.textContent?.trim() ?? '0';
        tiles.push({
          id,
          posture: parseInt(postureStr, 10) || 0,
        });
      });
      rows.push({ tiles });
    });

    const sprites: SpriteMapData[] = [];
    const spriteNodes = asset?.querySelectorAll('sprites > Item');

    spriteNodes?.forEach((sNode) => {
      const spriteId = sNode.querySelector('spriteId')?.textContent?.trim() ?? '';
      const posX = parseInt(sNode.querySelector('position_x')?.textContent?.trim() ?? '0', 10);
      const posY = parseInt(sNode.querySelector('position_y')?.textContent?.trim() ?? '0', 10);
      const postureStr = sNode.querySelector('posture')?.textContent?.trim();
      const posture = postureStr !== undefined ? parseInt(postureStr, 10) || 0 : 0;
      sprites.push({
        spriteId,
        positionX: posX,
        positionY: posY,
        posture,
      });
    });

    return {
      name,
      sizeX,
      sizeY,
      rows,
      sprites,
    };
  }

  public static serializeMapXml(mapData: MapData): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="utf-8"?>');
    lines.push('<XnaContent>');
    lines.push('  <Asset Type="SharedLibrary.MapData">');
    lines.push(`    <name>${mapData.name}</name>`);
    lines.push(`    <size_x>${mapData.sizeX}</size_x>`);
    lines.push(`    <size_y>${mapData.sizeY}</size_y>`);
    lines.push('    <rows>');

    for (const row of mapData.rows) {
      lines.push('      <Item>');
      lines.push('        <tiles>');
      for (const t of row.tiles) {
        lines.push('          <Item>');
        lines.push(`            <id>${t.id}</id>`);
        lines.push(`            <posture>${t.posture}</posture>`);
        lines.push('          </Item>');
      }
      lines.push('        </tiles>');
      lines.push('      </Item>');
    }

    lines.push('    </rows>');
    lines.push('    <sprites>');

    for (const s of mapData.sprites) {
      lines.push('      <Item>');
      lines.push(`        <spriteId>${s.spriteId}</spriteId>`);
      lines.push(`        <position_x>${Math.round(s.positionX)}</position_x>`);
      lines.push(`        <position_y>${Math.round(s.positionY)}</position_y>`);
      if (s.posture && s.posture > 0) {
        lines.push(`        <posture>${s.posture}</posture>`);
      }
      lines.push('      </Item>');
    }

    lines.push('    </sprites>');
    lines.push('  </Asset>');
    lines.push('</XnaContent>');

    return lines.join('\n');
  }
}

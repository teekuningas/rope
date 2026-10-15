/**
 * Platform-independent core game mechanics and functional domain logic.
 *
 * This module has ZERO DOM, Canvas, or Web Audio dependencies.
 * All functions are pure, portable, and easily translated to Rust, C#, or Wasm.
 */

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface BoundingBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ItemMetadata {
  readonly name: string;
  readonly desc: string;
}

export interface CoreEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  isItem?: boolean;
  posture?: number;
  name?: string;
  dropCooldownUntil?: number;
  spriteId?: string;
}

/**
 * Standard item registry mapping item IDs to display metadata.
 */
export const ITEM_REGISTRY: Readonly<Record<string, ItemMetadata>> = {
  '06': {
    name: 'Sword',
    desc: 'A sharp, finely crafted steel sword with a golden hilt.',
  },
  '01': {
    name: 'Magic Relic',
    desc: 'An ancient enchanted spiraling relic.',
  },
  '07': {
    name: 'Soccer Ball',
    desc: 'A bouncy soccer ball ready for a kick.',
  },
  '08': {
    name: 'Forest Mushroom',
    desc: 'A wild forest mushroom plucked from the glade.',
  },
  '09': {
    name: 'Spotted Mushroom',
    desc: 'A curious mushroom with brightly colored spots.',
  },
};

/**
 * Directional unit offsets for player facing directions.
 */
export const FACING_OFFSETS: Readonly<Record<Facing, Point2D>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Pure function: determines player facing direction from normalized input deltas.
 */
export function resolveFacing(dx: number, dy: number, fallback: Facing = 'down'): Facing {
  if (Math.abs(dx) <= 0.05 && Math.abs(dy) <= 0.05) {
    return fallback;
  }
  return Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}

/**
 * Pure function: merges keyboard deltas and analog touch joystick deltas into normalized movement.
 */
export function combineMovementInputs(
  kdx: number,
  kdy: number,
  touchX: number,
  touchY: number
): { dx: number; dy: number; magnitude: number } {
  // Normalize keyboard diagonal if present
  let normalizedKdx = kdx;
  let normalizedKdy = kdy;
  if (kdx !== 0 && kdy !== 0) {
    const kLen = Math.hypot(kdx, kdy);
    normalizedKdx /= kLen;
    normalizedKdy /= kLen;
  }

  let totalDx = normalizedKdx + touchX;
  let totalDy = normalizedKdy + touchY;
  const mag = Math.hypot(totalDx, totalDy);

  if (mag > 0.05) {
    if (mag > 1.0) {
      totalDx /= mag;
      totalDy /= mag;
    }
    return { dx: totalDx, dy: totalDy, magnitude: Math.min(1.0, mag) };
  }

  return { dx: 0, dy: 0, magnitude: 0 };
}

/**
 * Pure function: retrieves metadata for an item entity.
 */
export function getItemMetadata(spriteId?: string, fallbackName?: string): ItemMetadata {
  if (spriteId && ITEM_REGISTRY[spriteId]) {
    return ITEM_REGISTRY[spriteId];
  }
  return {
    name: fallbackName || (spriteId ? `Item ${spriteId}` : 'Carried Item'),
    desc: 'A carried adventurer item.',
  };
}

/**
 * Pure function: calculates collision bounding box for world obstacles based on sprite archetype.
 */
export function getObstacleBoundingBox(
  spriteId: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number
): BoundingBox | null {
  if (spriteId === '02') {
    // Tree trunk base
    return {
      left: x + width * 0.32,
      right: x + width * 0.68,
      top: y + height * 0.65,
      bottom: y + height * 0.90,
    };
  }
  if (spriteId === '03' || spriteId === '04' || spriteId === '05') {
    // Rocks
    return {
      left: x + width * 0.15,
      right: x + width * 0.85,
      top: y + height * 0.35,
      bottom: y + height * 0.85,
    };
  }
  return null;
}

/**
 * Pure function: tests if two bounding boxes intersect.
 */
export function boxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Pure function: validates whether player footprint can move to proposed target coordinates.
 */
export function canWalkToPosition(
  targetX: number,
  targetY: number,
  playerHeight: number,
  radiusX: number,
  radiusY: number,
  isWalkableTile: (x: number, y: number) => boolean,
  obstacleBoxes: readonly BoundingBox[],
  currentFeetPos: Point2D
): boolean {
  const targetFeetY = targetY + playerHeight / 2 - 40;
  const pLeft = targetX - radiusX;
  const pRight = targetX + radiusX;
  const pTop = targetFeetY - radiusY;
  const pBottom = targetFeetY + radiusY;

  // 1. Terrain tile walkability check
  if (
    !isWalkableTile(pLeft, targetFeetY) ||
    !isWalkableTile(pRight, targetFeetY) ||
    !isWalkableTile(targetX, pTop) ||
    !isWalkableTile(targetX, pBottom)
  ) {
    return false;
  }

  // 2. Obstacle boxes collision check
  const curLeft = currentFeetPos.x - radiusX;
  const curRight = currentFeetPos.x + radiusX;
  const curTop = currentFeetPos.y - radiusY;
  const curBottom = currentFeetPos.y + radiusY;

  const targetBox: BoundingBox = { left: pLeft, right: pRight, top: pTop, bottom: pBottom };
  const currentBox: BoundingBox = { left: curLeft, right: curRight, top: curTop, bottom: curBottom };

  for (const box of obstacleBoxes) {
    if (boxesIntersect(targetBox, box)) {
      // If already intersecting the obstacle, allow moving away from center
      if (boxesIntersect(currentBox, box)) {
        const obsCenterX = (box.left + box.right) / 2;
        const obsCenterY = (box.top + box.bottom) / 2;
        const curDist = Math.hypot(currentFeetPos.x - obsCenterX, currentFeetPos.y - obsCenterY);
        const nextDist = Math.hypot(targetX - obsCenterX, targetFeetY - obsCenterY);
        if (nextDist <= curDist) {
          return false;
        }
      } else {
        return false;
      }
    }
  }

  return true;
}

/**
 * Functional inventory drop operation:
 * Returns the updated inventory, the dropped entity with world coordinates, and the drop target point.
 */
export function dropItemFromInventory<T extends CoreEntity>(
  inventory: readonly T[],
  index: number,
  playerPos: Point2D,
  playerFacing: Facing,
  offsetDistance: number = 70,
  cooldownDurationMs: number = 1500,
  currentTime: number = Date.now()
): { inventory: T[]; droppedItem: T; dropPosition: Point2D } | null {
  if (index < 0 || index >= inventory.length) {
    return null;
  }

  const item = inventory[index];
  const nextInventory = inventory.filter((_, i) => i !== index);

  const offset = FACING_OFFSETS[playerFacing];
  const dropPosition: Point2D = {
    x: playerPos.x + offset.x * offsetDistance,
    y: playerPos.y + offset.y * offsetDistance,
  };

  const droppedItem: T = {
    ...item,
    x: dropPosition.x - item.width / 2,
    y: dropPosition.y - item.height / 2,
    dropCooldownUntil: currentTime + cooldownDurationMs,
  };

  return {
    inventory: nextInventory,
    droppedItem,
    dropPosition,
  };
}

/**
 * Functional candidate finder for picking up items:
 * Returns index and entity of the closest pickupable item within radius, or null if none.
 */
export function findNearbyPickupCandidate<T extends CoreEntity>(
  entities: readonly T[],
  playerPos: Point2D,
  pickupRadius: number,
  currentTime: number = Date.now()
): { index: number; entity: T; distance: number } | null {
  let closest: { index: number; entity: T; distance: number } | null = null;

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (!ent.isItem) continue;
    if (ent.dropCooldownUntil && currentTime < ent.dropCooldownUntil) continue;

    const itemCenterX = ent.x + ent.width / 2;
    const itemCenterY = ent.y + ent.height / 2;
    const dist = Math.hypot(playerPos.x - itemCenterX, playerPos.y - itemCenterY);

    if (dist <= pickupRadius && (!closest || dist < closest.distance)) {
      closest = { index: i, entity: ent, distance: dist };
    }
  }

  return closest;
}

/**
 * Functional pickup operation:
 * Transfers item at entityIndex into the inventory.
 */
export function pickupEntity<T extends CoreEntity>(
  inventory: readonly T[],
  entities: readonly T[],
  entityIndex: number
): { inventory: T[]; entities: T[]; pickedItem: T } | null {
  if (entityIndex < 0 || entityIndex >= entities.length) {
    return null;
  }

  const pickedItem = entities[entityIndex];
  if (!pickedItem.isItem) {
    return null;
  }

  const nextInventory = [...inventory, pickedItem];
  const nextEntities = entities.filter((_, idx) => idx !== entityIndex);

  return {
    inventory: nextInventory,
    entities: nextEntities,
    pickedItem,
  };
}

/**
 * Procedural generation of lightning bolt vertices.
 */
export function generateLightningPoints(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  segments: number = 12,
  jitterAmount: number = 60
): Point2D[] {
  const points: Point2D[] = [{ x: startX, y: startY }];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const interpX = startX + (targetX - startX) * t;
    const interpY = startY + (targetY - startY) * t;
    const jitter = (Math.random() - 0.5) * jitterAmount;
    points.push({ x: interpX + jitter, y: interpY });
  }

  points.push({ x: targetX, y: targetY });
  return points;
}

/**
 * Pure depth sorting comparator for Y-sorted rendering.
 */
export function compareRenderDepth(
  a: { centerY: number; centerX: number; id: string },
  b: { centerY: number; centerX: number; id: string }
): number {
  if (a.centerY !== b.centerY) {
    return a.centerY - b.centerY;
  }
  if (a.centerX !== b.centerX) {
    return a.centerX - b.centerX;
  }
  return a.id.localeCompare(b.id);
}

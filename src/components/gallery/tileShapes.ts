import type { ImageOrientation } from '@/utils/imageSize';

/**
 * Width over height of each gallery tile shape.
 *
 * Kept apart from JustifiedPhotoGrid so the portal's thumbnails can draw the same shapes without
 * the grid's module exporting anything but its component.
 */
export const TILE_RATIO: Record<ImageOrientation, number> = {
  landscape: 3 / 2,
  portrait: 2 / 3,
};

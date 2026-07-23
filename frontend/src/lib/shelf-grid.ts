/** Match shelf grid Tailwind: gap-3 mobile, gap-4 from sm. */
export const SHELF_GRID_GAP_PX = {
  mobile: 12,
  desktop: 16,
} as const;

/** Match minmax mins: 11rem / 12rem (sm / lg). */
export const SHELF_GRID_MIN_COL_PX = {
  mobile: 0, // fixed 2 columns
  sm: 176, // 11rem
  lg: 192, // 12rem
} as const;

/** Card estimate: 3/4 cover + text + footer (~28rem in BookCard). */
export const SHELF_CARD_ESTIMATE_HEIGHT_PX = 448;

/**
 * Column count aligned with shelf CSS:
 * - <640px: 2 columns
 * - ≥640px: auto-fit minmax(11rem, 12.5rem)
 * - ≥1024px: auto-fit minmax(12rem, 13rem)
 */
export function getShelfColumnCount(containerWidth: number): number {
  if (containerWidth <= 0) return 2;
  if (containerWidth < 640) return 2;

  const minCol =
    containerWidth >= 1024 ? SHELF_GRID_MIN_COL_PX.lg : SHELF_GRID_MIN_COL_PX.sm;
  const gap = SHELF_GRID_GAP_PX.desktop;
  return Math.max(2, Math.floor((containerWidth + gap) / (minCol + gap)));
}

export function getShelfRowCount(itemCount: number, columnCount: number): number {
  if (itemCount <= 0 || columnCount <= 0) return 0;
  return Math.ceil(itemCount / columnCount);
}

export function getShelfGapPx(containerWidth: number): number {
  return containerWidth < 640 ? SHELF_GRID_GAP_PX.mobile : SHELF_GRID_GAP_PX.desktop;
}

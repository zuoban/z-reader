'use client';

import { useEffect, useMemo, useState } from 'react';
import { Category } from '@/lib/api';
import { getCategoryColor } from '@/lib/categoryColors';

export interface RadialCategoryTarget {
  id: string;
  categoryId: string | null;
  label: string;
  color: string;
  count: number;
  blocked: boolean;
  dx: number;
  dy: number;
  size: number;
  width: number;
  height: number;
  isClear: boolean;
}

const MAX_LABEL_LENGTH = 5;
const ITEM_WIDTH = 128;
const ITEM_HEIGHT = 54;
const ITEM_GAP = 10;
const ITEMS_PER_ROW = 2;
const ROW_GAP = 12;
const ROW_VERTICAL_OFFSET = -128;
const TRAY_PADDING_X = 16;
const TRAY_PADDING_TOP = 16;
const TRAY_PADDING_BOTTOM = 16;

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  if (!/^[\da-fA-F]{6}$/.test(expanded)) {
    return `rgba(23, 23, 23, ${alpha})`;
  }

  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function truncateLabel(label: string) {
  return label.length > MAX_LABEL_LENGTH
    ? `${label.slice(0, MAX_LABEL_LENGTH)}...`
    : label;
}

export function buildRadialCategoryTargets(
  categories: Category[],
  bookCounts: Record<string, number>,
  originalCategoryId: string | null
): RadialCategoryTarget[] {
  const items = [
    ...categories
      .filter((category) => category.id !== originalCategoryId)
      .map((category) => ({
        id: category.id,
        categoryId: category.id,
        label: truncateLabel(category.name),
        color: getCategoryColor(category.sort_order),
        count: bookCounts[category.id] || 0,
        blocked: false,
        isClear: false,
      })),
    ...(originalCategoryId
      ? [{
          id: 'uncategorized',
          categoryId: null,
          label: '未分类',
          color: '#dc2626',
          count: 0,
          blocked: false,
          isClear: true,
        }]
      : []),
  ];
  const rowCount = Math.ceil(items.length / ITEMS_PER_ROW);

  return items.map((item, index) => {
    const row = Math.floor(index / ITEMS_PER_ROW);
    const indexInRow = index % ITEMS_PER_ROW;
    const totalWidth = ITEMS_PER_ROW * ITEM_WIDTH + Math.max(0, ITEMS_PER_ROW - 1) * ITEM_GAP;
    const startX = -totalWidth / 2 + ITEM_WIDTH / 2;
    const totalHeight = rowCount * ITEM_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;
    const startY = ROW_VERTICAL_OFFSET - totalHeight / 2 + ITEM_HEIGHT / 2;

    return {
      ...item,
      dx: startX + indexInRow * (ITEM_WIDTH + ITEM_GAP),
      dy: startY + row * (ITEM_HEIGHT + ROW_GAP),
      size: Math.max(ITEM_WIDTH, ITEM_HEIGHT),
      width: ITEM_WIDTH,
      height: ITEM_HEIGHT,
    };
  });
}

interface RadialCategoryMenuProps {
  anchorX: number;
  anchorY: number;
  targets: RadialCategoryTarget[];
  hoveredCategoryId: string | null;
}

export function RadialCategoryMenu({
  anchorX,
  anchorY,
  targets,
  hoveredCategoryId,
}: RadialCategoryMenuProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);

    return () => {
      window.removeEventListener('resize', updateViewportSize);
    };
  }, []);

  function clampPosition(value: number, min: number, max: number) {
    if (max <= min) return value;
    return Math.min(Math.max(value, min), max);
  }

  const bounds = useMemo(() => {
    if (targets.length === 0) {
      return { minDx: 0, maxDx: 0, minDy: 0, maxDy: 0 };
    }

    return targets.reduce(
      (acc, target) => ({
        minDx: Math.min(acc.minDx, target.dx - ITEM_WIDTH / 2),
        maxDx: Math.max(acc.maxDx, target.dx + ITEM_WIDTH / 2),
        minDy: Math.min(acc.minDy, target.dy - ITEM_HEIGHT / 2),
        maxDy: Math.max(acc.maxDy, target.dy + ITEM_HEIGHT / 2),
      }),
      {
        minDx: Number.POSITIVE_INFINITY,
        maxDx: Number.NEGATIVE_INFINITY,
        minDy: Number.POSITIVE_INFINITY,
        maxDy: Number.NEGATIVE_INFINITY,
      }
    );
  }, [targets]);

  const safeAnchorX = clampPosition(
    anchorX,
    TRAY_PADDING_X - bounds.minDx,
    Math.max(TRAY_PADDING_X - bounds.minDx, viewportSize.width - TRAY_PADDING_X - bounds.maxDx)
  );
  const safeAnchorY = clampPosition(
    anchorY,
    TRAY_PADDING_TOP - bounds.minDy,
    Math.max(TRAY_PADDING_TOP - bounds.minDy, viewportSize.height - TRAY_PADDING_BOTTOM - bounds.maxDy)
  );
  const trayLeft = safeAnchorX + bounds.minDx - TRAY_PADDING_X;
  const trayTop = safeAnchorY + bounds.minDy - TRAY_PADDING_TOP;
  const trayWidth = bounds.maxDx - bounds.minDx + TRAY_PADDING_X * 2;
  const trayHeight = bounds.maxDy - bounds.minDy + TRAY_PADDING_TOP + TRAY_PADDING_BOTTOM;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),rgba(255,255,255,0.08)_38%,rgba(148,163,184,0.14)_100%)] backdrop-blur-[10px]" />
      <div
        className="absolute overflow-hidden rounded-[28px] border border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.2))] shadow-[0_30px_90px_-44px_rgba(15,23,42,0.24)] backdrop-blur-[22px]"
        style={{
          left: trayLeft,
          top: trayTop,
          width: trayWidth,
          height: trayHeight,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,rgba(96,165,250,0.14),rgba(96,165,250,0)_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.28),rgba(255,255,255,0)_30%)]" />
        <div className="absolute inset-[1px] rounded-[27px] border border-white/30" />
      </div>

      {targets.map((target) => {
        const isHovered = hoveredCategoryId === target.id && !target.blocked;
        const left = safeAnchorX + target.dx;
        const top = safeAnchorY + target.dy;
        const accentColor = target.isClear ? '#ff6b6b' : '#0a84ff';

        return (
          <div
            key={target.id}
            className="absolute transition-all duration-200 ease-out motion-reduce:transition-none"
            style={{
              left,
              top,
              transform: `translate(-50%, -50%) translateY(${isHovered ? '-1px' : '0px'}) scale(${isHovered ? 1.01 : 1})`,
              opacity: target.blocked ? 0.48 : 1,
            }}
          >
            <div
              className="relative overflow-hidden rounded-[16px] transition-all duration-200"
              style={{
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                color: isHovered ? accentColor : '#172033',
              }}
            >
              <div className="relative flex h-full w-full items-center px-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold tracking-tight leading-none">
                    {target.label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

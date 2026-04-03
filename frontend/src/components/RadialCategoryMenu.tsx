'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Category } from '@/lib/api';

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
  isClear: boolean;
}

const MAX_LABEL_LENGTH = 5;
const ITEM_WIDTH = 82;
const ITEM_HEIGHT = 46;
const ITEM_GAP = 8;
const ITEMS_PER_ROW = 3;
const ROW_GAP = 10;
const ROW_VERTICAL_OFFSET = -118;

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
    ...(originalCategoryId
      ? [{
          id: 'uncategorized',
          categoryId: null,
          label: '删除分类',
          color: '#dc2626',
          count: 0,
          blocked: false,
          isClear: true,
        }]
      : []),
    ...categories
      .filter((category) => category.id !== originalCategoryId)
      .map((category) => ({
        id: category.id,
        categoryId: category.id,
        label: truncateLabel(category.name),
        color: category.color,
        count: bookCounts[category.id] || 0,
        blocked: false,
        isClear: false,
      })),
  ];
  const rowCount = Math.ceil(items.length / ITEMS_PER_ROW);

  return items.map((item, index) => {
    const row = Math.floor(index / ITEMS_PER_ROW);
    const indexInRow = index % ITEMS_PER_ROW;
    const rowStart = row * ITEMS_PER_ROW;
    const rowItems = Math.min(ITEMS_PER_ROW, items.length - rowStart);
    const totalWidth = rowItems * ITEM_WIDTH + Math.max(0, rowItems - 1) * ITEM_GAP;
    const startX = -totalWidth / 2 + ITEM_WIDTH / 2;
    const totalHeight = rowCount * ITEM_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;
    const startY = ROW_VERTICAL_OFFSET - totalHeight / 2 + ITEM_HEIGHT / 2;

    return {
      ...item,
      dx: startX + indexInRow * (ITEM_WIDTH + ITEM_GAP),
      dy: startY + row * (ITEM_HEIGHT + ROW_GAP),
      size: Math.max(ITEM_WIDTH, ITEM_HEIGHT),
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
    16 - bounds.minDx,
    Math.max(16 - bounds.minDx, viewportSize.width - 16 - bounds.maxDx)
  );
  const safeAnchorY = clampPosition(
    anchorY,
    16 - bounds.minDy,
    Math.max(16 - bounds.minDy, viewportSize.height - 16 - bounds.maxDy)
  );
  const trayLeft = safeAnchorX + bounds.minDx - 12;
  const trayTop = safeAnchorY + bounds.minDy - 12;
  const trayWidth = bounds.maxDx - bounds.minDx + 24;
  const trayHeight = bounds.maxDy - bounds.minDy + 24;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none">
      <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />
      <div
        className="absolute rounded-[26px] border border-white/55 bg-white/58 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.28)] backdrop-blur-xl"
        style={{
          left: trayLeft,
          top: trayTop,
          width: trayWidth,
          height: trayHeight,
        }}
      />

      {targets.map((target) => {
        const isHovered = hoveredCategoryId === target.id && !target.blocked;
        const left = safeAnchorX + target.dx;
        const top = safeAnchorY + target.dy;

        return (
          <div
            key={target.id}
            className="absolute transition-all duration-200 ease-out motion-reduce:transition-none"
            style={{
              left,
              top,
              transform: `translate(-50%, -50%) translateY(${isHovered ? '-1px' : '0px'}) scale(${isHovered ? 1.03 : 1})`,
              opacity: target.blocked ? 0.48 : 1,
            }}
          >
            <div
              className={`flex items-center justify-center rounded-2xl border backdrop-blur-xl transition-all duration-200 ${
                isHovered
                  ? 'border-foreground/16 bg-white text-foreground shadow-[0_16px_28px_-22px_rgba(15,23,42,0.24)]'
                  : 'border-border/55 bg-white/84 text-foreground/78 shadow-[0_10px_18px_-20px_rgba(15,23,42,0.14)]'
              } ${target.blocked ? 'border-dashed' : ''}`}
              style={{
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                color: '#171717',
              }}
            >
              {target.isClear ? (
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#171717]">
                  <Trash2 className="h-[15px] w-[15px]" />
                  <span>删除</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: '#dc2626' }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2 text-center text-[13px] font-semibold leading-none text-[#171717]">
                  <span className="whitespace-nowrap">{target.label}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: target.color }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

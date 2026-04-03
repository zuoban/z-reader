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
const ITEM_WIDTH = 86;
const ITEM_HEIGHT = 52;
const ITEM_GAP = 10;
const ROW_VERTICAL_OFFSET = -112;

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

  const totalWidth = items.length * ITEM_WIDTH + Math.max(0, items.length - 1) * ITEM_GAP;
  const startX = -totalWidth / 2 + ITEM_WIDTH / 2;

  return items.map((item, index) => ({
    ...item,
    dx: startX + index * (ITEM_WIDTH + ITEM_GAP),
    dy: ROW_VERTICAL_OFFSET,
    size: Math.max(ITEM_WIDTH, ITEM_HEIGHT),
  }));
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
      <div className="absolute inset-0 bg-white/6 backdrop-blur-[1.5px]" />
      <div
        className="absolute rounded-[28px] border border-white/50 bg-white/60 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur-xl"
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
              transform: `translate(-50%, -50%) translateY(${isHovered ? '-2px' : '0px'}) scale(${isHovered ? 1.04 : 1})`,
              opacity: target.blocked ? 0.48 : 1,
            }}
          >
            <div
              className={`flex items-center justify-center rounded-2xl border backdrop-blur-xl transition-all duration-200 ${
                isHovered
                  ? 'border-foreground/20 bg-white text-foreground shadow-[0_20px_36px_-22px_rgba(15,23,42,0.32)]'
                  : 'border-border/60 bg-white/90 text-foreground/78 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.18)]'
              } ${target.blocked ? 'border-dashed' : ''}`}
              style={{
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                color: target.isClear ? '#dc2626' : isHovered ? '#171717' : target.color,
              }}
            >
              {target.isClear ? (
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Trash2 className="h-4 w-4" />
                  <span>删除</span>
                </div>
              ) : (
                <span className="px-2 text-center text-[14px] font-semibold leading-[1.2]">
                  {target.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

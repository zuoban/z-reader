'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Sparkles, Trash2 } from 'lucide-react';
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

const ARC_START = 14;
const ARC_END = 132;
const BASE_RADIUS = 108;
const RING_GAP = 72;
const MAX_PER_RING = 5;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
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
        label: category.name,
        color: category.color,
        count: bookCounts[category.id] || 0,
        blocked: false,
        isClear: false,
      })),
  ];

  return items.map((item, index) => {
    const ring = Math.floor(index / MAX_PER_RING);
    const indexInRing = index % MAX_PER_RING;
    const ringCount = Math.min(MAX_PER_RING, items.length - ring * MAX_PER_RING);
    const radius = BASE_RADIUS + ring * RING_GAP;
    const angle =
      ringCount === 1
        ? (ARC_START + ARC_END) / 2
        : ARC_START + (indexInRing / (ringCount - 1)) * (ARC_END - ARC_START) + ring * 5;
    const radians = toRadians(angle);

    return {
      ...item,
      dx: Math.cos(radians) * radius,
      dy: Math.sin(radians) * radius,
      size: 68,
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

  const maxItemSize = targets.reduce((max, target) => Math.max(max, target.size), 68);
  const maxRadius = targets.reduce(
    (max, target) => Math.max(max, Math.hypot(target.dx, target.dy)),
    BASE_RADIUS
  );
  const menuPadding = maxRadius + maxItemSize / 2 + 18;
  const safeAnchorX = clampPosition(
    anchorX,
    menuPadding,
    Math.max(menuPadding, viewportSize.width - menuPadding)
  );
  const safeAnchorY = clampPosition(
    anchorY,
    menuPadding,
    Math.max(menuPadding, viewportSize.height - menuPadding)
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_16%,transparent_58%)]" />
      <div
        className="absolute rounded-full border border-black/8 bg-white/18 shadow-[0_24px_80px_-42px_rgba(15,23,42,0.36)] backdrop-blur-[2px]"
        style={{
          left: safeAnchorX,
          top: safeAnchorY,
          width: BASE_RADIUS * 2.7,
          height: BASE_RADIUS * 2.7,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {targets.map((target) => {
        const isHovered = hoveredCategoryId === target.id && !target.blocked;
        const textColor = target.isClear ? '#dc2626' : target.color;
        const itemSize = target.size;
        const left = safeAnchorX + target.dx;
        const top = safeAnchorY + target.dy;
        const lineDx = target.dx;
        const lineDy = target.dy;
        const lineLength = Math.max(18, Math.hypot(lineDx, lineDy) - itemSize * 0.5);

        return (
          <div
            key={target.id}
            className="absolute transition-all duration-200 ease-out motion-reduce:transition-none"
            style={{
              left,
              top,
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.04 : target.blocked ? 0.94 : 1})`,
              opacity: target.blocked ? 0.48 : 1,
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 -z-10 origin-left rounded-full"
              style={{
                width: lineLength,
                height: 2,
                background: isHovered
                  ? `linear-gradient(90deg, rgba(255,255,255,0.15) 0%, ${target.color}75 100%)`
                  : 'linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.16) 100%)',
                transform: `translateY(-50%) rotate(${Math.atan2(lineDy, lineDx)}rad)`,
              }}
            />
            <div
              className={`flex items-center justify-center border text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-all duration-200 ${
                isHovered
                  ? 'border-white/85 ring-4 ring-white/30'
                  : 'border-white/55'
              } rounded-full ${target.blocked ? 'border-dashed' : ''}`}
              style={{
                width: itemSize,
                height: itemSize,
                background: target.blocked
                  ? 'rgba(255,255,255,0.75)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(244,244,245,0.96) 100%)',
                color: target.blocked ? '#6b7280' : textColor,
                boxShadow: isHovered
                  ? `0 0 0 1px ${target.color}55, 0 18px 40px -24px ${target.color}99`
                  : undefined,
              }}
            >
              <div
                className="absolute inset-[4px] rounded-full border"
                style={{
                  borderColor: target.isClear ? 'rgba(220,38,38,0.18)' : `${target.color}26`,
                }}
              />
              {target.isClear ? (
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(220,38,38,0.12)] text-[#dc2626]">
                  <Trash2 className="h-4 w-4" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center px-2">
                  <span className="max-w-[72%] text-center text-[11px] font-semibold leading-tight">
                    {target.label}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: safeAnchorX, top: safeAnchorY }}
      >
        <div className="absolute inset-[-28px] rounded-full bg-foreground/12 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/70 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(39,39,42,0.98))] text-white shadow-[0_26px_46px_-28px_rgba(15,23,42,0.75)] backdrop-blur-xl">
          <div className="absolute inset-[6px] rounded-full border border-white/10" />
          <div className="relative flex items-center gap-1">
            <GripVertical className="h-4 w-4 opacity-80" />
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

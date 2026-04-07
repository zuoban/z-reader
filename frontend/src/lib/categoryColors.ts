import type { Category } from '@/lib/api';

// 分类颜色预设（8种循环）
export const CATEGORY_COLORS = [
  '#A4D3F2', // 晴蓝
  '#2DABC2', // 海青
  '#143B5D', // 深海
  '#FDBA11', // 金黄
  '#FF8A00', // 橙焰
  '#E85D3F', // 珊红
  '#5D9B6A', // 松绿
  '#7A64B8', // 葡紫
] as const;

// 暗色系颜色，需要白色图标
export const DARK_COLORS = ['#143B5D', '#2DABC2', '#5D9B6A', '#7A64B8'] as const;

/**
 * 根据序号获取分类颜色
 * @param sortOrder 分类排序序号（从1开始）
 * @returns 颜色值
 */
export function getCategoryColor(sortOrder: number): string {
  const index = (sortOrder - 1) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[index];
}

/**
 * 根据分类获取颜色（优先使用 sort_order）
 * @param category 分类对象
 * @returns 颜色值
 */
export function getCategoryColorFromCategory(category: Category): string {
  return getCategoryColor(category.sort_order);
}

/**
 * 获取对比色（用于文字/图标）
 * @param color 背景色
 * @returns 对比文字颜色
 */
export function getContrastColor(color: string): string {
  return DARK_COLORS.includes(color as (typeof DARK_COLORS)[number]) ? '#fff' : '#143B5D';
}

/**
 * 将颜色转换为带透明度的 rgba 字符串
 * @param hex hex 颜色值
 * @param alpha 透明度 0-1
 * @returns rgba 字符串
 */
export function toAlphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;

  if (value.length !== 6) return hex;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

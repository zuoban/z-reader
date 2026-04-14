'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/utils';

const sizeMap = {
  sm: { width: '150px', spineTranslation: '122px' },
  default: { width: '196px', spineTranslation: '168px' },
  lg: { width: '300px', spineTranslation: '272px' },
} as const;

type PerspectiveBookSize = keyof typeof sizeMap;

interface PerspectiveBookProps {
  size?: PerspectiveBookSize;
  className?: string;
  children: ReactNode;
  textured?: boolean;
}

const defaultColorClasses =
  'bg-neutral-100 text-primary dark:bg-[#1f1f1f] dark:before:absolute dark:before:inset-0 dark:before:rounded-[inherit] dark:before:bg-gradient-to-b dark:before:from-[#ffffff1a] dark:before:to-transparent dark:before:content-[""]';

function getCoverClasses(className?: string) {
  return cn(
    "absolute inset-y-0 left-0 flex size-full flex-col overflow-hidden pl-[8%] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-solid after:border-[#00000014] after:shadow-[0_1.8px_3.6px_#0000000d,_0_10.8px_21.6px_#00000014,_inset_0_-.9px_#0000001a,_inset_0_1.8px_1.8px_#ffffff1a,_inset_3.6px_0_3.6px_#0000001a]",
    className || defaultColorClasses
  );
}

export function PerspectiveBook({
  size = 'default',
  className = '',
  children,
  textured = false,
}: PerspectiveBookProps) {
  const coverWidth = sizeMap[size].width;
  const spineTranslation = sizeMap[size].spineTranslation;
  const [isActive, setIsActive] = useState(false);

  const handlePointerDown = useCallback(() => {
    setIsActive(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsActive(false);
  }, []);

  const handlePointerDownCapture = useCallback(() => {
    setIsActive(true);
  }, []);

  const handlePointerUpCapture = useCallback(() => {
    setIsActive(false);
  }, []);

  return (
    <div
      className="group z-10 h-min w-min [perspective:900px]"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // 允许指针事件穿透到父级
      style={{ touchAction: 'manipulation' }}
    >
      <div
        style={{
          width: coverWidth,
          borderRadius: '6px 4px 4px 6px',
        }}
        className={cn(
          "relative aspect-[49/60] transition-transform duration-300 ease-out [transform-style:preserve-3d]",
          // 悬停状态（桌面端）
          "group-hover:scale-[1.066] group-hover:-translate-x-1 group-hover:[transform:rotateY(-20deg)]",
          // 按压状态（移动端）
          isActive && "scale-[1.066] -translate-x-1 [transform:rotateY(-20deg)]"
        )}
      >
        {/* 封面 */}
        <div
          className={getCoverClasses(className)}
          style={{
            transform: 'translateZ(25px)',
            borderRadius: '6px 4px 4px 6px',
          }}
        >
          <div
            className="absolute left-0 top-0 h-full opacity-40"
            style={{
              minWidth: '8.2%',
              background:
                'linear-gradient(90deg, hsla(0, 0%, 100%, 0), hsla(0, 0%, 100%, 0) 12%, hsla(0, 0%, 100%, .25) 29.25%, hsla(0, 0%, 100%, 0) 50.5%, hsla(0, 0%, 100%, 0) 75.25%, hsla(0, 0%, 100%, .25) 91%, hsla(0, 0%, 100%, 0)), linear-gradient(90deg, rgba(0, 0, 0, .03), rgba(0, 0, 0, .1) 12%, transparent 30%, rgba(0, 0, 0, .02) 50%, rgba(0, 0, 0, .2) 73.5%, rgba(0, 0, 0, .5) 75.25%, rgba(0, 0, 0, .15) 85.25%, transparent)',
            }}
          />
          <div className="size-full">{children}</div>
          {textured && (
            <div
              className="book-cover-texture pointer-events-none absolute inset-0 rotate-180 bg-cover bg-no-repeat mix-blend-hard-light opacity-50 brightness-110"
              style={{ borderRadius: '6px 4px 4px 6px' }}
            />
          )}
        </div>

        {/* 书脊 */}
        <div
          className="absolute left-0 bg-[linear-gradient(90deg,#eaeaea_0%,#0000_80%),linear-gradient(#fff,#fafafa)]"
          style={{
            top: '3px',
            bottom: '3px',
            width: '48px',
            transform: `translateX(${spineTranslation}) rotateY(90deg)`,
          }}
        />

        {/* 封底 */}
        <div
          className={getCoverClasses(className)}
          style={{
            transform: 'translateZ(-25px)',
            borderRadius: '6px 4px 4px 6px',
          }}
        />
      </div>

      {/* 透明遮罩层，捕获整个卡片区域的 pointer 事件 */}
      <div
        className="absolute inset-0 z-20 cursor-pointer"
        style={{ touchAction: 'manipulation' }}
        onPointerDown={handlePointerDownCapture}
        onPointerUp={handlePointerUpCapture}
        onPointerLeave={handlePointerUpCapture}
        onPointerCancel={handlePointerUpCapture}
      />
    </div>
  );
}

interface BookHeaderProps {
  children: ReactNode;
  className?: string;
}

export function BookHeader({ children, className = '' }: BookHeaderProps) {
  return <div className={cn('flex flex-wrap gap-2', className)}>{children}</div>;
}

interface BookTitleProps {
  children: ReactNode;
  className?: string;
}

export function BookTitle({ children, className = '' }: BookTitleProps) {
  return (
    <h1 className={cn('mt-3 mb-1 select-none text-balance font-bold', className)}>
      {children}
    </h1>
  );
}

interface BookDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function BookDescription({
  children,
  className = '',
}: BookDescriptionProps) {
  return (
    <p className={cn('select-none text-xs/relaxed opacity-80', className)}>
      {children}
    </p>
  );
}

export default PerspectiveBook;

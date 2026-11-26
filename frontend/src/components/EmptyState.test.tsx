import { render, screen } from '@/test/render';
import { BookOpen } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/EmptyState';

describe('EmptyState', () => {
  it('renders JSX detail inside a div container rather than invalid p nesting', () => {
    render(
      <EmptyState
        icon={BookOpen}
        title="书架还是空的"
        description="上传书籍开始阅读。"
        detail={<div data-testid="empty-detail-block">支持多种格式</div>}
      />,
    );

    const detailBlock = screen.getByTestId('empty-detail-block');
    expect(detailBlock.parentElement?.tagName).toBe('DIV');
    expect(detailBlock.closest('p')).toBeNull();
  });

  it('marks heading and description inside role="alert" when tone is error', () => {
    render(
      <EmptyState
        icon={BookOpen}
        tone="error"
        title="加载失败"
        description="请检查网络连接。"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('加载失败');
    expect(alert).toHaveTextContent('请检查网络连接。');
  });
});

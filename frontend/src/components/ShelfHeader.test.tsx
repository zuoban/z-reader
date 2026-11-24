import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ShelfHeader } from '@/components/ShelfHeader';

describe('ShelfHeader', () => {
  it('renders upload action and settings menu items when online', () => {
    const onToggleTheme = vi.fn();
    const onManageOfflineBooks = vi.fn();
    const onLogout = vi.fn();

    render(
      <ShelfHeader
        uploadAccept=".epub,.pdf"
        isOffline={false}
        isUploading={false}
        isDark={false}
        onUpload={vi.fn()}
        onToggleTheme={onToggleTheme}
        onManageOfflineBooks={onManageOfflineBooks}
        onLogout={onLogout}
      />,
    );

    expect(screen.getByRole('button', { name: '上传书籍' })).toBeInTheDocument();
    expect(screen.queryByText('离线模式')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '书架设置' }));
    expect(screen.getByText('书架设置')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '离线图书管理' }));
    expect(onManageOfflineBooks).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '书架设置' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '暗色模式' }));
    expect(onToggleTheme).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '书架设置' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('shows an offline status badge instead of upload when offline', () => {
    render(
      <ShelfHeader
        uploadAccept=".epub,.pdf"
        isOffline
        isUploading={false}
        isDark
        onUpload={vi.fn()}
        onToggleTheme={vi.fn()}
        onManageOfflineBooks={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('离线模式');
    expect(screen.queryByRole('button', { name: '上传书籍' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '书架设置' }));
    expect(screen.getByRole('menuitem', { name: '亮色模式' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '退出登录' })).not.toBeInTheDocument();
  });
});

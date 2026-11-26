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

    fireEvent.click(screen.getByRole('button', { name: '切换明暗外观' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '书架设置' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '暗色模式' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(2);

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

  it('renders quick-resume pill when online with in-progress book and hides it offline', () => {
    const onResumeBook = vi.fn();
    const onPrefetchResumeBook = vi.fn();
    const resumeBook = { id: 'book-42', title: '人类简史', progress: 38 };

    const { rerender } = render(
      <ShelfHeader
        uploadAccept=".epub,.pdf"
        isOffline={false}
        isUploading={false}
        isDark={false}
        resumeBook={resumeBook}
        onResumeBook={onResumeBook}
        onPrefetchResumeBook={onPrefetchResumeBook}
        onUpload={vi.fn()}
        onToggleTheme={vi.fn()}
        onManageOfflineBooks={vi.fn()}
      />,
    );

    const resumeBtn = screen.getByRole('button', { name: '续读：人类简史（38%）' });
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.pointerEnter(resumeBtn);
    expect(onPrefetchResumeBook).toHaveBeenCalledWith('book-42');

    fireEvent.click(resumeBtn);
    expect(onResumeBook).toHaveBeenCalledWith('book-42');

    rerender(
      <ShelfHeader
        uploadAccept=".epub,.pdf"
        isOffline
        isUploading={false}
        isDark={false}
        resumeBook={resumeBook}
        onResumeBook={onResumeBook}
        onPrefetchResumeBook={onPrefetchResumeBook}
        onUpload={vi.fn()}
        onToggleTheme={vi.fn()}
        onManageOfflineBooks={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /续读/ })).not.toBeInTheDocument();
  });
});

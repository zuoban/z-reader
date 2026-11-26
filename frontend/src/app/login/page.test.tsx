import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';

const mockReplace = vi.fn();
const mockLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      login: mockLogin,
    });
  });

  it('shows inline validation error and focuses password input on empty submit', () => {
    render(<LoginPage />);

    const input = screen.getByLabelText('访问密码');
    fireEvent.click(screen.getByRole('button', { name: '进入书架' }));

    expect(screen.getByRole('alert')).toHaveTextContent('请输入访问密码');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(input);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('disables controls while submitting and clears server error when typing again', async () => {
    let rejectLogin!: (reason?: unknown) => void;
    mockLogin.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectLogin = reject;
        })
    );

    render(<LoginPage />);

    const input = screen.getByLabelText('访问密码');
    fireEvent.change(input, { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '进入书架' }));

    expect(mockLogin).toHaveBeenCalledWith('wrong-pass');
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: '正在进入...' })).toBeDisabled();

    rejectLogin(new Error('密码错误'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('密码错误');
    });
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(input, { target: { value: 'new-pass' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exposes password visibility toggle state and hints when Caps Lock is active', () => {
    render(<LoginPage />);

    const input = screen.getByLabelText('访问密码');
    const toggle = screen.getByRole('button', { name: '显示密码' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('title', '显示密码');

    fireEvent.mouseDown(toggle);
    const hideToggle = screen.getByRole('button', { name: '隐藏密码' });
    expect(hideToggle).toHaveAttribute('aria-pressed', 'true');
    expect(hideToggle).toHaveAttribute('title', '隐藏密码');
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByRole('status')).toHaveTextContent('大写锁定已开启');
    expect(input).toHaveAttribute('aria-describedby', 'caps-lock-hint');

    fireEvent.blur(input);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders login form immediately while auth verification is still loading', () => {
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      login: mockLogin,
    });

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: '解锁书库' })).toBeInTheDocument();
    expect(screen.getByLabelText('访问密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换明暗外观' })).toBeInTheDocument();
  });

  it('shows loading state and redirects to shelf when already authenticated', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      login: mockLogin,
    });

    render(<LoginPage />);

    expect(screen.queryByRole('heading', { name: '解锁书库' })).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/shelf');
  });

  it('switches the interactive editorial library showcase card when clicking another book', () => {
    render(<LoginPage />);

    expect(screen.getByText('西游记 · 第十四回')).toBeInTheDocument();
    expect(screen.getByText('54%')).toBeInTheDocument();

    const shuihuBtn = screen.getByRole('button', { name: /水浒传/ });
    expect(shuihuBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(shuihuBtn);

    expect(shuihuBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('水浒传 · 第十回')).toBeInTheDocument();
    expect(screen.getByText('28%')).toBeInTheDocument();
  });

  it('clears typed password and active validation error on Escape when not composing', () => {
    render(<LoginPage />);

    const input = screen.getByLabelText('访问密码');
    fireEvent.click(screen.getByRole('button', { name: '进入书架' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入访问密码');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'secret-123' } });

    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingEscape, 'isComposing', { value: true });
    fireEvent(input, composingEscape);
    expect(input).toHaveValue('secret-123');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});

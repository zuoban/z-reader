import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';

const mockReplace = vi.fn();
const mockLogin = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

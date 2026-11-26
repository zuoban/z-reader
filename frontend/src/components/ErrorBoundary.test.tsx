import { fireEvent, render, screen } from '@/test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { reportClientError } from '@/lib/error-reporting';

vi.mock('@/lib/error-reporting', () => ({
  reportClientError: vi.fn(),
}));

function ThrowingChild({ checkThrow }: { checkThrow: () => boolean }) {
  if (checkThrow()) {
    throw new Error('boom');
  }
  return <p>正常内容</p>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fallback with shelf escape link and resets when retry succeeds', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    render(
      <ErrorBoundary>
        <ThrowingChild checkThrow={() => shouldThrow} />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('页面出现了问题')).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), 'ErrorBoundary');

    const shelfLink = screen.getByRole('link', { name: '返回书架' });
    expect(shelfLink).toHaveAttribute('href', '/shelf');

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

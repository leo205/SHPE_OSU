// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:4173"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TurnstileWidget from './TurnstileWidget';

let api;
const mount = (onToken = vi.fn()) => {
  render(<TurnstileWidget siteKey="public-fixture-sitekey" action="resume_submit" onToken={onToken} />);
  return onToken;
};
const options = () => api.render.mock.calls.at(-1)[1];

beforeEach(() => {
  api = { render: vi.fn(() => `fixture-${api.render.mock.calls.length}`), remove: vi.fn(), reset: vi.fn() };
  window.turnstile = api;
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
  document.getElementById('cloudflare-turnstile-script')?.remove();
});

describe('Turnstile error recovery', () => {
  it('identifies an unauthorized local hostname and clears its error after a successful retry', async () => {
    const onToken = mount();
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(options().action).toBe('resume_submit');
    act(() => { expect(options()['error-callback']('110200')).toBe(true); });
    expect(screen.getByRole('alert').textContent).toContain('not enabled for this local address');
    expect(screen.getByText('Verification code: 110200')).toBeTruthy();
    expect(screen.queryByText(/Disable content blockers/)).toBeNull();
    expect(onToken).toHaveBeenLastCalledWith('');
    act(() => options().callback('fresh-fixture-token'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onToken).toHaveBeenLastCalledWith('fresh-fixture-token');
  });

  it('reports a configuration problem without blaming the visitor’s extensions', async () => {
    mount();
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    act(() => options()['error-callback']('110100'));
    expect(screen.getByRole('alert').textContent).toContain('site configuration update');
    expect(screen.getByRole('alert').textContent).not.toContain('content blockers');
  });

  it('remounts on retry, clears the token, and ignores callbacks from the removed widget', async () => {
    const onToken = mount();
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const previous = options();
    act(() => previous['error-callback']('200500'));
    expect(screen.getByRole('alert').textContent).toContain('connection or content blockers');
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
    expect(api.remove).toHaveBeenCalledWith('fixture-1');
    expect(onToken).toHaveBeenLastCalledWith('');
    act(() => previous.callback('removed-widget-token'));
    expect(onToken).not.toHaveBeenCalledWith('removed-widget-token');
    act(() => options().callback('current-widget-token'));
    expect(onToken).toHaveBeenLastCalledWith('current-widget-token');
  });

  it('does not expose arbitrary callback payloads as diagnostic codes', async () => {
    mount();
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    act(() => options()['error-callback']('unexpected-private-payload'));
    expect(screen.queryByText(/unexpected-private-payload/)).toBeNull();
    expect(screen.queryByText(/Verification code:/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry verification' })).toBeTruthy();
  });

  it('retries a failed script load instead of keeping a failed script element', async () => {
    delete window.turnstile;
    mount();
    const script = document.getElementById('cloudflare-turnstile-script');
    expect(script).toBeTruthy();
    await act(async () => { fireEvent.error(script); });
    expect(script.isConnected).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Verification could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
    const retried = document.getElementById('cloudflare-turnstile-script');
    expect(retried).toBeTruthy();
    expect(retried).not.toBe(script);
    window.turnstile = api;
    await act(async () => { fireEvent.load(retried); });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

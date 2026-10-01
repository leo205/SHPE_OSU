// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventModal } from './Events';
import { downloadICS } from '../lib/calendar';
import styles from './EventModal.module.css';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../lib/calendar', async (importOriginal) => ({
  ...await importOriginal(), downloadICS: vi.fn(),
}));

const event = {
  title: 'Long study session', category: 'Academic', date: '2026-09-30',
  time: '6:30 PM', endTime: '8:00 PM', location: 'CBEC 120 & 130',
  description: 'Study together. '.repeat(100), photo: '/test-flyer.webp',
};

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.clearAllMocks();
});

describe('event flyer dialog', () => {
  it('keeps the flyer and long details inside the bounded layout with close outside the scroller', () => {
    render(<EventModal event={event} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: event.title });
    const content = dialog.querySelector(`.${styles.content}`);
    expect(content.classList.contains(styles.withFlyer)).toBe(true);
    expect(content.contains(screen.getByAltText(`Flyer for ${event.title}`))).toBe(true);
    expect(content.contains(screen.getByText(event.description.trim()))).toBe(true);
    expect(content.contains(screen.getByRole('button', { name: 'Close event details' }))).toBe(false);
    expect(screen.getByRole('link', { name: /Open Full-Size Flyer/ }).getAttribute('href')).toBe(event.photo);
    fireEvent.click(screen.getByRole('button', { name: /Add to Apple/ }));
    expect(downloadICS).toHaveBeenCalledExactlyOnceWith(event);
    expect(screen.getByRole('link', { name: /Add to Google Calendar/ }).getAttribute('href')).toContain('calendar.google.com');
  });

  it('falls back to scrollable details when the flyer fails', () => {
    render(<EventModal event={event} onClose={vi.fn()} />);
    fireEvent.error(screen.getByAltText(`Flyer for ${event.title}`));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /Open Full-Size Flyer/ })).toBeNull();
    const content = screen.getByRole('dialog').querySelector(`.${styles.content}`);
    expect(content.classList.contains(styles.withFlyer)).toBe(false);
    expect(content.contains(screen.getByRole('button', { name: /Add to Apple/ }))).toBe(true);
  });

  it('uses the same scrolling container for an event without a flyer', () => {
    render(<EventModal event={{ ...event, photo: '' }} onClose={vi.fn()} />);
    const content = screen.getByRole('dialog').querySelector(`.${styles.content}`);
    expect(content.classList.contains(styles.withFlyer)).toBe(false);
    expect(content.contains(screen.getByText(event.description.trim()))).toBe(true);
  });

  it('retains Escape, close-button and backdrop dismissal without closing on content clicks', () => {
    const close = vi.fn();
    render(<EventModal event={event} onClose={close} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close event details' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('presentation'));
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('traps keyboard focus and restores focus and page scrolling when closed', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    document.body.style.overflow = 'auto';
    const view = render(<EventModal event={event} onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close event details' });
    const last = screen.getByRole('button', { name: /Add to Apple/ });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('auto');
    opener.remove();
  });
});

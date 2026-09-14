import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CalendarDay, { CalendarDayEvents } from './CalendarDay';

const events = Array.from({ length: 4 }, (_, index) => ({
  id: `event-${index}`, title: `Meeting ${index + 1}`, category: 'GBM', time: '6:00 PM',
}));

// Inspect the rendered native controls and execute their real selection handlers.
// No Supabase client, DOM package, or production data is involved.
function buttons(element) {
  if (!element || typeof element !== 'object') return [];
  return [
    ...(element.type === 'button' ? [element] : []),
    ...Children.toArray(element.props?.children).flatMap(buttons),
  ];
}

describe('same-day calendar event selection', () => {
  it('opens the event actually clicked instead of always opening the first', () => {
    const select = vi.fn();
    const tree = CalendarDay({ day: 14, dateLabel: 'September 14, 2026', events: events.slice(0, 2), onSelectEvent: select });
    const controls = buttons(tree);
    controls[1].props.onClick();
    expect(select).toHaveBeenCalledExactlyOnceWith(events[1]);
    controls[0].props.onClick();
    expect(select).toHaveBeenLastCalledWith(events[0]);
    expect(tree.props.role).toBeUndefined();
    expect(controls.every((control) => control.props.type === 'button')).toBe(true);
  });

  it('has an actionable overflow control and a choice for every extra event', () => {
    const showAll = vi.fn();
    const select = vi.fn();
    const controls = buttons(CalendarDay({ day: 14, dateLabel: 'September 14, 2026', events, onSelectEvent: select, onShowAll: showAll }));
    expect(controls).toHaveLength(3);
    controls[2].props.onClick();
    expect(showAll).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();

    const close = vi.fn();
    const listControls = buttons(CalendarDayEvents({ dateLabel: 'September 14, 2026', events, onSelectEvent: select, onClose: close }));
    expect(listControls).toHaveLength(5);
    listControls.slice(1).forEach((control, index) => {
      control.props.onClick();
      expect(select).toHaveBeenLastCalledWith(events[index]);
    });
    listControls[0].props.onClick();
    expect(close).toHaveBeenCalledOnce();
  });

  it('preserves an empty non-interactive day and single-event selection', () => {
    expect(buttons(CalendarDay({ day: 14, events: [] }))).toHaveLength(0);
    const select = vi.fn();
    const controls = buttons(CalendarDay({ day: 14, dateLabel: 'September 14, 2026', events: events.slice(0, 1), onSelectEvent: select }));
    expect(controls).toHaveLength(1);
    controls[0].props.onClick();
    expect(select).toHaveBeenCalledExactlyOnceWith(events[0]);
  });

  it('renders native keyboard-accessible buttons with full titles and escaped text', () => {
    const markup = renderToStaticMarkup(<CalendarDay day={14} dateLabel="September 14, 2026" events={[{ ...events[0], title: '<Workshop>' }]} isToday onSelectEvent={() => {}} />);
    expect(markup).toContain('<button type="button"');
    expect(markup).toContain('aria-label="September 14, 2026 — &lt;Workshop&gt;"');
    expect(markup).not.toContain('<Workshop>');
  });
});

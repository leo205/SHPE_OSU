import { categoryColors } from '../data/events';

/** Every visible event has its own native button; the cell is not a button. */
export default function CalendarDay({ day, dateLabel, events, isToday, onSelectEvent, onShowAll }) {
  return (
    <div className={`min-w-0 rounded-lg px-1 py-2 sm:px-2 text-sm relative overflow-hidden bg-surface-container-lowest ${
      events.length ? 'border border-outline-variant/20' : ''
    } ${isToday ? 'ring-2 ring-primary' : ''}`}>
      <span className={`text-xs font-bold ${isToday
        ? 'bg-primary text-on-primary rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
        {day}
      </span>
      <div className="mt-1 space-y-0.5">
        {events.slice(0, 2).map((event) => {
          const colors = categoryColors[event.category] || categoryColors.GBM;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event)}
              aria-label={`${dateLabel} — ${event.title}`}
              title={event.title}
              className={`block w-full text-left text-[9px] md:text-[10px] font-bold px-1 py-0.5 rounded leading-tight truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${colors.bg} ${colors.text}`}
            >
              {event.title}
            </button>
          );
        })}
        {events.length > 2 && (
          <button
            type="button"
            onClick={onShowAll}
            aria-label={`Show all ${events.length} events on ${dateLabel}`}
            className="block w-full rounded text-left text-[9px] leading-tight whitespace-nowrap font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            +{events.length - 2}<span className="hidden sm:inline"> more</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function CalendarDayEvents({ dateLabel, events, onSelectEvent, onClose, panelRef }) {
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`Events on ${dateLabel}`}
      className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 focus:outline-none"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-headline font-bold text-on-surface">Events on {dateLabel}</h3>
        <button type="button" onClick={onClose} aria-label="Close day event list"
          className="rounded px-2 py-1 text-sm font-bold text-primary hover:bg-primary/10">
          Close
        </button>
      </div>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <button type="button" onClick={() => onSelectEvent(event)}
              className="w-full rounded-lg border border-outline-variant/20 p-3 text-left text-sm hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span className="block font-bold text-on-surface">{event.title}</span>
              <span className="text-on-surface-variant">{event.time || 'Time to be announced'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

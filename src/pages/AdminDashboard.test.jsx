import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const view = vi.hoisted(() => ({ tab: 'home', states: {} }));

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal();
  return {
    ...react,
    useState(initial) {
      // Seed only the named dataset-state object, not hook positions or React's
      // internal state. All other hooks and all rendered markup remain real.
      const value = typeof initial === 'function' ? initial() : initial;
      const isDatasetState = value && ['attendance', 'resumes', 'company_access', 'events']
        .every((name) => value[name]?.status === 'loading');
      return react.useState(isDatasetState ? view.states : value);
    },
  };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams({ tab: view.tab }), vi.fn()],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => { throw new Error('SSR must not access a backend'); }),
    rpc: vi.fn(() => { throw new Error('SSR must not access a backend'); }),
    functions: { invoke: vi.fn(() => { throw new Error('SSR must not access a backend'); }) },
  },
}));

import AdminDashboard from './AdminDashboard';
import { supabase } from '../lib/supabase';

function renderTab(tab = 'home') {
  view.tab = tab;
  const markup = renderToStaticMarkup(<AdminDashboard />);
  expect(supabase.from).not.toHaveBeenCalled();
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
  return markup;
}

beforeEach(() => {
  vi.clearAllMocks();
  view.tab = 'home';
  view.states = Object.fromEntries(['attendance', 'resumes', 'company_access', 'events']
    .map((name) => [name, { status: 'ready', error: null }]));
});

describe('admin data availability in rendered UI', () => {
  it('shows attendance failure and retry without reporting zero or exporting an empty dataset', () => {
    view.states.attendance = { status: 'error', error: 'Could not load all attendance records. Please retry.' };
    const markup = renderTab();
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Could not load all attendance records. Please retry.');
    expect(markup).toContain('Retry loading');
    expect(markup).not.toContain('Total Check-ins');
    expect(markup).not.toContain('Export CSV');
    expect(markup).not.toContain('No attendance records found');
    expect(markup).not.toContain('Member Directory');
  });

  it('keeps a successfully loaded tab available when another dataset fails', () => {
    view.states.attendance = { status: 'error', error: 'Could not load all attendance records. Please retry.' };
    const markup = renderTab('events');
    expect(markup).toContain('Add Upcoming Event');
    expect(markup).toContain('Active Events Calendar');
    expect(markup).not.toContain('Could not load all attendance records');
    expect(markup).not.toContain('Retry loading');
  });

  it('describes an events load failure without claiming that its table is missing', () => {
    view.states.events = { status: 'error', error: 'Could not load all calendar events. Please retry.' };
    const markup = renderTab('events');
    expect(markup).toContain('Could not load all calendar events. Please retry.');
    expect(markup).toContain('Retry loading');
    expect(markup).not.toContain('Table Missing');
    expect(markup).not.toContain('CREATE TABLE');
    expect(markup).not.toContain('No events added');
    expect(markup).not.toContain('Add Upcoming Event');
  });

  it('hides resume counts, actions, and the empty-table message when the resume list is unavailable', () => {
    view.states.resumes = { status: 'error', error: 'Could not load all resume submissions. Please retry.' };
    const markup = renderTab('resume');
    expect(markup).toContain('Could not load all resume submissions. Please retry.');
    expect(markup).toContain('Retry loading');
    expect(markup).not.toContain('Approved &amp; Public');
    expect(markup).not.toContain('Pending Verification');
    expect(markup).not.toContain('No resume submissions found');
    expect(markup).not.toContain('Showing');
    expect(markup).not.toContain('View PDF');
  });

  it('keeps website sponsor management available when recruiter-code loading fails', () => {
    view.states.company_access = { status: 'error', error: 'Could not load all historical recruiter codes. Please retry.' };
    const markup = renderTab('companies');
    expect(markup).toContain('Website sponsors');
    expect(markup).toContain('Recruiter access');
    expect(markup).toContain('Add sponsor');
    expect(markup).toContain('Loading website sponsors');
    expect(markup).not.toContain('Could not load all historical recruiter codes. Please retry.');
    expect(markup).not.toContain('No company access codes generated');
  });

  it('preserves the companies URL while naming the four mobile navigation items Sponsors', () => {
    const markup = renderTab('companies');
    expect(markup).not.toContain('>Companies<');
    expect(markup).toContain('>Sponsors<');
    const mobileNav = markup.match(/<nav[^>]*aria-label="[^"]*"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    expect(mobileNav).toBeDefined();
    expect((mobileNav.match(/<button/g) || []).length).toBe(4);
  });

  it('hides the report while the complete attendance history is still loading', () => {
    view.states.attendance = { status: 'loading', error: null };
    const markup = renderTab();
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Loading records');
    expect(markup).not.toContain('Retry loading');
    expect(markup).not.toContain('Total Check-ins');
    expect(markup).not.toContain('Export CSV');
  });

  it('still displays a legitimately empty successful attendance result', () => {
    const markup = renderTab();
    expect(markup).toContain('Total Check-ins');
    expect(markup).toContain('No attendance records found');
    expect(markup).toContain('Export CSV');
    expect(markup).not.toContain('Retry loading');
  });
});

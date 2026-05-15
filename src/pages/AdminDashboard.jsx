import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#BB4D00', '#6B5E45', '#8C4A2F', '#D4956A', '#4A7C59'];

/* ── Stat Card ─────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
        </div>
        <span className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
      </div>
      <span className="font-headline text-4xl font-black text-on-surface">{value}</span>
      {sub && <span className="text-xs text-on-surface-variant">{sub}</span>}
    </div>
  );
}

/* ── Top Members Card ──────────────────────────────────────── */
function TopMembersCard({ members }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm col-span-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl">local_fire_department</span>
        </div>
        <span className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">Most Active Members</span>
      </div>
      <div className="flex flex-col gap-3">
        {members.map((m, i) => (
          <div key={m.dotnum} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`font-headline font-black text-lg w-6 text-center ${
                i === 0 ? 'text-primary' : 'text-on-surface-variant'
              }`}>{i + 1}</span>
              <span className="font-bold text-on-surface text-sm">{m.firstName} {m.lastName}</span>
            </div>
            <span className="text-xs font-bold bg-primary-container text-on-primary-container px-3 py-1 rounded-full">
              {m.count} {m.count === 1 ? 'event' : 'events'}
            </span>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-on-surface-variant text-sm">No data yet.</p>
        )}
      </div>
    </div>
  );
}

/* ── Admin Dashboard ────────────────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEvent, setFilterEvent] = useState('All');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  /* ── Derived analytics ──────────────────────────────────── */
  const totalSubmissions = rows.length;
  const uniqueEvents = [...new Set(rows.map((r) => r.event_name))];
  const firstTimers = rows.filter((r) => r.is_first_meeting).length;
  const uniqueMembers = [...new Set(rows.map((r) => r.last_name_dotnum.toLowerCase()))].length;

  // Most active members tracking (top 3)
  const memberAttendance = {};
  rows.forEach(r => {
    const dotnum = r.last_name_dotnum?.toLowerCase();
    if (!dotnum) return;
    if (!memberAttendance[dotnum]) {
      memberAttendance[dotnum] = { count: 0, firstName: r.first_name, lastName: r.last_name_dotnum, dotnum };
    }
    memberAttendance[dotnum].count++;
  });
  const topMembers = Object.values(memberAttendance)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Event Types heuristic
  const getEventType = (name) => {
    const n = name.toLowerCase();
    if (n.includes('gbm') || n.includes('general')) return 'GBM';
    if (n.includes('workshop') || n.includes('resume') || n.includes('professional')) return 'Workshop';
    if (n.includes('social') || n.includes('party') || n.includes('brunch')) return 'Social';
    if (n.includes('study')) return 'Study Session';
    return 'Other';
  };

  const typeCounts = {};
  rows.forEach(r => {
    const t = getEventType(r.event_name);
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const eventTypeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  // Attendance per event (stacked bar chart for retention/new)
  const perEvent = uniqueEvents.map((ev) => {
    const eventRows = rows.filter((r) => r.event_name === ev);
    const newMembers = eventRows.filter((r) => r.is_first_meeting).length;
    return {
      name: ev.length > 22 ? ev.slice(0, 22) + '…' : ev,
      fullName: ev,
      newMembers,
      returning: eventRows.length - newMembers,
      total: eventRows.length,
    };
  });

  // First-timer vs returning (pie chart)
  const pieData = [
    { name: 'First-timers', value: firstTimers },
    { name: 'Returning', value: totalSubmissions - firstTimers },
  ];

  // Attendance over time (line chart — by date)
  const byDate = {};
  rows.forEach((r) => {
    const d = r.created_at?.slice(0, 10) || 'Unknown';
    byDate[d] = (byDate[d] || 0) + 1;
  });
  const lineData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    }));

  /* ── Filtered table ─────────────────────────────────────── */
  const filteredRows = rows.filter((r) => {
    const matchSearch =
      search === '' ||
      r.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.last_name_dotnum?.toLowerCase().includes(search.toLowerCase()) ||
      r.major?.toLowerCase().includes(search.toLowerCase());
    const matchEvent = filterEvent === 'All' || r.event_name === filterEvent;
    return matchSearch && matchEvent;
  });

  /* ── CSV export ─────────────────────────────────────────── */
  const exportCSV = () => {
    const headers = ['First Name', 'Last Name.##', 'Year', 'Event', 'First Meeting', 'Major', 'Pronouns', 'How Heard', 'Feedback', 'Date'];
    const csvRows = [
      headers.join(','),
      ...filteredRows.map((r) =>
        [
          r.first_name,
          r.last_name_dotnum,
          r.year,
          `"${r.event_name}"`,
          r.is_first_meeting ? 'Yes' : 'No',
          r.major || '',
          r.pronouns || '',
          r.how_heard || '',
          `"${(r.feedback || '').replace(/"/g, "'")}"`,
          r.created_at?.slice(0, 10) || '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shpe-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <a href="/" className="flex items-center gap-3 group">
          <img
            src="/photos/shpeLogo.png"
            alt="SHPE OSU Logo"
            className="h-10 w-auto object-contain group-hover:scale-105 transition-transform"
          />
          <span className="font-headline font-black text-lg text-primary italic tracking-tighter group-hover:opacity-80 transition-opacity">
            Admin
          </span>
        </a>
        <div className="flex items-center gap-4">
          <a
            href="/admin/resumes"
            className="flex items-center gap-2 px-4 py-2 bg-tertiary-container text-on-tertiary-container rounded-full text-sm font-bold hover:brightness-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">description</span>
            Resumes
          </a>
          <button
            onClick={fetchData}
            className="p-2 rounded-full hover:bg-surface-container transition-colors"
            title="Refresh data"
          >
            <span className="material-symbols-outlined text-on-surface-variant">refresh</span>
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined animate-spin text-5xl text-primary">
              progress_activity
            </span>
          </div>
        ) : (
          <>
            {/* ── Stat Cards ─────────────────────────────────── */}
            <section>
              <h2 className="font-headline text-2xl font-bold text-on-surface mb-6">
                Overview
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon="person"
                  label="Members"
                  value={uniqueMembers}
                  sub="Unique people who checked in"
                />
                <StatCard
                  icon="groups"
                  label="Check-ins"
                  value={totalSubmissions}
                  sub="Total including repeat visits"
                />
                <StatCard icon="event" label="Events" value={uniqueEvents.length} />
                <TopMembersCard members={topMembers} />
              </div>
            </section>

            {/* ── Charts ─────────────────────────────────────── */}
            {rows.length > 0 && (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar — per event */}
                <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-headline font-bold text-lg mb-6 text-on-surface">
                    Attendance per Event
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={perEvent} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(val, name, props) => [val, name === 'newMembers' ? 'First-Timers' : 'Returning']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                        contentStyle={{ borderRadius: 12, fontSize: 13 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="returning" stackId="a" fill="#BB4D00" name="Returning" />
                      <Bar dataKey="newMembers" stackId="a" fill="#4A7C59" radius={[6, 6, 0, 0]} name="First-Timers" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie — first vs returning */}
                <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-headline font-bold text-lg mb-6 text-on-surface">
                    Attendance by Event Type
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={eventTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {eventTypeData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Line — over time */}
                {lineData.length > 1 && (
                  <div className="lg:col-span-3 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-headline font-bold text-lg mb-6 text-on-surface">
                      Attendance Over Time (Retention Trend)
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={lineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#BB4D00"
                          strokeWidth={3}
                          dot={{ r: 5, fill: '#BB4D00' }}
                          name="Check-ins"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            )}

            {/* ── Member Table ────────────────────────────────── */}
            <section>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h2 className="font-headline text-2xl font-bold text-on-surface">
                  Attendance Records
                </h2>
                <div className="flex flex-wrap gap-3">
                  {/* Search */}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search by name or major…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-52"
                    />
                  </div>

                  {/* Filter by event */}
                  <select
                    value={filterEvent}
                    onChange={(e) => setFilterEvent(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="All">All Events</option>
                    {uniqueEvents.map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>

                  {/* Export */}
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary-fixed-dim transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">download</span>
                    Export CSV
                  </button>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="text-center py-16 text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl block mb-3 opacity-30">
                    inbox
                  </span>
                  {rows.length === 0
                    ? 'No attendance data yet. Check back after your next event!'
                    : 'No results match your search.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-container-high text-on-surface-variant font-bold uppercase tracking-wider text-xs">
                      <tr>
                        {['Name', 'Dot #', 'Year', 'Event', 'First?', 'Major', 'Date'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {filteredRows.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-surface-container-low transition-colors"
                        >
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            {r.first_name}
                          </td>
                          <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                            {r.last_name_dotnum}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{r.year}</td>
                          <td className="px-4 py-3 text-on-surface-variant max-w-[200px] truncate">
                            {r.event_name}
                          </td>
                          <td className="px-4 py-3">
                            {r.is_first_meeting ? (
                              <span className="px-2 py-1 bg-tertiary-container text-on-tertiary-container rounded-full text-xs font-bold">
                                New ⭐
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-surface-container text-on-surface-variant rounded-full text-xs font-bold">
                                Returning
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-on-surface-variant max-w-[160px] truncate">
                            {r.major || '—'}
                          </td>
                          <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                            {r.created_at?.slice(0, 10) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 bg-surface-container-lowest border-t border-outline-variant/10 text-xs text-on-surface-variant">
                    Showing {filteredRows.length} of {rows.length} records
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

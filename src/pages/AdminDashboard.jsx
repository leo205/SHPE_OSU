import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isOtherMajor, customMajorText } from '../lib/majors';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Home as HomeIcon,
  Users,
  Briefcase,
  Calendar,
  FileText,
  LogOut,
  Plus,
  Search,
  Download,
  Trash2,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Edit2
} from 'lucide-react';

const CHART_COLORS = ['#a33700', '#3b5b92', '#7b5400', '#ff7943', '#feb300'];

// The category donut only ever renders a handful of slices, but majors can
// reach eight, so this palette is longer to keep two adjacent slices from
// landing on the same colour. These are chart hex values, deliberately
// separate from the Tailwind tokens in tailwind.config.js — those are the
// WCAG-verified UI palette and are not touched here.
const MAJOR_COLORS = [
  '#a33700', '#3b5b92', '#7b5400', '#ff7943',
  '#feb300', '#2f6b4f', '#8c3a5a', '#556070',
];

// ── Stat Card Component (Branded) ─────────────────────────────────────
function AnalyticsStatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex-1 min-w-[200px] rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant truncate">
            {label}
          </span>
          <div className="w-8 h-8 bg-surface-container-low rounded-lg flex items-center justify-center">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
        </div>
        <p className="text-3xl font-black font-headline text-on-surface">{value}</p>
      </div>
      {sub && <p className="mt-2 text-xs font-body text-on-surface-variant leading-tight">{sub}</p>}
    </div>
  );
}

// ── Top Members Card Component (Branded) ──────────────────────────────
function TopMembersCard({ members }) {
  return (
    <div className="flex-1 min-w-[280px] rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-surface-container-low rounded-lg flex items-center justify-center">
          <span className="text-sm">🔥</span>
        </div>
        <span className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant">Most Active</span>
      </div>
      <div className="space-y-3 font-body">
        {members.slice(0, 3).map((m, i) => (
          <div key={m.dotnum} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`font-headline font-black text-sm w-5 text-center ${
                i === 0 ? 'text-primary' : 'text-on-surface-variant'
              }`}>{i + 1}</span>
              <span className="font-bold text-on-surface text-sm truncate max-w-[150px]">{m.firstName} {m.lastName}</span>
            </div>
            <span className="text-xs font-bold bg-primary-container/15 text-primary-dim px-2.5 py-0.5 rounded-full shrink-0">
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

// ── Main Page Redesigned with Brand Identity ──────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State: 'home' | 'directory' | 'companies' | 'events' | 'resume'
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('tab') || 'home';
  });

  // Supabase Data States
  const [attendance, setAttendance] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [searchAttendance, setSearchAttendance] = useState('');
  const [filterAttendanceEvent, setFilterAttendanceEvent] = useState('All');
  const [filterFeedbackEvent, setFilterFeedbackEvent] = useState('All');
  const [searchResumes, setSearchResumes] = useState('');
  const [resumeActiveTab, setResumeActiveTab] = useState('approved'); // 'approved' | 'pending'

  // Calendar Event States
  const [dbEvents, setDbEvents] = useState([]);
  const [eventsError, setEventsError] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    endTime: '',
    location: '',
    description: '',
    category: 'GBM',
    featured: false,
    rsvpUrl: '',
    photo: '',
  });

  // Inline Major Editing States
  const [editingId, setEditingId] = useState(null);
  const [editMajorVal, setEditMajorVal] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [attData, resData, codesData, evData] = await Promise.all([
        supabase.from('attendance').select('*').order('created_at', { ascending: false }),
        supabase.from('resumes').select('*').order('uploaded_at', { ascending: false }),
        supabase.from('company_access').select('*').order('created_at', { ascending: false }),
        supabase.from('events').select('*').order('date', { ascending: false })
      ]);
      if (attData.data) setAttendance(attData.data);
      if (resData.data) setResumes(resData.data);
      if (codesData.data) setCodes(codesData.data);
      if (evData.data) {
        setDbEvents(evData.data);
        setEventsError(false);
      } else if (evData.error) {
        console.warn('Events table fetch warning:', evData.error);
        setEventsError(true);
      }
    } catch (err) {
      console.error('[AdminDashboard] Fetch error:', err);
      setEventsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  // ── Attendance Major Editing ──────────────────────────────────────────
  const saveAttendanceMajor = async (id) => {
    setSavingId(id);
    const trimmed = editMajorVal.trim();
    const { error } = await supabase
      .from('attendance')
      .update({ major: trimmed || null })
      .eq('id', id);
    if (!error) {
      setAttendance((prev) =>
        prev.map((r) => (r.id === id ? { ...r, major: trimmed || null } : r))
      );
      setEditingId(null);
    } else {
      console.error('[AdminDashboard] Update error:', error);
      alert(`Could not save that major: ${error.message}`);
    }
    setSavingId(null);
  };

  // ── Resumes Major Editing ─────────────────────────────────────────────
  const saveResumeMajor = async (id) => {
    setSavingId(id);
    const trimmed = editMajorVal.trim();
    const { error } = await supabase
      .from('resumes')
      .update({ major: trimmed || null })
      .eq('id', id);
    if (!error) {
      setResumes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, major: trimmed || null } : r))
      );
      setEditingId(null);
    } else {
      console.error('[AdminDashboard] Resume update error:', error);
      alert(`Could not save that major: ${error.message}`);
    }
    setSavingId(null);
  };

  // ── Resumes Toggle Approval ───────────────────────────────────────────
  const handleToggleResumeApproval = async (id, currentStatus) => {
    const { error } = await supabase.from('resumes').update({ approved: !currentStatus }).eq('id', id);
    if (error) {
      // Silent failure here is dangerous in both directions: an admin thinks
      // they published a resume that stayed hidden, or revoked one still live.
      console.error('[AdminDashboard] Approval toggle failed:', error);
      alert(`Could not ${currentStatus ? 'revoke' : 'approve'} this resume: ${error.message}`);
      return;
    }
    setResumes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, approved: !currentStatus } : r))
    );
  };

  // ── Resumes Delete ────────────────────────────────────────────────────
  const handleDeleteResume = async (id, path) => {
    if (!window.confirm('Delete this resume? This cannot be undone.')) return;

    // Delete the row first: an orphaned storage blob is harmless, but a row
    // pointing at a deleted file shows recruiters a resume that 404s.
    const { error: dbError } = await supabase.from('resumes').delete().eq('id', id);
    if (dbError) {
      console.error('[AdminDashboard] Resume delete failed:', dbError);
      alert(`Could not delete this resume: ${dbError.message}`);
      return;
    }

    const { error: storageError } = await supabase.storage.from('resumes').remove([path]);
    if (storageError) {
      console.warn('[AdminDashboard] Orphaned resume file left in storage:', path, storageError);
    }

    setResumes((prev) => prev.filter((r) => r.id !== id));
  };

  const handleViewResume = async (path) => {
    // Opened synchronously so the click's user-gesture context survives the
    // await — otherwise popup blockers swallow the new tab. See CompanyDashboard.
    // NOTE: no 'noopener' here. Per spec, window.open() returns NULL when
    // noopener is passed — the whole point is to sever the handle. That made
    // `tab` null, so the code fell through to the popup-blocked fallback and
    // navigated the CURRENT tab to the PDF, while the blank tab it had just
    // opened sat there empty. Opener is severed below instead, which keeps the
    // handle and still prevents reverse tabnabbing.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const { data, error } = await supabase.storage.from('resumes').createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      console.error('[AdminDashboard] Signed URL error:', error);
      tab?.close();
      alert('Could not open this resume. The file may have been removed.');
      return;
    }

    if (tab) tab.location = data.signedUrl;
    else window.location.assign(data.signedUrl);
  };

  // ── Recruiter Access Codes ────────────────────────────────────────────
  // Code generation was removed with the move to Supabase Auth logins. It is
  // not commented out on purpose: leaving a working "Generate Code" button in
  // the admin UI meant an E-Board member could still hand a recruiter a
  // credential that nothing accepts, and only find out days later when the
  // recruiter could not sign in. Revoking old codes is still useful, so
  // handleDeleteCode stays.

  const handleDeleteCode = async (id) => {
    if (!window.confirm('Revoke access code?')) return;
    const { error } = await supabase.from('company_access').delete().eq('id', id);
    if (error) {
      console.error('[AdminDashboard] Code revoke failed:', error);
      alert(`Could not revoke that code: ${error.message}`);
      return;
    }
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  // ── Calendar Events Management ─────────────────────────────────────────
  const handleAddEvent = async (e) => {
    e.preventDefault();
    setAddingEvent(true);

    let photoUrl = eventForm.photo.trim() || null;

    // Check if an image is selected for upload
    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('events')
        .upload(filePath, imageFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Failed to upload event image. Please verify that the "events" storage bucket exists in Supabase and is set to public.');
        setAddingEvent(false);
        return;
      }

      // Get Public URL
      const { data } = supabase.storage
        .from('events')
        .getPublicUrl(filePath);

      photoUrl = data.publicUrl;
    }

    const { error, data } = await supabase.from('events').insert([
      {
        title: eventForm.title.trim(),
        date: eventForm.date,
        time: eventForm.time,
        end_time: eventForm.endTime || null,
        location: eventForm.location.trim(),
        description: eventForm.description.trim(),
        category: eventForm.category,
        featured: eventForm.featured,
        rsvp_url: eventForm.rsvpUrl.trim() || null,
        photo: photoUrl,
      }
    ]).select();

    if (!error) {
      setEventForm({
        title: '',
        date: '',
        time: '',
        endTime: '',
        location: '',
        description: '',
        category: 'GBM',
        featured: false,
        rsvpUrl: '',
        photo: '',
      });
      setImageFile(null);
      
      // Clear file input DOM element
      const fileInput = document.getElementById('event-image-input');
      if (fileInput) fileInput.value = '';

      if (data) {
        setDbEvents(prev => [data[0], ...prev]);
      } else {
        const evData = await supabase.from('events').select('*').order('date', { ascending: false });
        if (evData.data) setDbEvents(evData.data);
      }
    } else {
      console.error('Error adding calendar event:', error);
      alert('Failed to add event. Please make sure the events table is created in Supabase.');
    }
    setAddingEvent(false);
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Delete this calendar event? This cannot be undone.')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) {
      setDbEvents(prev => prev.filter(ev => ev.id !== id));
    } else {
      console.error('Error deleting calendar event:', error);
      alert(`Could not delete that event: ${error.message}`);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Image size must be under 500 KB. Please compress the image first.");
      e.target.value = '';
      setImageFile(null);
      return;
    }
    setImageFile(file);
  };

  // ── Derived Analytics ────────────────────────────────────────────────
  const totalSubmissions = attendance.length;
  const uniqueEvents = [...new Set(attendance.map((r) => r.event_name))];
  const uniqueMembers = [...new Set(attendance.map((r) => r.last_name_dotnum.toLowerCase()))].length;

  // "Most Active" is labelled in events, so count DISTINCT events rather than
  // raw rows — otherwise a duplicate check-in at one GBM inflates the ranking.
  // (totalSubmissions above is deliberately still raw rows: it reports check-ins.)
  const memberAttendance = {};
  attendance.forEach(r => {
    const dotnum = r.last_name_dotnum?.toLowerCase();
    if (!dotnum) return;
    if (!memberAttendance[dotnum]) {
      memberAttendance[dotnum] = { events: new Set(), firstName: r.first_name, lastName: r.last_name_dotnum, dotnum };
    }
    memberAttendance[dotnum].events.add((r.event_name ?? '').trim().toLowerCase());
  });
  const topMembers = Object.values(memberAttendance)
    .map(({ events, ...rest }) => ({ ...rest, count: events.size }))
    .sort((a, b) => b.count - a.count || a.firstName.localeCompare(b.firstName));

  const getEventType = (name) => {
    const n = name.toLowerCase();
    if (n.includes('gbm') || n.includes('general')) return 'GBM';
    if (n.includes('workshop') || n.includes('resume') || n.includes('professional')) return 'Workshop';
    if (n.includes('social') || n.includes('party') || n.includes('brunch')) return 'Social';
    if (n.includes('study')) return 'Study Session';
    return 'Other';
  };

  const typeCounts = {};
  attendance.forEach(r => {
    const t = getEventType(r.event_name);
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const eventTypeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  const perEvent = uniqueEvents.map((ev) => {
    const eventRows = attendance.filter((r) => r.event_name === ev);
    const newMembers = eventRows.filter((r) => r.is_first_meeting).length;
    return {
      name: ev.length > 15 ? ev.slice(0, 15) + '…' : ev,
      fullName: ev,
      newMembers,
      returning: eventRows.length - newMembers,
      total: eventRows.length,
    };
  });

  const byDate = {};
  attendance.forEach((r) => {
    const d = r.created_at?.slice(0, 10) || 'Unknown';
    byDate[d] = (byDate[d] || 0) + 1;
  });
  const lineData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    }));

  const showTrend = lineData.length > 1;

  // ── Majors breakdown ──────────────────────────────────────────────────
  // Counted per PERSON, not per check-in. Someone who comes to three events
  // would otherwise be counted three times, tilting the chart toward whoever
  // shows up most rather than showing what the chapter actually studies.
  // Keyed on dot number — the same identity "Most Active" uses.
  const majorByMember = {};
  attendance.forEach((r) => {
    const dotnum = r.last_name_dotnum?.toLowerCase();
    if (!dotnum) return;
    if (!(dotnum in majorByMember)) majorByMember[dotnum] = null;
    // Keep the FIRST non-null major seen for a person. Returning members are
    // never asked for one, so most of their rows carry null — a plain
    // last-write-wins would erase a major they gave at an earlier meeting.
    if (r.major && !majorByMember[dotnum]) majorByMember[dotnum] = r.major;
  });

  const MAJOR_SLICES = 6;
  const majorCounts = {};
  let membersWithoutMajor = 0;
  Object.values(majorByMember).forEach((stored) => {
    if (!stored) {
      membersWithoutMajor += 1;
      return;
    }
    // "Other – Data Analytics" is stored flattened by lib/majors. Show what
    // the student actually typed rather than collapsing every custom entry
    // into one meaningless "Other" wedge.
    const label = isOtherMajor(stored) ? (customMajorText(stored).trim() || 'Other') : stored;
    majorCounts[label] = (majorCounts[label] || 0) + 1;
  });
  const membersWithMajor = Object.keys(majorByMember).length - membersWithoutMajor;

  const sortedMajors = Object.entries(majorCounts)
    .sort(([aName, aVal], [bName, bVal]) => bVal - aVal || aName.localeCompare(bName));

  // Long names are truncated for the legend only; the tooltip carries the
  // full one, so "Food, Agricultural, & Bi…" is still identifiable.
  const majorData = sortedMajors.slice(0, MAJOR_SLICES).map(([name, value]) => ({
    name: name.length > 24 ? `${name.slice(0, 23)}…` : name,
    fullName: name,
    value,
  }));
  const tailCount = sortedMajors.slice(MAJOR_SLICES).reduce((sum, [, v]) => sum + v, 0);
  if (tailCount > 0) {
    const remaining = sortedMajors.length - MAJOR_SLICES;
    majorData.push({
      name: `Other (${remaining} more)`,
      fullName: `${remaining} more major${remaining === 1 ? '' : 's'}`,
      value: tailCount,
    });
  }

  // Feedback students wrote at check-in. Until now this was collected, stored,
  // and only ever surfaced as a column in the CSV export — while the check-in
  // form told students "we read every response!". Nobody could, without
  // exporting a spreadsheet and scrolling sideways.
  const feedbackEntries = attendance
    .filter((r) => r.feedback && r.feedback.trim())
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  // Only events that actually HAVE feedback, so the filter can never offer an
  // option that returns nothing. Counts ride along because "which meeting did
  // people have something to say about" is worth seeing on its own.
  const feedbackEventMeta = {};
  feedbackEntries.forEach((r) => {
    const ev = r.event_name ?? 'Unknown';
    if (!feedbackEventMeta[ev]) feedbackEventMeta[ev] = { count: 0, latest: '' };
    feedbackEventMeta[ev].count += 1;
    const at = r.created_at ?? '';
    if (at > feedbackEventMeta[ev].latest) feedbackEventMeta[ev].latest = at;
  });

  // Newest event first, ordered by its most recent check-in. Sorting on the
  // event NAME would be wrong: labels are "M/D - title", so "10/3" sorts
  // before "8/27" as text and October would file under August.
  const feedbackEvents = Object.entries(feedbackEventMeta)
    .sort(([, a], [, b]) => b.latest.localeCompare(a.latest));

  const visibleFeedback =
    filterFeedbackEvent === 'All'
      ? feedbackEntries
      : feedbackEntries.filter((r) => (r.event_name ?? 'Unknown') === filterFeedbackEvent);

  const sanitizeCSVCell = (value) => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportCSV = () => {
    const headers = ['First Name', 'Last Name.##', 'Year', 'Event', 'First Meeting', 'Major', 'Pronouns', 'How Heard', 'Feedback', 'Date'];
    const csvRows = [
      headers.join(','),
      ...filteredAttendance.map((r) =>
        [
          sanitizeCSVCell(r.first_name),
          sanitizeCSVCell(r.last_name_dotnum),
          sanitizeCSVCell(r.year),
          sanitizeCSVCell(r.event_name),
          r.is_first_meeting ? 'Yes' : 'No',
          sanitizeCSVCell(r.major),
          sanitizeCSVCell(r.pronouns),
          sanitizeCSVCell(r.how_heard),
          sanitizeCSVCell(r.feedback),
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

  // ── Filtered Attendance ─────────────────────────────────────────────
  const filteredAttendance = attendance.filter((r) => {
    const matchSearch =
      searchAttendance === '' ||
      r.first_name?.toLowerCase().includes(searchAttendance.toLowerCase()) ||
      r.last_name_dotnum?.toLowerCase().includes(searchAttendance.toLowerCase()) ||
      r.major?.toLowerCase().includes(searchAttendance.toLowerCase());
    const matchEvent = filterAttendanceEvent === 'All' || r.event_name === filterAttendanceEvent;
    return matchSearch && matchEvent;
  });

  // ── Filtered Resumes ────────────────────────────────────────────────
  const pendingResumes = resumes.filter(r => !r.approved);
  const approvedResumes = resumes.filter(r => r.approved);

  const filteredResumes = (resumeActiveTab === 'pending' ? pendingResumes : approvedResumes).filter((r) => {
    const q = searchResumes.toLowerCase().trim();
    if (!q) return true;
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.major?.toLowerCase().includes(q) ||
      r.graduation_year?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface font-body">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant animate-pulse">
          <img src="/photos/shpeLogo.png" alt="SHPE Logo" className="h-14 w-auto object-contain mb-2 animate-bounce" />
          <p className="font-bold text-sm">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-surface font-body text-on-surface overflow-hidden">
      
      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="flex h-full w-64 shrink-0 flex-col justify-between border-r border-outline-variant/20 bg-surface-container-low px-4 py-6">
        <div>
          <div className="mb-8 flex items-center px-2">
            <img
              src="/photos/shpeLogo.png"
              alt="SHPE Logo"
              className="h-12 w-auto object-contain"
            />
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { id: 'home', label: 'Home', icon: HomeIcon },
              { id: 'companies', label: 'Companies', icon: Briefcase },
              { id: 'events', label: 'Events', icon: Calendar },
              { id: 'resume', label: 'Resume', icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setActiveTab(id); setEditingId(null); }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-headline transition ${
                  activeTab === id
                    ? "bg-primary font-bold text-on-primary shadow-md"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={activeTab === id ? 2.2 : 1.8} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 font-headline">
          <a
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium transition"
          >
            <ExternalLink className="h-5 w-5 text-primary" strokeWidth={1.8} />
            Go to Website
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-error hover:bg-error/10 font-bold transition"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
            Log Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-10 py-8">
        
        {/* ── TAB 1: HOME (ANALYTICS & CHARTS) ────────────────────────── */}
        {activeTab === 'home' && (
          <div className="space-y-8 max-w-6xl">
            <div>
              <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">Dashboard</h1>
              <p className="text-sm text-on-surface-variant mt-1">Real-time attendance insights and statistics.</p>
            </div>

            {/* Stats Cards Row */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <AnalyticsStatCard
                icon={Users}
                label="Members"
                value={uniqueMembers}
                sub="Unique people checked in"
              />
              <AnalyticsStatCard
                icon={ShieldCheck}
                label="Total Check-ins"
                value={totalSubmissions}
                sub="Total event registrations"
              />
              <AnalyticsStatCard
                icon={Calendar}
                label="Total Events"
                value={uniqueEvents.length}
                sub="Tracked events this year"
              />
              <TopMembersCard members={topMembers} />
            </div>

            {/* Charts Section */}
            {attendance.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Stacked Attendance per Event */}
                <div className="lg:col-span-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
                  <h3 className="font-bold font-headline text-base mb-6 text-on-surface">
                    Attendance per Event
                  </h3>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={perEvent} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e1dc" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5e5b57' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#5e5b57' }} />
                      <Tooltip
                        formatter={(val, name) => [val, name === 'newMembers' ? 'First-Timers' : 'Returning']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                        contentStyle={{ borderRadius: 12, fontSize: 13, border: '1px solid #e2dcd6', background: '#fbf5f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="returning" stackId="a" fill="#a33700" name="Returning" />
                      <Bar dataKey="newMembers" stackId="a" fill="#feb300" radius={[4, 4, 0, 0]} name="First-Timers" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Event Type breakdown donut */}
                <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
                  <h3 className="font-bold font-headline text-base mb-6 text-on-surface">
                    Events by Category
                  </h3>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={eventTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {eventTypeData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13, border: '1px solid #e2dcd6', background: '#fbf5f0' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Trend + majors, side by side at half width each.
                    The trend card used to span the full dashboard width, which
                    gave a two-point line the visual weight of a chart of record.
                    Halving it makes room for the majors breakdown, which is the
                    question the E-Board actually asks of this data. */}
                <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {showTrend && (
                    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
                      <h3 className="font-bold font-headline text-base mb-6 text-on-surface">
                        Attendance History Trend
                      </h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={lineData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e7e1dc" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5e5b57' }} />
                          <YAxis tick={{ fontSize: 12, fill: '#5e5b57' }} />
                          <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13, border: '1px solid #e2dcd6', background: '#fbf5f0' }} />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#a33700"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#a33700' }}
                            name="Check-ins"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Majors breakdown. Spans the full row when there is no
                      trend yet (a single event), so it is never a half-empty row. */}
                  <div
                    className={`rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm ${
                      showTrend ? '' : 'lg:col-span-2'
                    }`}
                  >
                    <h3 className="font-bold font-headline text-base text-on-surface">
                      Majors
                    </h3>
                    <p className="text-xs text-on-surface-variant mb-4">
                      {membersWithMajor > 0
                        ? `${membersWithMajor} of ${uniqueMembers} members — each counted once, not per check-in.`
                        : 'Collected from first-time attendees at check-in.'}
                    </p>

                    {majorData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={210}>
                          <PieChart>
                            <Pie
                              data={majorData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={72}
                              dataKey="value"
                              paddingAngle={3}
                            >
                              {majorData.map((_, i) => (
                                <Cell key={i} fill={MAJOR_COLORS[i % MAJOR_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(val, name, entry) => [
                                `${val} member${val === 1 ? '' : 's'}`,
                                entry?.payload?.fullName ?? name,
                              ]}
                              contentStyle={{ borderRadius: 12, fontSize: 13, border: '1px solid #e2dcd6', background: '#fbf5f0' }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        {membersWithoutMajor > 0 && (
                          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                            {membersWithoutMajor} member{membersWithoutMajor === 1 ? '' : 's'} not shown — no major on
                            record. Returning members are not asked for one at check-in; you can
                            fill these in from the Attendance tab.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex h-[210px] items-center justify-center text-center text-sm text-on-surface-variant">
                        No majors recorded yet.
                      </div>
                    )}
                  </div>
                </div>
                {/* Events Summary Table */}
                <div className="lg:col-span-3 space-y-4 pt-4 border-t border-outline-variant/10">
                  <div>
                    <h3 className="font-bold font-headline text-base text-on-surface">Events Analytics</h3>
                    <p className="text-xs text-on-surface-variant">Overview of check-in volume and member retention across events.</p>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-surface-container-high border-b border-outline-variant/20 text-on-surface-variant font-bold uppercase tracking-wider text-xs font-headline">
                          <th className="px-6 py-4">Event Name</th>
                          <th className="px-6 py-4">Category</th>
                          <th className="px-6 py-4 text-center">First-Timers</th>
                          <th className="px-6 py-4 text-center">Returning</th>
                          <th className="px-6 py-4 text-center">Total Check-Ins</th>
                          <th className="px-6 py-4 text-right">New Member Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 font-body">
                        {perEvent.map((ev, i) => {
                          const ratio = ev.total > 0 ? (ev.newMembers / ev.total) * 100 : 0;
                          return (
                            <tr
                              key={ev.fullName}
                              className={`transition hover:bg-surface-container-low ${
                                i % 2 === 1 ? "bg-surface-container-low/20" : "bg-surface-container-lowest"
                              }`}
                            >
                              <td className="px-6 py-4 font-bold text-on-surface">{ev.fullName}</td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                                  {getEventType(ev.fullName)}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-on-surface-variant font-bold">{ev.newMembers}</td>
                              <td className="px-6 py-4 text-center text-on-surface-variant">{ev.returning}</td>
                              <td className="px-6 py-4 text-center font-bold text-primary">{ev.total}</td>
                              <td className="px-6 py-4 text-right font-bold text-on-surface">
                                {ratio.toFixed(0)}%
                              </td>
                            </tr>
                          );
                        })}
                        {perEvent.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                              No events have check-in data yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Member Feedback ─────────────────────────────────────── */}
            <div className="space-y-4 pt-8 border-t border-outline-variant/20 max-w-6xl">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black font-headline text-on-surface">Member Feedback</h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Everything students wrote in the &ldquo;Any feedback or suggestions?&rdquo; box at check-in, newest first.
                  </p>
                </div>

                {feedbackEntries.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">
                      Showing {visibleFeedback.length} of {feedbackEntries.length}
                    </span>
                    <select
                      value={filterFeedbackEvent}
                      onChange={(e) => setFilterFeedbackEvent(e.target.value)}
                      aria-label="Filter feedback by event"
                      className="px-4 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm"
                    >
                      <option value="All">All Events ({feedbackEntries.length})</option>
                      {feedbackEvents.map(([ev, meta]) => (
                        <option key={ev} value={ev}>
                          {ev} ({meta.count})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {feedbackEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant/30 bg-surface-container-lowest px-6 py-10 text-center text-sm text-on-surface-variant">
                  No feedback yet. It appears here as soon as someone leaves a comment when they check in.
                </div>
              ) : visibleFeedback.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant/30 bg-surface-container-lowest px-6 py-10 text-center text-sm text-on-surface-variant">
                  No feedback from that event yet.
                </div>
              ) : (
                /* Capped height with its own scrollbar. One busy GBM produced
                   enough comments to push the Member Directory far below the
                   fold, so this section grew without bound as attendance did —
                   the same reason the attendance table is capped at 600px. */
                <div className="max-h-[520px] overflow-y-auto rounded-lg border border-outline-variant/20 bg-surface-container p-3 space-y-3">
                  {visibleFeedback.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm"
                    >
                      <p className="text-on-surface font-body leading-relaxed whitespace-pre-wrap">
                        {r.feedback}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                        <span className="font-bold text-on-surface">{r.first_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{r.event_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {r.created_at
                            ? new Date(r.created_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : '—'}
                        </span>
                        {r.is_first_meeting && (
                          <span className="rounded-md bg-tertiary-container/20 px-2 py-0.5 font-bold text-tertiary">
                            First Time
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Member Directory Section on Home Page */}
            <div className="space-y-6 pt-8 border-t border-outline-variant/20 max-w-6xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black font-headline text-on-surface">Member Directory</h1>
                  <p className="text-sm text-on-surface-variant mt-1">Review, search, and update check-in data.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant h-4 w-4" />
                    <input
                      type="search"
                      placeholder="Search name or major..."
                      value={searchAttendance}
                      onChange={(e) => setSearchAttendance(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-56 shadow-sm"
                    />
                  </div>

                  {/* Event Select filter */}
                  <select
                    value={filterAttendanceEvent}
                    onChange={(e) => setFilterAttendanceEvent(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm"
                  >
                    <option value="All">All Events</option>
                    {uniqueEvents.map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>

                  {/* CSV Export */}
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-fixed-dim transition shadow-sm font-headline"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
                <div className="overflow-x-auto max-h-[600px] rounded-t-lg">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-surface-container-high border-b border-outline-variant/20 text-on-surface-variant font-bold uppercase tracking-wider text-xs font-headline">
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Dot Number</th>
                        <th className="px-6 py-4">Year</th>
                        <th className="px-6 py-4">Event</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Major</th>
                        <th className="px-6 py-4">Check-in Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-body">
                      {filteredAttendance.map((r, i) => (
                        <tr
                          key={r.id}
                          className={`transition hover:bg-surface-container-low ${
                            i % 2 === 1 ? "bg-surface-container-low/20" : "bg-surface-container-lowest"
                          }`}
                        >
                          <td className="px-6 py-4 font-bold text-on-surface">{r.first_name}</td>
                          <td className="px-6 py-4 text-on-surface-variant font-mono text-xs">{r.last_name_dotnum}</td>
                          <td className="px-6 py-4 text-on-surface">{r.year}</td>
                          <td className="px-6 py-4 text-on-surface-variant max-w-[200px] truncate">{r.event_name}</td>
                          <td className="px-6 py-4">
                            {r.is_first_meeting ? (
                              <span className="inline-flex items-center rounded-md bg-tertiary-container/20 px-2 py-0.5 text-xs font-bold text-tertiary">
                                First Time ⭐
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                                Returning
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-on-surface">
                            {editingId === r.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  maxLength={150}
                                  value={editMajorVal}
                                  onChange={(e) => setEditMajorVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveAttendanceMajor(r.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="px-2 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-44"
                                />
                                <button
                                  onClick={() => saveAttendanceMajor(r.id)}
                                  disabled={savingId === r.id}
                                  className="p-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition disabled:opacity-50"
                                >
                                  {savingId === r.id ? (
                                    <span className="material-symbols-outlined animate-spin text-xs">progress_activity</span>
                                  ) : (
                                    <Check className="h-4 w-4" strokeWidth={2.5} />
                                  )}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="truncate max-w-[200px] inline-block">{r.major || '—'}</span>
                                <button
                                  onClick={() => { setEditingId(r.id); setEditMajorVal(r.major || ''); }}
                                  className="p-1 text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Edit major"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-on-surface-variant text-xs">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric'
                            }) : '—'}
                          </td>
                        </tr>
                      ))}
                      {filteredAttendance.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant">
                            No attendance records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="bg-surface-container-high border-t border-outline-variant/20 px-6 py-3 text-xs font-bold text-on-surface-variant font-headline">
                  Showing {filteredAttendance.length} of {attendance.length} records
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: COMPANIES (ACCESS CODES) ────────────────────────── */}
        {activeTab === 'companies' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h1 className="text-3xl font-black font-headline text-on-surface">Recruiter Codes</h1>
              <p className="text-sm text-on-surface-variant mt-1">Sponsors sign in with a real account. The codes below are historical and grant nothing — delete them once every sponsor has a login.</p>
            </div>

            {/* Sponsor onboarding — access codes are gone */}
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6 shadow-sm">
              <h3 className="font-bold font-headline text-on-surface mb-2">Give a sponsor access</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                Access codes are no longer used — they were readable by anyone, so they
                protected nothing. Sponsors now sign in with a real account.
              </p>
              <ol className="text-sm text-on-surface-variant list-decimal ml-5 space-y-1.5">
                <li>Supabase Dashboard → <strong>Authentication → Users → Add user</strong></li>
                <li>Enter the recruiter&apos;s work email and generate a password. Turn <strong>Auto-confirm</strong> ON.</li>
                <li>Grant them the sponsor role by running, in the SQL Editor:
                  <pre className="mt-1.5 p-2.5 bg-surface-container rounded-md font-mono text-[11px] overflow-x-auto select-all">{`UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"sponsor"}'::jsonb
WHERE email = 'recruiter@company.com';`}</pre>
                </li>
                <li>Send them the email and password. They sign in at <strong>/company</strong>.</li>
              </ol>
              <p className="text-xs text-on-surface-variant mt-4 opacity-80">
                To revoke access, delete the user in Supabase. An account with no role
                reaches nothing, so a half-finished setup is safe.
              </p>
            </div>

            {/* Historical codes — these no longer grant access to anything. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body">
              {codes.map(c => (
                <div key={c.id} className="p-5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest flex justify-between items-center shadow-sm hover:border-outline-variant transition-all">
                  <div>
                    <h4 className="font-bold text-on-surface">{c.company_name}</h4>
                    <p className="font-mono text-lg font-semibold tracking-wider text-primary mt-1">{c.access_code}</p>
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      Created: {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteCode(c.id)}
                    className="p-2.5 rounded-lg bg-error/10 hover:bg-error/20 text-error transition"
                    title="Revoke access code"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </div>
              ))}
              {codes.length === 0 && (
                <div className="col-span-2 text-center py-12 text-on-surface-variant bg-surface-container-lowest border border-dashed border-outline-variant/20 rounded-lg">
                  No company access codes generated yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: EVENTS ──────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <div className="space-y-6 max-w-5xl">
            <div>
              <h1 className="text-3xl font-black font-headline text-on-surface">Calendar Events</h1>
              <p className="text-sm text-on-surface-variant mt-1">Manage events displayed on the public website calendar.</p>
            </div>

            {/* SQL Table Check Warning */}
            {eventsError && (
              <div className="p-6 bg-error/10 border border-error/20 text-on-surface rounded-xl space-y-4 font-body max-w-4xl shadow-sm">
                <div className="flex items-center gap-2.5 text-error">
                  <span className="material-symbols-outlined font-black">warning</span>
                  <h3 className="font-bold font-headline">Events Database Table Missing</h3>
                </div>
                <p className="text-sm">
                  The <code className="bg-surface-container px-1.5 py-0.5 rounded font-mono font-bold text-xs">events</code> table is not found in your Supabase database. To enable this dynamic calendar feature, copy and run the following SQL command in your <strong>Supabase Dashboard → SQL Editor</strong>:
                </p>
                <pre className="p-4 bg-surface-container-lowest text-xs rounded-lg font-mono overflow-x-auto text-on-surface border border-outline-variant/30 select-all leading-relaxed">
{`CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  title text NOT NULL,
  date text NOT NULL,
  time text NOT NULL,
  end_time text,
  location text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  featured boolean DEFAULT false NOT NULL,
  rsvp_url text DEFAULT '',
  photo text DEFAULT ''
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read events" ON events FOR SELECT USING (true);
CREATE POLICY "Allow admin full access events" ON events FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
                </pre>
              </div>
            )}

            {/* Event Form Card */}
            {!eventsError && (
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-6 shadow-sm max-w-4xl">
                <h3 className="font-bold font-headline text-on-surface mb-4">Add Upcoming Event</h3>
                <form onSubmit={handleAddEvent} className="space-y-4 font-body text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label htmlFor="ev-title" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Event Title</label>
                      <input
                        id="ev-title"
                        type="text"
                        required
                        value={eventForm.title}
                        onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g. GBM #5 — End of Semester Celebration"
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="ev-category" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Category</label>
                      <select
                        id="ev-category"
                        value={eventForm.category}
                        onChange={e => setEventForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="GBM">GBM</option>
                        <option value="Social">Social</option>
                        <option value="Professional">Professional</option>
                        <option value="Academic">Academic</option>
                        <option value="Outreach">Outreach</option>
                        <option value="Fundraiser">Fundraiser</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="ev-date" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Date</label>
                      <input
                        id="ev-date"
                        type="date"
                        required
                        value={eventForm.date}
                        onChange={e => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="ev-time" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Start Time</label>
                      <input
                        id="ev-time"
                        type="text"
                        required
                        value={eventForm.time}
                        onChange={e => setEventForm(prev => ({ ...prev, time: e.target.value }))}
                        placeholder="e.g. 6:00 PM"
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="ev-end-time" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">End Time (Optional)</label>
                      <input
                        id="ev-end-time"
                        type="text"
                        value={eventForm.endTime}
                        onChange={e => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                        placeholder="e.g. 8:00 PM"
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ev-location" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Location</label>
                      <input
                        id="ev-location"
                        type="text"
                        required
                        value={eventForm.location}
                        onChange={e => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="e.g. Caldwell Lab 120"
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="ev-rsvp" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">RSVP Form URL (Optional)</label>
                      <input
                        id="ev-rsvp"
                        type="url"
                        value={eventForm.rsvpUrl}
                        onChange={e => setEventForm(prev => ({ ...prev, rsvpUrl: e.target.value }))}
                        placeholder="e.g. https://forms.gle/..."
                        className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-2">
                      <label htmlFor="event-image-input" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Event Image (Max 500 KB)</label>
                      <input
                        type="file"
                        id="event-image-input"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border border-outline-variant/30 rounded-lg px-2 py-1.5 bg-surface-container-lowest"
                      />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        id="featured"
                        checked={eventForm.featured}
                        onChange={e => setEventForm(prev => ({ ...prev, featured: e.target.checked }))}
                        className="w-4 h-4 text-primary bg-surface-container border-outline-variant/30 rounded focus:ring-primary/50"
                      />
                      <label htmlFor="featured" className="text-xs font-bold text-on-surface-variant uppercase cursor-pointer select-none">
                        Featured Event
                      </label>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ev-description" className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">Event Description</label>
                    <textarea
                      id="ev-description"
                      required
                      rows={3}
                      value={eventForm.description}
                      onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add brief details about the event. This will be shown on the public calendar."
                      className="w-full px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={addingEvent}
                    className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-primary-fixed-dim transition shadow-sm flex items-center gap-2 font-headline disabled:opacity-50"
                  >
                    {addingEvent ? (
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Calendar Event
                  </button>
                </form>
              </div>
            )}

            {/* List of active calendar events */}
            {!eventsError && (
              <div className="space-y-4">
                <h3 className="font-bold font-headline text-base text-on-surface">Active Events Calendar</h3>
                <div className="overflow-x-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-sm max-w-4xl">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-surface-container-high border-b border-outline-variant/20 text-on-surface-variant font-bold uppercase tracking-wider text-xs font-headline">
                        <th className="px-6 py-4">Title</th>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Time</th>
                        <th className="px-6 py-4">Location</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-body">
                      {dbEvents.map((ev, i) => (
                        <tr
                          key={ev.id}
                          className={`transition hover:bg-surface-container-low ${
                            i % 2 === 1 ? "bg-surface-container-low/20" : "bg-surface-container-lowest"
                          }`}
                        >
                          <td className="px-6 py-4 font-bold text-on-surface">{ev.title}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                              {ev.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-on-surface">{ev.date}</td>
                          <td className="px-6 py-4 text-on-surface-variant">{ev.time}{ev.end_time ? ` - ${ev.end_time}` : ''}</td>
                          <td className="px-6 py-4 text-on-surface-variant">{ev.location}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteEvent(ev.id)}
                              className="p-2 rounded-lg bg-error/10 hover:bg-error/20 text-error transition"
                              title="Delete event"
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dbEvents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                            No events added to database yet. Using local static events backup.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 5: RESUME (SUBMISSIONS VERIFICATION) ────────────────── */}
        {activeTab === 'resume' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black font-headline text-on-surface">Resume Submissions</h1>
                <p className="text-sm text-on-surface-variant mt-1">Approve or reject student resumes for the Corporate Resume Book.</p>
              </div>

              {/* Search resumes */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant h-4 w-4" />
                <input
                  type="search"
                  placeholder="Search name, email, major..."
                  value={searchResumes}
                  onChange={e => setSearchResumes(e.target.value)}
                  className="pl-9 pr-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64 shadow-sm"
                />
              </div>
            </div>

            {/* Split sub-tabs */}
            <div className="flex gap-1.5 p-1.5 bg-surface-container rounded-full w-fit animate-fade-in">
              {[
                { key: 'approved', label: 'Approved & Public', count: approvedResumes.length, color: 'text-primary bg-primary/10' },
                { key: 'pending', label: 'Pending Verification', count: pendingResumes.length, color: 'text-error bg-error/10' },
              ].map(subTab => (
                <button
                  key={subTab.key}
                  type="button"
                  onClick={() => { setResumeActiveTab(subTab.key); setEditingId(null); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all font-headline ${
                    resumeActiveTab === subTab.key
                      ? "bg-surface-container-lowest shadow-sm text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {subTab.label}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    resumeActiveTab === subTab.key ? subTab.color : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {subTab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Resumes Table */}
            <div className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
              <div className="overflow-x-auto max-h-[500px] rounded-t-lg">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-surface-container-high border-b border-outline-variant/20 text-on-surface-variant font-bold uppercase tracking-wider text-xs font-headline">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Major</th>
                      <th className="px-6 py-4">Graduation Year</th>
                      <th className="px-6 py-4">Submitted Date</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 font-body">
                    {filteredResumes.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`transition hover:bg-surface-container-low ${
                          i % 2 === 1 ? "bg-surface-container-low/20" : "bg-surface-container-lowest"
                        }`}
                      >
                        {/* Student info */}
                        <td className="px-6 py-4 font-bold text-on-surface">
                          <div>
                            <p className="font-bold text-on-surface">{r.full_name}</p>
                            <p className="text-xs text-on-surface-variant font-normal">{r.email}</p>
                          </div>
                        </td>

                        {/* Major and edit */}
                        <td className="px-6 py-4 text-on-surface">
                          {editingId === r.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                maxLength={150}
                                value={editMajorVal}
                                onChange={(e) => setEditMajorVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveResumeMajor(r.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="px-2 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-44"
                              />
                              <button
                                onClick={() => saveResumeMajor(r.id)}
                                disabled={savingId === r.id}
                                className="p-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition disabled:opacity-50"
                              >
                                {savingId === r.id ? (
                                  <span className="material-symbols-outlined animate-spin text-xs">progress_activity</span>
                                ) : (
                                  <Check className="h-4 w-4" strokeWidth={2.5} />
                                )}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <span className="truncate max-w-[200px] inline-block">{r.major || '—'}</span>
                              <button
                                onClick={() => { setEditingId(r.id); setEditMajorVal(r.major || ''); }}
                                className="p-1 text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit major"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Grad year */}
                        <td className="px-6 py-4 text-on-surface">{r.graduation_year}</td>

                        {/* Date submitted */}
                        <td className="px-6 py-4 text-on-surface-variant text-xs">
                          {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true
                          }) : '—'}
                        </td>

                        {/* Status tag */}
                        <td className="px-6 py-4 text-center">
                          {r.approved ? (
                            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => handleViewResume(r.resume_path)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-xs font-semibold text-on-surface hover:bg-surface-container transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleResumeApproval(r.id, r.approved)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                                r.approved
                                  ? 'bg-error/10 hover:bg-error/20 text-error border border-error/20'
                                  : 'bg-primary hover:bg-primary-fixed-dim text-on-primary'
                              }`}
                            >
                              {r.approved ? 'Revoke' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteResume(r.id, r.resume_path)}
                              className="p-2 rounded-lg bg-error/10 hover:bg-error/20 text-error transition"
                              title="Delete resume submission"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredResumes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-on-surface-variant">
                          No resume submissions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-surface-container-high border-t border-outline-variant/20 px-6 py-3 text-xs font-bold text-on-surface-variant font-headline">
                Showing {filteredResumes.length} of {resumeActiveTab === 'pending' ? pendingResumes.length : approvedResumes.length} submissions
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

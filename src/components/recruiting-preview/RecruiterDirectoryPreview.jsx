import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Building2, Search } from 'lucide-react';
import { normalizeLinkedInUrl } from '../../lib/linkedin';
import styles from './RecruiterDirectoryPreview.module.css';

function LinkedInProfileLink({ student }) {
  const href = normalizeLinkedInUrl(student.linkedinUrl);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.linkedinLink} aria-label={`Open LinkedIn profile for ${student.fullName} (opens in a new tab)`}>
      LinkedIn <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  ) : <span className={styles.missingLinkedin}>LinkedIn not provided</span>;
}

/** The parent passes approved, company-scoped DTOs; private PDFs use callbacks. */
export default function RecruiterDirectoryPreview({ company, students = [], connected = false, onViewPdf, allStudentsOnly = false }) {
  const [activeTab, setActiveTab] = useState(allStudentsOnly ? 'all' : 'interested');
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const tabs = useRef({});
  const id = useId();

  useEffect(() => {
    setActiveTab(allStudentsOnly ? 'all' : 'interested');
    setQuery('');
    setYear('all');
  }, [company?.id, allStudentsOnly]);

  const interestedCount = students.filter((student) => student.interested === true).length;
  const years = [...new Set(students.map((student) => student.graduationYear))].sort();
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return students.filter((student) => {
      if (activeTab === 'interested' && student.interested !== true) return false;
      if (year !== 'all' && student.graduationYear !== year) return false;
      return !normalizedQuery || `${student.fullName} ${student.major}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [students, activeTab, query, year]);

  const resetFilters = () => {
    setQuery('');
    setYear('all');
  };

  const selectTabWithKeyboard = (event) => {
    const order = allStudentsOnly ? ['all'] : ['interested', 'all'];
    let next;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = order[(order.indexOf(activeTab) + 1) % order.length];
    } else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order[order.length - 1];
    else return;
    event.preventDefault();
    setActiveTab(next);
    tabs.current[next]?.focus();
  };

  const noCompany = !allStudentsOnly && !company?.id;
  const noInterests = activeTab === 'interested' && interestedCount === 0;
  const hasFilters = query.trim() || year !== 'all';

  return (
    <section className={styles.portal} aria-labelledby={`${id}-welcome`}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>SHPE · Corporate Recruiting Portal</p>
          <h1 id={`${id}-welcome`}>{allStudentsOnly ? 'Approved resume book' : `Welcome, ${company?.name || 'recruiter'}`}</h1>
          <p className={styles.intro}>Meet the next generation of engineering talent.</p>
        </div>
        <span className={styles.companyIcon} aria-hidden="true"><Building2 size={27} strokeWidth={1.6} /></span>
      </header>

      <div className={`${styles.stats} ${allStudentsOnly ? styles.allStats : ''}`} aria-label="Resume book totals">
        <div className={styles.stat}>
          <p>Available students</p>
          <strong>{students.length}</strong>
          <span>Approved for the resume book</span>
        </div>
        {!allStudentsOnly && <div className={styles.stat}>
          <p>Interested in your company</p>
          <strong>{interestedCount}</strong>
          <span>Selected {company?.name || 'your company'}</span>
        </div>}
      </div>

      <div className={styles.directoryHeader}>
        <div>
          <h2>Student Directory</h2>
          <p>{allStudentsOnly ? 'Browse all approved student resumes.' : 'Start with students interested in you, or explore the whole resume book.'}</p>
        </div>
        <span className={styles.approvedNote}>Approved resumes only</span>
      </div>

      <div className={styles.tablist} role="tablist" aria-label="Student directory view">
        {[
          { value: 'interested', label: 'Interested in us', count: interestedCount },
          { value: 'all', label: 'All students', count: students.length },
        ].filter((tab) => !allStudentsOnly || tab.value === 'all').map((tab) => (
          <button
            key={tab.value}
            ref={(element) => { tabs.current[tab.value] = element; }}
            id={`${id}-${tab.value}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls={`${id}-results`}
            tabIndex={activeTab === tab.value ? 0 : -1}
            onClick={() => setActiveTab(tab.value)}
            onKeyDown={selectTabWithKeyboard}
            className={activeTab === tab.value ? styles.activeTab : styles.tab}
          >
            {tab.label}<span>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className={styles.filters}>
        <div className={styles.searchField}>
          <label htmlFor={`${id}-search`}>Search students</label>
          <div className={styles.inputWrap}>
            <Search size={18} aria-hidden="true" />
            <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or major" />
          </div>
        </div>
        <div className={styles.yearField}>
          <label htmlFor={`${id}-year`}>Graduation year</label>
          <select id={`${id}-year`} value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="all">All graduation years</option>
            {years.map((value) => <option key={value} value={value}>{value === 'Alumni' ? 'Alumni' : value}</option>)}
          </select>
        </div>
      </div>

      <div id={`${id}-results`} role="tabpanel" aria-labelledby={`${id}-${activeTab}-tab`} className={styles.results}>
        <p className={styles.resultsCount} role="status">{filtered.length} {filtered.length === 1 ? 'student' : 'students'} shown{hasFilters ? ' with these filters' : ''}</p>
        {noCompany ? (
          <div className={styles.emptyState}>
            <Building2 size={32} aria-hidden="true" />
            <h3>Choose a preview company</h3>
            <p>Select a sample company above to explore its resume book.</p>
          </div>
        ) : filtered.length ? (
          <ul className={styles.students}>
            {filtered.map((student) => (
              <li key={student.id} className={styles.student}>
                <div className={styles.studentInfo}>
                  <h3>{student.fullName}</h3>
                  <p>{student.major}<span aria-hidden="true"> · </span><span className={styles.srOnly}>, </span>{student.graduationYear}</p>
                </div>
                <div className={styles.studentActions}>
                  {student.interested === true && <span className={styles.interestedBadge}>Interested</span>}
                  <div className={styles.profileLinks}>
                    {connected ? <button type="button" onClick={() => onViewPdf?.(student)} disabled={!onViewPdf} className={styles.resumeButton} aria-label={`View PDF for ${student.fullName} (opens in a new tab)`}>View PDF <ArrowUpRight size={15} aria-hidden="true" /></button> : <a href="/recruiting-preview/sample-resume.pdf" target="_blank" rel="noopener noreferrer" className={styles.resumeButton} aria-label={`View PDF for ${student.fullName} (opens in a new tab)`}>
                      View PDF <ArrowUpRight size={15} aria-hidden="true" />
                    </a>}
                    <LinkedInProfileLink student={student} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <Search size={32} aria-hidden="true" />
            <h3>{noInterests ? 'Your next connection is out there.' : students.length ? 'No students match these filters.' : 'The resume book is getting started.'}</h3>
            <p>{noInterests ? 'No approved students have selected your company yet. You can still explore every approved student.' : students.length ? 'Try another name, major, or graduation year.' : 'Students appear here after their resumes are approved.'}</p>
            {noInterests ? <button type="button" className={styles.emptyAction} onClick={() => { setActiveTab('all'); resetFilters(); tabs.current.all?.focus(); }}>Explore all students <ArrowUpRight size={15} aria-hidden="true" /></button> : hasFilters && <button type="button" className={styles.emptyAction} onClick={resetFilters}>Clear filters</button>}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span>{connected ? 'Private resume book · Student details are shared for recruiting purposes.' : 'Local preview · Fictional students and counts. PDF links open a generic sample, not an uploaded resume.'}</span>
        <span>Company selections highlight interest; all approved students remain discoverable.</span>
      </footer>
    </section>
  );
}

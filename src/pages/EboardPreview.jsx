import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Sun, BriefcaseBusiness } from 'lucide-react';
import { previewMembers } from '../data/eboardPreview';
import { scrollToAnchor } from '../lib/scroll';
import styles from './EboardPreview.module.css';

const membersById = new Map(previewMembers.map((member) => [member.id, member]));

// Member IDs follow the owner-confirmed left-to-right order in each photograph.
const leadership = [
  { id: 'president', title: 'President', photo: 'isabella', memberIds: [1], position: '43% 55%' },
  { id: 'vice-president', title: 'Vice President', photo: 'joshua', memberIds: [2], position: '62% 60%' },
  { id: 'treasurer', title: 'Treasurer', photo: 'brooke', memberIds: [3], position: '66% 55%' },
  { id: 'secretary', title: 'Secretary', photo: 'victoria', memberIds: [4], position: '65% 55%' },
];

const chairs = [
  { id: 'academics-shpetinas-marketing', title: 'Academics, Marketing & SHPEtinas', photo: 'academics-shpetinas-marketing', memberIds: [19, 5, 8], wide: true },
  { id: 'alumni-network', title: 'Alumni Network', photo: 'ricardo', memberIds: [6], position: '35% 50%', solo: true },
  { id: 'community-outreach', title: 'Community Outreach', photo: 'community-outreach', memberIds: [9, 10] },
  { id: 'professional-development', title: 'Professional Development', photo: 'professional-development', memberIds: [12, 11] },
  { id: 'conference-parliamentarian', title: 'Parliamentarian & Conference', photo: 'conference-parliamentarian', memberIds: [7, 13] },
  { id: 'digital-operations', title: 'Digital Operations', photo: 'digital-operations', memberIds: [15, 14] },
];

const chapterDevelopment = {
  id: 'chapter-development', title: 'Chapter Development', photo: 'chapter-development', memberIds: [17, 18, 16],
};

function Portrait({ photo, alt, position = '50% 65%', className = '', sizes, eager = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`${styles.portrait} ${className}`}>
      {failed ? (
        <div className={styles.photoFallback}>
          <img src="/photos/shpeLogo.png" alt="SHPE at Ohio State" width="500" height="155" />
          <span>SHPE OSU · Nuestra Familia</span>
        </div>
      ) : (
        <img
          src={`/photos/eboard-preview/${photo}-1440.webp`}
          srcSet={`/photos/eboard-preview/${photo}-640.webp 640w, /photos/eboard-preview/${photo}-1440.webp 1440w`}
          sizes={sizes || '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 620px'}
          alt={alt}
          width="1440"
          height="1080"
          style={{ objectPosition: position }}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function MemberProfile({ member, showRole = true }) {
  return (
    <div className={styles.member} data-member-id={member.id}>
      {showRole && <p className={styles.memberRole}>{member.role}</p>}
      <h3>{member.name}</h3>
      <p className={styles.major}>{member.major}</p>
      <p className={styles.year}>{member.year}</p>
      {member.internship && (
        <p className={styles.internship}>
          <BriefcaseBusiness size={14} aria-hidden="true" />
          <span>{member.internship}</span>
        </p>
      )}
      <p className={styles.loteriaLabel}>{member.label}</p>
    </div>
  );
}

function GroupCard({ group, leadershipCard = false, chapterCard = false }) {
  const members = group.memberIds.map((id) => membersById.get(id));
  const names = members.map((member) => member.name).join(', ');
  return (
    <article
      className={`${styles.card} ${leadershipCard ? styles.leaderCard : ''} ${group.wide ? styles.wideCard : ''} ${group.solo ? styles.soloCard : ''} ${chapterCard ? styles.chapterCard : ''}`}
      aria-labelledby={`${group.id}-title`}
    >
      <div className={styles.cardHeading}>
        <h2 id={`${group.id}-title`}>{group.title}</h2>
      </div>
      <figure className={styles.figure}>
        <Portrait
          photo={group.photo}
          alt={`${names}${members.length > 1 ? ', from left to right' : ''}, wearing red SHPE polos on campus`}
          position={group.position}
          className={leadershipCard || group.solo ? styles.individualPortrait : styles.groupPortrait}
          sizes={leadershipCard ? '(max-width: 520px) 100vw, (max-width: 900px) 50vw, 300px' : undefined}
        />
        <figcaption className={styles.photoCaption}>
          <span>{members.length > 1 ? 'From left' : 'Fall portraits'}</span>
          <span>{members.length > 1 ? members.map((member) => member.name.split(' ')[0]).join(' / ') : 'SHPE at Ohio State'}</span>
        </figcaption>
      </figure>
      <div className={styles.profiles} style={{ '--member-columns': members.length }}>
        {members.map((member) => <MemberProfile key={member.id} member={member} showRole={!leadershipCard} />)}
      </div>
    </article>
  );
}

export default function EboardPreview() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> SHPE at Ohio State · Executive Board</p>
          <h1>The faces<br />behind the<br /><em>familia.</em><Sun className={styles.heroSun} aria-hidden="true" strokeWidth={1.2} /></h1>
          <a className={styles.primaryLink} href="#leadership" onClick={(event) => scrollToAnchor(event, 'leadership')}>
            Meet your E-Board <ArrowDown size={18} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.heroCollage}>
          <figure className={styles.heroPhoto}>
            <Portrait photo="academics-shpetinas-marketing" alt="Rosa, Natalia, and Yareni, from left to right, in their red SHPE polos" eager position="50% 70%" sizes="(max-width: 700px) 85vw, 570px" />
            <figcaption><span>Nuestra Familia</span><span>OHIO STATE</span></figcaption>
          </figure>
        </div>
      </header>

      <div className={styles.indexBar}>
        <p><Sun size={19} aria-hidden="true" /><strong>{previewMembers.length} leaders.</strong> One shared purpose.</p>
        <nav aria-label="E-Board sections">
          <a href="#leadership" onClick={(event) => scrollToAnchor(event, 'leadership')}>Leadership</a>
          <a href="#chairs" onClick={(event) => scrollToAnchor(event, 'chairs')}>The chairs</a>
          <a href="#chapter-development" onClick={(event) => scrollToAnchor(event, 'chapter-development')}>Chapter development</a>
        </nav>
      </div>

      <section className={styles.section} id="leadership" aria-labelledby="leadership-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Leadership</p><h2 id="leadership-heading">Leading with corazón.</h2></div>
          <p>Meet the people helping our<br className={styles.desktopBreak} /> chapter move forward, together.</p>
        </div>
        <div className={styles.leadershipGrid}>
          {leadership.map((group) => <GroupCard key={group.id} group={group} leadershipCard />)}
        </div>
      </section>

      <section className={styles.section} id="chairs" aria-labelledby="chairs-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>The chairs</p><h2 id="chairs-heading">Different talents.<br />Shared energy.</h2></div>
          <p>The faces behind our programs,<br className={styles.desktopBreak} /> connections, and community.</p>
        </div>
        <div className={styles.chairsGrid}>
          {chairs.map((group) => <GroupCard key={group.id} group={group} />)}
        </div>
      </section>

      <section className={styles.section} id="chapter-development" aria-labelledby="chapter-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Chapter development</p><h2 id="chapter-heading">Growing our familia.</h2></div>
          <p>More connections.<br className={styles.desktopBreak} /> More room to belong.</p>
        </div>
        <GroupCard group={chapterDevelopment} chapterCard />
      </section>

      <section className={styles.closing} aria-labelledby="join-heading">
        <div><p className={styles.eyebrow}>There’s a place for you here.</p><h2 id="join-heading">Come meet the familia.</h2><p>Find your next event. Say hello. Make yourself at home.</p></div>
        <Link to="/events" className={styles.primaryLink}>Find an event <ArrowUpRight size={19} aria-hidden="true" /></Link>
      </section>
      <div className={styles.originalLink}><Link to="/eboard">View original E-Board page <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    </main>
  );
}

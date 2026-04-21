import ImagePlaceholder from '../components/ImagePlaceholder';

/*
 * ── E-BOARD MEMBERS ────────────────────────────────────────────
 * To update a member:
 *   1. Add their photo to /public/photos/eboard/
 *   2. Replace the `photo: null` with `photo: '/photos/eboard/name.jpg'`
 *   3. Update name, major, year as needed
 *
 * To add a new member: copy one of the objects below and add it to the array.
 */
const eboardMembers = [
  {
    id: 1,
    role: 'President',
    label: 'EL LÍDER',
    accent: 'primary',
    icon: 'star',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '', // TODO: Add name
    major: '', // TODO: Add major
    year: '',  // TODO: Add year
    photo: null, // TODO: '/photos/eboard/president.jpg'
    rotate: '',
  },
  {
    id: 2,
    role: 'Vice President',
    label: 'EL APOYO',
    accent: 'secondary',
    icon: 'handshake',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[-1deg]',
  },
  {
    id: 3,
    role: 'Treasurer',
    label: 'EL TESORO',
    accent: 'primary',
    icon: 'payments',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[2deg]',
  },
  {
    id: 4,
    role: 'Marketing',
    label: 'LA VOZ',
    accent: 'secondary',
    icon: 'campaign',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 5,
    role: 'Secretary',
    label: 'LA PLUMA',
    accent: 'primary',
    icon: 'edit_note',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[-2deg]',
  },
  {
    id: 6,
    role: 'Alumni Network',
    label: 'EL VÍNCULO',
    accent: 'secondary',
    icon: 'hub',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 7,
    role: 'Parliamentarian',
    label: 'LA LEY',
    accent: 'primary',
    icon: 'gavel',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[1deg]',
  },
  {
    id: 8,
    role: 'SHPEtinas Chair',
    label: 'LA FUERZA',
    accent: 'secondary',
    icon: 'diversity_1',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[-1deg]',
  },
  {
    id: 9,
    role: 'Outreach Chair',
    label: 'LA COMUNIDAD',
    accent: 'primary',
    icon: 'volunteer_activism',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 10,
    role: 'Outreach Chair',
    label: 'EL CORAZÓN',
    accent: 'primary',
    icon: 'favorite',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[2deg]',
  },
  {
    id: 11,
    role: 'Prof. Dev. Chair',
    label: 'EL ÉXITO',
    accent: 'secondary',
    icon: 'work',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 12,
    role: 'Prof. Dev. Chair',
    label: 'LA META',
    accent: 'secondary',
    icon: 'trending_up',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[-2deg]',
  },
  {
    id: 13,
    role: 'Conference Chair',
    label: 'LA REUNIÓN',
    accent: 'primary',
    icon: 'groups',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 14,
    role: 'Digital Ops',
    label: 'LA RED',
    accent: 'secondary',
    icon: 'terminal',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[1deg]',
  },
  {
    id: 15,
    role: 'Digital Ops',
    label: 'EL SISTEMA',
    accent: 'secondary',
    icon: 'code',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 16,
    role: 'Chapter Dev',
    label: 'LA RAÍZ',
    accent: 'primary',
    icon: 'forest',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[-2deg]',
  },
  {
    id: 17,
    role: 'Chapter Dev',
    label: 'EL CULTIVO',
    accent: 'primary',
    icon: 'eco',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
  {
    id: 18,
    role: 'Chapter Dev',
    label: 'EL FRUTO',
    accent: 'primary',
    icon: 'spa',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: 'rotate-[1deg]',
  },
  {
    id: 19,
    role: 'Board Member',
    label: 'LA FAMILIA',
    accent: 'tertiary',
    icon: 'favorite',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: '',
    major: '',
    year: '',
    photo: null,
    rotate: '',
  },
];

/* ── Lotería Card ──────────────────────────────────────────── */
function LoteriaCard({ member, index }) {
  const accentColor =
    member.accent === 'primary'
      ? 'text-primary border-primary/10'
      : member.accent === 'secondary'
      ? 'text-secondary border-secondary/10'
      : 'text-tertiary border-tertiary/20';

  return (
    <div
      className={`loteria-card bg-surface-container-lowest p-4 rounded-lg shadow-lg border-4 relative group ${accentColor} ${member.rotate}`}
    >
      {/* Card number */}
      <div className={`absolute top-4 right-4 font-black font-headline text-xl ${accentColor.split(' ')[0]}`}>
        {index + 1}
      </div>

      {/* Photo slot */}
      <div className="w-full rounded-sm overflow-hidden mb-4 bg-surface-container-high border-2 border-outline-variant/20" style={{ height: '65%' }}>
        {member.photo ? (
          <img
            src={member.photo}
            alt={`${member.role} - ${member.name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          /*
           * 📸 SWAP PHOTO:
           * 1. Add photo to /public/photos/eboard/yourname.jpg
           * 2. Set `photo: '/photos/eboard/yourname.jpg'` in the eboardMembers array above
           */
          <ImagePlaceholder
            label={`${member.role} Photo`}
            className="w-full h-full"
          />
        )}
      </div>

      {/* Role title */}
      <div className="text-center">
        <h3 className={`font-headline font-extrabold text-xl leading-none mb-1 ${accentColor.split(' ')[0]}`}>
          {member.role}
        </h3>
        {member.name && (
          <p className="text-on-surface font-bold text-sm">{member.name}</p>
        )}
        {member.major && (
          <p className="text-on-surface-variant text-xs">{member.major}{member.year ? ` • ${member.year}` : ''}</p>
        )}
        <p className="text-on-surface-variant font-bold text-xs uppercase mt-1">
          {member.label}
        </p>
      </div>

      {/* Icon sticker */}
      <div className={`absolute -bottom-2 -right-2 ${member.iconBg} p-2 rounded-full shadow-md`}>
        <span
          className={`material-symbols-outlined ${member.iconText}`}
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          {member.icon}
        </span>
      </div>
    </div>
  );
}

/* ── E-Board Page ──────────────────────────────────────────── */
export default function Eboard() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto loteria-texture min-h-screen">
        <header className="relative mb-20 text-center">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-10 pointer-events-none">
            <span
              className="material-symbols-outlined text-[18rem]"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              wb_sunny
            </span>
          </div>
          <div className="relative z-10">
            <span className="inline-block px-4 py-1 mb-4 text-xs font-bold uppercase tracking-widest bg-tertiary-container text-on-tertiary-container rounded-sm rotate-[-2deg] shadow-sm">
              Nuestra Familia
            </span>
            <h1 className="text-6xl md:text-7xl font-black font-headline text-primary tracking-tighter mb-6">
              Executive Board
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-on-surface-variant font-medium">
              Meet the student leaders driving the Sol de OSU mission. Dedicated
              to empowering the Hispanic community in engineering at The Ohio
              State University.
            </p>
          </div>
        </header>

        {/* ── LOTERIA GRID ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
          {eboardMembers.map((member, idx) => (
            <LoteriaCard key={member.id} member={member} index={idx} />
          ))}
        </div>
      </main>
    </>
  );
}

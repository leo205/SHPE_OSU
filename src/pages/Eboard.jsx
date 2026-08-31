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
    label: 'LA PRESIDENTA',
    accent: 'primary',
    icon: 'star',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Isabella Staschiak',
    major: 'Environmental Engineering',
    year: '3rd Year',
    internship: 'Intern @ GM',
    photo: '/photos/eboard/isa.webp',
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
    name: 'Joshua Cruz Santos',
    major: 'Electrical & Computer Engineering',
    year: '',
    internship: 'Facilities Ops Intern @ Honda',
    photo: '/photos/eboard/josh.webp',
    rotate: '',
  },
  {
    id: 3,
    role: 'Treasurer',
    label: 'LA TESORERA',
    accent: 'primary',
    icon: 'payments',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Brooke McPike',
    major: 'MechE + Integrated Business & Engineering',
    year: '2nd Year',
    internship: 'Incoming @ Honda',
    photo: '/photos/eboard/brooke.webp',
    rotate: '',
  },
  {
    id: 4,
    role: 'Marketing',
    label: 'LA VOZ',
    accent: 'secondary',
    icon: 'campaign',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: 'Natalia Favila Inacua',
    major: 'Industrial & Systems Engineering',
    year: '2nd Year',
    internship: 'Operations Intern @ Loeb Electric',
    photo: '/photos/eboard/natalia.webp',
    rotate: '',
  },
  {
    id: 5,
    role: 'Secretary',
    label: 'LA SECRETARIA',
    accent: 'primary',
    icon: 'edit_note',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: 'Victoria Cuellar Garcia',
    major: 'Environmental Engineering',
    year: '3rd Year',
    internship: 'Water + Environment Intern @ Gresham Smith',
    photo: '/photos/eboard/victoria.webp',
    rotate: '',
  },
  {
    id: 6,
    role: 'Alumni Network',
    label: 'EL VÍNCULO',
    accent: 'secondary',
    icon: 'hub',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Ricardo Tinoco Lopez',
    major: 'Honors Industrial & Systems Engineering',
    year: '3rd Year',
    internship: 'Indirect Purchasing IT Buyer @ Ford',
    photo: '/photos/eboard/ricardo.webp',
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
    name: 'Juan Andres Valle Nieto',
    major: 'The Ohio State University',
    year: '',
    internship: 'Honda Quality Weld Intern',
    photo: '/photos/eboard/juan.webp',
    rotate: '',
  },
  {
    id: 8,
    role: 'SHPEtinas Chair',
    label: 'LA FUERZA',
    accent: 'secondary',
    icon: 'diversity_1',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Yareni Velazquez Garcia',
    major: 'Industrial & Systems Eng. + International Business',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/yareni.webp',
    rotate: '',
  },
  {
    id: 9,
    role: 'Community Outreach',
    label: 'LA COMUNIDAD',
    accent: 'primary',
    icon: 'volunteer_activism',
    iconBg: 'bg-secondary-container',
    iconText: 'text-on-secondary-container',
    name: 'Maria Paola Manrique Barrios',
    major: 'Biomedical Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/maria.webp',
    rotate: '',
  },
  {
    id: 10,
    role: 'Community Outreach',
    label: 'EL CORAZÓN',
    accent: 'primary',
    icon: 'favorite',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Eric Luther',
    major: 'Chemical Engineering Honors',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/ericL.webp',
    rotate: '',
  },
  {
    id: 11,
    role: 'Prof. Dev. Chair',
    label: 'EL ÉXITO',
    accent: 'secondary',
    icon: 'work',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: 'Eric Santos Martinez',
    major: 'Material Science & Engineering',
    year: '2nd Year',
    internship: 'Prev. Intern @ Lincoln Electric',
    photo: '/photos/eboard/ericM.webp',
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
    name: 'Jesus (Chuy) Trejo',
    major: 'Electrical Engineering',
    year: '3rd Year',
    internship: 'Intern @ Honda',
    photo: '/photos/eboard/chuy.webp',
    rotate: '',
  },
  {
    id: 13,
    role: 'Conference Chair',
    label: 'LA REUNIÓN',
    accent: 'primary',
    icon: 'groups',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Fernando Sandoval Perez',
    major: 'Biomedical Engineering',
    year: '2nd Year',
    internship: 'QC Engineering Intern @ State Industrial Products',
    photo: '/photos/eboard/fern.webp',
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
    name: 'Leonardo Medina',
    major: 'Computer Science & Engineering',
    year: '',
    internship: 'Incoming @ JPMorganChase',
    photo: '/photos/eboard/leo.webp',
    rotate: '',
  },
  {
    id: 15,
    role: 'Digital Ops',
    label: 'EL SISTEMA',
    accent: 'secondary',
    icon: 'code',
    iconBg: 'bg-primary-container',
    iconText: 'text-on-primary-container',
    name: 'Kamila Nieto',
    major: 'Computer Science & Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/kamila.webp',
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
    name: 'Berenice Araiza Sierra',
    major: 'Computer Science & Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/berenice.webp',
    rotate: '',
  },
  {
    id: 17,
    role: 'Chapter Dev',
    label: 'EL CULTIVO',
    accent: 'primary',
    icon: 'eco',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Gloria Morales',
    major: 'Mechanical Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/gloria.webp',
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
    name: 'Aaron Perez',
    major: 'Civil Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/aaron.webp',
    rotate: '',
  },
  {
    id: 19,
    role: 'Academic Chair',
    label: 'LA ACADÉMICA',
    accent: 'tertiary',
    icon: 'school',
    iconBg: 'bg-tertiary-container',
    iconText: 'text-on-tertiary-container',
    name: 'Rosa Waimin',
    major: 'Chemical Engineering',
    year: '2nd Year',
    internship: '',
    photo: '/photos/eboard/rosa.webp',
    rotate: '',
  },
];



/* ── Lotería Card ──────────────────────────────────────────── */
function LoteriaCard({ member }) {
  const accentColor =
    member.accent === 'primary'
      ? 'text-primary border-primary/10'
      : member.accent === 'secondary'
        ? 'text-secondary border-secondary/10'
        : 'text-tertiary border-tertiary/20';

  return (
    <div
      className={`loteria-card flex flex-col aspect-[2.5/3.5] bg-surface-container-lowest p-4 rounded-md shadow-lg border-4 relative w-[calc(50%-12px)] sm:w-[calc(33.333%-16px)] md:w-[calc(25%-18px)] xl:w-[calc(20%-19.2px)] ${accentColor} ${member.rotate}`}
    >

      {/* Photo slot */}
      <div className="w-full rounded-md overflow-hidden mb-4 bg-surface-container-high border-2 border-black" style={{ aspectRatio: '1 / 1.2' }}>
        {member.photo ? (
          <img
            src={member.photo}
            alt={`${member.role} - ${member.name}`}
            className={`w-full h-full object-cover ${member.id === 13 ? 'object-top' : 'object-center'}`}
            loading="lazy"
            decoding="async"
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
        {member.internship && (
          <p className="text-primary font-bold text-xs mt-1 flex items-center justify-center gap-0.5">
            <span className="material-symbols-outlined" style={{ fontSize: '12px', fontVariationSettings: '"FILL" 1' }}>work</span>
            {member.internship}
          </p>
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
        <div className="flex flex-wrap justify-center gap-6 md:gap-8">
          {eboardMembers.map((member) => (
            <LoteriaCard key={member.id} member={member} />
          ))}
        </div>
      </main>
    </>
  );
}

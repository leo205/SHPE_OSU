/**
 * Copy and photos for the involvement-fair landing page (/join).
 *
 * Kept separate from the component so an E-Board member can reword the copy or
 * swap a photo without touching JSX. Everything a non-developer might want to
 * change for next year lives in this file.
 *
 * ⚠️  The one-liner especially should be replaced with how the chapter actually
 * describes itself out loud at the booth — that is the sentence someone reads
 * first, and it should sound like a person, not a mission statement.
 *
 * PHOTO WEIGHT MATTERS HERE more than anywhere else on the site. This page is
 * scanned by hundreds of people sharing one venue's wifi. Only the hero loads
 * eagerly; everything below is lazy, so images stream in as someone scrolls
 * rather than delaying the button they came to press.
 */

/** The first thing a stranger reads. Keep it to one breath. */
export const oneLiner =
  'We are Ohio State’s chapter of the Society of Hispanic Professional Engineers — a community that helps students get into STEM careers and not feel alone doing it.';

/** Loads eagerly. Wide aspect, and a lot of happy people, which is the point. */
export const heroPhoto = {
  src: '/photos/profDev/shpeNationalGroup.webp',
  alt: 'SHPE OSU members together at the national convention',
  width: 1179,
  height: 649,
};

/**
 * The real barrier at a booth is not "what do you do", it is "am I allowed to be
 * here". Most orgs bury that under a mission statement. Answer it first.
 */
export const belonging = [
  {
    question: 'Do I have to be Hispanic?',
    answer: 'No. SHPE is open to every student, from every background.',
  },
  {
    question: 'Do I have to be an engineer?',
    answer:
      'No. Our members study computer science, data analytics, business and more — any major is welcome.',
  },
  {
    question: 'Am I too late to join?',
    answer:
      'No. There is no application and no deadline. Show up to any event whenever you like.',
  },
];

/**
 * Three reasons to stay, once they have decided they belong.
 *
 * These render in FIXED 4:3 frames, so every photo here must be LANDSCAPE.
 * A portrait image cropped to 4:3 loses its top and bottom, which is survivable
 * for a photo of people but destroys a poster — the words go first.
 */
export const whatYouGet = [
  {
    icon: 'work',
    title: 'Get hired',
    text: 'Resume reviews, mock interviews, and a resume book our corporate partners actually read.',
    photo: '/photos/picsMain/shpeBrunch.webp',
    alt: 'Members networking with industry professionals at a SHPE OSU brunch',
  },
  {
    icon: 'diversity_3',
    title: 'Find your people',
    text: 'Study tables, socials, and upperclassmen who have taken the classes you are about to take.',
    photo: '/photos/picsMain/brunchPic2.webp',
    alt: 'SHPE OSU members together at a community brunch',
  },
  {
    icon: 'flight_takeoff',
    title: 'Go national',
    text: 'We send members to the SHPE National Convention to meet recruiters from across the country.',
    photo: '/photos/picsMain/SHPE_convention.jpg',
    alt: 'SHPE OSU members at the national convention',
  },
];

/**
 * Gallery — six PHOTOS, rendered as a uniform square grid.
 *
 * Two earlier attempts failed for opposite reasons, both worth recording:
 *
 *  1. A fixed square grid containing event flyers cropped the top and bottom off
 *     every poster. Photos of people survive a square crop; posters do not,
 *     because the words go first.
 *  2. Switching to a CSS-columns masonry stopped the cropping but balanced the
 *     columns by content height, so with mixed portrait and landscape one column
 *     ran far longer than the others — a ragged bottom edge and a block of dead
 *     space above the closing call to action.
 *
 * The fix is to stop mixing. This grid holds photos only, six of them, so it
 * tiles evenly (3x2 on desktop, 2x3 on mobile) with a flat bottom edge. The
 * flyers were dropped rather than reframed: they also carried spring 2026 dates,
 * which read as upcoming events to someone seeing the page for the first time.
 *
 * If you add one, keep it a PHOTO and keep the count a multiple of the column
 * count, or the bottom row goes ragged again.
 *
 * All lazy-loaded.
 */
export const gallery = [
  { src: '/photos/picsMain/SHPE_volunteering.webp', alt: 'Members volunteering in the Columbus community' },
  { src: '/photos/events/cakeSHPE.webp', alt: 'Members at a hands-on SHPE OSU activity night' },
  { src: '/photos/picsMain/shpeTinas.webp', alt: 'SHPEtinas members at a chapter event' },
  { src: '/photos/profDev/shpeNationalPic.webp', alt: 'Members representing Ohio State at the Industry Partnership Council' },
  { src: '/photos/events/pickleBall.jpg', alt: 'Members playing pickleball at a SHPE OSU social' },
  // NOTE: not visually verified — if this turns out to be a flyer rather than a
  // photo it will crop badly here. Swap it for another photo if so.
  { src: '/photos/profDev/shpeTinasN.webp', alt: 'SHPEtinas members at a professional development event' },
];

/** The single action this page exists to produce. */
export const primaryAction = {
  label: 'Join our GroupMe',
  href: 'https://groupme.com/join_group/33253300/9a2V8k',
  note: 'This is where everything gets announced. It takes about ten seconds.',
};

/** Everything else, deliberately quieter than the button above. */
export const secondaryLinks = [
  {
    label: 'First-Year Guide',
    href: '/photos/First-Year-Guide.pdf',
    // 6.6 MB. Never make this the primary action — on packed venue wifi it is a
    // 30-60 second download, and most people will give up watching a spinner.
    note: 'PDF · best saved for later',
  },
  { label: 'Instagram', href: 'https://www.instagram.com/shpeosu/', note: '@shpeosu' },
  { label: 'Newsletter', href: 'https://eepurl.com/drG0Or', note: 'Events & scholarships' },
];

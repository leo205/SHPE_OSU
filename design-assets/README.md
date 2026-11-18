# E-Board Fall photos

The owner approved the Fall design for the public `/eboard` route on November
18, 2026. `/eboard-preview` redirects to that route. The old `Eboard.jsx` and
its images remain as legacy references; Git history preserves the prior layout.
See [the release record](../docs/plans/eboard-red-polo-release.md) for checks
and deployment status.

Full-resolution JPGs live in the Git-ignored `eboard-fall-originals/` folder.
They were copied out of `dist/photos/eboard/` before running a build: `dist/`
is generated and is not a safe place to keep originals. Keep a separate backup.
Only the resized 640px and 1440px WebP copies under
`public/photos/eboard-preview/` are served by the website. Conversion uses
`cwebp -q 83 -m 6 -resize WIDTH 0`; original pixels are not retouched.

Use the owner's latest corrections for the left-to-right photo order, rather
than inferring it from the original filenames:

- Academics / Marketing / SHPEtinas: Rosa / Natalia / Yareni.
- Community Outreach: Maria Paola Manrique Barrios / Eric Luther.
- Parliamentarian / Conference: Juan Andres Valle Nieto / Fernando Sandoval Perez.
- `Chuy:Eric` means Jesus (Chuy) Trejo / Eric Santos Martinez.

The shared portraits include members of different roles; each person's original
role and profile information is retained. The hero uses only the larger trio
photo; its former smaller Digital Operations photo/caption was removed.

`src/data/eboard.js` is the active public roster, preserving all 19 members and
their existing displayed details. Photo groups and cropping live in
`src/pages/EboardRedPolos.jsx`, with styles in `EboardRedPolos.module.css`.
Do not add private student identifiers or leaderboard exclusions here.

The adopted page is lazy-loaded through the existing E-Board navigation link.
The image directory retains its preview name to preserve existing URLs. Only
the 22 optimized images ship; never add the full-resolution originals to Git.
Use a focused revert if the design needs to be withdrawn, preserving recruiting
and other releases rather than resetting `main`.

## Local verification — November 14, 2026

- Lint, all 494 existing tests in 50 files, all five Edge bundle checks,
  frontend build, and `git diff --check` passed.
- A one-off server-rendered DOM comparison verified that all 19 source members
  appear exactly once with their original name, role, major, year, internship,
  and Lotería label. All image files and section/comparison links resolve.
- `/eboard-preview` returned HTTP 200 from the local development server.
- The original E-Board page, original images, and navigation list have no diff.
- Production dependency audit: zero findings. Full audit: five existing
  development-tool findings (three moderate, two high) in Vitest/mocker,
  postcss-selector-parser, source-map-js, and Vite. No dependency changes were
  made; a dependency maintenance pass remains separate from this experiment.
- Existing large-chunk and mixed Supabase import build warnings remain. The
  preview page has its own lazy JS/CSS chunks.
- Browser control was not approved, so real desktop/mobile visual checks,
  clicked navigation, image-failure behavior, and keyboard review remain pending.
  DOM/HTTP checks do not establish browser acceptance. No production operations
  or form submissions were performed.

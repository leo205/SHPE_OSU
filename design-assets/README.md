# E-Board Fall photo experiment

Local route: `/eboard-preview` on `codex/eboard-red-polo-experiment`.
The original `/eboard`, its roster, and its images are unchanged.

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

`src/data/eboardPreview.js` is an intentional experimental snapshot of the public
roster, preserving all 19 members and their existing displayed details. If the
design is adopted, reconcile the two pages into shared roster data. Do not add
private student identifiers or leaderboard exclusions here.

The experiment is lazy-loaded and unlisted in the main navigation. To discard
it, remove its route/import, preview page/CSS/data, and optimized preview images.
Do not delete the full-resolution originals or the existing E-Board assets.
Nothing has been published by creating the preview.

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

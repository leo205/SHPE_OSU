# Admin-managed sponsors

Status on **2026-09-24: release 1 backend and frontend live and verified**.
The owner explicitly authorized
production rollout after local visual approval. Implementation began on
`feature/admin-managed-sponsors`, based on collaborator changes through
`4778478` (pulled 2026-09-23). Release 2 remains a proposal and is not authorized
by this release-1 rollout.

The approved functional version is saved in commit `0a1ec6c` on
`feature/admin-managed-sponsors`. A separate visual experiment on
`experiment/sponsor-glass-ui` adds frosted surfaces and glossy controls solely
to **Website sponsors**. Its CSS module does not restyle the public directory,
recruiter section, or other admin screens. The owner approved the revised UI
and its local commit on September 24, then approved including it in production.
The rollout follows the backend-first sequence below; do not infer frontend
verification from the applied migration or function deployment.
The September 24 visual revision keeps the glass depth/highlights but removes
decorative color: a clear backdrop, neutral white/gray surfaces, monochrome
controls/status badges, and neutral shadows. Existing sponsor artwork and
semantic error feedback remain unchanged.
The header now uses the existing SHPE logo instead of the building icon, and
the permanent **Refresh listings** button is removed. Initial loading, automatic
list updates after saving, failed-load retry, and conflict reload remain available.

## Recommendation

Build a focused sponsor manager in the existing Admin Dashboard using the
existing Supabase project, Auth, and Storage. Preserve the public page's visual
design. Routine company/logo changes should require an admin login and a
Publish action, not a developer, Git commit, or Vercel deployment.

Deliver in two releases: **sponsor listings first**, then **editable packages
and the sponsorship packet**. A separate CMS, payment system, CRM, or rewrite of
the whole dashboard is not necessary for this scope.

## Baseline before release 1

- `src/pages/Sponsors.jsx` hardcodes five company names, their logos, tier
  grouping, card sizes, the packet URL, and page copy.
- `src/lib/sponsorInquiry.js` defines the four packages, prices, benefits, and
  exact inquiry labels. `supabase/functions/_shared/sponsor-validation.ts`
  independently allowlists those labels; tests assert the two lists agree.
- The Companies admin tab contains historical access codes and recruiter Auth
  onboarding instructions. It does not manage the public sponsor wall.
- Events already demonstrate admin editing backed by Supabase. Reuse that
  interaction pattern, not every implementation detail.
- `src/lib/events.js` merges bundled entries into database results. That is
  unsuitable for sponsors: an archived company could reappear from the bundle.

These are repository observations, not a fresh production database audit.

## Release 1: website sponsor listings

Reuse the existing **Companies** navigation slot, relabel it **Sponsors**, and
provide two clearly separated sections: **Website sponsors** and **Recruiter
access**. Preserve existing `?tab=companies` links and the four-item mobile
navigation. Do not delete historical access records or alter recruiter access.

Website sponsors lets an admin:

- Add a company name, upload an optional logo, and choose an existing tier.
- Preview the actual public card and tier grouping before publishing.
- Save a new entry as a draft, publish it, change its order within a tier,
  replace its logo, or edit its details.
- Archive and restore a listing instead of permanently deleting it.
- Filter the admin list by status and tier, with clear loading, error,
  empty, saving, and saved states on both phones and desktops.

For an already published entry, edits remain in the local editor until the
admin explicitly selects **Save and publish**. Cancel leaves the published
entry unchanged. Release 1 does not promise persistent unpublished revisions
of an already published entry; that would require a separate draft record.

The owner removed company website and academic-year controls on 2026-09-24.
The nullable database fields remain for compatibility; ordinary saves preserve
their values, and conflict resolution preserves the latest saved hidden values.
New entries leave them unset. There is no automatic expiry rule: semester
rollover is an explicit archive/renew action. Do not invent contract dates or
infer a sponsor's payment status from its logo.

### Data and access

`public.sponsors` contains public-display content only:

| Field | Purpose |
|---|---|
| `id` | Stable UUID; names are editable, not record identifiers |
| `name` | Bounded company display name |
| `tier_key` | Stable code for one of the four existing tiers |
| `logo_path` | Validated project asset reference; optional |
| `website_url` | Retained optional HTTPS destination; no editor control |
| `academic_year` | Retained optional year label; no editor control/filter |
| `status` | `draft`, `published`, or `archived`; default `draft` |
| `display_order` | Bounded ordering within a tier |
| `version` | Server-incremented value to detect conflicting edits |
| `created_at`, `updated_at` | Server-maintained timestamps |

Use database constraints plus explicit grants and RLS: public users may read
published listings only; editing and reading unpublished listings require
`public.is_admin()`. A logged-in recruiter is not an admin. Admin edits include
the expected version and must return the changed record; a zero-row update is
a conflict/failure, never a successful save. Keep editor identity and change
history in a separate admin-only audit table written by a database trigger.

Do not put recruiter emails, credentials, contracts, payment records, internal
notes, or inquiry messages in this publicly readable table. Creating,
publishing, or archiving a listing must never grant or revoke resume access.

RLS is database enforcement, not a hidden button or browser filter. See the
[Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Logo storage and replacement

- Use a dedicated `sponsor-assets` bucket, separate from private resumes.
  Accept bounded PNG/JPEG/WebP logos, not SVG/HTML or arbitrary remote images.
  Input and normalized output are capped at 2 MiB, each dimension at 4096 pixels,
  and total pixels at 4 million. The backend fully decodes and re-encodes static
  images to PNG; it does not trust MIME declarations or a file prefix alone.
- Use an admin-authenticated upload endpoint for bounded format/size checking
  and generated immutable paths. Verify the bearer and admin role before any
  privileged Storage call. Deny direct browser uploads, overwrites, and deletes,
  including admin-browser writes, so uploads cannot bypass this validator.
  The verified admin endpoint performs the asset mutations; service keys stay
  server-side. Plain metadata editing can use the existing RLS-protected
  Supabase client; no public submission endpoint is needed for that.
- Publish only references to verified uploaded assets or explicitly migrated
  existing local logos. Enforce that reference in the database against an
  admin-only verified-asset registry and the explicit migration allowlist, not
  just the editor's dropdown. The current CSP already permits project Supabase
  images; do not broaden it to arbitrary image hosts.
- Replace in this order: upload new asset, successfully update the row, then
  retire the old reference. Never delete a working logo before its replacement
  is saved. Track unfinished uploads for retryable, reference-checked cleanup;
  preserve assets needed by archived records or retained history. Do not reuse
  the resume cleanup queue for these public assets.
- A public bucket means draft/archived logo URLs remain publicly retrievable.
  Archive removes the listing from the page; it is not confidential erasure.
  Upload only public branding. Confidential/embargoed assets would require
  private staging and a different publication flow. See
  [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- Missing or failed logos show the company name cleanly, without cropping a
  logo or displaying a broken-image icon.

### Read behavior and module boundaries

The database becomes the sole directory source after cutover. A successful
empty response is a genuine empty list; do not repopulate it from hardcoded
companies. On load failure show a small unavailable/retry state for the sponsor
wall while keeping the rest of the page and inquiry form usable. No realtime
subscription is required: publish is visible on the next page fetch/reload.

Keep new functionality out of the large dashboard component:

| Implemented module | Responsibility |
|---|---|
| `src/components/admin/SponsorsManager.jsx` | Listing/editor/preview workflow |
| `src/components/sponsors/SponsorCard.jsx` | Shared public card and admin preview |
| `src/lib/sponsors.js` | Directory reads, admin saves, archive/restore, ordering |
| `src/lib/sponsorValidation.js` | Pure field normalization and UI validation |
| `supabase/sponsors-admin.sql` | Additive schema, constraints, RLS, grants, audit |
| `supabase/functions/manage-sponsor-assets/` | Admin-only validated asset handling |

Load website sponsor data independently of legacy `company_access`: a failure
in historical recruiter-code loading must not disable website editing. Keep
the existing dashboard lazy-loaded. Add no general-purpose CMS framework or
new state-management library for this small feature.

## Release 2: packages, packet, and public contact settings

Make tier names, prices, ordered benefits, presentation order, and the packet
editable after the directory flow is accepted. Editing prices only in React
would break submissions: the server currently accepts exact labels such as
`Carmen ($1,000)`, and existing browser drafts store those labels.

Use stable package IDs and immutable package/catalog revisions. Store money as
integer minor units with a currency, not formatted text. Cards, dropdowns, and
the Edge handler must resolve the same published revision. Submit a package
ID/revision; the server derives the authoritative label/price for the email.
Treat `Custom` as an explicit supported inquiry option. Never trust a
browser-supplied amount or infer payment from an inquiry.

Publish a reviewed package catalog and its packet reference together. Keep
previous revisions so old inquiries and purchased-tier references remain
understandable after a rename or price change. A stale open form should ask the
visitor to refresh/reselect, not silently substitute a different price. Preserve
the draft's other fields and start a new inquiry identity when its selection
changes. Server compatibility with the old payload must precede frontend
cutover; retain it for rollback and existing tabs until retirement is verified.
Map legacy labels to their known historical revision or request reselection;
never interpret an old price label as the latest package price.

The packet is a separate public PDF document, not a student resume: define its
own bounded validation policy rather than applying the resume's 250 KB limit
without inspecting the chapter's packet. Do not generate or rewrite its
contents automatically when prices change; preview and confirm consistency.

An editable public contact address must remain distinct from the trusted
EmailJS recipient. This feature must not let visitors or arbitrary content
settings choose an email recipient. Preserve Turnstile, durable quotas,
server-held credentials, and exactly one provider attempt per submission.

## Implementation and acceptance

- The existing five-company/tier mapping is preserved with stable seed IDs and
  `ON CONFLICT DO NOTHING`; repeat runs do not overwrite edits or resurrect
  archived listings. Existing local logo files remain valid migrated references.
- New drafts keep a stable creation UUID. A retry after a lost response returns
  the same saved draft, while changed values require explicit comparison.
  Existing updates use a server-maintained version and never treat zero rows as
  a successful save. Conflict recovery preserves typed edits and verified uploads.
- Logo uploads require server-verified admin Auth. Browser Storage mutations are
  blocked even for admins. An asset registry, reference/history checks, leases,
  and permanent tombstones coordinate safe cleanup; unsaved uploads become
  eligible after 24 hours. Cleanup is manually requested, not scheduled.
- Audit history is admin-readable in the database, not a new history/rollback
  screen. Historical logo references are retained. Archive is recoverable and
  never deletes recruiter access or student data.
- `npm run local:sponsors:setup` prepares an isolated loopback-only Supabase
  project, five public branding seeds, empty supporting datasets, and one
  disposable local admin. It never connects to the hosted project. See README
  for startup and test commands.
- Tests cover React interactions, real isolated PostgreSQL constraints/RLS,
  local REST role checks and lifecycle, actual local Edge image decoding and
  Storage cleanup, plus the existing application regressions. These do not
  establish production state or replace visual browser acceptance.
- Final local gates on 2026-09-23: **448 tests in 45 files passed**, lint,
  all five Edge bundles, frontend build, and whitespace checks passed; both
  full and production-only npm audits reported zero vulnerabilities. The build
  retains existing large-chunk and mixed Supabase import warnings. Local REST
  and Edge smoke checks passed; three concurrency cases passed against actual
  local PostgreSQL. No production connection was used.
- Browser automation was not approved during implementation. The owner later
  reviewed and approved the local visual UI; this is not a claim of automated
  desktop/mobile or real-browser keyboard testing.

### September 24 authorized production rollout

- Latest gates: **460 tests in 46 files passed**, lint, frontend build, all five
  Edge bundles, and both dependency audits at zero vulnerabilities. A production-
  configured preview passed route, CSP, and all asset-hash checks.
- `sponsors-admin.sql` is applied and `manage-sponsor-assets` v1 is deployed and
  verified. Existing four functions, policies, grants, definitions, and buckets
  were unchanged. Preserved counts: 322 attendance rows, 17 events, 10 resumes,
  10 private files, and 4 Auth users.
- Hosted rollback-only SQL checks covered lifecycle, RLS, and version conflicts.
  A real PNG upload, public fetch, registry checks, admin-browser upload/delete
  denials, and CORS/missing-bearer/invalid-bearer/non-admin denials passed. Real
  cleanup removed the temporary logo and retained one tombstone. Both temporary
  Auth users were deleted. No student writes, emails, or browser automation
  occurred.
- Commit `e1713e8` is live through successful Vercel deployment
  `8UKNpAcXdmwCnToMxo5t6Az1o7xw`. The site serves `/assets/index-B98w6Nd9.js`;
  all generated JS/CSS SHA-256 hashes match the production-configured build,
  and eight routes return 200 with exact expected security headers. The exact
  public frontend query returns five published listings (`Content-Range: 0-4/5`);
  the apex domain redirects to `www`, which returns 200. Production
  browser/mobile interaction acceptance remains an owner follow-up; the API
  and HTTP checks do not establish it. The September 14 attendance,
  resume-replacement, and sponsor-delivery acceptance checks remain separate
  and were not retested here. The authoritative rollout evidence is in
  [`supabase/README.md`](../../supabase/README.md#admin-managed-sponsors--release-1).

## Tradeoffs

| Approach | Advantages | Costs / limitations |
|---|---|---|
| Existing admin + Supabase (recommended) | One login; familiar workflow; no deploy for content edits; fits annual E-Board handoff | Schema/policy/upload tests and maintenance; sponsor wall depends on data availability; storage/bandwidth use existing project quotas |
| Keep hardcoding | Smallest immediate code change; roster available with static hosting alone | Every content update needs a developer/deploy; greater chance of stale content and conflicting edits |
| External CMS | Ready-made editorial tooling and potentially richer publishing | Another service, account/permission model, integration, and possible subscription; unnecessary for the current directory size |

No extra paid CMS or second hosted Supabase project is a design requirement.
Existing service quotas still apply; do not promise unlimited/free operation.
Admin mistakes become visible more quickly, which is why preview, explicit
publishing, conflict detection, audit history, and recoverable archive matter.

## Implementation and rollout checklist

1. Confirm release-1 scope and the currently published five-company/tier
   mapping with the chapter owner. Preserve those names, logos, and tier
   assignments during migration; leave unknown years/dates unset. No historical
   recruiter-code or student records are deleted.
2. Implement on a feature branch from updated `main`. Test the additive schema
   and role matrix in an isolated local database, plus actual Storage/endpoint
   behavior in local Supabase or an approved preview environment. A Vercel
   preview pointing at production is not an isolated database.
3. Write a narrowly scoped, repeat-safe initial seed that never overwrites
   subsequent admin edits or resurrects archived entries. Inventory grants,
   policies, records, and bucket settings; back up before authorized rollout.
   Do not rerun the repository's historical SQL files as a bundle.
4. Apply schema/bucket permissions and seed first, then the admin asset
   endpoint, then the frontend. Old code remains compatible with these
   additive changes. Verify all five listings before switching public reads.
5. Verify create, preview, publish, edit, reorder, archive, restore, failed
   upload/save, missing logo, stale-editor conflict, empty list, and data outage.
   Probe direct API denial for anonymous and non-admin authenticated writers,
   unpublished-row reads, and asset mutations; UI-only checks are insufficient.
6. Check phone navigation, keyboard controls, focus, loading/error messages,
   uncropped logos, and no page-level horizontal overflow. Confirm recruiter
   access and the protected sponsor inquiry still behave as before.
7. Run project release gates and the code-reviewer/security-auditor reviews.
   Provide the actual running local URL for visual review (normally
   `http://localhost:5173`; production-header preview normally
   `http://localhost:4173`). Deploy only after approval and update operations
   docs with verified live status, not planned behavior.
8. Prepare frontend/endpoint rollback while retaining the additive data and
   restrictions. The old frontend's static roster is stale after admin edits;
   review it before rollback. A Git revert does not undo database content or
   uploaded files. Do not reopen anonymous writes to recover.

Release 2 receives its own compatibility tests and rollout. Do not silently
bundle recruiter self-service, billing, automatic account provisioning,
automatic renewal, or a whole-dashboard refactor into either release.

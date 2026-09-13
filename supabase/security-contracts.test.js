import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

function sourceText(directory = new URL('../src/', import.meta.url)) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return sourceText(path);
    return /\.(?:js|jsx)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('public submission SQL security contracts', () => {
  it('keeps the owner-approved GroupMe invite exact and scoped', () => {
    const publicPages = sourceText().join('\n');
    const approvedInvite = 'https://groupme.com/join_group/33253300/9a2V8k';
    const groupMeUrls = publicPages.match(/https:\/\/groupme\.com\/[^'"\s]+/g) ?? [];

    expect(groupMeUrls).toHaveLength(3);
    expect(new Set(groupMeUrls)).toEqual(new Set([approvedInvite]));
  });

  it('caps the public leaderboard at ten rows inside the database view', () => {
    const leaderboard = sql('./leaderboard-view.sql');

    expect(leaderboard).toMatch(/SELECT ranked\.first_name, ranked\.count[\s\S]*LIMIT 10;/);
    expect(leaderboard).not.toMatch(/SELECT ranked\.\*/);
  });

  it('keeps EmailJS credentials and traffic out of the browser bundle', () => {
    const sponsorPage = readFileSync(
      new URL('../src/pages/Sponsors.jsx', import.meta.url),
      'utf8',
    );
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

    expect(sponsorPage).not.toMatch(
      /@emailjs\/browser|EMAILJS_(SERVICE_ID|TEMPLATE_ID|PUBLIC_KEY)/,
    );
    expect(packageJson).not.toContain('@emailjs/browser');
    expect(vercel).not.toContain('api.emailjs.com');
  });

  it('preserves the supported browser floor across the Vite security upgrade', () => {
    const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(viteConfig).toContain("target: 'safari14'");
    expect(packageJson.engines.node).toBe('^20.19.0 || >=22.12.0');
  });

  it('retains durable rate buckets for the full sponsor monthly window', () => {
    const migration = sql('./attendance-submit.sql');

    expect(migration).toContain('OR p_window_seconds > 2678400 THEN');
    expect(migration).toContain('pg_catalog.make_interval(secs => 5356800)');
    expect(migration).not.toContain('p_window_seconds > 86400');
    expect(migration).not.toContain('make_interval(secs => 172800)');
  });

  it('keeps resume reservation and queue RPCs service-only', () => {
    const migration = sql('./resume-edge-submit.sql');

    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.reserve_resume_submission(uuid, bigint, text)\n  TO service_role;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.queue_resume_submission(uuid, text, text, text, text, text, text)\n  TO service_role;',
    );
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_approved_email_idx');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS resumes_resume_path_unique_idx');
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.(reserve|queue)_resume_submission\([^;]+?\)\s+TO (anon|authenticated)\s*;/,
    );
  });

  it('removes direct resume metadata, Storage, and legacy upsert access', () => {
    const lockdown = sql('./resume-lockdown.sql');

    expect(lockdown).toContain('REVOKE INSERT ON TABLE public.resumes FROM anon;');
    expect(lockdown).toContain('REVOKE INSERT ON TABLE storage.objects FROM anon;');
    expect(lockdown).toContain(
      'REVOKE ALL ON FUNCTION public.submit_resume(text, text, text, text, text)',
    );
  });

  it('does not let a canonical historical file reopen a locked path', () => {
    const sponsorAuth = sql('./sponsor-auth.sql');
    const retiredResume = sql('./resume-submit.sql');

    expect(sponsorAuth).not.toContain('CREATE POLICY "resumes public insert"');
    expect(sponsorAuth).not.toContain('CREATE POLICY "resumes bucket public upload"');
    expect(retiredResume).not.toMatch(/GRANT EXECUTE[\s\S]*?TO anon/);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLeaderboardExclusionRollout } from './prepare-leaderboard-exclusions.mjs';

const canonicalSql = readFileSync(new URL('../supabase/leaderboard-view.sql', import.meta.url), 'utf8');

describe('private leaderboard rollout preparation', () => {
  it('normalizes synthetic identifiers and seeds inside the canonical transaction', () => {
    const result = buildLeaderboardExclusionRollout(canonicalSql, ['  TestMember.901 ', 'AnotherMember.902@osu.edu']);
    expect(result.count).toBe(2);
    expect(result.sql).toContain("('testmember.901'),\n  ('anothermember.902')");
    expect(result.sql).toContain('ON CONFLICT (member_key) DO NOTHING;');
    expect(result.sql.match(/^\s*BEGIN;\s*$/gm)).toHaveLength(1);
    expect(result.sql.match(/^\s*COMMIT;\s*$/gm)).toHaveLength(1);
    expect(result.sql.indexOf('INSERT INTO public.leaderboard_exclusions'))
      .toBeLessThan(result.sql.indexOf('\nCOMMIT;'));
    expect(result.sql.indexOf('CREATE VIEW public.leaderboard'))
      .toBeLessThan(result.sql.indexOf('INSERT INTO public.leaderboard_exclusions'));
  });

  it.each([
    [], null, ['member901'], ['member.901@example.com'], ['member.0'],
    ['member.901\nDELETE'], [123], ['member.901', ' MEMBER.901@osu.edu '],
    Array.from({ length: 251 }, (_, index) => `member.${index + 1}`),
  ].map((identifiers) => ({ identifiers })))('rejects invalid or duplicate private input without echoing identifiers %#', ({ identifiers }) => {
    expect(() => buildLeaderboardExclusionRollout(canonicalSql, identifiers)).toThrow();
  });

  it.each([
    'SELECT 1;',
    'BEGIN;\nCOMMIT;\nCOMMIT;',
    'COMMIT;\nBEGIN;',
    'BEGIN;\nBEGIN;\nCOMMIT;',
  ])('refuses a changed canonical transaction boundary %#', (schemaSql) => {
    expect(() => buildLeaderboardExclusionRollout(schemaSql, ['member.901']))
      .toThrow('The canonical SQL must contain one BEGIN/COMMIT transaction.');
  });
});

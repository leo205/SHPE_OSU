#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Produce local SQL only. Never contact Supabase or log member identifiers. */
export function buildLeaderboardExclusionRollout(schemaSql, identifiers) {
  if (!Array.isArray(identifiers) || identifiers.length < 1 || identifiers.length > 250) {
    throw new Error('Provide between one and 250 private member identifiers.');
  }
  const keys = identifiers.map((value) => {
    if (typeof value !== 'string') throw new Error('Member identifiers must be strings.');
    const key = value.trim().toLowerCase().replace(/@osu\.edu$/, '');
    if (key.length > 100 || !/^[a-z][a-z0-9-]*\.[1-9][0-9]*$/.test(key)) {
      throw new Error('Use an exact surname.number identifier or OSU email.');
    }
    return key;
  });
  if (new Set(keys).size !== keys.length) throw new Error('The private roster contains duplicates.');
  // Fail closed if a later canonical migration changes its transaction shape.
  const transactionLines = schemaSql.match(/^\s*(?:BEGIN|COMMIT);\s*$/gmi) || [];
  if (transactionLines.length !== 2
    || transactionLines[0].trim().toUpperCase() !== 'BEGIN;'
    || transactionLines[1].trim().toUpperCase() !== 'COMMIT;') {
    throw new Error('The canonical SQL must contain one BEGIN/COMMIT transaction.');
  }
  const insertion = [
    '-- PRIVATE LOCAL ROSTER: do not commit or upload this file.',
    'INSERT INTO public.leaderboard_exclusions (member_key) VALUES',
    keys.map((key) => `  ('${key}')`).join(',\n'),
    'ON CONFLICT (member_key) DO NOTHING;',
    '',
    'COMMIT;',
  ].join('\n');
  return { sql: schemaSql.replace(/^\s*COMMIT;\s*$/mi, `\n${insertion}\n`), count: keys.length };
}

async function prepareLocalRollout() {
  const directory = new URL('../.leaderboard-local/', import.meta.url);
  const [schemaSql, rosterText] = await Promise.all([
    readFile(new URL('../supabase/leaderboard-view.sql', import.meta.url), 'utf8'),
    readFile(new URL('eboard-identifiers.json', directory), 'utf8'),
  ]);
  const { sql, count } = buildLeaderboardExclusionRollout(schemaSql, JSON.parse(rosterText));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const output = new URL('eboard-rollout.sql', directory);
  await writeFile(output, sql, { mode: 0o600 });
  await chmod(output, 0o600);
  console.log(`Prepared ${count} private exclusions in .leaderboard-local/eboard-rollout.sql.`);
  console.log('No database was contacted. Applying this transaction requires target verification and approval.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  prepareLocalRollout().catch(() => {
    // JSON/parser/filesystem errors can contain private input; never echo them.
    console.error('Could not prepare the rollout. Check the private roster and canonical SQL; no database was contacted.');
    process.exitCode = 1;
  });
}

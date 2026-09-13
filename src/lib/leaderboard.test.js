import { describe, expect, it } from 'vitest';
import { publicLeaderboardName } from './leaderboard.js';

describe('public leaderboard names', () => {
  it('shows a first name and only one surname initial', () => {
    expect(publicLeaderboardName('Maria', 'buckeye')).toBe('Maria B.');
  });

  it('trims public values and tolerates a missing initial', () => {
    expect(publicLeaderboardName('  Maria  ', '  b  ')).toBe('Maria B.');
    expect(publicLeaderboardName('Maria', null)).toBe('Maria');
  });
});

/**
 * Formats the deliberately limited identity returned by the public leaderboard
 * view. The database exposes one derived surname initial, never the stored
 * last-name/dot-number value.
 */
export function publicLeaderboardName(firstName, lastInitial) {
  const safeFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const safeInitial = typeof lastInitial === 'string'
    ? Array.from(lastInitial.trim())[0]?.toLocaleUpperCase()
    : '';

  return safeInitial ? `${safeFirstName} ${safeInitial}.` : safeFirstName;
}

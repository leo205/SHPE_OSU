import { describe, expect, it } from 'vitest';
import { formatMajor } from './majors.js';

describe('major storage contract', () => {
  it('uses the canonical en dash for a custom major', () => {
    expect(formatMajor('Other', '  Computer Science  ')).toBe('Other – Computer Science');
  });

  it('passes a standard major through unchanged', () => {
    expect(formatMajor('Mechanical Engineering')).toBe('Mechanical Engineering');
  });
});

import { describe, expect, it } from 'vitest';
import { demo } from './api';

describe('web demo fallbacks', () => {
  it('keeps dashboard fallback data available before the API is running', () => {
    expect(demo.roles.length).toBeGreaterThanOrEqual(3);
    expect(demo.articles[0]?.digest?.tags).toContain('AI Agent');
  });
});

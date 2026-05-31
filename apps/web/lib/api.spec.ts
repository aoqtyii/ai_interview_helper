import { describe, expect, it } from 'vitest';
import { ApiError } from './api';

describe('ApiError', () => {
  it('carries response status on API errors', () => {
    const error = new ApiError('failed', 401, 'request-1');
    expect(error.status).toBe(401);
    expect(error.requestId).toBe('request-1');
  });
});

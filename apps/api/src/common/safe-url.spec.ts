import { describe, expect, it } from 'vitest';
import { assertSafeHttpUrl } from './safe-url';

describe('assertSafeHttpUrl', () => {
  it('rejects localhost URLs', async () => {
    await expect(assertSafeHttpUrl('http://localhost/feed.xml')).rejects.toThrow('Localhost');
  });

  it('rejects private IP URLs', async () => {
    await expect(assertSafeHttpUrl('http://127.0.0.1/feed.xml')).rejects.toThrow('Private or local');
  });

  it('rejects non-HTTP protocols', async () => {
    await expect(assertSafeHttpUrl('file:///etc/passwd')).rejects.toThrow('Only HTTP and HTTPS');
  });
});

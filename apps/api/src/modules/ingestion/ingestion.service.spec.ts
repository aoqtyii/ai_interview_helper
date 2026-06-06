import { FeedType, RecordStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from './ingestion.service';

vi.mock('../../common/safe-url', () => ({
  assertSafeHttpUrl: vi.fn(async (url: string) => url)
}));

const feedXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>AI Feed</title>
    <item>
      <title>Agent release notes</title>
      <link>https://example.com/agent-release</link>
      <description>New agent runtime details.</description>
      <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('IngestionService', () => {
  it('rejects invalid AI digest output without creating partial articles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(feedXml) }));
    const prisma = buildPrisma();
    const ai = { run: vi.fn().mockResolvedValue('not-json') };
    const service = new IngestionService(prisma as never, ai as never);

    await expect(service.runFeed('feed-1')).rejects.toThrow('AI article digest is not valid JSON');

    expect(prisma.intelligenceArticle.create).not.toHaveBeenCalled();
    expect(prisma.sourceFeed.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('creates article and digest together after AI digest validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(feedXml) }));
    const prisma = buildPrisma();
    const ai = {
      run: vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'A useful agent runtime update.',
          tags: ['AI Agent'],
          relevanceScores: { aiProductManager: 70, aiAgentDeveloper: 90, fde: 75 }
        })
      )
    };
    const service = new IngestionService(prisma as never, ai as never);

    await expect(service.runFeed('feed-1')).resolves.toEqual({ feedId: 'feed-1', created: 1, skipped: 0 });

    expect(prisma.intelligenceArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Agent release notes',
          digest: {
            create: {
              summary: 'A useful agent runtime update.',
              tags: ['AI Agent'],
              relevanceScores: { aiProductManager: 70, aiAgentDeveloper: 90, fde: 75 }
            }
          }
        })
      })
    );
    expect(prisma.sourceFeed.update).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

function buildPrisma() {
  return {
    sourceFeed: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'feed-1',
        type: FeedType.RSS,
        url: 'https://example.com/feed.xml',
        status: RecordStatus.ACTIVE
      }),
      update: vi.fn().mockResolvedValue({})
    },
    intelligenceArticle: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'article-1' })
    }
  };
}

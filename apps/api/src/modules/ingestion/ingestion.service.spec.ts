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

const feedXmlWithTwoItems = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>AI Feed</title>
    <item>
      <title>Broken digest article</title>
      <link>https://example.com/broken-digest</link>
      <description>This item receives invalid AI output.</description>
      <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Agent release notes</title>
      <link>https://example.com/agent-release</link>
      <description>New agent runtime details.</description>
      <pubDate>Tue, 02 Jun 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('IngestionService', () => {
  it('skips a single invalid AI digest output and continues the feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(feedXmlWithTwoItems) }));
    const prisma = buildPrisma();
    const ai = {
      run: vi
        .fn()
        .mockResolvedValueOnce('not-json')
        .mockResolvedValueOnce(
          JSON.stringify({
            summary: 'A useful agent runtime update.',
            tags: ['AI Agent'],
            relevanceScores: { aiProductManager: 70, aiAgentDeveloper: 90, fde: 75 }
          })
        )
    };
    const service = new IngestionService(prisma as never, ai as never);

    await expect(service.runFeed('feed-1')).resolves.toEqual({ feedId: 'feed-1', created: 1, skipped: 0, failed: 1 });

    expect(prisma.intelligenceArticle.create).toHaveBeenCalledOnce();
    expect(prisma.sourceFeed.update).toHaveBeenCalledOnce();
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

    await expect(service.runFeed('feed-1')).resolves.toEqual({ feedId: 'feed-1', created: 1, skipped: 0, failed: 0 });

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

  it('does not update crawl time when the feed request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const prisma = buildPrisma();
    const ai = { run: vi.fn() };
    const service = new IngestionService(prisma as never, ai as never);

    await expect(service.runFeed('feed-1')).rejects.toThrow('Feed request failed with 503');

    expect(prisma.intelligenceArticle.create).not.toHaveBeenCalled();
    expect(prisma.sourceFeed.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('continues runAll when one feed fails', async () => {
    const prisma = buildPrisma();
    prisma.sourceFeed.findMany.mockResolvedValue([
      { id: 'feed-1', status: RecordStatus.ACTIVE },
      { id: 'feed-2', status: RecordStatus.ACTIVE }
    ]);
    const ai = { run: vi.fn() };
    const service = new IngestionService(prisma as never, ai as never);
    vi.spyOn(service, 'runFeed').mockRejectedValueOnce(new Error('feed failed')).mockResolvedValueOnce({
      feedId: 'feed-2',
      created: 1,
      skipped: 0,
      failed: 0
    });

    await expect(service.runAll()).resolves.toEqual([
      { feedId: 'feed-1', created: 0, skipped: 0, failed: 1, error: 'feed failed' },
      { feedId: 'feed-2', created: 1, skipped: 0, failed: 0 }
    ]);
  });
});

function buildPrisma() {
  return {
    sourceFeed: {
      findMany: vi.fn().mockResolvedValue([]),
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

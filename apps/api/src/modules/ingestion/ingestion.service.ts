import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FeedType, RecordStatus } from '@prisma/client';
import Parser from 'rss-parser';
import { assertSafeHttpUrl } from '../../common/safe-url';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

const FEED_FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 1_000_000;

@Injectable()
export class IngestionService {
  private readonly parser = new Parser();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService
  ) {}

  async runAll() {
    const feeds = await this.prisma.sourceFeed.findMany({ where: { status: RecordStatus.ACTIVE } });
    const results = [];
    for (const feed of feeds) {
      results.push(await this.runFeed(feed.id));
    }
    return results;
  }

  async runFeed(feedId: string) {
    const feed = await this.prisma.sourceFeed.findUniqueOrThrow({ where: { id: feedId } });
    if (feed.type !== FeedType.RSS) {
      return { feedId, created: 0, skipped: 0, note: 'Only RSS is implemented in MVP worker' };
    }

    const safeUrl = await assertSafeHttpUrl(feed.url);
    const parsed = await this.parser.parseString(await this.fetchFeedXml(safeUrl));
    let created = 0;
    let skipped = 0;

    for (const item of parsed.items.slice(0, 10)) {
      const url = item.link;
      if (!url || !item.title) {
        skipped += 1;
        continue;
      }

      const rawHash = createHash('sha256').update(`${item.title}:${url}:${item.isoDate ?? ''}`).digest('hex');
      const exists = await this.prisma.intelligenceArticle.findUnique({ where: { url } });
      if (exists) {
        skipped += 1;
        continue;
      }

      const article = await this.prisma.intelligenceArticle.create({
        data: {
          sourceId: feed.id,
          title: item.title,
          url,
          publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
          rawHash
        }
      });

      const rawDigest = await this.ai.run({
        taskType: 'article_digest',
        system: '你是 AI 前沿资讯分析器。输出 JSON：summary、tags、relevanceScores。',
        input: `标题：${item.title}\n链接：${url}\n内容：${item.contentSnippet ?? item.content ?? ''}`
      });
      const digest = this.parseDigest(rawDigest);

      await this.prisma.articleDigest.create({
        data: {
          articleId: article.id,
          summary: digest.summary,
          tags: digest.tags,
          relevanceScores: digest.relevanceScores
        }
      });

      created += 1;
    }

    await this.prisma.sourceFeed.update({
      where: { id: feed.id },
      data: { lastCrawledAt: new Date() }
    });

    return { feedId, created, skipped };
  }

  private parseDigest(raw: string) {
    try {
      return JSON.parse(raw) as { summary: string; tags: string[]; relevanceScores: Record<string, number> };
    } catch {
      return {
        summary: raw.slice(0, 500),
        tags: ['AI'],
        relevanceScores: { aiProductManager: 60, aiAgentDeveloper: 60, fde: 60 }
      };
    }
  }

  private async fetchFeedXml(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Feed request failed with ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) return response.text();

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_FEED_BYTES) throw new Error('Feed response is too large');
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      clearTimeout(timeout);
    }
  }
}

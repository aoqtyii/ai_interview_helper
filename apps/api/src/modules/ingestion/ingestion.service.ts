import { createHash } from 'node:crypto';
import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { FeedType, RecordStatus } from '@prisma/client';
import Parser from 'rss-parser';
import { assertSafeHttpUrl } from '../../common/safe-url';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

const FEED_FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 1_000_000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly parser = new Parser();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly ai: AiGatewayService
  ) {}

  async runAll() {
    const feeds = await this.prisma.sourceFeed.findMany({ where: { status: RecordStatus.ACTIVE } });
    const results = [];
    for (const feed of feeds) {
      try {
        results.push(await this.runFeed(feed.id));
      } catch (error) {
        const message = this.errorMessage(error);
        this.logger.warn(`Feed ingestion failed for ${feed.id}: ${message}`);
        results.push({ feedId: feed.id, created: 0, skipped: 0, failed: 1, error: message });
      }
    }
    return results;
  }

  async runFeed(feedId: string) {
    const feed = await this.prisma.sourceFeed.findUniqueOrThrow({ where: { id: feedId } });
    if (feed.type !== FeedType.RSS) {
      return { feedId, created: 0, skipped: 0, failed: 0, note: 'Only RSS is implemented in MVP worker' };
    }

    const safeUrl = await assertSafeHttpUrl(feed.url);
    const parsed = await this.parser.parseString(await this.fetchFeedXml(safeUrl));
    let created = 0;
    let skipped = 0;
    let failed = 0;

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

      try {
        const rawDigest = await this.ai.run({
          taskType: 'article_digest',
          system: '你是 AI 前沿资讯分析器。输出 JSON：summary、tags、relevanceScores。',
          input: `标题：${item.title}\n链接：${url}\n内容：${item.contentSnippet ?? item.content ?? ''}`
        });
        const digest = this.parseDigest(rawDigest);

        await this.prisma.intelligenceArticle.create({
          data: {
            sourceId: feed.id,
            title: item.title,
            url,
            publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
            rawHash,
            digest: {
              create: {
                summary: digest.summary,
                tags: digest.tags,
                relevanceScores: digest.relevanceScores
              }
            }
          }
        });

        created += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Article ingestion failed for ${url}: ${this.errorMessage(error)}`);
      }
    }

    await this.prisma.sourceFeed.update({
      where: { id: feed.id },
      data: { lastCrawledAt: new Date() }
    });

    return { feedId, created, skipped, failed };
  }

  private parseDigest(raw: string) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGatewayException('AI article digest is not valid JSON');
    }

    if (!this.isValidDigest(parsed)) {
      throw new BadGatewayException('AI article digest schema is invalid');
    }

    return parsed;
  }

  private isValidDigest(value: unknown): value is { summary: string; tags: string[]; relevanceScores: Record<string, number> } {
    if (!value || typeof value !== 'object') return false;
    const digest = value as Record<string, unknown>;
    if (typeof digest.summary !== 'string' || !digest.summary.trim()) return false;
    if (!Array.isArray(digest.tags) || !digest.tags.length) return false;
    if (!digest.tags.every((tag) => typeof tag === 'string' && Boolean(tag.trim()))) return false;
    if (!digest.relevanceScores || typeof digest.relevanceScores !== 'object' || Array.isArray(digest.relevanceScores)) return false;
    const scores = Object.entries(digest.relevanceScores);
    return scores.length > 0 && scores.every(([key, score]) => Boolean(key.trim()) && typeof score === 'number' && Number.isFinite(score));
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

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

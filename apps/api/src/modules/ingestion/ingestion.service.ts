import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FeedType, RecordStatus } from '@prisma/client';
import Parser from 'rss-parser';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

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

    const parsed = await this.parser.parseURL(feed.url);
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
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: { tag?: string }) {
    return this.prisma.intelligenceArticle.findMany({
      where: query.tag ? { digest: { tags: { has: query.tag } } } : undefined,
      include: { source: true, digest: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50
    });
  }

  async get(id: string) {
    const article = await this.prisma.intelligenceArticle.findUnique({
      where: { id },
      include: { source: true, digest: true }
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  bookmark(userId: string, articleId: string) {
    return this.prisma.articleBookmark.upsert({
      where: { userId_articleId: { userId, articleId } },
      create: { userId, articleId },
      update: {}
    });
  }
}

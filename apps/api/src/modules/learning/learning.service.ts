import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async recommendations(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    return this.prisma.learningItem.findMany({
      where: profile?.targetRoleId ? { skill: { roleProfileId: profile.targetRoleId } } : undefined,
      include: { skill: true, progress: { where: { userId } } },
      orderBy: { estimatedMinutes: 'asc' },
      take: 12
    });
  }

  progress(userId: string, input: { learningItemId: string; status: 'TODO' | 'IN_PROGRESS' | 'DONE'; score?: number }) {
    return this.prisma.learningProgress.upsert({
      where: { userId_learningItemId: { userId, learningItemId: input.learningItemId } },
      create: {
        userId,
        learningItemId: input.learningItemId,
        status: input.status,
        score: input.score
      },
      update: {
        status: input.status,
        score: input.score
      }
    });
  }
}

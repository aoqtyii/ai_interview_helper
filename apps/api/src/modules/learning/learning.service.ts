import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InterviewStatus, ProgressStatus, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LearningService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  items(userId: string) {
    return this.prisma.learningItem.findMany({
      where: { status: RecordStatus.ACTIVE },
      include: this.learningItemInclude(userId),
      orderBy: [{ difficulty: 'asc' }, { estimatedMinutes: 'asc' }, { createdAt: 'desc' }]
    });
  }

  async recommendations(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    return this.prisma.learningItem.findMany({
      where: {
        status: RecordStatus.ACTIVE,
        ...(profile?.targetRoleId
          ? {
              OR: [{ roleProfileId: profile.targetRoleId }, { skill: { roleProfileId: profile.targetRoleId } }, { roleProfileId: null, skillId: null }]
            }
          : {})
      },
      include: this.learningItemInclude(userId),
      orderBy: [{ estimatedMinutes: 'asc' }, { createdAt: 'desc' }],
      take: 12
    });
  }

  async pending(userId: string) {
    const [reportItems, recommendedItems] = await Promise.all([this.latestReportRecommendedItems(userId), this.recommendations(userId)]);
    const byId = new Map<string, (typeof recommendedItems)[number]>();

    for (const item of [...reportItems, ...recommendedItems]) {
      if (item.progress[0]?.status !== ProgressStatus.DONE && !byId.has(item.id)) byId.set(item.id, item);
    }

    return Array.from(byId.values()).slice(0, 6);
  }

  async progress(userId: string, input: { learningItemId: string; status: ProgressStatus; score?: number; note?: string; reflection?: string }) {
    const learningItem = await this.prisma.learningItem.findFirst({
      where: { id: input.learningItemId, status: RecordStatus.ACTIVE },
      select: { id: true }
    });
    if (!learningItem) throw new NotFoundException('Learning item not found');

    const completedAt = input.status === ProgressStatus.DONE ? new Date() : null;
    return this.prisma.learningProgress.upsert({
      where: { userId_learningItemId: { userId, learningItemId: input.learningItemId } },
      create: {
        userId,
        learningItemId: input.learningItemId,
        status: input.status,
        score: input.score,
        completedAt,
        note: input.note ?? '',
        reflection: input.reflection ?? ''
      },
      update: {
        status: input.status,
        score: input.score,
        completedAt,
        note: input.note,
        reflection: input.reflection
      }
    });
  }

  private learningItemInclude(userId: string) {
    return {
      roleProfile: true,
      skill: true,
      progress: { where: { userId } },
      recommendedPlanItems: {
        take: 3,
        orderBy: { createdAt: 'desc' as const },
        include: {
          planItem: {
            include: {
              plan: {
                include: {
                  report: {
                    include: {
                      session: { include: { roleProfile: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  private async latestReportRecommendedItems(userId: string) {
    const report = await this.prisma.assessmentReport.findFirst({
      where: { session: { userId, status: InterviewStatus.COMPLETED } },
      orderBy: { createdAt: 'desc' },
      include: {
        improvementPlans: {
          include: {
            planItems: {
              orderBy: { priority: 'asc' },
              include: {
                recommendedResources: {
                  orderBy: { position: 'asc' },
                  include: {
                    learningItem: {
                      include: this.learningItemInclude(userId)
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    return (
      report?.improvementPlans
        .flatMap((plan) => plan.planItems)
        .flatMap((planItem) => planItem.recommendedResources)
        .map((resource) => resource.learningItem)
        .filter((item) => item.status === RecordStatus.ACTIVE) ?? []
    );
  }
}

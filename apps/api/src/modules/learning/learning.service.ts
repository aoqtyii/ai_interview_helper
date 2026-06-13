import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InterviewStatus, ProgressStatus, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class LearningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(SettingsService) private readonly settings?: SettingsService
  ) {}

  async items(userId: string) {
    const items = await this.prisma.learningItem.findMany({
      where: { status: RecordStatus.ACTIVE },
      include: this.learningItemInclude(userId),
      orderBy: [{ difficulty: 'asc' }, { estimatedMinutes: 'asc' }, { createdAt: 'desc' }]
    });
    return items.map((item) => this.withLearningRecommendationReasons(item));
  }

  async recommendations(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const items = await this.prisma.learningItem.findMany({
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
    return items.map((item) => this.withLearningRecommendationReasons(item));
  }

  async pending(userId: string) {
    const learningConfig = await this.resolveLearningConfig();
    const [reportItems, recommendedItems] = await Promise.all([this.latestReportRecommendedItems(userId), this.recommendations(userId)]);
    const byId = new Map<string, (typeof recommendedItems)[number]>();

    for (const item of [...reportItems, ...recommendedItems]) {
      if (item.progress[0]?.status !== ProgressStatus.DONE && !byId.has(item.id)) byId.set(item.id, item);
    }

    return Array.from(byId.values())
      .slice(0, learningConfig.pendingLimit)
      .map((item) => this.withLearningRecommendationReasons(item));
  }

  async progress(userId: string, input: { learningItemId: string; status: ProgressStatus; score?: number; note?: string; reflection?: string }) {
    const learningItem = await this.prisma.learningItem.findFirst({
      where: { id: input.learningItemId, status: RecordStatus.ACTIVE },
      select: { id: true }
    });
    if (!learningItem) throw new NotFoundException('Learning item not found');

    const existing = await this.prisma.learningProgress.findUnique({
      where: { userId_learningItemId: { userId, learningItemId: input.learningItemId } },
      select: { completedAt: true }
    });
    const completedAt = input.status === ProgressStatus.DONE ? existing?.completedAt ?? new Date() : null;
    const note = input.note === undefined ? undefined : input.note.trim();
    const reflection = input.reflection === undefined ? undefined : input.reflection.trim();

    return this.prisma.learningProgress.upsert({
      where: { userId_learningItemId: { userId, learningItemId: input.learningItemId } },
      create: {
        userId,
        learningItemId: input.learningItemId,
        status: input.status,
        score: input.score,
        completedAt,
        note: note ?? '',
        reflection: reflection ?? ''
      },
      update: {
        status: input.status,
        score: input.score,
        completedAt,
        note,
        reflection
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

  private withLearningRecommendationReasons<
    T extends {
      roleProfile?: { name?: string } | null;
      skill?: { name?: string } | null;
      dimensionKeys?: string[];
      recommendedPlanItems?: Array<Record<string, unknown>>;
    }
  >(item: T): T {
    if (!item.recommendedPlanItems?.length) return item;
    return {
      ...item,
      recommendedPlanItems: item.recommendedPlanItems.map((resource) => ({
        ...resource,
        reason: this.learningRecommendationReason(item, resource)
      }))
    };
  }

  private learningRecommendationReason(item: { roleProfile?: { name?: string } | null; skill?: { name?: string } | null; dimensionKeys?: string[] }, resource: Record<string, unknown>) {
    const planItem = resource.planItem as { title?: string; dimensionKey?: string; plan?: { report?: { session?: { roleProfile?: { name?: string } } } } } | undefined;
    const reasons: string[] = [];

    if (planItem?.dimensionKey && item.dimensionKeys?.includes(planItem.dimensionKey)) reasons.push('匹配本次短板维度');
    if (item.skill?.name) reasons.push(`匹配技能：${item.skill.name}`);
    if (item.roleProfile?.name ?? planItem?.plan?.report?.session?.roleProfile?.name) {
      reasons.push(`匹配岗位：${item.roleProfile?.name ?? planItem?.plan?.report?.session?.roleProfile?.name}`);
    }
    if (!item.roleProfile && !item.skill) reasons.push('通用补弱资源');
    if (planItem?.title) reasons.push(`关联补弱任务：${planItem.title}`);

    return Array.from(new Set(reasons)).slice(0, 3).join('，') || '根据最近面试报告推荐';
  }

  private async resolveLearningConfig() {
    return (
      (await this.settings?.learningConfig()) ?? {
        recommendationLimit: 3,
        pendingLimit: 6
      }
    );
  }
}

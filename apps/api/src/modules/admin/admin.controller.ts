import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { assertSafeHttpUrl } from '../../common/safe-url';
import { Roles } from '../../common/roles.decorator';
import { CreateInterviewQuestionDto, CreateLearningItemDto, CreateRoleProfileDto, CreateSourceFeedDto, UpdateLearningItemDto } from './dto/admin.dto';
import { IngestionService } from '../ingestion/ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';

@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IngestionService) private readonly ingestion: IngestionService
  ) {}

  @Post('role-profiles')
  createRole(@Body() body: CreateRoleProfileDto) {
    return this.prisma.roleProfile.create({ data: body });
  }

  @Post('interview-questions')
  createQuestion(@Body() body: CreateInterviewQuestionDto) {
    return this.prisma.interviewQuestion.create({ data: body });
  }

  @Post('source-feeds')
  async createFeed(@Body() body: CreateSourceFeedDto) {
    const safeUrl = await assertSafeHttpUrl(body.url);
    return this.prisma.sourceFeed.create({
      data: {
        name: body.name,
        type: body.type,
        url: safeUrl,
        crawlInterval: body.crawlInterval ?? '*/30 * * * *'
      }
    });
  }

  @Get('learning-items')
  learningItems() {
    return this.prisma.learningItem.findMany({
      include: { roleProfile: true, skill: true },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
    });
  }

  @Post('learning-items')
  async createLearningItem(@Body() body: CreateLearningItemDto) {
    const data = (await this.toLearningItemData(body)) as Prisma.LearningItemUncheckedCreateInput;
    return this.prisma.learningItem.create({
      data,
      include: { roleProfile: true, skill: true }
    });
  }

  @Patch('learning-items/:id')
  async updateLearningItem(@Param('id') id: string, @Body() body: UpdateLearningItemDto) {
    const data = (await this.toLearningItemData(body)) as Prisma.LearningItemUncheckedUpdateInput;
    return this.prisma.learningItem.update({
      where: { id },
      data,
      include: { roleProfile: true, skill: true }
    });
  }

  @Post('ingestion/run')
  runIngestion() {
    return this.ingestion.runAll();
  }

  @Get('ai-run-logs')
  aiRunLogs() {
    return this.prisma.aiRunLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  private async toLearningItemData(body: CreateLearningItemDto | UpdateLearningItemDto): Promise<Prisma.LearningItemUncheckedCreateInput | Prisma.LearningItemUncheckedUpdateInput> {
    const relation = await this.resolveLearningRelation(body.roleProfileId, body.skillId);
    const contentUrl = body.contentUrl ? await assertSafeHttpUrl(body.contentUrl) : undefined;

    return {
      type: body.type,
      title: body.title?.trim(),
      description: body.description?.trim(),
      contentUrl,
      roleProfileId: relation.roleProfileId,
      skillId: relation.skillId,
      difficulty: body.difficulty,
      estimatedMinutes: body.estimatedMinutes,
      tags: body.tags ? this.cleanStringList(body.tags) : undefined,
      dimensionKeys: body.dimensionKeys ? this.cleanStringList(body.dimensionKeys) : undefined,
      status: body.status
    };
  }

  private async resolveLearningRelation(roleProfileId?: string, skillId?: string) {
    if (!roleProfileId && !skillId) return { roleProfileId: undefined, skillId: undefined };

    const [roleProfile, skill] = await Promise.all([
      roleProfileId ? this.prisma.roleProfile.findUnique({ where: { id: roleProfileId } }) : Promise.resolve(null),
      skillId ? this.prisma.skill.findUnique({ where: { id: skillId } }) : Promise.resolve(null)
    ]);

    if (roleProfileId && !roleProfile) throw new BadRequestException('Role profile not found');
    if (skillId && !skill) throw new BadRequestException('Skill not found');
    if (roleProfileId && skill && skill.roleProfileId !== roleProfileId) {
      throw new BadRequestException('Skill does not belong to the selected role profile');
    }

    return {
      roleProfileId: roleProfileId ?? skill?.roleProfileId,
      skillId
    };
  }

  private cleanStringList(items: string[]) {
    return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, 20);
  }
}

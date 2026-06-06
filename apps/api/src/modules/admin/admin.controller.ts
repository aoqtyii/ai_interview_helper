import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { assertSafeHttpUrl } from '../../common/safe-url';
import { Roles } from '../../common/roles.decorator';
import { CreateInterviewQuestionDto, CreateRoleProfileDto, CreateSourceFeedDto } from './dto/admin.dto';
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

  @Post('ingestion/run')
  runIngestion() {
    return this.ingestion.runAll();
  }

  @Get('ai-run-logs')
  aiRunLogs() {
    return this.prisma.aiRunLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}

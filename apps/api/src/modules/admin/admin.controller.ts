import { Body, Controller, Get, Post } from '@nestjs/common';
import { Difficulty, FeedType, Prisma, UserRole } from '@prisma/client';
import { Roles } from '../../common/roles.decorator';
import { IngestionService } from '../ingestion/ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';

@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService
  ) {}

  @Post('role-profiles')
  createRole(@Body() body: { name: string; slug: string; description: string }) {
    return this.prisma.roleProfile.create({ data: body });
  }

  @Post('interview-questions')
  createQuestion(
    @Body()
    body: {
      roleProfileId: string;
      skillId?: string;
      difficulty: Difficulty;
      question: string;
      rubric: Prisma.InputJsonValue;
    }
  ) {
    return this.prisma.interviewQuestion.create({ data: body });
  }

  @Post('source-feeds')
  createFeed(@Body() body: { name: string; type: FeedType; url: string; crawlInterval?: string }) {
    return this.prisma.sourceFeed.create({
      data: {
        name: body.name,
        type: body.type,
        url: body.url,
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

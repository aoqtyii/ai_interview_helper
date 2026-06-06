import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { IntelligenceService } from './intelligence.service';

@Controller('intelligence')
export class IntelligenceController {
  constructor(@Inject(IntelligenceService) private readonly intelligence: IntelligenceService) {}

  @Get('articles')
  list(@Query('tag') tag?: string) {
    return this.intelligence.list({ tag });
  }

  @Get('articles/:id')
  get(@Param('id') id: string) {
    return this.intelligence.get(id);
  }

  @Post('articles/:id/bookmark')
  bookmark(@CurrentUser() user: AuthUser, @Param('id') articleId: string) {
    return this.intelligence.bookmark(user.id, articleId);
  }
}

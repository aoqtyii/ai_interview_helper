import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { LearningService } from './learning.service';

@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthUser) {
    return this.learning.recommendations(user.id);
  }

  @Post('progress')
  progress(@CurrentUser() user: AuthUser, @Body() body: { learningItemId: string; status: 'TODO' | 'IN_PROGRESS' | 'DONE'; score?: number }) {
    return this.learning.progress(user.id, body);
  }
}

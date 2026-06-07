import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { UpdateLearningProgressDto } from './dto/learning.dto';
import { LearningService } from './learning.service';

@Controller('learning')
export class LearningController {
  constructor(@Inject(LearningService) private readonly learning: LearningService) {}

  @Get('items')
  items(@CurrentUser() user: AuthUser) {
    return this.learning.items(user.id);
  }

  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthUser) {
    return this.learning.recommendations(user.id);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.learning.pending(user.id);
  }

  @Post('progress')
  progress(@CurrentUser() user: AuthUser, @Body() body: UpdateLearningProgressDto) {
    return this.learning.progress(user.id, body);
  }
}

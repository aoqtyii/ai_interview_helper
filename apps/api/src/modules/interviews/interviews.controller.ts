import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { AddInterviewTurnDto, CreateInterviewSessionDto } from './dto/interview.dto';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
export class InterviewsController {
  constructor(@Inject(InterviewsService) private readonly interviews: InterviewsService) {}

  @Post('sessions')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateInterviewSessionDto) {
    return this.interviews.create(user.id, body);
  }

  @Get('sessions')
  list(@CurrentUser() user: AuthUser) {
    return this.interviews.list(user.id, user.role as UserRole);
  }

  @Get('sessions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interviews.get(user.id, user.role as UserRole, id);
  }

  @Post('sessions/:id/turns')
  addTurn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AddInterviewTurnDto) {
    return this.interviews.addTurn(user.id, user.role as UserRole, id, body.content);
  }

  @Post('sessions/:id/finish')
  finish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interviews.finish(user.id, user.role as UserRole, id);
  }

  @Get('sessions/:id/report')
  report(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interviews.report(user.id, user.role as UserRole, id);
  }
}

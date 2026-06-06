import { Difficulty } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateInterviewSessionDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(128)
  roleProfileId!: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  topic?: string;
}

export class AddInterviewTurnDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(8000)
  content!: string;
}

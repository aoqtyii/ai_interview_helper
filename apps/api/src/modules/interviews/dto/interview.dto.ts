import { Difficulty } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInterviewSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  roleProfileId!: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;
}

export class AddInterviewTurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

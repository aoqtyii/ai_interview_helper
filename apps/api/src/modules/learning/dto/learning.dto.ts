import { ProgressStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateLearningProgressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  learningItemId!: string;

  @IsEnum(ProgressStatus)
  status!: ProgressStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;
}

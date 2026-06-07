import { Difficulty, FeedType, LearningType, Prisma, RecordStatus } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRoleProfileDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(1000)
  description!: string;
}

export class CreateInterviewQuestionDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(128)
  roleProfileId!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  skillId?: string;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(4000)
  question!: string;

  @IsObject()
  rubric!: Prisma.InputJsonObject;
}

export class CreateSourceFeedDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsEnum(FeedType)
  type!: FeedType;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  crawlInterval?: string;
}

export class CreateLearningItemDto {
  @IsEnum(LearningType)
  type!: LearningType;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  contentUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  roleProfileId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  skillId?: string;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(1)
  @Max(2000)
  estimatedMinutes!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  dimensionKeys?: string[];

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class UpdateLearningItemDto {
  @IsOptional()
  @IsEnum(LearningType)
  type?: LearningType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  contentUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  roleProfileId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  skillId?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  estimatedMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  dimensionKeys?: string[];

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

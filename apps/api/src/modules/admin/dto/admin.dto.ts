import { Difficulty, FeedType, Prisma } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

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

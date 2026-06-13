import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AdminController } from './modules/admin/admin.controller';
import { AdminSettingsController } from './modules/settings/admin-settings.controller';
import { AiGatewayService } from './modules/ai/ai-gateway.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './modules/health/health.controller';
import { IngestionService } from './modules/ingestion/ingestion.service';
import { IntelligenceController } from './modules/intelligence/intelligence.controller';
import { IntelligenceService } from './modules/intelligence/intelligence.service';
import { InterviewsController } from './modules/interviews/interviews.controller';
import { InterviewsService } from './modules/interviews/interviews.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { LearningController } from './modules/learning/learning.controller';
import { LearningService } from './modules/learning/learning.service';
import { PrismaService } from './prisma/prisma.service';
import { RoleProfilesController } from './modules/role-profiles/role-profiles.controller';
import { RoleProfilesService } from './modules/role-profiles/role-profiles.service';
import { SettingsService } from './modules/settings/settings.service';
import { loadAppConfig } from './common/app-config';

const appConfig = loadAppConfig();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      secret: appConfig.jwtSecret,
      signOptions: { expiresIn: '7d' }
    })
  ],
  controllers: [
    AdminController,
    AdminSettingsController,
    AuthController,
    HealthController,
    IntelligenceController,
    InterviewsController,
    LearningController,
    RoleProfilesController
  ],
  providers: [
    AiGatewayService,
    AuthService,
    IngestionService,
    IntelligenceService,
    InterviewsService,
    LearningService,
    PrismaService,
    RoleProfilesService,
    SettingsService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ]
})
export class AppModule {}

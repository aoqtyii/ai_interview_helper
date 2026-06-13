import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Roles(UserRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  getSettings() {
    return this.settings.adminSettings();
  }

  @Patch()
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: UpdateSettingsDto) {
    return this.settings.updateSettings(user.id, body.settings);
  }
}

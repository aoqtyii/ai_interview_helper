import { Controller, Get, Query } from '@nestjs/common';
import { RoleProfilesService } from './role-profiles.service';

@Controller()
export class RoleProfilesController {
  constructor(private readonly roleProfiles: RoleProfilesService) {}

  @Get('role-profiles')
  list() {
    return this.roleProfiles.list();
  }

  @Get('skills')
  skills(@Query('roleProfileId') roleProfileId?: string) {
    return this.roleProfiles.skills(roleProfileId);
  }
}

import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoleProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.roleProfile.findMany({
      where: { status: RecordStatus.ACTIVE },
      include: { skills: true },
      orderBy: { name: 'asc' }
    });
  }

  skills(roleProfileId?: string) {
    return this.prisma.skill.findMany({
      where: roleProfileId ? { roleProfileId } : undefined,
      include: { roleProfile: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
  }
}

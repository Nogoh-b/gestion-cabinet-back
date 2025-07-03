// src/commands/seed.command.ts

import { Command, Console } from 'nestjs-console';
import { SuperAdminSeeder } from '../database/seeders/super-admin.seeder';

@Console()
export class SeedCommand {
  constructor(private readonly superAdminSeeder: SuperAdminSeeder) {}

  @Command({
    command: 'seed:super-admin',
    description: 'Seed the SUPER_ADMIN user, role and permission',
  })
  async seedSuperAdmin() {
    await this.superAdminSeeder.seed();
  }
}
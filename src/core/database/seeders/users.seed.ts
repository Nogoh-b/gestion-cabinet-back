import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import * as bcrypt from 'bcrypt';
import { UserRole } from 'src/core/enums/user-role.enum';
import { User } from 'src/modules/iam/user/entities/user.entity';

export default class UsersSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    if (process.env.ALLOW_DEMO_USER_SEED !== 'true') {
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Le seed des utilisateurs de demonstration est interdit en production.');
    }

    const userRepository = dataSource.getRepository(User);
    const saltRounds = 12;
    const adminPassword = this.requiredPassword('SEED_DEMO_ADMIN_PASSWORD');
    const lawyerPassword = this.requiredPassword('SEED_DEMO_LAWYER_PASSWORD');
    const secretaryPassword = this.requiredPassword('SEED_DEMO_SECRETARY_PASSWORD');

    const users = [
      {
        email: process.env.SEED_DEMO_ADMIN_EMAIL || 'admin@demo.invalid',
        password: await bcrypt.hash(adminPassword, saltRounds),
        firstName: 'System',
        lastName: 'Administrator',
        role: UserRole.ADMIN,
        isActive: true,
        emailVerified: true,
      },
      {
        email: process.env.SEED_DEMO_LAWYER_EMAIL || 'lawyer@demo.invalid',
        password: await bcrypt.hash(lawyerPassword, saltRounds),
        firstName: 'Marie',
        lastName: 'Dupont',
        role: UserRole.AVOCAT,
        isActive: true,
        emailVerified: true,
        specialite: 'Droit civil',
      },
      {
        email: process.env.SEED_DEMO_SECRETARY_EMAIL || 'secretary@demo.invalid',
        password: await bcrypt.hash(secretaryPassword, saltRounds),
        firstName: 'Sophie',
        lastName: 'Martin',
        role: UserRole.SECRETAIRE,
        isActive: true,
        emailVerified: true,
      },
    ];

    await userRepository.save(users);
  }

  private requiredPassword(name: string): string {
    const value = process.env[name];
    if (!value || value.length < 14) {
      throw new Error(`${name} est obligatoire et doit contenir au moins 14 caracteres.`);
    }
    return value;
  }
}

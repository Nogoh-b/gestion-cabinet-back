import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import * as bcrypt from 'bcrypt';
import { UserRole } from 'src/core/enums/user-role.enum';
import { User } from 'src/modules/iam/user/entities/user.entity';

export default class UsersSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const userRepository = dataSource.getRepository(User);
    const saltRounds = 12;

    const users = [
      {
        email: 'admin@juridique.com',
        password: await bcrypt.hash('Admin123!', saltRounds),
        firstName: 'System',
        lastName: 'Administrator',
        role: UserRole.ADMIN,
        isActive: true,
        emailVerified: true,
      },
      {
        email: 'avocat1@juridique.com',
        password: await bcrypt.hash('Avocat123!', saltRounds),
        firstName: 'Marie',
        lastName: 'Dupont',
        role: UserRole.AVOCAT,
        isActive: true,
        emailVerified: true,
        specialite: 'Droit civil',
      },
      {
        email: 'secretaire1@juridique.com',
        password: await bcrypt.hash('Secretaire123!', saltRounds),
        firstName: 'Sophie',
        lastName: 'Martin',
        role: UserRole.SECRETAIRE,
        isActive: true,
        emailVerified: true,
      },
    ];

    await userRepository.save(users);
  }
}
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cabinet }             from '../cabinet/entities/cabinet.entity';
import { Branch }              from '../agencies/branch/entities/branch.entity';
import { Employee }            from '../agencies/employee/entities/employee.entity';
import { User }                from '../iam/user/entities/user.entity';
import { UserRole }            from '../iam/user-role/entities/user-role.entity';
import { UserRoleAssignment }  from '../iam/user-role-assignment/entities/user-role-assignment.entity';
import { CabinetModule }       from '../cabinet/cabinet.module';
import { OnboardingService }   from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cabinet,
      Branch,
      Employee,
      User,
      UserRole,
      UserRoleAssignment,
    ]),
    CabinetModule,  // pour CabinetService (generateCode, getCabinetUrl)
  ],
  controllers: [OnboardingController],
  providers:   [OnboardingService],
})
export class OnboardingModule {}

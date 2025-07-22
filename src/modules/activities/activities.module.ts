import { Module } from '@nestjs/common';
import { ActivitiesSavingsAccountController } from './activities-savings-account/activities-savings-account.controller';
import { ActivitiesSavingsAccountService } from './activities-savings-account/activities-savings-account.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesSavingsAccount } from './activities-savings-account/entities/activities-savings-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActivitiesSavingsAccount])],
  controllers: [ActivitiesSavingsAccountController],
  providers: [ActivitiesSavingsAccountService],
  exports: [ActivitiesSavingsAccountService, TypeOrmModule],
})
export class ActivitiesModule {}

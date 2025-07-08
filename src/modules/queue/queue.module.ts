import { Queue } from 'bull';
import { CoreModule } from 'src/core/core.module';
import { BullModule, InjectQueue } from '@nestjs/bull';

import { forwardRef, Module, OnModuleInit } from '@nestjs/common';





import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { TransactionModule } from '../transaction/transaction.module';
import { QueueController } from './queue.controller';
import { QueueProcessor } from './queue.processor';
import { QueueService } from './queue.service';







@Module({
  imports: [
    // Enregistrement de la queue dans ce module
    BullModule.registerQueue({ name: 'task-queue' }),
    forwardRef(() => TransactionModule),
    forwardRef(() =>SavingsAccountModule),
    CoreModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, QueueProcessor],
  exports: [QueueService],
})
export class QueueModule implements OnModuleInit {
  constructor(
    @InjectQueue('task-queue') private readonly queue: Queue,
  ) {}

  onModuleInit() {
    // Debug events
    this.queue.on('active', job => console.log(`Job ${job.id} actif`));
    this.queue.on('completed', job => console.log(`Job ${job.id} terminé`));
    this.queue.on('failed', (job, err) => console.error(`Job ${job.id} échoué`, err));
  }
}
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxDeliveryAttempt } from './outbox-delivery-attempt.entity';
import { OutboxEventDispatcher } from './outbox-event.dispatcher';
import { OutboxWorkerService } from './outbox-worker.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, OutboxDeliveryAttempt])],
  providers: [OutboxService, OutboxEventDispatcher, OutboxWorkerService],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}

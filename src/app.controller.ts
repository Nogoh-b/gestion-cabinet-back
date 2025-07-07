import { JobOptions, Queue } from 'bull';
import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';

import { Body, Controller, Inject, Post } from '@nestjs/common';


import { MessagePattern, Payload } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBody } from '@nestjs/swagger';























import { AppService } from './app.service';
import { QueueService } from './modules/queue/queue.service';
import { TransactionSavingsAccountService } from './modules/transaction/transaction_saving_account/transaction_saving_account.service';
























class AddJobDto {
  foo: string;
  accountId:any;
  /**
   * Mettre à true pour exécuter le job chaque mois à la même date
   */
  recurring?: boolean;
}

@Controller()
export class AppController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly appService: AppService,
    private readonly queueService: QueueService,
    private readonly txService: TransactionSavingsAccountService,
    @InjectQueue('maintenance')
    private readonly maintenanceQueue: Queue,
    @Inject('USER_SERVICE') private readonly client: ClientProxy,
  ) {
    this.maintenanceQueue.on('error', (err) =>
      console.error('🔴 Queue Error', err),
    );
    this.maintenanceQueue.on('waiting', (jobId) =>
      console.log('🕒 Job waiting', jobId),
    );
  }

  @Post('test_cron_maintenance')
  @ApiBody({ type: AddJobDto })
  async addJob(@Body() data: AddJobDto) {


    const job = await this.queueService.addTaskBuyInterest(2);
    return { jobId: job.id };
  }
  @Post('test_cron_maintenance1')
  @ApiBody({ type: AddJobDto })
  async addJobTask(@Body() data: AddJobDto) {

   /* return await this.txService.mcotiService.checkStatusPaymentDeposit(data.accountId, "MOMO")
    return {
"accountId" : "620489772"
}*/
    // Options Bull de base
    const opts: JobOptions = {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
    };
      // Planifie le job chaque mois à minuit à la date du jour
      const now = new Date();
      const day = now.getDate();
      // opts.repeat = { cron: `0 0 ${day} * *` };
      opts.repeat = { cron: '*/5 * * * * *' }; // Toutes les 5 secondes
    const job = await this.queueService.addTaskCheckPayment(data.accountId);
    return { jobId: job.id };
  }
  /*@Get('typeorm-error')
  async throwTypeormError(): Promise<void> {
    // Cette requête pointe sur une table inexistante → QueryFailedError
    await this.dataSource.query('SELECT * FROM table_inexistante');
  }*/

  @MessagePattern({ cmd: 'relay' })
  async handleTcpRelay(@Payload() data: any) {
    return firstValueFrom(this.client.send({ cmd: 'process-data' }, data));
  }
}

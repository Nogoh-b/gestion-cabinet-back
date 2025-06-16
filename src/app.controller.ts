import { Job, Queue } from 'bull';
import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';

import { Controller, Get, Inject } from '@nestjs/common';


import { MessagePattern, Payload } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { ApiQuery } from '@nestjs/swagger';




import { AppService } from './app.service';







@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource, 
  private readonly appService: AppService, 
  @InjectQueue('maintenance')
  private readonly maintenanceQueue: Queue,
  @Inject('USER_SERVICE') private readonly client: ClientProxy) {
    this.maintenanceQueue.on('error', err => console.error('🔴 Queue Error', err));
    this.maintenanceQueue.on('waiting', jobId => console.log('🕒 Job waiting', jobId));
  }

  @Get('test_cron')
  @ApiQuery({ name: 'name', required: true })
  async getUserViaRest() {
    console.log('→ test_cron called');
    // 1) ajoute un job simple sans repeat pour tester
    const oneShot: Job = await this.maintenanceQueue.add('deduct-fee', { accountId: 2 });
    console.log('   oneShot job id:', oneShot.id);

    // 2) ajoute le job répété
    const repeatable: Job = await this.maintenanceQueue.add(
      'deduct-fee',
      { accountId: 2 },
      { repeat: { every: 10_000 } },
    );
    console.log('   scheduled repeatable job id:', repeatable.id);

    // 3) affiche les jobs récurrentiels actuellement enregistrés
    const repeatables = await this.maintenanceQueue.getRepeatableJobs();
    console.log('   repeatable jobs:', repeatables);

    return { oneShotId: oneShot.id, repeatables };
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

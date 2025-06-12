import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ClientProxy } from '@nestjs/microservices';


import { AppService } from './app.service';



@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource, private readonly appService: AppService, @Inject('USER_SERVICE') private readonly client: ClientProxy) {}

  /*@Get('users_')
  @ApiQuery({ name: 'name', required: true })
  async getUserViaRest(@Query('name') name: string) {
    return firstValueFrom(this.client.send({ cmd: 'get-user' }, name));
  }*/
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

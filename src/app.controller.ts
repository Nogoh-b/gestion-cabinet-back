import { Controller, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService, @Inject('USER_SERVICE') private readonly client: ClientProxy) {}

  /*@Get('users_')
  @ApiQuery({ name: 'name', required: true })
  async getUserViaRest(@Query('name') name: string) {
    return firstValueFrom(this.client.send({ cmd: 'get-user' }, name));
  }*/

  @MessagePattern({ cmd: 'relay' })
  async handleTcpRelay(@Payload() data: any) {
    return firstValueFrom(this.client.send({ cmd: 'process-data' }, data));
  }
}

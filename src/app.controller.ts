import { Controller, Inject } from '@nestjs/common';
import {
  ClientProxy,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Controller()
export class AppController {
  constructor(
    @Inject('USER_SERVICE')
    private readonly client: ClientProxy,
  ) {}

  @MessagePattern({ cmd: 'relay' })
  handleTcpRelay(@Payload() data: unknown) {
    return firstValueFrom(
      this.client.send({ cmd: 'process-data' }, data),
    );
  }
}

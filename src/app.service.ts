import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
      constructor(
      ) {
        const synchronize = process.env.SYNCHRONIZE === undefined ? true : process.env.SYNCHRONIZE === 'true';
        console.log('AppService initialized', synchronize);
      }
  getHello(): string {
    return 'Hello World! microservice core banking server';
  }
}

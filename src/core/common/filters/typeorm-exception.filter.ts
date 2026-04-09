import { QueryFailedError } from 'typeorm';
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';


@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const responseBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      statusCode1: HttpStatus.INTERNAL_SERVER_ERROR,
      // renvoie directement le message d'erreur SQL/TypeORM
      message: (exception as any).message,
    };

    httpAdapter.reply(
      ctx.getResponse(),
      responseBody,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

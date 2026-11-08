import { QueryFailedError } from 'typeorm';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeOrmExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    // Le détail SQL reste dans les journaux : il révèle le schéma et ne dit
    // rien d'utile à l'utilisateur.
    this.logger.error(exception.message, exception.stack);
    const responseBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      statusCode1: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        "Une erreur technique est survenue. Réessayez ou contactez l'administrateur.",
    };

    httpAdapter.reply(
      ctx.getResponse(),
      responseBody,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

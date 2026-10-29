import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { statusMessage, toUserMessage } from './user-messages';

/**
 * Filtre global des erreurs HTTP : réponse `{ statusCode, message, error }`
 * avec un message en français lisible par l'utilisateur.
 *
 *  - Erreurs métier (HttpException) : message conservé, traduit s'il vient
 *    du framework ou de class-validator.
 *  - Erreurs de base de données : jamais de SQL renvoyé ; doublon et donnée
 *    encore référencée deviennent des conflits explicites.
 *  - Toute autre erreur : 500 générique, détail seulement dans les logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erreurs');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  private readonly ws = new BaseWsExceptionFilter();
  private readonly rpc = new BaseRpcExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost): any {
    // WebSocket / microservice : comportement par défaut de Nest.
    if (host.getType() === 'ws') return this.ws.catch(exception, host);
    if (host.getType() === 'rpc') return this.rpc.catch(exception, host);

    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const { status, message, extra } = this.describe(exception);

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.originalUrl ?? request?.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(
      ctx.getResponse(),
      { statusCode: status, message, error: errorLabel(status), ...extra },
      status,
    );
  }

  private describe(exception: unknown): { status: number; message: string | string[]; extra?: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as any)?.message ?? exception.message;
      // Champs métier ajoutés par certains services (code, détails…) : conservés.
      const extra =
        body && typeof body === 'object'
          ? Object.fromEntries(
              Object.entries(body).filter(([k]) => !['message', 'statusCode', 'error'].includes(k)),
            )
          : undefined;
      if (Array.isArray(raw)) {
        const list = [...new Set(raw.map((m) => toUserMessage(m)).filter(Boolean) as string[])];
        return { status, message: list.length ? list : statusMessage(status), extra };
      }
      return { status, message: toUserMessage(raw) ?? statusMessage(status), extra };
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception as any).driverError?.code ?? (exception as any).code;
      if (code === 'ER_DUP_ENTRY') {
        return { status: HttpStatus.CONFLICT, message: 'Cet élément existe déjà (une valeur unique est déjà utilisée).' };
      }
      if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Impossible : cet élément est encore utilisé ailleurs. Supprimez d’abord les éléments qui y sont liés.',
        };
      }
      if (code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_NO_REFERENCED_ROW') {
        return { status: HttpStatus.BAD_REQUEST, message: 'Un élément lié est introuvable. Actualisez la page puis réessayez.' };
      }
      if (code === 'ER_DATA_TOO_LONG') {
        return { status: HttpStatus.BAD_REQUEST, message: 'Un des textes saisis est trop long.' };
      }
    }

    if (exception instanceof EntityNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, message: statusMessage(404) };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: statusMessage(500) };
  }
}

function errorLabel(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 409) return 'Conflict';
  if (status === 413) return 'Payload Too Large';
  if (status === 429) return 'Too Many Requests';
  return status >= 500 ? 'Internal Server Error' : 'Error';
}

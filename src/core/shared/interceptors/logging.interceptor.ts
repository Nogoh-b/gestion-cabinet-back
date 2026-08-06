import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const path = String(
      request.originalUrl ?? request.url ?? '/',
    ).split('?')[0];
    const method = String(request.method ?? 'UNKNOWN');
    this.logger.log(`${method} ${path}`);

    return next.handle().pipe(
      tap(() => this.logger.log(`${method} ${path} termine`)),
      catchError((error) => {
        const status = Number(
          error?.status ?? error?.statusCode ?? 500,
        );
        this.logger.error(`${method} ${path} echec HTTP ${status}`);
        return throwError(() => error);
      }),
    );
  }
}

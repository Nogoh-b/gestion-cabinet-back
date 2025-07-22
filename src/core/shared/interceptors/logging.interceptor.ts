import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';


@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    console.log(`Requête reçue : ${request.method} ${request.url}`);

    return next.handle().pipe(
      tap(() => console.log(`← Réponse envoyée pour ${request.url}`)),
      catchError(err => {
        // ici on loggue la stack complète ou juste le message
        console.error(
          `‼ Erreur sur ${request.method} ${request.url} :`,
          err.name,
          err.message
        );
        return throwError(() => err);
      }),
    );
  }
}
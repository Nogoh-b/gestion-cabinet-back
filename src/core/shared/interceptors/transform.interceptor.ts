import { Observable, isObservable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ApiResponse } from '../interfaces/api-response.interface';
import { ResponseFormatter } from '../utils/response.formatter';


@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T | { data: any; meta: any }, ApiResponse<any>>
{
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<any>> {
    // ── SSE routes: flatten the inner Observable emitted by the handler ──
    // NestJS's sse() receives the interceptor chain result and subscribes to
    // it directly. When next.handle() emits the handler's Observable as a
    // value (instead of the MessageEvent objects themselves), NestJS writes
    // that Observable object as data — nothing useful reaches the client.
    // switchMap flattens: outer Observable emits inner → subscribe to inner,
    // forwarding actual MessageEvent emissions to NestJS's SSE machinery.
    const isSse = this.reflector.get<boolean>(SSE_METADATA, context.getHandler());
    if (isSse) {
      return next.handle().pipe(
        switchMap(value => (isObservable(value) ? value : of(value))),
      );
    }

    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest();
    const res = httpCtx.getResponse();

    return next.handle().pipe(
      map((result) => {
        // StreamableFile (téléchargement / visualisation de fichier binaire) :
        // ne JAMAIS envelopper dans { data } — laisser NestJS le streamer tel
        // quel, sinon il est sérialisé en JSON et le binaire est perdu.
        if (result instanceof StreamableFile) {
          return result as any;
        }

        // Si la réponse a été envoyée manuellement (via res.write/end)
        // — typique pour les endpoints SSE — ne pas transformer.
        if (res?.writableEnded || res?.headersSent) {
          return result as ApiResponse<any>;
        }

        // Si le service renvoie { data, meta }
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result
        ) {
          return ResponseFormatter.format(
            result.data,
            'Success',
            200,
            result.meta,
          );
        }
        // sinon réponse simple
        return ResponseFormatter.format(result);
      }),
    );
  }
}

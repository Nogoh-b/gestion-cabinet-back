import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';

import { ApiResponse } from '../interfaces/api-response.interface';
import { ResponseFormatter } from '../utils/response.formatter';


@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T | { data: any; meta: any }, ApiResponse<any>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<any>> {
    return next.handle().pipe(
      map((result) => {
        // Si le service renvoie { data, meta }
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result
        ) {
          // on formate avec data et meta
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

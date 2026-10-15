import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { signUploadUrl } from 'src/core/security/uploads-access';

const MAX_DEPTH = 25;

function isTraversable(value: object): boolean {
  return !(
    value instanceof Date ||
    value instanceof StreamableFile ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof RegExp ||
    Object.isFrozen(value) ||
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    typeof (value as any).pipe === 'function' ||
    typeof (value as any).then === 'function'
  );
}

/**
 * Parcourt un corps de réponse JSON et remplace toute URL `/uploads/…` privée
 * par son équivalent signé. Les objets sont modifiés en place (les instances
 * d'entités gardent ainsi leur prototype, donc les règles de sérialisation).
 */
export function signUploadUrlsDeep<T>(
  value: T,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): T {
  if (typeof value === 'string') {
    return (value.includes('/uploads/') ? signUploadUrl(value) : value) as T;
  }
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (!isTraversable(value) || seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = signUploadUrlsDeep(value[i], seen, depth + 1);
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const current = record[key];
    const signed = signUploadUrlsDeep(current, seen, depth + 1);
    if (signed === current) continue;
    try {
      record[key] = signed;
    } catch {
      // propriété en lecture seule : l'URL reste telle quelle
    }
  }
  return value;
}

/**
 * `/uploads` n'est plus public (hors logos de cabinet) : les URLs de fichiers
 * que l'API renvoie (`file_url`, `fileUrl`, `thumbnailUrl`, `attachment_url`,
 * `preuvePaiement`…) sont signées à la volée pour que le navigateur puisse
 * continuer à les ouvrir. Valeurs en base inchangées.
 */
@Injectable()
export class SignUploadUrlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(map((body) => signUploadUrlsDeep(body)));
  }
}

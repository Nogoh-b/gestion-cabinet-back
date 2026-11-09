import {
  ArgumentMetadata,
  Logger,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';

const COMMON_VALIDATION_OPTIONS = {
  transform: true,
  // Le tri des champs est fait ici (declaredProperties) : `whitelist` de
  // class-validator retirerait aussi les champs déclarés par @ApiProperty
  // seul, très nombreux dans les DTO historiques (filtres de recherche,
  // formulaires) et qui passaient avant le pipe global.
  whitelist: false,
  forbidNonWhitelisted: false,
  transformOptions: { enableImplicitConversion: true },
} as const;

/**
 * Pipe global des requêtes.
 *
 * - Query : validée et convertie, jamais filtrée (des filtres en lecture ;
 *   plusieurs contrôleurs appliquent deux DTO à la même query).
 * - Corps de mutation : seuls les champs déclarés par le DTO (validateur ou
 *   @ApiProperty) sont conservés ; les autres sont retirés — jamais
 *   appliqués — au lieu d'être refusés, car beaucoup de formulaires renvoient
 *   l'enregistrement entier (id, code…). Ils sont journalisés.
 */
export class RequestValidationPipe implements PipeTransform {
  private readonly logger = new Logger(RequestValidationPipe.name);

  private readonly pipe = new ValidationPipe(COMMON_VALIDATION_OPTIONS);

  async transform(value: unknown, metadata: ArgumentMetadata) {
    const result = await this.pipe.transform(value, metadata);
    if (metadata.type !== 'body' || !isPlainRecord(result) || result === value) {
      return result;
    }
    const declared = declaredProperties(metadata.metatype);
    if (!declared) return result;
    const stripped = Object.keys(result).filter((key) => !declared.has(key));
    if (stripped.length === 0) return result;
    for (const key of stripped) delete (result as Record<string, unknown>)[key];
    this.logger.warn(
      `Champs ignorés pour ${metadata.metatype?.name ?? 'corps'} : ${stripped.join(', ')}`,
    );
    return result;
  }
}

const declaredCache = new WeakMap<object, Set<string> | null>();

/**
 * Propriétés déclarées par un DTO : décorateurs class-validator et
 * @ApiProperty (héritage et PartialType/OmitType compris). `null` quand le
 * DTO ne déclare rien de lisible : rien n'est alors retiré.
 */
export function declaredProperties(metatype: unknown): Set<string> | null {
  if (typeof metatype !== 'function') return null;
  if (declaredCache.has(metatype)) return declaredCache.get(metatype)!;
  const names = new Set<string>();
  for (const meta of getMetadataStorage().getTargetValidationMetadatas(
    metatype as new () => unknown,
    '',
    true,
    false,
  )) {
    if (meta.propertyName) names.add(meta.propertyName);
  }
  let proto = (metatype as { prototype?: object }).prototype;
  while (proto && proto !== Object.prototype) {
    const swagger: string[] =
      Reflect.getMetadata?.('swagger/apiModelPropertiesArray', proto) ?? [];
    for (const entry of swagger) names.add(entry.replace(/^:/, ''));
    proto = Object.getPrototypeOf(proto);
  }
  const result = names.size ? names : null;
  declaredCache.set(metatype, result);
  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

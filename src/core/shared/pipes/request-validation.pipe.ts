import {
  ArgumentMetadata,
  Logger,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';

const COMMON_VALIDATION_OPTIONS = {
  transform: true,
  whitelist: true,
  transformOptions: { enableImplicitConversion: true },
} as const;

/**
 * Plusieurs contrôleurs historiques appliquent deux DTO à la même query
 * (filtres + pagination). Chaque DTO doit donc ignorer les propriétés de
 * l'autre.
 *
 * Les corps de mutation ne gardent que les propriétés déclarées dans le DTO :
 * les autres sont retirées (jamais appliquées) au lieu d'être refusées, car
 * beaucoup de formulaires renvoient l'enregistrement entier (id, code…).
 * Les champs retirés sont journalisés pour repérer ces formulaires.
 */
export class RequestValidationPipe implements PipeTransform {
  private readonly logger = new Logger(RequestValidationPipe.name);

  private readonly queryPipe = new ValidationPipe({
    ...COMMON_VALIDATION_OPTIONS,
    forbidNonWhitelisted: false,
  });

  private readonly bodyPipe = new ValidationPipe({
    ...COMMON_VALIDATION_OPTIONS,
    forbidNonWhitelisted: false,
  });

  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === 'query') {
      return this.queryPipe.transform(value, metadata);
    }
    const result = await this.bodyPipe.transform(value, metadata);
    this.logStrippedFields(value, result, metadata);
    return result;
  }

  private logStrippedFields(input: unknown, output: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' || !isPlainRecord(input) || !isPlainRecord(output)) return;
    if (output === input) return; // pas de DTO : rien n'a été filtré
    const stripped = Object.keys(input).filter((key) => !(key in output));
    if (stripped.length === 0) return;
    this.logger.warn(
      `Champs ignorés pour ${metadata.metatype?.name ?? 'corps'} : ${stripped.join(', ')}`,
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

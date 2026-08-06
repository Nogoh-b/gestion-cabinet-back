import {
  ArgumentMetadata,
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
 * l'autre. Les corps de mutation restent stricts et refusent toute propriété
 * inconnue.
 */
export class RequestValidationPipe implements PipeTransform {
  private readonly queryPipe = new ValidationPipe({
    ...COMMON_VALIDATION_OPTIONS,
    forbidNonWhitelisted: false,
  });

  private readonly strictPipe = new ValidationPipe({
    ...COMMON_VALIDATION_OPTIONS,
    forbidNonWhitelisted: true,
  });

  transform(value: unknown, metadata: ArgumentMetadata) {
    const pipe =
      metadata.type === 'query' ? this.queryPipe : this.strictPipe;
    return pipe.transform(value, metadata);
  }
}

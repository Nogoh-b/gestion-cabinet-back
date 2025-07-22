import { plainToInstance } from 'class-transformer';
import { validate, ValidatorOptions } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export async function validateDto<T extends object>(
  dtoClass: new () => T,
  payload: unknown,
  options: ValidatorOptions = { whitelist: true, forbidNonWhitelisted: false }
): Promise<T> {
  const instance = plainToInstance(dtoClass, payload, {
    enableImplicitConversion: true, 
  });
  const errors = await validate(instance, options);

  if (errors.length > 0) {
    throw new BadRequestException(
      errors.map(err => ({
        property: err.property,
        constraints: err.constraints,
      }))
    );
  }

  return instance;
}

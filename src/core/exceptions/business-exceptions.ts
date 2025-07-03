import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientFundsException extends HttpException {
  constructor() {
    super('Fonds insuffisants pour effectuer cette transaction', HttpStatus.BAD_REQUEST);
  }
}

export class DocumentValidationException extends HttpException {
  constructor() {
    super('Document rejeté : format invalide ou informations manquantes', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
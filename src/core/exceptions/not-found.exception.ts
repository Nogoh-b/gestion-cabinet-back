import { HttpException, HttpStatus } from '@nestjs/common';

export class NotFoundException extends HttpException {
  constructor(resource: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: `${resource} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
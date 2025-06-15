import { ApiResponse } from "../interfaces/api-response.interface";
import { PaginationMeta } from "../interfaces/pagination.interface";

export class ResponseFormatter {
  static format<T>(
    data: T,
    message = 'Success',
    statusCode = 200,
    meta?: PaginationMeta,
  ): ApiResponse<T> {
    const response: ApiResponse<T> = { data, message, statusCode };
    if (meta) {
      response.meta = meta;
    }
    return response;
  }
}


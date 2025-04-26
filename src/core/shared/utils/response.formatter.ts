import { ApiResponse } from "../interfaces/api-response.interface";

export class ResponseFormatter {
  static format<T>(data: T, message = 'Success', statusCode = 200): ApiResponse<T> {
    return { data, message, statusCode };
  }
}
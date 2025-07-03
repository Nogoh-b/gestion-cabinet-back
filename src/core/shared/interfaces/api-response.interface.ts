import { PaginationMeta } from "./pagination.interface";

export interface ApiResponse<T> {
  data: T;
  message: string;
  statusCode: number;
  meta?: PaginationMeta;
} 
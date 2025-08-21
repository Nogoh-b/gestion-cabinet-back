export interface MetaData {
  count: number;
  size: number;
  page: number;
  total: number;
}
export interface ResponseApi<T> {
  data?: T | T[];
  meta?: MetaData;
  message?: string;
  status: number;
  success: boolean;
  code?: string;
}

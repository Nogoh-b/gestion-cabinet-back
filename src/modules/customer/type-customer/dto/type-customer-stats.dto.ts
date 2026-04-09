// src/modules/customer/type-customer/dto/type-customer-stats.dto.ts
export class TypeCustomerStatsDto {
  total: number;
  active: number;
  inactive: number;
  
  details: TypeCustomerDetailDto[];
}

export class TypeCustomerDetailDto {
  id: number;
  name: string;
  code: string;
  customersCount: number;
  requiredDocumentsCount: number;
  status: number;
  createdAt: Date;
}
// src/modules/agencies/branch/dto/branch-stats.dto.ts
export class BranchStatsDto {
  total: number;
  active: number;
  
  employeesByBranch: BranchEmployeeCountDto[];
  customersByBranch: BranchCustomerCountDto[];
  dossiersByBranch: BranchDossierCountDto[];
  performanceByBranch: any[];
}

export class BranchEmployeeCountDto {
  id: number;
  name: string;
  city: string;
  employees: number;
  avocats: number;
  secretaires: number;
}

export class BranchCustomerCountDto {
  id: number;
  name: string;
  customers: number;
  particuliers: number;
  professionnels: number;
}

export class BranchDossierCountDto {
  id: number;
  name: string;
  dossiers: number;
  actifs: number;
  clos: number;
}
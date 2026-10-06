import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpenseCategory, ExpenseRebillingType } from '../entities/expense-line.entity';
import { SupplierInvoiceStatus } from '../entities/supplier-invoice.entity';

export enum ExpenseWorkspaceOrigin {
  SUPPLIER_INVOICE = 'SUPPLIER_INVOICE',
  EMPLOYEE_REPORT = 'EMPLOYEE_REPORT',
}

export enum ExpenseWorkspaceTarget {
  INTERNAL = 'INTERNAL',
  DOSSIER = 'DOSSIER',
}

export enum ExpenseWorkspaceFinalization {
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
}

export class UnifiedSupplierInvoiceDto {
  @IsInt()
  supplier_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoice_number?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  invoice_date: string;

  @IsDateString()
  due_date: string;

  @IsNumber()
  @Min(0)
  amount_ht: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tax_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_tva?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_ttc?: number;

  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;

  @IsOptional()
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @IsString()
  attachment_url?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UnifiedExpenseLineDto {
  @IsDateString()
  expense_date: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsNumber()
  @Min(0)
  amount_ht: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tax_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_ttc?: number;

  @IsOptional()
  @IsString()
  attachment_url?: string;
}

export class UnifiedExpenseReportDto {
  @IsInt()
  employee_id: number;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsDateString()
  submission_date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnifiedExpenseLineDto)
  lines: UnifiedExpenseLineDto[];
}

export class CreateUnifiedExpenseDto {
  @IsEnum(ExpenseWorkspaceOrigin)
  origin: ExpenseWorkspaceOrigin;

  @IsEnum(ExpenseWorkspaceTarget)
  target: ExpenseWorkspaceTarget;

  @IsEnum(ExpenseWorkspaceFinalization)
  finalization: ExpenseWorkspaceFinalization;

  @IsOptional()
  @IsInt()
  dossier_id?: number;

  @IsOptional()
  @IsUUID()
  action_id?: string;

  @IsOptional()
  @IsEnum(ExpenseRebillingType)
  rebilling_type?: ExpenseRebillingType;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UnifiedSupplierInvoiceDto)
  supplier_invoice?: UnifiedSupplierInvoiceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UnifiedExpenseReportDto)
  expense_report?: UnifiedExpenseReportDto;
}

export class ExpenseWorkspaceSearchDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ExpenseWorkspaceOrigin)
  origin?: ExpenseWorkspaceOrigin;

  @IsOptional()
  @IsEnum(ExpenseWorkspaceTarget)
  target?: ExpenseWorkspaceTarget;

  @IsOptional()
  @IsEnum(ExpenseRebillingType)
  rebilling_type?: ExpenseRebillingType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplier_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dossier_id?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  is_rebillable?: boolean;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

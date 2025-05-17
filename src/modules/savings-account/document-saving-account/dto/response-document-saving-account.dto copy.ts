export class DocumentSavingAccountResponseDto {
  id: number;
  name?: string;
  type?: string;
  status?: number;
  date_validation?: Date;
  date_ejected?: Date;
  date_expired?: Date;
  created_at: Date;
  updated_at: Date;
  savings_account_id: number;
  savings_account_branch_id: number;
}

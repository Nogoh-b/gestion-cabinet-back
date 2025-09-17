import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus, DisputeSeverity } from '../entities/transaction-dispute.entity';
import { TransactionSavingsAccount } from '../../transaction_saving_account/entities/transaction_saving_account.entity';

class TransactionLiteDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  status: number;

  @ApiProperty({ nullable: true })
  payment_code?: string;

  @ApiProperty({ nullable: true })
  reference?: string;

  @ApiProperty({ nullable: true })
  provider_code?: string;
}

export class TransactionDisputeDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: DisputeStatus })
  status: DisputeStatus;

  @ApiProperty({ enum: DisputeSeverity })
  severity: DisputeSeverity;

  @ApiProperty({ nullable: true })
  description?: string;

  @ApiProperty({ nullable: true })
  resolution_notes?: string;

  @ApiProperty({ nullable: true })
  assigned_to_id?: number;

  @ApiProperty({ nullable: true })
  resolution_date?: Date;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({ nullable: true })
  closed_at?: Date;

  @ApiProperty({ type: TransactionLiteDto })
  transaction?: TransactionSavingsAccount;
}

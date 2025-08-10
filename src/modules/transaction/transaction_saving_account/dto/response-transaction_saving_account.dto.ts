import { Exclude, Expose, Transform } from 'class-transformer';
import { Commercial } from 'src/modules/commercial/entities/commercial.entity';
import { Partner } from 'src/modules/partner/entities/partner.entity';
import { Provider } from 'src/modules/provider/provider/entities/provider.entity';
import { Ressource } from 'src/modules/ressource/ressource/entities/ressource.entity';




import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { ApiProperty } from '@nestjs/swagger';











import { ChannelTransaction } from '../../chanel-transaction/entities/channel-transaction.entity';
import { TransactionType } from '../../transaction_type/entities/transaction_type.entity';












export class ResponseTransactionSavingsAccountDto {
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty()
  @Expose()
  status: number;

  @ApiProperty({ required: false })
  @Expose()
  external_activities_id?: string;

  @ApiProperty()
  @Expose()
  is_locked: boolean;

  @ApiProperty()
  @Expose()
  channels_transaction_id: number;

  @ApiProperty()
  @Expose()
  provider_code: string;

  @ApiProperty()
  @Expose()
  payment_code: string;

  @ApiProperty()
  @Expose()
  token: string;

  @ApiProperty()
  @Expose()
  payment_token_provider: string;

  @ApiProperty()
  @Expose()
  origin: string;

  @ApiProperty()
  @Expose()
  target: string;

  @ApiProperty({ required: false })
  @Expose()
  status_provider?: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiProperty()
  @Expose()
  transaction_type_id: number;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty({ type: () => SavingsAccount, required: false })
  @Exclude()
  @Transform(({ value }) => {
    if (!value) return value;
    const { targetSavingsAccountTx, originSavingsAccountTx,required_documents,balance,avalaible_balance,type_savings_account, branch, ...rest } = value;
    return rest;
  })
  originSavingsAccount?: SavingsAccount;


  @Expose()
  @ApiProperty({ type: () => SavingsAccount, required: false })
  @Transform(({ value }) => {
    if (!value) return value;
    const { targetSavingsAccountTx, originSavingsAccountTx, required_documents,balance,avalaible_balance,type_savings_account,branch, ...rest } = value;
    return rest;
  })
  targetSavingsAccount?: SavingsAccount;


  @ApiProperty({ type: () => Ressource, required: false })
  @Expose()
  ressource?: Ressource;

  @ApiProperty({ required: false })
  @Expose()
  promo_code?: string;

  @ApiProperty({ required: false })
  @Expose()
  commission?: number;

  @ApiProperty({ required: false })
  @Expose()
  branch_id?: number;

  @ApiProperty({ required: false })
  @Expose()
  commercial_code?: string;

  @ApiProperty({ type: () => Partner, required: false })
  @Expose()
  partner?: Partner;

  @ApiProperty({ type: () => Commercial, required: false })
  @Expose()
  commercial?: Commercial;

  @ApiProperty({ type: () => ChannelTransaction })
  @Expose()
  channelTransaction: ChannelTransaction;

  @ApiProperty({ type: () => Provider })
  @Expose()
  provider: Provider;

  @ApiProperty({ type: () => TransactionType })
  @Expose()
  transactionType: TransactionType;
}

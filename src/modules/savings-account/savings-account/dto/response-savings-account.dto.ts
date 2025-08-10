// savings-account-response.dto.ts
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';











import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';







import { DocumentSavingAccountResponseDto } from '../../document-saving-account/dto/response-document-saving-account.dto';
import { TypeSavingsAccount } from '../../type-savings-account/entities/type-savings-account.entity';
import { SavingsAccountHasInterest } from '../entities/account-has-interest.entity';
import { SavingsAccount } from '../entities/savings-account.entity';



















export class SavingsAccountResponseDto {
  @Expose()
  id: number;

  @Expose()
  number_savings_account: string;

  @Expose()
  fee_savings: number;

  @Expose()
  amount_created: number;

  @Expose()
  avalaible_balance: number;

  @Expose()
  balance: number;

  @Expose()
  status: number;

  @Expose()
  statusLabel: string;

  @Expose()
  created_online: number;

  @Expose()
  iban: string;

  @Expose()
  code_product: string;

  @Expose()
  wallet_link?: string;

  @Expose()
  interest_year_savings_account?: number;

  @Expose()
  account_number?: string;

  @Expose()
  is_admin?: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => Customer)
  customer: Customer;

  @Expose()
  @Type(() => SavingsAccount)
  enrolled_by: SavingsAccount


  @Expose()
  @Transform(({ obj }) => {
    console.log('obj.targetSavingsAccountTx', obj.targetSavingsAccountTx);
    // 1) On récupère uniquement les tx à status = 1
    const filteredTxs: TransactionSavingsAccount[] = (obj.targetSavingsAccountTx ?? [])
      .filter(tx => tx.status === 1);

    // 2) Si aucune, on renvoie false
    if (filteredTxs.length === 0) {
      return false;
    }

    // 3) Sinon, tri chronologique (du plus ancien au plus récent)
    const [oldestStatus1] = filteredTxs.sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    );

    // 4) On renvoie true si la plus ancienne des tx filtrées existe
    //    (ici donc forcément status === 1)
    return !!oldestStatus1;
  })
  @Type(() => Boolean)
  has_init_transaction: boolean;

  @Exclude()
  originSavingsAccountTx?: TransactionSavingsAccount[]; // Transactions liées au compte

  @Exclude()
  targetSavingsAccountTx?: TransactionSavingsAccount[]; // Transactions liées au compte

  @Expose()
  @Transform(({ obj }) => {
    return obj?.partner?.code
  })
  @Type(() => Boolean)
  partner_code: string;

  @Expose()
  @Type(() => TypeSavingsAccount)
  type_savings_account: TypeSavingsAccount;

  @Expose()
  @Type(() => Branch)
  branch: Branch;



  @Expose()
  @Type(() => DocumentSavingAccountResponseDto)
  documents: DocumentSavingAccountResponseDto[];

  @Expose()
  @Type(() => SavingsAccountHasInterest)
  interestRelations: SavingsAccountHasInterest[];

  @Expose()
  @Type(() => SavingsAccountHasInterest)
  activeInterest?: SavingsAccountHasInterest;

  /*constructor(account: SavingsAccount) {
    this.id = account.id;
    this.number_savings_account = account.number_savings_account;
    this.fee_savings = account.fee_savings;
    this.amount_created = account.amount_created;
    this.avalaible_balance = account.avalaible_balance;
    this.balance = account.balance;
    this.status = account.status;
    this.statusLabel = SavingsAccountStatus[account.status];
    this.iban = account.iban;
    this.code_product = account.code_product;
    this.wallet_link = account.wallet_link;
    this.interest_year_savings_account = account.interest_year_savings_account;
    this.account_number = account.account_number;
    this.is_admin = account.is_admin;
    this.created_at = account.created_at;
    this.updated_at = account.updated_at;
    this.customer = account.customer;
    this.type_savings_account = account.type_savings_account;
    this.branch = account.branch;
    this.documents = account.documents?.map(doc => 
      plainToClass(DocumentSavingAccountResponseDto, {
        ...doc,
        document_type_id: doc.document_type?.id,
        customer_id: doc.customer?.id,
      })
    ) || [];
    this.interestRelations = account.interestRelations;
    this.activeInterest = account.activeInterest;
  }*/
}

export class SavingAccountInterestAssignmentResponseDto {
  @ApiProperty({ description: 'ID du compte épargne' })
  savings_account_id: number;

  @ApiProperty({ description: 'ID du taux d’intérêt' })
  interest_saving_account_id: number;

  @ApiProperty({ description: 'Date de début d’application', type: String })
  begin_date: string;

  @ApiPropertyOptional({ description: 'Date de fin d’application', type: String })
  end_date?: string;

  @ApiPropertyOptional({ description: 'Statut de l’affectation', example: 1 })
  status?: number;
}

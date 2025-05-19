import { Entity, Column, ManyToOne, JoinColumn, BaseEntity, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { InterestSavingAccount } from '../../interest-saving-account/entities/interest-saving-account.entity';
import { Commission } from '../../commission/entities/commission.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';

@Entity('type_savings_account')
export class TypeSavingsAccount extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 45 })
  name: string;

  @Column({ length: 45 })
  code: string;

  @Column({ length: 45 })
  periode: string;

  @Column({ type: 'tinyint' })
  status: number;

  @Column({ length: 45, default: '0' })
  interest_year_savings_account: string;

  @Column({ length: 45, nullable: true })
  minimum_blocking_duration: string;

  @Column({ type: 'double', nullable: true })
  initial_deposit: number;

  @Column({ type: 'double', nullable: true })
  minimum_balance: number;

  @Column({ type: 'double', nullable: true })
  commission_per_product: number;

  @Column({ type: 'double', nullable: true })
  monthly_maintenance_costs: number;

  @Column({ type: 'double', nullable: true })
  account_closure_fees: number;

  @Column({ type: 'int' })
  commission_id: number;

  @Column({ type: 'int' })
  interest_saving_account_id: number;

 @ManyToMany(() => DocumentType)
  @JoinTable({
    name: 'type_savings_account_has_documenttype',
    joinColumn: { name: 'type_savings_account_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'DocumentType_id', referencedColumnName: 'id' },
    schema: 'core_banking',
  })
  required_documents: DocumentType[];

  // Relations
  @ManyToOne(() => Commission)
  @JoinColumn({ name: 'commission_id' })
  commission: Commission;

  @ManyToOne(() => InterestSavingAccount)
  @JoinColumn({ name: 'interest_saving_account_id' }) 
  interestRate: InterestSavingAccount;

  @OneToMany(() => SavingsAccount, sa => sa.type_savings_account) 
  savings_accounts: SavingsAccount[];
    /*@ManyToMany(() => DocumentType, documentType => documentType.typeAccounts)
  @JoinTable({
    name: 'type_savings_account_has_documenttype',
    joinColumn: { name: 'type_savings_account_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'DocumentType_id', referencedColumnName: 'id' }
  })
  documentTypes: DocumentType[];*/
}
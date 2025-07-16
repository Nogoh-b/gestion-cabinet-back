import { BaseEntity } from 'src/core/entities/base.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { Entity, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';












import { Commission } from '../../commission/entities/commission.entity';
import { InterestSavingAccount } from '../../interest-saving-account/entities/interest-saving-account.entity';
import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';






@Entity('type_savings_account')
export class TypeSavingsAccount extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 45 })
  name: string;

  @Column({ length: 45 })
  code: string;

  @Column({ type: 'double', nullable: true })
  promo_code_reduction: number;

  @Column({ type: 'double', nullable: true })
  promo_code_fee: number;

  @Column({ length: 45, nullable: true })
  periode: string;

  @Column({ type: 'tinyint' })
  status: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  interest_year_savings_account: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true})
  minimum_blocking_duration: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  account_opening_fee: number;

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

  @Column({ type: 'int', nullable: true })
  commission_id: number;

  @Column({ type: 'int' , nullable: true})
  interest_saving_account_id: number;

  @Column({ type: 'tinyint', default : 0 })
  canCreateOnline: number;

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

  @OneToMany(() => SavingsAccount, (sa) => sa.type_savings_account)
  savings_accounts: SavingsAccount[];
  /*@ManyToMany(() => DocumentType, documentType => documentType.typeAccounts)
  @JoinTable({
    name: 'type_savings_account_has_documenttype',
    joinColumn: { name: 'type_savings_account_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'DocumentType_id', referencedColumnName: 'id' }
  })
  documentTypes: DocumentType[];*/
}
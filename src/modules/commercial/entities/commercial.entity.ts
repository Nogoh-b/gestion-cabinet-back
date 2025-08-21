// src/partner/entities/partner.entity.ts
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import {
  Entity, Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  Index,
  BaseEntity,
  OneToMany,
  PrimaryColumn
} from 'typeorm';






@Entity('commercial')
export class Commercial extends BaseEntity {
   // @PrimaryGeneratedColumn()
    // id: number;
  
    @Column({ length: 100 })
    name: string; // Nom du partenaire
  
  
  
    @Index({ unique: true })
    @PrimaryColumn({ type: 'varchar', length: 50 }) // Modification ici (char → varchar)
    commercial_code: string;
  
    @Index({ unique: true }) 
    @Column()
    customer_id: number; // Lien unique vers le client

    @Column()
    saving_account_id: number; // Lien unique vers le client
  
    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;
  
    /*@ManyToOne(() => SavingsAccount)
    @JoinColumn({ name: 'saving_account_id' })
    saving_account: SavingsAccount;*/
  
    @OneToMany(
      () => TransactionSavingsAccount,
      tx => tx.partner
    )
    transactions?: TransactionSavingsAccount[];
    
    @Column({ type: 'tinyint', default: 1 })
    status: number; // Statut du partenaire (1=actif, 0=inactif)
  
    @CreateDateColumn()
    created_at: Date;
  
    @UpdateDateColumn()
    updated_at: Date;
  
    // @OneToMany(() => SavingsAccount, account => account.partner)
    // created_savings_accounts: SavingsAccount[];
  
    @BeforeInsert()
    async setIncrementalCode(): Promise<void> {
        // on récupère le max ou undefined
        const raw = await Commercial.createQueryBuilder('c')
        .select('MAX(c.commercial_code)', 'max')
        .getRawOne<{ max: string }>();

        // si raw est undefined ou raw.max falsy, on part de "00000"
        const lastCode = raw?.max ?? '00000';

        // incrément + pad à 5 chiffres
        const nextNumber = (parseInt(lastCode, 10) + 1)
        .toString()
        .padStart(5, '0');

        this.commercial_code = nextNumber;
}
}

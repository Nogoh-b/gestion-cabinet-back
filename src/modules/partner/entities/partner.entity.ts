// src/partner/entities/partner.entity.ts
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  BaseEntity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';









@Entity('partner')
export class Partner extends BaseEntity {
  /*@PrimaryGeneratedColumn()
  id: number;*/

  @Column({ length: 100 })
  name: string; // Nom du partenaire



  @Index({ unique: true })
  @PrimaryColumn({ type: 'varchar', length: 50 }) // Modification ici (char → varchar)
  promo_code: string;

  @Index({ unique: true }) 
  @Column()
  customer_id: number; // Lien unique vers le client

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => SavingsAccount)
  @JoinColumn({ name: 'saving_account_id' })
  saving_account: SavingsAccount;

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

  /*@BeforeInsert()
  async generateUniqueCode(): Promise<void> {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10; // Sécurité pour éviter une boucle infinie

    while (!isUnique && attempts < maxAttempts) {
      // Génération du code
      this.promo_code = Math.random().toString(36).substring(2, 6).toUpperCase();
      
      // Vérification de l'unicité
      const existingPartner = await Partner.findOne({ where: { promo_code: this.promo_code } });
      
      if (!existingPartner) {
        isUnique = true;
      }
      
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Impossible de générer un code unique après plusieurs tentatives');
    }
  }*/
}

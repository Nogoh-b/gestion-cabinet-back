// src/partner/entities/partner.entity.ts
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
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
  
    @OneToMany(() => SavingsAccount, account => account.partner)
    created_savings_accounts: SavingsAccount[];
  
    @BeforeInsert()
    async generateUniqueCode(): Promise<void> {
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 10;
        const digits = '0123456789'; // 10 chiffres possibles

        while (!isUnique && attempts < maxAttempts) {
            // Génération du code avec 6 chiffres uniquement
            this.commercial_code = Array.from({length: 6}, () => 
            digits.charAt(Math.floor(Math.random() * digits.length))
            ).join('');
            
            // Vérification de l'unicité
            const existingPartner = await Commercial.findOne({ where: { commercial_code: this.commercial_code } });
            
            if (!existingPartner) {
            isUnique = true;
            }
            
            attempts++;
        }

        if (!isUnique) {
            throw new Error('Impossible de générer un code unique après plusieurs tentatives');
        }
    }
}

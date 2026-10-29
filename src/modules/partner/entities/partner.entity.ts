// src/partner/entities/partner.entity.ts
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

@Entity('partner')
@BusinessTable({
  label: 'Partenaires',
  description:
    'Partenaires du cabinet : nom, code promo, client lié, statut (1=actif, 0=inactif).',
  category: 'client',
  readOnly: true,
})
export class Partner extends BaseEntity {
  /*@PrimaryGeneratedColumn()
  id: number;*/

  @Column({ length: 100 })
  @BusinessColumn({
    label: 'Nom du partenaire',
    description: 'Nom du partenaire',
    importance: 'critical',
  })
  name: string; // Nom du partenaire

  @Index({ unique: true })
  @PrimaryColumn({ type: 'varchar', length: 50 }) // Modification ici (char → varchar)
  @BusinessColumn({
    label: 'Code promo',
    description: 'Code promotionnel du partenaire',
  })
  promo_code: string;

  @Index({ unique: true })
  @Column()
  @BusinessColumn({ label: 'Client', description: 'Client lié (customer.id)' })
  customer_id: number; // Lien unique vers le client

  @Column()
  @BusinessColumn({
    label: 'Compte',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  saving_account_id: number; // Lien unique vers le client

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'tinyint', default: 1 })
  @BusinessColumn({ label: 'Statut', description: '1=Actif, 0=Inactif' })
  status: number; // Statut du partenaire (1=actif, 0=inactif)

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity

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

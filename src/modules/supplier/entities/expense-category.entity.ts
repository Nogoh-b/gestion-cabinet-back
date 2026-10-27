import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';

@Entity('expense_category')
@Index('UQ_expense_category_tenant_code', ['tenant_id', 'code'], {
  unique: true,
})
@BusinessTable({
  label: 'Catégories de dépenses',
  description:
    'Liste des catégories utilisables dans les lignes de dépenses, gérable par le cabinet.',
  icon: '🏷️',
  category: 'rh',
})
export class ExpenseCategoryEntity extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la catégorie',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 80, name: 'code' })
  @BusinessColumn({
    label: 'Code',
    description: 'Code technique stable (slug), unique par cabinet',
    example: 'transport',
    importance: 'high',
    group: 'identification',
  })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Nom affiché dans les formulaires',
    example: 'Transport',
    importance: 'high',
    group: 'identification',
  })
  label: string;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  @BusinessColumn({
    label: 'Actif',
    description: 'BD: 1=Actif, 0=Inactif.',
    importance: 'medium',
    group: 'statut',
  })
  is_active: boolean;
}

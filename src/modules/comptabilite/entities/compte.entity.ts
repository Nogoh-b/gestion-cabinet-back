import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { ClasseCompte, TypeCompte } from '../enums/comptabilite.enums';
import { LigneEcriture } from './ligne-ecriture.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('comptes_comptables')
@BusinessTable({
  label: 'Comptes comptables',
  description: 'Plan comptable du cabinet (SYSCOHADA). Chaque compte a un numéro, un libellé et une classe (1 à 8) et sert à enregistrer les écritures comptables (débit/crédit).',
  icon: '📒',
  category: 'finance',
})
export class CompteComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du compte',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ length: 10 })
  @BusinessColumn({
    label: 'Numéro de compte',
    description: 'Numéro du compte selon le plan comptable SYSCOHADA',
    example: '411000, 601000, 521000',
    importance: 'critical',
    group: 'identification',
  })
  numero: string;

  @Column({ length: 255 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Nom/intitulé du compte',
    example: 'Clients, Achats de marchandises, Banque',
    importance: 'critical',
    group: 'identification',
  })
  libelle: string;

  @Column({ type: 'enum', enum: TypeCompte })
  @BusinessColumn({
    label: 'Type de compte',
    description: 'ACTIF, PASSIF, CHARGE ou PRODUIT',
    importance: 'high',
    group: 'classification',
  })
  typeCompte: TypeCompte;

  @Column({ type: 'int' })
  @BusinessColumn({
    label: 'Classe',
    description: 'Classe comptable SYSCOHADA (1 à 8)',
    example: '4 = comptes de tiers, 6 = charges, 7 = produits',
    importance: 'high',
    group: 'classification',
  })
  classe: ClasseCompte;

  @Column({ default: true })
  @BusinessColumn({
    label: 'Actif',
    description: 'Indique si le compte est encore utilisable',
    importance: 'medium',
    group: 'état',
  })
  actif: boolean;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description complémentaire du compte',
    importance: 'low',
    group: 'contenu',
  })
  description: string;

  @OneToMany(() => LigneEcriture, l => l.compte)
  lignes: LigneEcriture[];
}

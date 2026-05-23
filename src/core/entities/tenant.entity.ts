import { Column, Index, BeforeInsert } from 'typeorm';
import { BaseEntity } from './baseEntity';
import { getCurrentTenantId, hasActiveTenant } from '../tenant/tenant.context';

/**
 * Classe de base pour toutes les entités métier multi-tenant.
 * Étend BaseEntity (created_at, updated_at, deleted_at) et ajoute tenant_id.
 *
 * Usage — changer 1 mot sur chaque entité métier :
 *
 *   // AVANT
 *   export class Dossier extends BaseEntity { ... }
 *
 *   // APRÈS
 *   export class Dossier extends TenantEntity { ... }
 *
 * Avec synchronize:true, TypeORM ajoute automatiquement la colonne tenant_id.
 * default: 1 → les lignes existantes reçoivent tenant_id=1 sans risque de perte.
 *
 * Entités à NE PAS migrer (données globales partagées entre cabinets) :
 *   - UserRole, Permission, RolePermission, UserRoleAssignment
 *   - Geography (pays, régions, villes)
 */
export abstract class TenantEntity extends BaseEntity {
  @Column({ name: 'tenant_id', default: 1 })
  @Index()
  tenant_id: number;

  /**
   * Injecte automatiquement le tenant_id du contexte courant avant chaque INSERT.
   * Évite que les services aient à le setter manuellement.
   * Sans contexte actif (script, migration) → laisse la valeur existante ou le default DB.
   */
  @BeforeInsert()
  protected _injectTenantId(): void {
    if (hasActiveTenant()) {
      this.tenant_id = getCurrentTenantId();
    }
  }
}

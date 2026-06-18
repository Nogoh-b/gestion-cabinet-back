import 'reflect-metadata';


export const SHARED_TENANT_KEY = 'shared:tenant';

/**
 * Marque une entité multi-tenant comme **partagée** entre tous les cabinets.
 *
 * - **SANS** ce décorateur → isolation stricte : `WHERE tenant_id = X`
 *   (le cabinet ne voit que ses propres données).
 * - **AVEC** ce décorateur → données partagées : `WHERE tenant_id IN (1, X)`
 *   (le cabinet voit les données globales tenant_id=1 + ses propres données).
 *
 * Usage :
 * ```typescript
 * @SharedAcrossTenants()
 * @Entity('document_category')
 * export class DocumentCategory extends TenantEntity { ... }
 * ```
 */
export function SharedAcrossTenants(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SHARED_TENANT_KEY, true, target);
  };
}

/**
 * Vérifie si une classe d'entité est marquée comme partagée entre tous les cabinets.
 * Utilisé par TenantRepositoryPatch pour adapter le filtre tenant_id.
 *
 * @param target Constructeur de la classe (Function)
 * @returns true si l'entité est décorée @SharedAcrossTenants()
 */
export function isSharedEntity(target: Function): boolean {
  return !!Reflect.getMetadata(SHARED_TENANT_KEY, target);
}

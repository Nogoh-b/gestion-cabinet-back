import { Injectable, Scope } from '@nestjs/common';
import { RequestContext } from 'cls-hooked';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private static readonly TENANT_KEY = 'CURRENT_TENANT_ID';

  setTenantId(tenantId: number): void {
    const context = RequestContext.getNamespace();
    if (context.active) {
      context.set(TenantContext.TENANT_KEY, tenantId);
    }
  }

  getTenantId(): number | undefined {
    const context = RequestContext.getNamespace();
    if (!context.active) return undefined;
    return context.get(TenantContext.TENANT_KEY);
  }

  getCurrentTenant(): { tenantId: number } | null {
    const id = this.getTenantId();
    return id ? { tenantId: id } : null;
  }

  /**
   * Vérifie si l'utilisateur actuel est un admin (peut voir tous les tenants)
   */
  isAdmin(): boolean {
    const context = RequestContext.getNamespace();
    if (!context.active) return false;
    return context.get('IS_ADMIN') === true;
  }

  setIsAdmin(isAdmin: boolean): void {
    const context = RequestContext.getNamespace();
    if (context.active) {
      context.set('IS_ADMIN', isAdmin);
    }
  }
}

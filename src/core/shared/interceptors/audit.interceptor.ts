import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PERMISSIONS_KEY } from 'src/core/decorators/permissions.decorator';
import { ActivitiesUserService } from 'src/modules/iam/activities-user/activities-user.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP = [/\/auth\/refresh/i];
const AUDITABLE_READ = /\/(?:download|export|stream|base64|pdf)(?:\/|\?|$)/i;

const RESOURCE_META: Record<string, { object: string; route?: string }> = {
  auth: { object: 'la session' },
  user: { object: 'le membre', route: '/gestion-cabinet/employees' },
  users: { object: 'le membre', route: '/gestion-cabinet/employees' },
  customer: { object: 'le client', route: '/clients' },
  clients: { object: 'le client', route: '/clients' },
  dossiers: { object: 'le dossier', route: '/dossiers' },
  documents: { object: 'le document', route: '/documents' },
  audiences: { object: 'l’audience', route: '/audiences' },
  diligence: { object: 'la diligence', route: '/dossiers/diligences' },
  diligences: { object: 'la diligence', route: '/dossiers/diligences' },
  factures: { object: 'la facture', route: '/facturation/factures' },
  jurisdictions: { object: 'la juridiction', route: '/dossiers/juridiction' },
  suppliers: { object: 'le fournisseur', route: '/suppliers' },
  'supplier-invoices': { object: 'la facture fournisseur', route: '/supplier-invoices' },
  'expense-reports': { object: 'la note de frais', route: '/expense-reports' },
  referrers: { object: 'l’apporteur', route: '/referrers' },
};

const FIELD_LABELS: Record<string, string> = {
  first_name: 'prénom',
  last_name: 'nom',
  email: 'adresse e-mail',
  phone_number: 'téléphone',
  professional_phone: 'téléphone professionnel',
  professional_address: 'adresse professionnelle',
  position: 'fonction',
  status: 'statut',
  role: 'rôle',
  branch_id: 'agence',
  title: 'titre',
  object: 'objet',
  description: 'description',
  type: 'type',
  priority: 'priorité',
  start_date: 'date de début',
  deadline: 'échéance',
  assigned_lawyer_id: 'responsable',
  client_id: 'client',
  lawyer_id: 'avocat responsable',
  amount: 'montant',
  total: 'montant total',
  due_date: 'date d’échéance',
  name: 'nom',
};

/** Journalise les mutations réussies et échouées avec la décision d'accès. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: ActivitiesUserService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const method = String(req?.method ?? '').toUpperCase();
    const userId: number | undefined = req?.user?.userId ?? req?.user?.id;
    const path: string = req?.originalUrl ?? req?.url ?? req?.path ?? '';
    const auditable = MUTATING.has(method) || (method === 'GET' && AUDITABLE_READ.test(path));
    if (!auditable || !userId || SKIP.some((re) => re.test(path))) {
      return next.handle();
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const grantedPermissions: string[] = Array.isArray(req?.user?.permissions)
      ? req.user.permissions
      : [];
    const authorizationResult = requiredPermissions.length
      ? ('allowed' as const)
      : ('not_required' as const);

    return next.handle().pipe(
      tap({
        next: (body) => {
          const res = ctx.switchToHttp().getResponse();
          const action = this.actionFor(method, path);
          const resource = this.resourceOf(path);
          const resourceId = this.resourceIdOf(req, body);
          const resourceName = this.resourceNameOf(req, body, res);
          const resourceUrl = this.resourceUrlFor(resource, resourceId, path);
          const details = this.detailsOf(req, resourceName);
          void this.audit.record({
            tenantId: req?.user?.tenantId ?? req?.user?._resolvedTenantId,
            userId,
            action,
            resource,
            resourceId: resourceId != null ? String(resourceId) : null,
            resourceName,
            resourceUrl,
            details,
            method,
            path: path.slice(0, 255),
            statusCode: res?.statusCode ?? null,
            ip: this.ipOf(req),
            summary: this.summaryFor(action, resource, resourceName, true),
            authorizationResult,
            requiredPermissions,
            grantedPermissions,
            riskLevel: this.riskFor(method, path, res?.statusCode ?? 200),
          });
        },
        error: (error: any) => {
          const statusCode = Number(error?.status ?? error?.statusCode ?? 500);
          const action = this.actionFor(method, path);
          const resource = this.resourceOf(path);
          const resourceId = this.resourceIdOf(req, null);
          const resourceName = this.resourceNameOf(req, null, null);
          void this.audit.record({
            tenantId: req?.user?.tenantId ?? req?.user?._resolvedTenantId,
            userId,
            action,
            resource,
            resourceId: resourceId != null ? String(resourceId) : null,
            resourceName,
            resourceUrl: this.resourceUrlFor(resource, resourceId, path),
            details: this.detailsOf(req, resourceName),
            method,
            path: path.slice(0, 255),
            statusCode,
            ip: this.ipOf(req),
            summary: this.summaryFor(action, resource, resourceName, false),
            authorizationResult,
            requiredPermissions,
            grantedPermissions,
            riskLevel: statusCode >= 500 ? 'critical' : 'medium',
            errorMessage: String(error?.message ?? 'Opération échouée'),
          });
        },
      }),
    );
  }

  private actionFor(method: string, path = ''): string {
    if (/\/auth\/login/i.test(path)) return 'login';
    if (/\/logout/i.test(path)) return 'logout';
    if (/\/unblock(?:\?|$)/i.test(path)) return 'unblock';
    if (/\/block(?:\?|$)/i.test(path)) return 'block';
    if (method === 'GET' && AUDITABLE_READ.test(path)) return 'download';
    if (method === 'POST') return 'create';
    if (method === 'DELETE') return 'delete';
    return 'update';
  }

  private summaryFor(
    action: string,
    resource: string | null,
    resourceName: string | null,
    success: boolean,
  ): string {
    const object = RESOURCE_META[resource ?? '']?.object ?? 'l’élément';
    const namedObject = resourceName ? `${object} « ${resourceName} »` : object;
    const labels: Record<string, string> = {
      login: 'S’est connecté au cabinet',
      logout: 'S’est déconnecté du cabinet',
      create: `A créé ${namedObject}`,
      update: `A modifié ${namedObject}`,
      delete: `A supprimé ${namedObject}`,
      download: `A téléchargé ${namedObject}`,
      block: `A bloqué ${namedObject}`,
      unblock: `A réactivé ${namedObject}`,
      access_denied: `A tenté d’accéder à ${namedObject}`,
    };
    const summary = labels[action] ?? `A effectué une action sur ${namedObject}`;
    return success ? summary : `Échec : ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
  }

  private riskFor(
    method: string,
    path: string,
    statusCode: number,
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400) return 'medium';
    if (method === 'DELETE' || /\/(?:block|unblock)(?:\?|$)/i.test(path)) {
      return 'high';
    }
    return 'none';
  }

  private resourceOf(path: string): string | null {
    const seg = path.split('?')[0].split('/').filter(Boolean);
    if (!seg.length) return null;
    const resource = seg[0] === 'api' && seg[1]
      ? seg[1]
      : seg[0] === 't' && seg.length > 2
        ? seg[2]
        : seg[0];
    if (resource === 'activities-user' && seg.includes('members')) return 'user';
    return resource;
  }

  private resourceIdOf(req: any, body: any): string | number | null {
    const value = body?.data ?? body;
    return (
      req?.params?.id ??
      req?.params?.userId ??
      req?.params?.documentId ??
      value?.id ??
      value?.employee?.id ??
      value?.user?.id ??
      null
    );
  }

  private resourceNameOf(req: any, body: any, res: any): string | null {
    const disposition = String(res?.getHeader?.('content-disposition') ?? '');
    const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (filenameMatch) {
      try {
        return decodeURIComponent(filenameMatch[1] ?? filenameMatch[2]).slice(0, 255);
      } catch {
        return String(filenameMatch[1] ?? filenameMatch[2]).slice(0, 255);
      }
    }

    const root = body?.data ?? body;
    const candidates = [
      root,
      root?.user,
      root?.employee,
      root?.customer,
      root?.dossier,
      root?.document,
      req?.body,
    ].filter((candidate) => candidate && typeof candidate === 'object');

    for (const candidate of candidates) {
      const fullName = [candidate.first_name, candidate.last_name]
        .filter((part) => typeof part === 'string' && part.trim())
        .join(' ')
        .trim();
      if (fullName) return fullName.slice(0, 255);
      for (const key of [
        'title',
        'name',
        'full_name',
        'object',
        'filename',
        'file_name',
        'original_name',
        'dossier_number',
        'numero',
        'number',
        'email',
      ]) {
        const value = candidate[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim().slice(0, 255);
        }
      }
    }
    return null;
  }

  private resourceUrlFor(
    resource: string | null,
    resourceId: string | number | null,
    path: string,
  ): string | null {
    if (!resourceId) return null;
    const meta = RESOURCE_META[resource ?? ''];
    if (!meta?.route) return null;
    if (resource === 'documents' && /\/download(?:\/|\?|$)/i.test(path)) {
      return `${meta.route}/${encodeURIComponent(String(resourceId))}`;
    }
    return `${meta.route}/${encodeURIComponent(String(resourceId))}`;
  }

  private detailsOf(req: any, resourceName: string | null): Record<string, unknown> | null {
    const body = req?.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return resourceName ? { resource_name: resourceName } : null;
    }
    const changedFields = Object.keys(body)
      .filter((key) => FIELD_LABELS[key])
      .map((key) => FIELD_LABELS[key]);
    const uniqueFields = Array.from(new Set(changedFields));
    if (!resourceName && uniqueFields.length === 0) return null;
    return {
      ...(resourceName ? { resource_name: resourceName } : {}),
      ...(uniqueFields.length ? { changed_fields: uniqueFields } : {}),
    };
  }

  private ipOf(req: any): string | null {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) {
      return forwarded.split(',')[0].trim().slice(0, 64);
    }
    return (
      (req?.ip ?? req?.socket?.remoteAddress ?? null)
        ?.toString()
        .slice(0, 64) ?? null
    );
  }
}

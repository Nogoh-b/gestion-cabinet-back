import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from 'src/core/shared/utils/secret-cipher';
import {
  PaymentMethod,
  PaymentMethodKind,
  PaymentMode,
  PaymentProviderCode,
} from './entities/payment-method.entity';
import { ProviderContext } from './payment-provider.interface';
import { isPaymentTestEnabled } from './payment-test-mode';

export const PAYMENT_SECRET_ENV = 'PAYMENT_CONFIG_ENCRYPTION_KEY';

/** Secrets attendus par passerelle (et ceux obligatoires pour l'activer). */
export const PROVIDER_SECRET_FIELDS: Record<
  Exclude<PaymentProviderCode, 'test'>,
  { fields: { key: string; label: string }[]; required: string[] }
> = {
  cinetpay: {
    fields: [
      { key: 'apikey', label: 'Clé API (apikey)' },
      { key: 'site_id', label: 'Identifiant du site (site_id)' },
      { key: 'secret_key', label: 'Clé secrète (signature des notifications)' },
    ],
    required: ['apikey', 'site_id'],
  },
  notchpay: {
    fields: [
      { key: 'public_key', label: 'Clé publique' },
      { key: 'private_key', label: 'Clé privée (X-Grant, facultative)' },
      { key: 'webhook_hash', label: 'Clé de hachage des webhooks' },
    ],
    required: ['public_key'],
  },
  stripe: {
    fields: [
      { key: 'secret_key', label: 'Clé secrète (sk_…)' },
      { key: 'webhook_secret', label: 'Secret de webhook (whsec_…)' },
    ],
    required: ['secret_key', 'webhook_secret'],
  },
};

const PROVIDERS: PaymentProviderCode[] = ['cinetpay', 'notchpay', 'stripe'];

/** Moyen « test » virtuel, proposé uniquement hors production. */
export const TEST_METHOD_CODE = 'test';

export interface PaymentMethodInput {
  code?: string;
  label?: string;
  kind?: PaymentMethodKind;
  provider?: PaymentProviderCode | null;
  mode?: PaymentMode;
  public_config?: Record<string, any> | null;
  currencies?: string[] | null;
  fee_percent?: number;
  fee_fixed?: number;
  min_amount?: number;
  sort_order?: number;
  /** Secrets en clair ; `''` ou valeur masquée = inchangé ; `null` = effacé. */
  secrets?: Record<string, string | null>;
}

/** Vue publique d'un moyen (côté cabinet) : jamais de secret. */
export interface PublicPaymentMethod {
  code: string;
  label: string;
  kind: PaymentMethodKind;
  provider: PaymentProviderCode | null;
  public_config: Record<string, any>;
  currencies: string[];
  min_amount: number;
}

/**
 * URL publique du front (retours de paiement, liens d'emails) :
 * APP_FRONTEND_URL, sinon FRONTEND_URL, sinon la première origine CORS.
 */
export function frontendPublicUrl(): string {
  const candidate =
    process.env.APP_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    String(process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .find((o) => /^https?:\/\//.test(o)) ||
    '';
  return candidate.trim().replace(/\/+$/, '');
}

export function apiPublicUrl(): string {
  return String(
    process.env.API_PUBLIC_URL || `http://localhost:${String(process.env.PORT || '3004').trim()}`,
  ).replace(/\/+$/, '');
}

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly repo: Repository<PaymentMethod>,
  ) {}

  // ── Lecture ────────────────────────────────────────────────────────────────

  async listForPlatform() {
    const rows = await this.repo
      .createQueryBuilder('m')
      .addSelect('m.secret_config')
      .orderBy('m.sort_order', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .getMany();
    return rows.map((m) => this.toPlatformView(m));
  }

  async findForPlatform(id: number) {
    return this.toPlatformView(await this.loadWithSecrets(id));
  }

  /** Moyens actifs proposés au cabinet pour une devise donnée. */
  async listActiveForCabinet(currency = 'XAF'): Promise<PublicPaymentMethod[]> {
    const rows = await this.repo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    const list: PublicPaymentMethod[] = rows
      .filter((m) => !m.currencies?.length || m.currencies.includes(currency))
      .map((m) => this.toPublic(m));
    if (isPaymentTestEnabled()) {
      list.push({
        code: TEST_METHOD_CODE,
        label: 'Paiement de test (simulation)',
        kind: 'gateway',
        provider: 'test',
        public_config: { instructions: 'Environnement de développement : aucun encaissement réel.' },
        currencies: [currency],
        min_amount: 0,
      });
    }
    return list;
  }

  /** Moyen utilisable pour un paiement (actif, ou `test` hors production). */
  async resolveForPayment(code: string): Promise<PaymentMethod> {
    if (code === TEST_METHOD_CODE) {
      if (!isPaymentTestEnabled()) {
        throw new BadRequestException('Paiement de test indisponible.');
      }
      return Object.assign(new PaymentMethod(), {
        id: null as any,
        code: TEST_METHOD_CODE,
        label: 'Paiement de test',
        kind: 'gateway',
        provider: 'test',
        mode: 'sandbox',
        is_active: true,
        public_config: {},
        currencies: null,
        fee_percent: 0,
        fee_fixed: 0,
        min_amount: 0,
        sort_order: 999,
      } as Partial<PaymentMethod>);
    }
    const method = await this.repo.findOne({ where: { code, is_active: true } });
    if (!method) throw new BadRequestException('Moyen de paiement indisponible.');
    return method;
  }

  /** Moyen d'une passerelle (actif ou non : un paiement en cours doit aboutir). */
  async findByProvider(provider: PaymentProviderCode): Promise<PaymentMethod | null> {
    const rows = await this.repo.find({
      where: { provider },
      order: { is_active: 'DESC', id: 'ASC' },
    });
    return rows[0] ?? null;
  }

  async findById(id: number | null | undefined): Promise<PaymentMethod | null> {
    if (!id) return null;
    return this.repo.findOne({ where: { id } });
  }

  /** Contexte passerelle : secrets déchiffrés + configuration publique. */
  async contextFor(method: PaymentMethod): Promise<ProviderContext> {
    let secrets: Record<string, string> = {};
    if (method.id) {
      const row = await this.repo
        .createQueryBuilder('m')
        .addSelect('m.secret_config')
        .where('m.id = :id', { id: method.id })
        .getOne();
      secrets = this.readSecrets(row?.secret_config ?? null);
    }
    return {
      methodCode: method.code,
      mode: method.mode,
      secrets,
      publicConfig: method.public_config ?? {},
    };
  }

  /** Frais estimés pour un montant (pourcentage + fixe). */
  feeFor(method: PaymentMethod | null, amount: number): number {
    if (!method) return 0;
    const fee =
      (Number(amount) * Number(method.fee_percent ?? 0)) / 100 + Number(method.fee_fixed ?? 0);
    return Math.round(fee * 100) / 100;
  }

  // ── Écriture (plateforme) ──────────────────────────────────────────────────

  async create(input: PaymentMethodInput) {
    const code = String(input.code ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(code) || code === TEST_METHOD_CODE) {
      throw new BadRequestException('Code invalide (2 à 40 caractères a-z, 0-9, _).');
    }
    if (await this.repo.findOne({ where: { code } })) {
      throw new ConflictException('Un moyen de paiement utilise déjà ce code.');
    }
    const kind = input.kind ?? 'manual';
    const provider = kind === 'gateway' ? input.provider ?? null : null;
    if (kind === 'gateway' && (!provider || !PROVIDERS.includes(provider))) {
      throw new BadRequestException('Passerelle inconnue (cinetpay, notchpay ou stripe).');
    }
    const method = this.repo.create({
      code,
      label: String(input.label ?? code).slice(0, 100),
      kind,
      provider,
      mode: input.mode ?? 'sandbox',
      is_active: false,
      public_config: input.public_config ?? {},
      currencies: this.cleanCurrencies(input.currencies),
      fee_percent: Number(input.fee_percent ?? 0),
      fee_fixed: Number(input.fee_fixed ?? 0),
      min_amount: Number(input.min_amount ?? 0),
      sort_order: Number(input.sort_order ?? 100),
      secret_config: this.writeSecrets({}, input.secrets, provider),
    });
    const saved = await this.repo.save(method);
    return this.findForPlatform(saved.id);
  }

  async update(id: number, input: PaymentMethodInput) {
    const method = await this.loadWithSecrets(id);
    const before = this.toPlatformView(method);
    if (input.label !== undefined) method.label = String(input.label).slice(0, 100);
    if (input.mode !== undefined) method.mode = input.mode;
    if (input.public_config !== undefined) method.public_config = input.public_config ?? {};
    if (input.currencies !== undefined) method.currencies = this.cleanCurrencies(input.currencies);
    if (input.fee_percent !== undefined) method.fee_percent = Number(input.fee_percent);
    if (input.fee_fixed !== undefined) method.fee_fixed = Number(input.fee_fixed);
    if (input.min_amount !== undefined) method.min_amount = Number(input.min_amount);
    if (input.sort_order !== undefined) method.sort_order = Number(input.sort_order);
    if (input.secrets) {
      method.secret_config = this.writeSecrets(
        this.readSecrets(method.secret_config),
        input.secrets,
        method.provider,
      );
    }
    if (method.is_active) this.assertActivable(method);
    await this.repo.save(method);
    return { before, after: await this.findForPlatform(id) };
  }

  async setActive(id: number, active: boolean) {
    const method = await this.loadWithSecrets(id);
    if (active) this.assertActivable(method);
    method.is_active = active;
    await this.repo.save(method);
    return this.findForPlatform(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async loadWithSecrets(id: number): Promise<PaymentMethod> {
    const method = await this.repo
      .createQueryBuilder('m')
      .addSelect('m.secret_config')
      .where('m.id = :id', { id })
      .getOne();
    if (!method) throw new NotFoundException('Moyen de paiement introuvable.');
    return method;
  }

  private assertActivable(method: PaymentMethod) {
    if (method.kind !== 'gateway' || !method.provider || method.provider === 'test') return;
    const spec = PROVIDER_SECRET_FIELDS[method.provider];
    const secrets = this.readSecrets(method.secret_config);
    const missing = spec.required.filter((k) => !secrets[k]);
    if (missing.length) {
      throw new BadRequestException(
        `Configuration incomplète pour activer ${method.label} : ${missing.join(', ')}.`,
      );
    }
  }

  private readSecrets(stored: string | null): Record<string, string> {
    if (!stored) return {};
    try {
      return JSON.parse(decryptSecret(stored, PAYMENT_SECRET_ENV)) ?? {};
    } catch {
      return {};
    }
  }

  private writeSecrets(
    current: Record<string, string>,
    patch: Record<string, string | null> | undefined,
    provider: PaymentProviderCode | null,
  ): string | null {
    const allowed =
      provider && provider !== 'test'
        ? PROVIDER_SECRET_FIELDS[provider].fields.map((f) => f.key)
        : [];
    const next = { ...current };
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!allowed.includes(key)) continue;
      if (value === null) {
        delete next[key];
      } else if (typeof value === 'string' && value.trim() && !value.startsWith('••••')) {
        next[key] = value.trim();
      }
    }
    if (!Object.keys(next).length) return null;
    return encryptSecret(JSON.stringify(next), PAYMENT_SECRET_ENV);
  }

  private cleanCurrencies(list: string[] | null | undefined): string[] {
    const values = (list ?? ['XAF'])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => /^[A-Z]{3}$/.test(c));
    return values.length ? [...new Set(values)] : ['XAF'];
  }

  private toPublic(m: PaymentMethod): PublicPaymentMethod {
    return {
      code: m.code,
      label: m.label,
      kind: m.kind,
      provider: m.provider,
      public_config: m.public_config ?? {},
      currencies: m.currencies ?? ['XAF'],
      min_amount: Number(m.min_amount ?? 0),
    };
  }

  private toPlatformView(m: PaymentMethod) {
    const secrets = this.readSecrets(m.secret_config ?? null);
    const spec =
      m.provider && m.provider !== 'test' ? PROVIDER_SECRET_FIELDS[m.provider] : null;
    const { secret_config: _omit, ...rest } = m as any;
    return {
      ...rest,
      fee_percent: Number(m.fee_percent ?? 0),
      fee_fixed: Number(m.fee_fixed ?? 0),
      min_amount: Number(m.min_amount ?? 0),
      secret_fields: (spec?.fields ?? []).map((f) => ({
        ...f,
        required: spec?.required.includes(f.key) ?? false,
        configured: !!secrets[f.key],
        masked: maskSecret(secrets[f.key]),
      })),
      webhook_url: m.provider ? `${apiPublicUrl()}/payments/webhooks/${m.provider}` : null,
      return_url: m.provider ? `${apiPublicUrl()}/payments/return/${m.provider}` : null,
    };
  }
}

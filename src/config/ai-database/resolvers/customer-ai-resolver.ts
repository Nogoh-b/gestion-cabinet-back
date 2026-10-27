import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  ResolveResult,
  ResolveConfig,
} from 'src/core/ai-database/write/entity-resolver.service';
import {
  MATCH_TIER_RANK,
  pickDeterministic,
  searchWords,
} from 'src/core/ai-database/write/exact-match';
import { SpecializedEntityResolver } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';

/** Champs qui identifient un client (nom, raison sociale, code, e-mail, téléphone). */
const IDENTITY_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'company_name',
  'email',
  'customer_code',
  'reference',
  'number_phone_1',
] as const;

function identityTexts(c: Partial<Customer>): unknown[] {
  const texts: unknown[] = IDENTITY_FIELDS.map((field) => (c as any)[field]);
  if (c.first_name && c.last_name) {
    texts.push(`${c.first_name} ${c.last_name}`, `${c.last_name} ${c.first_name}`);
  }
  return texts;
}

function customerLabel(c: Partial<Customer>): string {
  const name =
    c.full_name ||
    `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() ||
    c.company_name ||
    c.email ||
    `#${c.id}`;
  const extra = [c.customer_code, c.email && c.email !== name ? c.email : null].filter(Boolean);
  return [name, ...extra].join(' · ').slice(0, 80);
}

/**
 * Client désigné par un texte, SANS score : le client (propriétaire juridique
 * du dossier) n'est retenu que si le texte correspond exactement (nom complet
 * dans un sens ou l'autre, raison sociale, code, e-mail) ou si tous ses mots
 * figurent dans un seul client. Sinon les clients proches sont proposés.
 */
@Injectable()
export class CustomerAiResolver implements SpecializedEntityResolver {
  readonly tables = ['customer', 'customers'];

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async resolve(
    input: string,
    _config?: ResolveConfig,
  ): Promise<ResolveResult<any>> {
    const words = searchWords(input);
    const rows = await this.findContaining(words.slice(0, 1), 200);
    let pick = pickDeterministic(input, rows, identityTexts);
    if (!pick.best && !pick.ambiguous && words.length > 1) {
      // Rien de sûr : élargir aux autres mots, seulement pour proposer.
      const more = await this.findContaining(words, 30);
      const known = new Set(rows.map((r) => r.id));
      pick = pickDeterministic(input, [...rows, ...more.filter((r) => !known.has(r.id))], identityTexts);
    }

    const candidates = pick.matches.slice(0, 10).map((m) => ({
      entity: m.entity,
      score: MATCH_TIER_RANK[m.tier],
      matchedOn: customerLabel(m.entity),
    }));
    if (pick.best) {
      return {
        found: true,
        best: pick.best,
        score: MATCH_TIER_RANK[pick.bestTier ?? 'exact'],
        matchedOn: customerLabel(pick.best),
        candidates,
        ambiguous: false,
      };
    }
    return {
      found: false,
      best: null,
      score: 0,
      matchedOn: '',
      candidates,
      ambiguous: pick.ambiguous,
    };
  }

  /** Clients dont un champ identifiant contient l'un des mots (cabinet courant via le patch tenant). */
  private async findContaining(words: string[], take: number): Promise<Customer[]> {
    const usable = words.filter((w) => w.length >= 2);
    if (!usable.length) return [];
    return this.customerRepo.find({
      where: IDENTITY_FIELDS.flatMap((field) =>
        usable.map((word) => ({ [field]: ILike(`%${word}%`) }) as any),
      ),
      take,
    });
  }
}

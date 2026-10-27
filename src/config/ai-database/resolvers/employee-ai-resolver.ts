import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
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
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';

/** Nom, prénom, nom complet et e-mail du compte lié (employee n'a pas de nom propre). */
function identityTexts(e: Employee): unknown[] {
  const user = (e as any).user ?? {};
  const texts: unknown[] = [user.full_name, user.first_name, user.last_name, user.email, user.username];
  if (user.first_name && user.last_name) {
    texts.push(`${user.first_name} ${user.last_name}`, `${user.last_name} ${user.first_name}`);
  }
  return texts;
}

function employeeLabel(e: Employee): string {
  const user = (e as any).user ?? {};
  const name =
    user.full_name || `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email || `#${e.id}`;
  return [name, e.specialization].filter(Boolean).join(' · ').slice(0, 80);
}

/**
 * Collaborateur désigné par un texte, SANS score : retenu seulement si le
 * texte est son nom complet (dans un sens ou l'autre), son e-mail, ou si tous
 * ses mots figurent dans un seul collaborateur. Sinon proposés au choix.
 */
@Injectable()
export class EmployeeAiResolver implements SpecializedEntityResolver {
  private readonly logger = new Logger(EmployeeAiResolver.name);
  readonly tables = ['employee', 'employees'];

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async resolve(
    input: string,
    _config?: ResolveConfig,
  ): Promise<ResolveResult<any>> {
    const words = searchWords(input);
    const rows = await this.findContaining(words.slice(0, 1), 200);
    let pick = pickDeterministic(input, rows, identityTexts);
    if (!pick.best && !pick.ambiguous && words.length > 1) {
      const more = await this.findContaining(words, 30);
      const known = new Set(rows.map((r) => r.id));
      pick = pickDeterministic(input, [...rows, ...more.filter((r) => !known.has(r.id))], identityTexts);
    }

    this.logger.log(
      `🔍 Collaborateur « ${input} » : ${
        pick.best ? `#${pick.best.id} (${pick.bestTier})` : pick.ambiguous ? `${pick.matches.length} possibles` : 'aucune correspondance exacte'
      }`,
    );

    const candidates = pick.matches.slice(0, 10).map((m) => ({
      entity: m.entity,
      score: MATCH_TIER_RANK[m.tier],
      matchedOn: employeeLabel(m.entity),
    }));
    if (pick.best) {
      return {
        found: true,
        best: pick.best,
        score: MATCH_TIER_RANK[pick.bestTier ?? 'exact'],
        matchedOn: employeeLabel(pick.best),
        candidates,
        ambiguous: false,
      };
    }
    return { found: false, best: null, score: 0, matchedOn: '', candidates, ambiguous: pick.ambiguous };
  }

  /** Collaborateurs du cabinet dont le compte contient l'un des mots. */
  private async findContaining(words: string[], take: number): Promise<Employee[]> {
    const usable = words.filter((w) => w.length >= 2);
    if (!usable.length) return [];
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'u')
      .where(
        new Brackets((or) => {
          usable.forEach((word, i) => {
            for (const column of ['u.full_name', 'u.first_name', 'u.last_name', 'u.email']) {
              or.orWhere(`LOWER(${column}) LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
            }
          });
        }),
      )
      .take(take);
    return addTenantCondition(qb, 'e').getMany();
  }
}

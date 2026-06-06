import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import {
  ResolveResult,
  ResolveMatch,
  ResolveConfig,
} from 'src/core/ai-database/write/entity-resolver.service';
import { SpecializedEntityResolver } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;
  const tokensA = new Set(na.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(nb.split(' ').filter(t => t.length > 1));
  const common = [...tokensA].filter(t => tokensB.has(t)).length;
  const tokenScore = common / Math.max(tokensA.size, tokensB.size, 1);
  const bigrams = (s: string) => {
    const r: string[] = [];
    for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2));
    return r;
  };
  const bA = bigrams(na);
  const bB = bigrams(nb);
  const bi = bA.filter(bg => bB.includes(bg)).length;
  const bigramScore = (2 * bi) / (bA.length + bB.length || 1);
  return Math.round(Math.max(tokenScore, bigramScore) * 80);
}

@Injectable()
export class EmployeeAiResolver implements SpecializedEntityResolver {
  private readonly logger = new Logger(EmployeeAiResolver.name);
  readonly tables = ['employee', 'employees'];

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async resolve(input: string, config?: ResolveConfig): Promise<ResolveResult<any>> {
    const ni = normalize(input);
    const parts = ni.split(' ');
    const first = parts[0];
    const rest = parts.slice(1).join(' ');

    const orConditions: string[] = [];
    const params: Record<string, string> = {};
    orConditions.push('LOWER(u.first_name) LIKE :f0', 'LOWER(u.last_name) LIKE :f0');
    params['f0'] = `%${first}%`;
    if (rest) {
      orConditions.push('LOWER(u.first_name) LIKE :r0', 'LOWER(u.last_name) LIKE :r0');
      params['r0'] = `%${rest}%`;
    }
    orConditions.push('LOWER(e.specialization) LIKE :full');
    params['full'] = `%${ni}%`;
    parts.forEach((p, i) => {
      orConditions.push(`LOWER(e.specialization) LIKE :sp${i}`);
      params[`sp${i}`] = `%${p}%`;
    });

    this.logger.log(
      `🔍 EmployeeAiResolver.resolve("${input}") | tokens=[${parts.join(', ')}] | OR conditions: ${orConditions.length}`,
    );

    const candidates = await this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'u')
      .where(`(${orConditions.join(' OR ')})`, params)
      .take(20)
      .getMany();

    this.logger.log(
      `🔍 EmployeeAiResolver: ${candidates.length} candidat(s) trouvé(s) pour "${input}" | ` +
      candidates.slice(0, 5).map(e => {
        const u = (e as any).user;
        return `#${e.id}:${u?.first_name ?? '?'} ${u?.last_name ?? '?'}`;
      }).join(', '),
    );

    const scored: ResolveMatch<Employee>[] = candidates
      .map(e => {
        const user = (e as any).user;
        const firstName = user?.first_name ?? '';
        const lastName = user?.last_name ?? '';
        const fullName = `${firstName} ${lastName}`.trim();
        const reverseName = `${lastName} ${firstName}`.trim();
        const scores = [
          { score: similarityScore(input, fullName), label: 'prénom+nom' },
          { score: similarityScore(input, reverseName), label: 'nom+prénom' },
          { score: similarityScore(input, firstName), label: 'prénom' },
          { score: similarityScore(input, lastName), label: 'nom' },
          { score: similarityScore(input, e.specialization), label: 'spécialisation' },
          { score: similarityScore(input, e.bar_association_city), label: 'ville barreau' },
        ];
        const best = scores.reduce((a, b) => (a.score >= b.score ? a : b));
        return {
          entity: e,
          score: best.score,
          matchedOn: `${best.label}: ${fullName || e.specialization || ''}`.slice(0, 80),
        };
      })
      .sort((a, b) => b.score - a.score);

    this.logger.log(
      `🔍 EmployeeAiResolver: ${scored.length} candidat(s) scoré(s) | ` +
      scored.slice(0, 5).map(s => `${s.matchedOn} (score:${s.score})`).join(' | '),
    );

    return this.buildResult(scored, input, config);
  }

  private buildResult(
    scored: ResolveMatch<any>[],
    input: string,
    config?: ResolveConfig,
  ): ResolveResult<any> {
    if (scored.length === 0) {
      return { found: false, best: null, score: 0, matchedOn: '', candidates: [], ambiguous: false };
    }
    const MIN_SCORE = config?.minScore ?? 40;
    const AMBIGUITY_GAP = config?.ambiguityGap ?? 15;
    const valid = scored.filter(m => m.score >= MIN_SCORE);
    if (valid.length === 0) {
      return { found: false, best: null, score: 0, matchedOn: '', candidates: scored.slice(0, 10), ambiguous: false };
    }
    const best = valid[0];
    const second = valid[1];
    const ambiguous = !!second && best.score - second.score < AMBIGUITY_GAP && best.score < 90;
    return {
      found: true,
      best: best.entity,
      score: best.score,
      matchedOn: best.matchedOn,
      candidates: valid,
      ambiguous,
    };
  }
}

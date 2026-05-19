import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
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
export class CustomerAiResolver implements SpecializedEntityResolver {
  readonly tables = ['customer', 'customers'];

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async resolve(input: string, config?: ResolveConfig): Promise<ResolveResult<any>> {
    const ni = normalize(input);
    const parts = ni.split(' ');
    const first = parts[0];
    const rest = parts.slice(1).join(' ');

    const candidates = await this.customerRepo.find({
      where: [
        { first_name: ILike(`%${first}%`) },
        { last_name: ILike(`%${first}%`) },
        ...(rest
          ? [{ first_name: ILike(`%${rest}%`) }, { last_name: ILike(`%${rest}%`) }]
          : []),
        { company_name: ILike(`%${input}%`) },
        { email: ILike(`%${input}%`) },
      ],
      take: 20,
    });

    if (candidates.length === 0) {
      const conditions = parts.flatMap(t => [
        { first_name: ILike(`%${t}%`) },
        { last_name: ILike(`%${t}%`) },
        { company_name: ILike(`%${t}%`) },
      ]);
      candidates.push(...(await this.customerRepo.find({ where: conditions, take: 20 })));
    }

    const scored: ResolveMatch<Customer>[] = candidates
      .map(c => {
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const reverseName = `${c.last_name ?? ''} ${c.first_name ?? ''}`.trim();
        const scores = [
          { score: similarityScore(input, fullName), label: 'prénom+nom' },
          { score: similarityScore(input, reverseName), label: 'nom+prénom' },
          { score: similarityScore(input, c.first_name), label: 'prénom' },
          { score: similarityScore(input, c.last_name), label: 'nom' },
          { score: similarityScore(input, c.company_name), label: 'entreprise' },
          { score: similarityScore(input, c.email), label: 'email' },
        ];
        const best = scores.reduce((a, b) => (a.score >= b.score ? a : b));
        return {
          entity: c,
          score: best.score,
          matchedOn: `${best.label}: ${fullName || c.email || c.company_name || ''}`.slice(0, 80),
        };
      })
      .sort((a, b) => b.score - a.score);

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

/**
 * Le prompt métier cite des codes de statut en clair. Quand un enum change
 * (ex. dossiers.status passé de 0–10 à DRAFT/ACTIVE/CLOSED/ARCHIVED), l'IA
 * continue d'écrire l'ancien code et ses réponses deviennent fausses sans
 * aucune erreur visible. Ces tests échouent dès que le prompt et le code
 * divergent.
 */
import {
  CABINET_JURIDIQUE_ANALYSIS_PROMPT,
  CABINET_JURIDIQUE_READ_RULES,
} from './cabinet-juridique-prompt';
import { StatutFacture } from '../../modules/facture/dto/create-facture.dto';
import { StatutPaiement } from '../../modules/paiement/dto/create-paiement.dto';
import { DossierStatus } from '../../core/enums/dossier-status.enum';
import {
  ActionBillingDecision,
  BillableItemStatus,
  DossierActionStatus,
  DossierLifecyclePhase,
} from '../../modules/case-workflow/case-workflow.enums';
import { DossierOutcome } from '../../modules/dossiers/entities/dossier.entity';

const PROMPT = `${CABINET_JURIDIQUE_ANALYSIS_PROMPT}\n${CABINET_JURIDIQUE_READ_RULES}`;

/** Valeurs d'un enum TypeScript, en texte (les clés inverses des enums numériques comprises). */
const values = (enumObject: object) => new Set(Object.values(enumObject).map(String));

/** Codes cités dans `CASE <col> WHEN 'x' THEN …` pour une colonne donnée. */
function caseCodes(column: string): string[] {
  const codes: string[] = [];
  const caseRe = new RegExp(`CASE\\s+${column.replace('.', '\\.')}\\s+((?:WHEN\\s+'[^']*'\\s+THEN\\s+'[^']*'\\s*)+)END`, 'g');
  for (const match of PROMPT.matchAll(caseRe)) {
    for (const when of match[1].matchAll(/WHEN\s+'([^']*)'/g)) codes.push(when[1]);
  }
  return codes;
}

/** Valeurs quotées dans les comparaisons `<col> = 'x'`. */
function comparedValues(column: string): string[] {
  const re = new RegExp(`\\b${column.replace('.', '\\.')}\\s*(?:=|<>)\\s*'([^']*)'`, 'g');
  return Array.from(PROMPT.matchAll(re), (match) => match[1]);
}

describe('prompt métier du cabinet ↔ enums du code', () => {
  it('les statuts de facture cités existent', () => {
    const allowed = values(StatutFacture);
    const cited = [...caseCodes('f.status'), ...comparedValues('f.status')];
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((code) => !allowed.has(code))).toEqual([]);
    // Le libellé lisible couvre tous les statuts (une facture validée ne doit
    // pas apparaître sans statut).
    expect(new Set(caseCodes('f.status'))).toEqual(
      new Set(Object.values(StatutFacture).filter((v) => typeof v === 'number').map(String)),
    );
  });

  it('les statuts de dossier cités sont ceux du cycle administratif', () => {
    const cited = caseCodes('d.status');
    expect(new Set(cited)).toEqual(values(DossierStatus));
    expect(PROMPT).not.toMatch(/dossiers\.status est un code numerique/);
  });

  it('les phases, issues et statuts d’action cités existent', () => {
    const line = (prefix: string) => PROMPT.split('\n').find((l) => l.startsWith(prefix)) ?? '';
    const quoted = (text: string) => Array.from(text.matchAll(/'([A-Za-z_]+)'/g), (m) => m[1]);

    const phases = quoted(line('- Phase :').split('Issue :')[0]);
    expect(phases.filter((p) => !values(DossierLifecyclePhase).has(p))).toEqual([]);
    const outcomes = quoted(line('- Phase :').split('Issue :')[1] ?? '');
    expect(outcomes.filter((o) => !values(DossierOutcome).has(o))).toEqual([]);

    const actionStatuses = [...comparedValues('dossier_actions.status'), ...line('- Avancement').match(/[A-Z_]{4,}/g) ?? []];
    expect(actionStatuses.filter((s) => !values(DossierActionStatus).has(s))).toEqual([]);
  });

  it('les statuts de facturation cités existent', () => {
    const billable = comparedValues('bi.status').concat(comparedValues('billable_items.status'));
    expect(billable.filter((s) => !values(BillableItemStatus).has(s))).toEqual([]);
    const decisions = ['BILLABLE', 'HOURLY', 'VACATION', 'NON_BILLABLE', 'INCLUDED_IN_PACKAGE', 'NOT_DECIDED', 'NEEDS_REVIEW'];
    expect(decisions.filter((d) => !values(ActionBillingDecision).has(d))).toEqual([]);
  });

  it('ne demande jamais de joindre la table protégée user', () => {
    // user est refusée à l'assistant (AI_DENIED_TABLES) : une règle qui la
    // joint fait refuser toute la requête (« point sur un dossier », actions).
    expect(PROMPT).not.toMatch(/JOIN\s+`?user`?\b/i);
  });

  it('le paiement valide cité est bien VALIDE', () => {
    expect(new Set(comparedValues('p.status'))).toEqual(new Set([String(StatutPaiement.VALIDE)]));
  });
});

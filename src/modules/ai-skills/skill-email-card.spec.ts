import { AiActionRegistry } from 'src/core/ai-database/write/ai-action.registry';
import { PlanFieldsService } from 'src/core/ai-database/plan-fields.service';
import type { WritePlan } from 'src/core/ai-database/dto/analysis-response.dto';
import { EnvoyerEmailSkill } from './communication.skills';
import { EnvoyerEmailAiAction } from './skill-actions';
import { actionPlan } from './skill-drafting';

/** Demain 08:00 au format de la carte (« AAAA-MM-JJ HH:MM:00 »). */
function tomorrowAt8(): string {
  const date = new Date(Date.now() + 24 * 3600 * 1000);
  date.setHours(8, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 08:00:00`;
}

const dossierInfo = {
  type: 'dossier',
  table: 'dossiers',
  id: 91,
  label: 'DOS-2026-0001',
  resource: { id: 91 },
  dossier: { id: 91 },
  client: { id: 7 },
  recipientName: 'Jean Dupont',
  email: 'jean.dupont@exemple.cm',
  phone: '690000000',
  mailEntity: { type: 'dossier', id: 91 },
  mailParent: null,
};

function stubTargets() {
  return {
    load: async (target: any) => ({ ...dossierInfo, type: target.type, table: target.table, id: target.id }),
    facts: async () => 'Objet : litige.',
    sender: async () => ({ name: 'Me Ngono', title: 'Avocat', cabinetName: 'Cabinet Kaby', cabinetAddress: '' }),
    attachableDocuments: async () => [
      { id: 5, name: 'Assignation.pdf', file_size: 20480 },
      { id: 6, name: 'Jugement.pdf', file_size: 102400 },
    ],
    documentsByIds: async (ids: number[]) => ids.map((id) => ({ id, name: `Doc-${id}.pdf`, file_size: 1000 })),
  } as any;
}

/** Chaîne createQueryBuilder → liste vide (aucun modèle du cabinet). */
function stubDataSource() {
  const chain: any = {};
  chain.where = () => chain;
  chain.andWhere = () => chain;
  chain.orderBy = () => chain;
  chain.take = () => chain;
  chain.getMany = async () => [];
  return { getRepository: () => ({ createQueryBuilder: () => chain }), entityMetadatas: [] } as any;
}

function stubContext(overrides: Record<string, any> = {}) {
  return {
    question: "Confirme au client la date de l'audience",
    references: [{ type: 'dossier', id: 91, label: 'DOS-2026-0001', data: { id: 91 } }],
    quote: null,
    documents: [],
    params: {},
    user: {},
    userId: 'user-1',
    history: [],
    llm: { complete: async () => '{}', stream: async () => '' },
    status: () => undefined,
    readDocuments: async () => [],
    legalSources: async () => '',
    userContext: '',
    ...overrides,
  } as any;
}

function describeService(registry: AiActionRegistry) {
  return new PlanFieldsService(
    stubDataSource(),
    {} as any,
    { getTableLabel: () => '' } as any,
    {} as any,
    { assertCanWritePlan: async () => undefined } as any,
    undefined,
    undefined,
    registry,
  );
}

describe("Compétence « Envoyer un e-mail » → carte de confirmation", () => {
  it('produit un plan ACTION décrivant un message modifiable, des pièces à cocher et la programmation', async () => {
    const skill = new EnvoyerEmailSkill(stubTargets(), stubDataSource());
    const outcome = await skill.run(stubContext({
      params: { subject: "Point sur votre dossier", body: 'Bonjour,\n\nVoici le point.' },
    }));
    expect(outcome.type).toBe('plan');
    if (outcome.type !== 'plan') return;
    const plan = outcome.plan as WritePlan;
    const op = plan.operations[0] as any;
    expect(op.operation).toBe('ACTION');
    expect(op.action).toBe('envoyer_email');
    expect(op.entity).toBe('dossiers');
    expect(op.entityId).toBe(91);
    expect(op.fields.subject).toBe("Point sur votre dossier");
    expect(op.fields.body).toContain('Voici le point.');

    const registry = new AiActionRegistry();
    registry.register(new EnvoyerEmailAiAction(stubTargets(), {} as any, {} as any, {} as any));
    const described = await describeService(registry).describePlan({} as any, plan);
    const fields = described.operations[0].fields;
    const byName = Object.fromEntries(fields.map((field) => [field.name, field]));

    expect(byName.to.editable).toBe(true);
    expect(byName.subject.editable).toBe(true);
    expect(byName.body.kind).toBe('longtext');
    expect(byName.body.format).toBe('email');
    expect(byName.body.editable).toBe(true);
    expect(byName.body.value).toContain('Voici le point.');
    expect(byName.attachments.kind).toBe('multi');
    expect(byName.attachments.editable).toBe(true);
    expect(byName.attachments.options).toHaveLength(2);
    expect(byName.scheduledAt.kind).toBe('datetime');
    expect(byName.scheduledAt.editable).toBe(true);
    expect(described.operations[0].preview).toContain('À : jean.dupont@exemple.cm');
    expect(described.operations[0].warning).toMatch(/rappelé/);
  });

  it('reprend les pièces jointes et la programmation demandées dans l’aperçu', async () => {
    const plan = actionPlan('envoyer_email', 'dossiers', 91, {
      subject: 'Objet',
      body: 'Corps',
      attachments: [5],
      scheduledAt: tomorrowAt8(),
    }, 'Envoyer un e-mail');
    const registry = new AiActionRegistry();
    registry.register(new EnvoyerEmailAiAction(stubTargets(), {} as any, {} as any, {} as any));
    const described = await describeService(registry).describePlan({} as any, plan);
    expect(described.operations[0].preview).toContain('1 pièce(s) jointe(s)');
    expect(described.operations[0].preview).toContain('programmé le');
  });

  it('met en forme le message à l’envoi (gras, liens, texte brut, objet net)', async () => {
    const sent: any[] = [];
    const mails = { createAndSend: async (payload: any) => { sent.push(payload); return { id: 1 }; } };
    const templates = { wrapForCabinet: async (html: string) => `<cab>${html}</cab>` };
    const action = new EnvoyerEmailAiAction(stubTargets(), mails as any, templates as any, {} as any);
    const prepared = await action.prepare(91, {
      to: 'jean.dupont@exemple.cm',
      subject: '**Relance** [FAC-1](https://app.test/f/1)',
      body: '**Montant : 500 000 FCFA** : voir [le dossier](https://app.test/dossiers/91)',
    }, 'user-1', 'dossiers');
    await prepared.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Relance FAC-1');
    expect(sent[0].html).toContain('<strong>Montant : 500 000 FCFA</strong>');
    expect(sent[0].html).toContain('<a href="https://app.test/dossiers/91">le dossier</a>');
    expect(sent[0].text).toContain('le dossier (https://app.test/dossiers/91)');
  });
});

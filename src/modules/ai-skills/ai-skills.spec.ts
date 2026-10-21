/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';

import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import { MailService } from 'src/core/shared/emails/emails.service';
import { MailStatus } from 'src/core/shared/emails/entities/mail.entity';
import { CreerDiligenceSkill, ReporterAudienceSkill } from './agenda.skills';
import { EnvoyerEmailSkill, MessageCollaborateurSkill, WhatsappSkill } from './communication.skills';
import { letterSubject, MISE_EN_DEMEURE_PREFIX, pastedText, pickTemplate, targetLanguage } from './document.skills';
import { parsePeriod } from './report.skills';
import { EnvoyerEmailAiAction, parseEmailList, parseSchedule } from './skill-actions';
import { senderLine } from './skill-drafting';
import type { TargetInfo } from './skill-targets.service';

const NOW = new Date(2026, 9, 19, 10, 0); // 19 octobre 2026

const info = (extra: Partial<TargetInfo> = {}): TargetInfo => ({
  type: 'dossier',
  table: 'dossiers',
  id: 91,
  label: 'Dossier DOS-2026-0001',
  resource: { id: 91 },
  dossier: { id: 91, dossier_number: 'DOS-2026-0001' } as any,
  client: { id: 83, full_name: 'Jean Dupont', email: 'jean@exemple.cm', number_phone_1: '677123456' } as any,
  employee: null,
  recipientName: 'Jean Dupont',
  email: 'jean@exemple.cm',
  phone: '677123456',
  mailEntity: { type: 'dossier', id: 91 },
  mailParent: null,
  ...extra,
});

function targetsMock(target = info()) {
  return {
    load: jest.fn(async () => target),
    facts: jest.fn(async () => 'Dossier : DOS-2026-0001'),
    sender: jest.fn(async () => ({ name: 'Me Kaby', title: 'Avocat', cabinetName: 'Cabinet Kaby', cabinetAddress: '' })),
    attachableDocuments: jest.fn(async () => []),
    documentsByIds: jest.fn(async (ids: number[]) => ids.map((id) => ({ id, name: `Pièce ${id}`, file_size: 1000, file_path: `uploads/cab/piece-${id}.pdf`, file_mimetype: 'application/pdf' }))),
  };
}

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: "Confirme au client l'audience",
  references: [{ type: 'dossier', label: 'DOS-2026-0001', data: { id: 91 } }],
  documents: [],
  params: {},
  user: { id: 31 },
  userId: '31',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

describe('Période d’un rapport', () => {
  it('lit les périodes courantes de la demande', () => {
    const label = (question: string) => parsePeriod(question, NOW).label;
    expect(label("rapport d'activité")).toBe('octobre 2026');
    expect(label('le mois dernier')).toBe('septembre 2026');
    expect(label('bilan de février 2026')).toBe('février 2026');
    expect(label('cette année')).toBe("l'année 2026");
    expect(label('activité 2025')).toBe("l'année 2025");
    const explicit = parsePeriod('du 01/09/2026 au 15/09/2026', NOW);
    expect([explicit.from.getDate(), explicit.to.getDate(), explicit.to.getMonth()]).toEqual([1, 15, 8]);
  });
});

describe('Documents', () => {
  const templates = [
    { id: 1, code: 'client_fiche', name: 'Client — Fiche signalétique' },
    { id: 2, code: 'client_attestation', name: 'Client — Attestation de suivi' },
  ] as any[];

  it('choisit le modèle nommé dans la demande, sinon demande lequel', () => {
    expect(pickTemplate(templates, 'une attestation pour ce client')?.code).toBe('client_attestation');
    expect(pickTemplate(templates, 'un document')).toBeUndefined();
    expect(pickTemplate([templates[0]], 'peu importe')?.code).toBe('client_fiche');
  });

  it('reconnaît aussi un modèle par son code (« convocation »)', () => {
    const audience = [
      { id: 3, code: 'audience_fiche', name: 'Audience — Fiche' },
      { id: 4, code: 'audience_convocation', name: 'Audience — Avis au client' },
    ] as any[];
    expect(pickTemplate(audience, 'la convocation de cette audience')?.code).toBe('audience_convocation');
  });

  it('traduit vers la langue demandée, sinon vers l’autre langue', () => {
    expect(targetLanguage('traduis en anglais')).toBe('anglais');
    expect(targetLanguage('translate into French')).toBe('français');
    expect(targetLanguage('traduis ce texte')).toContain("l'autre langue");
  });

  it('traduit le texte collé après la consigne', () => {
    expect(pastedText('Traduis en anglais : Le preneur est tenu de payer le loyer aux termes convenus.'))
      .toBe('Le preneur est tenu de payer le loyer aux termes convenus.');
    expect(pastedText('Traduis ce contrat en anglais')).toBe('');
    expect(pastedText('Traduis : merci')).toBe('');
  });

  it('ne double pas « Mise en demeure » ni « Objet : » dans l’objet', () => {
    expect(letterSubject('Mise en demeure de payer la créance', MISE_EN_DEMEURE_PREFIX)).toBe('Payer la créance');
    expect(letterSubject('Objet : Mise en demeure — Loyers impayés', MISE_EN_DEMEURE_PREFIX)).toBe('Loyers impayés');
    expect(letterSubject('Objet : renvoi de l’audience')).toBe('Renvoi de l’audience');
  });

  it('signe au nom du cabinet quand l’expéditeur n’a pas de fiche', () => {
    expect(senderLine({ name: 'Me Kaby', title: 'Avocat', cabinetName: 'Cabinet Kaby' })).toBe('Expéditeur : Me Kaby, Avocat — Cabinet Kaby');
    expect(senderLine({ name: '', title: '', cabinetName: 'Cabinet Kaby' }, 'Signataire')).toBe('Signataire : Cabinet Kaby');
    expect(senderLine({ name: '', title: '', cabinetName: 'Kaby & Associés' })).toBe('Expéditeur : le cabinet Kaby & Associés');
    expect(senderLine({ name: '', title: '', cabinetName: '' })).toBe('');
  });
});

describe('Compétence « Envoyer un e-mail »', () => {
  it('rédige objet et message, puis prépare un plan à confirmer sur la fiche visée', async () => {
    const skill = new EnvoyerEmailSkill(targetsMock() as any, { getRepository: () => ({ createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ andWhere: () => ({ orderBy: () => ({ take: () => ({ getMany: async () => [] }) }) }) }) }) }) }) } as any);
    const context = ctx();
    (context.llm.complete as jest.Mock).mockResolvedValue('{"subject": "Votre audience", "body": "Bonjour,\\n\\nVotre audience est confirmée.", "to": "", "scheduledAt": "2026-10-20 08:00"}');

    const outcome = await skill.run(context);

    expect(outcome).toMatchObject({
      type: 'plan',
      plan: {
        operations: [{
          operation: 'ACTION', action: 'envoyer_email', entity: 'dossiers', entityId: 91,
          fields: { subject: 'Votre audience', body: 'Bonjour,\n\nVotre audience est confirmée.', scheduledAt: '2026-10-20 08:00:00' },
        }],
      },
    });
    expect((outcome as any).plan.operations[0].fields.to).toBeUndefined();
  });

  it('demande la mention quand rien ne désigne le destinataire', async () => {
    const skill = new EnvoyerEmailSkill(targetsMock() as any, {} as any);
    const outcome = await skill.run(ctx({ references: [] }));
    expect(outcome).toMatchObject({ type: 'clarify' });
    expect((outcome as any).markdown).toContain('@');
  });

  it('lit un corps écrit avec de vrais retours à la ligne dans le JSON', async () => {
    const skill = new EnvoyerEmailSkill(targetsMock() as any, { getRepository: () => ({ createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ andWhere: () => ({ orderBy: () => ({ take: () => ({ getMany: async () => [] }) }) }) }) }) }) }) } as any);
    const context = ctx();
    (context.llm.complete as jest.Mock).mockResolvedValue('{"subject": "Audience", "body": "Madame,\n\nVotre audience est confirmée.\n\nMe Kaby", "to": "", "scheduledAt": ""}');
    const outcome = await skill.run(context);
    expect(context.llm.complete).toHaveBeenCalledTimes(1);
    expect((outcome as any).plan.operations[0].fields).toMatchObject({ body: 'Madame,\n\nVotre audience est confirmée.\n\nMe Kaby' });
    expect((outcome as any).plan.operations[0].fields.scheduledAt).toBeUndefined();
  });

  it('reprend tel quel un message transmis par un bouton de suite', async () => {
    const skill = new EnvoyerEmailSkill(targetsMock() as any, {} as any);
    const context = ctx({ params: { subject: 'Compte rendu', body: 'Texte', attachments: [5] } });
    const outcome = await skill.run(context);
    expect(context.llm.complete).not.toHaveBeenCalled();
    expect((outcome as any).plan.operations[0].fields).toMatchObject({ subject: 'Compte rendu', body: 'Texte', attachments: [5] });
  });

  it('signale une rédaction vide au lieu de produire une carte sans message', async () => {
    const skill = new EnvoyerEmailSkill(targetsMock() as any, { getRepository: () => ({ createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ andWhere: () => ({ orderBy: () => ({ take: () => ({ getMany: async () => [] }) }) }) }) }) }) }) } as any);
    const context = ctx();
    (context.llm.complete as jest.Mock).mockResolvedValue('{}');
    await expect(skill.run(context)).rejects.toThrow(BadRequestException);
    await expect(skill.run(context)).rejects.toThrow('pas abouti');
  });
});

describe('Action « envoyer_email »', () => {
  function build(target = info()) {
    const targets = targetsMock(target);
    const mails = { createAndSend: jest.fn(async () => ({ id: 'm-1' })) };
    const templates = { wrapForCabinet: jest.fn(async (html: string) => `<layout>${html}</layout>`) };
    const action = new EnvoyerEmailAiAction(targets as any, mails as any, templates as any);
    return { action, mails };
  }

  it('écrit au client par défaut, joint les pièces et range l’envoi dans l’historique', async () => {
    const { action, mails } = build();
    const prepared = await action.prepare(91, { subject: 'Point', body: 'Bonjour <Jean>', attachments: [5] }, '31', 'dossiers');

    await expect(prepared.run()).resolves.toBe('E-mail « Point » envoyé à jean@exemple.cm.');
    expect(mails.createAndSend).toHaveBeenCalledWith(expect.objectContaining({
      to: ['jean@exemple.cm'],
      subject: 'Point',
      html: '<layout><p>Bonjour &lt;Jean&gt;</p></layout>',
      // Chemin seulement : le base64 de plusieurs pièces dépassait la colonne du mail.
      attachments: [{ filename: 'Pièce 5.pdf', path: 'uploads/cab/piece-5.pdf', contentType: 'application/pdf' }],
      metadata: expect.objectContaining({ linkedEntity: { type: 'dossier', id: 91 }, source: 'ai_skill' }),
    }));
  });

  it('refuse sans adresse connue ni saisie, ou avec une adresse invalide', async () => {
    const { action } = build(info({ email: null }));
    await expect(action.prepare(91, { subject: 'Point', body: 'Bonjour' }, '31', 'dossiers')).rejects.toThrow('indiquez le destinataire');
    await expect(action.prepare(91, { to: 'pas-une-adresse', subject: 'Point', body: 'Bonjour' }, '31', 'dossiers')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('annonce le destinataire, les pièces et la programmation sur la carte', async () => {
    const { action } = build();
    const preview = await action.preview(91, { attachments: [5, 6], scheduledAt: '2099-01-01 08:00:00' }, 'dossiers');
    expect(preview).toContain('À : jean@exemple.cm');
    expect(preview).toContain('2 pièce(s) jointe(s)');
    expect(preview).toContain('programmé le');
  });

  it('lit les listes d’adresses et la date d’envoi', () => {
    expect(parseEmailList('a@x.cm; b@y.cm', 'Copie')).toEqual(['a@x.cm', 'b@y.cm']);
    expect(parseSchedule('', NOW)).toBeNull();
    expect(parseSchedule('2026-10-19 09:00:00', NOW)).toBeNull(); // déjà passée : envoi immédiat
    expect(parseSchedule('2026-10-20 08:00:00', NOW)?.getDate()).toBe(20);
    expect(() => parseSchedule('demain', NOW)).toThrow("Date d'envoi illisible");
  });
});

describe('Compétence « WhatsApp »', () => {
  it('prépare un brouillon avec le numéro du client, sans rien envoyer', async () => {
    const skill = new WhatsappSkill(targetsMock() as any);
    const context = ctx();
    (context.llm.complete as jest.Mock).mockResolvedValue('{"text": "Bonjour M. Dupont, votre audience est confirmée."}');
    await expect(skill.run(context)).resolves.toMatchObject({
      type: 'message_draft',
      draft: { channel: 'whatsapp', customerId: 83, phone: '677123456', text: 'Bonjour M. Dupont, votre audience est confirmée.' },
    });
  });

  it('signale une rédaction vide au lieu de produire une carte sans message', async () => {
    const skill = new WhatsappSkill(targetsMock() as any);
    const context = ctx();
    (context.llm.complete as jest.Mock).mockResolvedValue('{}');
    await expect(skill.run(context)).rejects.toThrow(BadRequestException);
    await expect(skill.run(context)).rejects.toThrow('pas abouti');
  });
});

describe('Compétence « Message à un collaborateur »', () => {
  it('donne au modèle les faits du dossier mentionné en plus du collaborateur', async () => {
    const employee = info({ type: 'employee', table: 'employee', id: 31, label: 'Zangue Martin', recipientName: 'Zangue Martin' });
    const targets = targetsMock(employee);
    const skill = new MessageCollaborateurSkill(targets as any);
    const context = ctx({
      question: "Préviens-le que l'audience est avancée",
      references: [
        { type: 'employee', label: 'Zangue Martin', data: { id: 31 } },
        { type: 'dossier', label: 'DOS-2026-0001', data: { id: 91 } },
      ],
    });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"content": "Salut, l’audience est avancée."}');
    await expect(skill.run(context)).resolves.toMatchObject({
      type: 'plan',
      plan: { operations: [{ action: 'message_collaborateur', entityId: 31, fields: { content: 'Salut, l’audience est avancée.' } }] },
    });
    expect(targets.load).toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier', id: 91 }));
    expect((context.llm.complete as jest.Mock).mock.calls[0][0]).toContain('Dossier concerné :\nDossier : DOS-2026-0001');
  });
});

describe('Écriture guidée (audience, diligence, paiement)', () => {
  it('ajoute sa consigne à la demande enrichie au lieu de la réécrire', async () => {
    const outcome = await new CreerDiligenceSkill().run(ctx({ question: 'Déposer les conclusions avant le 30/11' }));
    expect(outcome).toMatchObject({ type: 'write', tables: ['diligences'] });
    expect((outcome as any).instruction).toContain('INSERT diligences');
    expect((outcome as any).instruction).not.toContain('Déposer les conclusions');
    expect((outcome as any).question).toBeUndefined();
  });
});

describe('Compétence « Reporter une audience »', () => {
  it('garde l’heure actuelle quand la demande ne donne que le jour', async () => {
    const audience = info({ type: 'audience', table: 'audiences', id: 12, label: 'Audience du 15/10/2026', resource: { id: 12, audience_time: '09:30' } });
    const skill = new ReporterAudienceSkill(targetsMock(audience) as any);
    const context = ctx({ references: [{ type: 'audience', label: 'Audience', data: { id: 12 } }] });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"audience_date": "2026-11-12", "reason": "", "room": ""}');
    await expect(skill.run(context)).resolves.toMatchObject({
      type: 'plan',
      plan: { operations: [{ fields: { audience_date: '2026-11-12 09:30:00' } }] },
    });
    expect((context.llm.complete as jest.Mock).mock.calls[0][0]).toContain("l'heure actuelle (09:30)");
  });

  const audience = info({ type: 'audience', table: 'audiences', id: 12, label: 'Audience du 15/10/2026' });

  it('demande la nouvelle date quand la demande n’en donne pas', async () => {
    const skill = new ReporterAudienceSkill(targetsMock(audience) as any);
    const context = ctx({ references: [{ type: 'audience', label: 'Audience', data: { id: 12 } }] });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"audience_date": "", "reason": "", "room": ""}');
    await expect(skill.run(context)).resolves.toMatchObject({ type: 'clarify' });
  });

  it('prépare le report à la date lue', async () => {
    const skill = new ReporterAudienceSkill(targetsMock(audience) as any);
    const context = ctx({ references: [{ type: 'audience', label: 'Audience', data: { id: 12 } }] });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"audience_date": "2026-11-12", "reason": "Absence du juge", "room": ""}');
    await expect(skill.run(context)).resolves.toMatchObject({
      type: 'plan',
      plan: { operations: [{ action: 'reporter_audience', entityId: 12, fields: { audience_date: '2026-11-12 00:00:00', reason: 'Absence du juge' } }] },
    });
  });
});

describe('Envoi des e-mails', () => {
  function mailService(rows: any[] = []) {
    const repo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null),
      save: jest.fn(async (row: any) => {
        if (!rows.includes(row)) rows.push(row);
        return row;
      }),
      create: jest.fn((row: any) => ({ id: 'new', retryCount: 0, ...row })),
    };
    const sendMail = jest.fn(async () => undefined);
    const smtp = { getTenantTransport: jest.fn(async () => ({ transport: { sendMail }, from: 'cabinet@x.cm' })) };
    const tenant = { run: jest.fn((_id: number, fn: () => any) => fn()), runWithoutTenant: jest.fn((fn: () => any) => fn()) };
    const service: any = new MailService(repo as any, {} as any, {} as any, smtp as any, tenant as any);
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { service, sendMail, tenant, repo };
  }

  it('décode les pièces jointes en base64 (composer, GED)', async () => {
    const { service, sendMail } = mailService();
    await service.sendDirect({ to: 'a@x.cm', subject: 'Test', html: '<p>x</p>', attachments: [{ filename: 'a.pdf', content: Buffer.from('PDF!').toString('base64'), contentType: 'application/pdf' }] });
    const attachment = (sendMail.mock.calls[0] as any)[0].attachments[0];
    expect(Buffer.isBuffer(attachment.content)).toBe(true);
    expect(attachment.content.toString()).toBe('PDF!');
  });

  it('envoie les e-mails programmés chacun dans son cabinet', async () => {
    const due = { id: 'm-1', tenant_id: 25, status: MailStatus.PENDING, to: ['a@x.cm'], subject: 'S', html: '<p>x</p>', retryCount: 0 };
    const { service, tenant, sendMail } = mailService([due]);
    await service.handleScheduledMails();
    await new Promise((resolve) => setImmediate(resolve));
    expect(tenant.runWithoutTenant).toHaveBeenCalled();
    expect(tenant.run).toHaveBeenCalledWith(25, expect.any(Function));
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('attend l’envoi immédiat et le signale en échec', async () => {
    const { service, sendMail, repo } = mailService();
    sendMail.mockRejectedValueOnce(new Error('SMTP refusé'));
    // Le SMTP du cabinet échoue : repli sur le SMTP global, absent ici → erreur lisible.
    await expect(service.createAndSend({ to: ['a@x.cm'], subject: 'S', html: '<p>x</p>' })).rejects.toThrow('SMTP');
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: MailStatus.FAILED }));
  });

  it('enregistre seulement un e-mail programmé', async () => {
    const { service, sendMail } = mailService();
    const saved = await service.createAndSend({ to: ['a@x.cm'], subject: 'S', html: '<p>x</p>', scheduledAt: '2099-01-01T08:00:00.000Z' });
    expect(saved.status).toBe(MailStatus.PENDING);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

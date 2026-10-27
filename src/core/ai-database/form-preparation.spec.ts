/// <reference types="jest" />
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { buildFormPrompt, normalizeFormDraft, parseFormFields, DraftField } from './form-preparation';
import { AiDatabaseService } from './ai-database.service';
import { AiContextConfigService } from './ai-context-config.service';
import { TenantContext } from '../tenant/tenant.context';

const fields: DraftField[] = [
  { name: 'result_code', label: 'Résultat', type: 'select', options: [{ value: 'POSTPONED', label: 'Reportée' }] },
  { name: 'duration_minutes', label: 'Temps passé', type: 'number', validation: { min: 0 } },
  { name: 'audience_ids', label: 'Audiences', type: 'multiselect', options: [{ value: 12, label: 'Audience du dossier' }] },
  { name: 'new_date', label: 'Nouvelle date', type: 'date' },
  { name: 'report', label: 'Rapport', type: 'textarea' },
];

describe('Préparation de formulaire IA', () => {
  it('rejette les identifiants inconnus et valeurs invalides, sans ajouter de champ métier', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: { result_code: 'UNKNOWN', duration_minutes: -1,
      audience_ids: [12, 999], new_date: '2026-02-30', report: 'Audience reportée', dossier_id: 99 } }), fields);
    expect(result.values).toEqual({ report: 'Audience reportée' });
    expect(result.warnings).toHaveLength(4);
  });
  it('normalise uniquement les valeurs autorisées, dont les relations du contexte', () => {
    expect(normalizeFormDraft('```json\n' + JSON.stringify({ values: { result_code: { value: 'POSTPONED' }, duration_minutes: '45',
      audience_ids: ['12'], new_date: '2026-11-20' } }) + '\n```', fields).values)
      .toEqual({ result_code: 'POSTPONED', duration_minutes: 45, audience_ids: [12], new_date: '2026-11-20' });
  });
  it('une lecture ne peut jamais proposer de valeurs à appliquer', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: { report: 'Modifié' }, message: 'Une pièce manque' }), fields, true);
    expect(result.values).toEqual({}); expect(result.message).toBe('Une pièce manque');
  });
  it('pose une précision courte sans appliquer le brouillon tant que la contradiction reste ouverte', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: { duration_minutes: 65, audience_ids: [12] },
      clarification: 'Confirmez-vous la date de cette audience ?', message: 'duration_minutes est renseigné.' }), fields);
    expect(result.values).toEqual({});
    expect(result.clarification).toBe('Confirmez-vous la date de cette audience ?');
    expect(result.message).toBe('Temps passé est renseigné.');
  });
  it('signale une pièce d’un autre dossier sans bloquer le brouillon ni demander de la retirer', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: { report: 'Compte rendu préparé', duration_minutes: 65 },
      message: 'Je ne peux pas préparer cette action à cause du document.', clarification: 'Pouvez-vous retirer ce document ?',
      attachmentIssues: [
        { fileName: 'convocation.pdf', message: 'Ce document concerne un autre dossier.' },
        { fileName: 'inventé.pdf', message: 'Ce document ne convient pas.' },
      ] }), fields, false, ['convocation.pdf']);
    expect(result.values).toEqual({ report: 'Compte rendu préparé', duration_minutes: 65 });
    expect(result.attachmentIssues).toEqual([{ fileName: 'convocation.pdf', message: 'Ce document concerne un autre dossier.' }]);
    expect(result.clarification).toBe('');
    expect(result.message).toBe('');
  });
  it('distingue un avertissement de pièce d’une vraie information indispensable manquante', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: { duration_minutes: 65 },
      clarification: 'Que s’est-il passé pendant l’audience ?', clarificationReason: 'missing_information',
      attachmentIssues: [{ fileName: 'convocation.pdf', message: 'Ce document concerne un autre dossier.' }] }), fields, false, ['convocation.pdf']);
    expect(result.values).toEqual({});
    expect(result.clarification).toBe('Que s’est-il passé pendant l’audience ?');
    expect(result.clarificationReason).toBe('missing_information');
  });
  it('remplace les noms internes par les libellés dans tous les textes affichés', () => {
    const result = normalizeFormDraft(JSON.stringify({ values: {}, message: 'Rapport (report) manquant.',
      warnings: ['Vérifiez audience_ids.'], clarification: 'Pouvez-vous compléter report ?' }), fields);
    expect(result.message).toBe('Rapport manquant.');
    expect(result.warnings).toEqual(['Vérifiez Audiences.']);
    expect(result.clarification).toBe('Pouvez-vous compléter Rapport ?');
  });
  it('résout aujourd’hui à partir de la date serveur et du fuseau transmis', () => {
    const prompt = buildFormPrompt({ text: 'Audience aujourd’hui, 65 minutes, dans le forfait', fields: '[]',
      timeZone: 'Africa/Douala' }, fields, '', new Date('2026-10-13T23:30:00Z'));
    expect(prompt).toContain('Date de référence : 2026-10-14');
    expect(prompt).toContain("Une relation facultative sans options n'appelle aucun avertissement");
    expect(buildFormPrompt({ text: '', fields: '[]', timeZone: 'invalide' }, fields, '', new Date('2026-10-13T23:30:00Z')))
      .toContain('Date de référence : 2026-10-13');
  });
  it('refuse les chemins de pollution de prototype et les noms dupliqués', () => {
    expect(() => parseFormFields(JSON.stringify([{ name: '__proto__.x', label: 'X', type: 'text' }]))).toThrow(BadRequestException);
    expect(() => parseFormFields(JSON.stringify([fields[0], fields[0]]))).toThrow(BadRequestException);
  });
  it('explique les limites dans le prompt de fin d’action', () => {
    expect(buildFormPrompt({ text: 'Termine cette action', fields: '[]', mode: 'complete' }, fields))
      .toContain('sans enregistrer ni exécuter aucune action');
  });
  it('la préparation contourne totalement SQL, conversations et handlers d’écriture', async () => {
    const service: any = Object.create(AiDatabaseService.prototype);
    service.withAiMetrics = (_name: string, _id: number, run: () => unknown) => run();
    service.configureRequestModel = jest.fn(); service.markMetric = jest.fn();
    service.invokeModel = jest.fn().mockResolvedValue({ content: JSON.stringify({ values: { report: 'Brouillon' } }) });
    service.genericWriteService = { executePlan: jest.fn() };
    service.dataSource = { query: jest.fn() };
    service.conversationManager = { addUserMessage: jest.fn() };
    const result = await service.prepareForm({ text: 'Termine et enregistre', fields: JSON.stringify(fields), mode: 'complete' });
    expect(result.values).toEqual({ report: 'Brouillon' });
    expect(service.genericWriteService.executePlan).not.toHaveBeenCalled();
    expect(service.dataSource.query).not.toHaveBeenCalled();
    expect(service.conversationManager.addUserMessage).not.toHaveBeenCalled();
  });
  it('prépare quand même le brouillon quand une pièce jointe est illisible', async () => {
    const service: any = Object.create(AiDatabaseService.prototype);
    service.withAiMetrics = (_name: string, _id: number, run: () => unknown) => run();
    service.configureRequestModel = jest.fn(); service.markMetric = jest.fn();
    service.logger = { warn: jest.fn() };
    service.extractFileContent = jest.fn().mockRejectedValue(new Error('Invalid PDF structure'));
    service.invokeModel = jest.fn().mockResolvedValue({ content: JSON.stringify({ values: { report: 'Brouillon' } }) });
    const file = { originalname: 'corrompu.pdf' };
    const result = await service.prepareForm({ text: 'Classe ce fichier', fields: JSON.stringify(fields), mode: 'create' }, [file]);
    expect(result.values).toEqual({ report: 'Brouillon' });
    expect(JSON.stringify(service.invokeModel.mock.calls[0][1])).toContain('corrompu.pdf\\n[Contenu illisible');
  });
  it('bloque la préparation et les demandes sans contexte de page quand le cabinet désactive son aide', async () => {
    const configRepo: any = { find: jest.fn().mockResolvedValue([]), findOneBy: jest.fn().mockResolvedValue({ enabled: false }) };
    const service: any = Object.create(AiDatabaseService.prototype);
    service.contextConfigs = new AiContextConfigService(configRepo, {} as any);
    service.withAiMetrics = (_name: string, _id: number, run: () => unknown) => run();
    service.configureRequestModel = jest.fn(); service.invokeModel = jest.fn();
    await new TenantContext().run(7, async () => {
      await expect(service.prepareForm({ text: 'Prépare le rapport', fields: JSON.stringify(fields), mode: 'complete' })).rejects.toThrow(ForbiddenException);
      await expect(service.buildRequestContext({ question: 'Résume le dossier' })).rejects.toThrow(ForbiddenException);
      await expect(service.buildRequestContext({ question: 'Résume le dossier', pageContext: '{invalide' })).rejects.toThrow(ForbiddenException);
    });
    expect(configRepo.findOneBy).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 7 }));
    expect(service.configureRequestModel).not.toHaveBeenCalled();
    expect(service.invokeModel).not.toHaveBeenCalled();
  });
  it('une demande de texte en lecture ne reprend pas un ancien plan d’écriture', async () => {
    const service: any = Object.create(AiDatabaseService.prototype);
    service.withAiMetrics = (_name: string, _id: number, run: () => unknown) => run();
    service.logger = { log: jest.fn(), error: jest.fn() };
    service.conversationManager = { withCitations: (run: () => unknown) => run(), citedRecords: () => [] };
    service.configureRequestModel = () => ({ mode: 'fast' }); service.markMetric = jest.fn(); service.getRequestModelName = () => 'test';
    service.tryConsumePendingEntityIdClarification = jest.fn(() => { throw new Error('Un plan a été repris'); });
    service.buildRequestContext = async (dto: any) => ({ enrichedQuestion: dto.question, referenced: [], documentContext: [] });
    service.resolveFollowUpContext = (question: string) => question;
    service.invokeModel = async () => ({ content: 'Explication du formulaire' });
    const result = await service.analyzeQuestion({ question: 'Explique le dossier 42', conversationId: 'ancienne-conversation', intentMode: 'read', textGenerationOnly: true }, { id: 1 });
    expect(result.analysis).toBe('Explication du formulaire');
    expect(service.tryConsumePendingEntityIdClarification).not.toHaveBeenCalled();
  });
});

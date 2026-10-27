/// <reference types="jest" />
import { EnvoyerFactureAiAction, RelancerImpayesAiAction } from './facture-ai-actions';

describe('Actions du chat sur les factures', () => {
  it('envoie la facture avec le destinataire choisi sur la carte', async () => {
    const factures: any = {
      previewFactureEmail: jest.fn(async () => ({ facture: { id: 'f-1', numero: 'FAC-2026-0003' }, to: 'compta@client.cm' })),
      sendFactureByEmail: jest.fn(async () => ({ sent: true, to: 'compta@client.cm', message: 'Facture FAC-2026-0003 envoyée à compta@client.cm.' })),
    };
    const action = new EnvoyerFactureAiAction(factures);
    expect(action.definition.permission).toBe('email_facture');

    const prepared = await action.prepare('f-1', { email: 'compta@client.cm' });
    expect(prepared.plannedMessage).toBe('Facture FAC-2026-0003 à envoyer à compta@client.cm.');
    expect(factures.sendFactureByEmail).not.toHaveBeenCalled();
    await expect(prepared.run()).resolves.toBe('Facture FAC-2026-0003 envoyée à compta@client.cm.');
    expect(factures.sendFactureByEmail).toHaveBeenCalledWith('f-1', 'compta@client.cm');
  });

  it('relance un dossier du cabinet, et signale une relance qui n’est pas partie', async () => {
    const factures: any = {
      previewRelanceForDossier: jest.fn(async () => ({ to: 'client@exemple.cm', count: 2, totalReste: 150000 })),
      sendRelanceForDossier: jest.fn(async () => ({ sent: false, count: 2, message: "Le client n'a pas d'adresse email enregistrée." })),
    };
    const findOne = jest.fn(async ({ where }: any) => (where.id === 91 ? { id: 91, dossier_number: 'DOS-2026-0001' } : null));
    const dataSource: any = { getRepository: () => ({ findOne }) };
    const action = new RelancerImpayesAiAction(factures, dataSource);

    // toLocaleString('fr-FR') sépare les milliers par une espace insécable.
    expect((await action.preview(91)).replace(/\s/g, ' ')).toBe('À : client@exemple.cm · 2 facture(s) impayée(s), reste dû 150 000');
    await expect(action.prepare(12)).rejects.toThrow('Dossier #12 introuvable');

    const prepared = await action.prepare('91');
    expect(prepared.data).toMatchObject({ dossier_number: 'DOS-2026-0001' });
    await expect(prepared.run()).rejects.toThrow("Le client n'a pas d'adresse email enregistrée.");
  });
});

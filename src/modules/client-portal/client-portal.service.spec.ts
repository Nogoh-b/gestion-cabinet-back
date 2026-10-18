/**
 * Espace client : chaque opération est bornée à la fiche client du jeton, les
 * documents exposés se limitent aux dépôts du client et aux pièces « client »
 * validées, et un paiement déclaré reste EN_ATTENTE (approbation du cabinet).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { DocumentCustomerStatus } from '../documents/document-customer/entities/document-customer.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { StatutPaiement } from '../paiement/dto/create-paiement.dto';

import { ClientPortalService } from './client-portal.service';

const CLIENT = { id: 50, role: 'client', customerId: 83 };
const pdf = (size = 1000): any => ({
  mimetype: 'application/pdf',
  originalname: 'piece.pdf',
  size,
  buffer: Buffer.from('x'),
});

function doc(over: Record<string, any>): any {
  return {
    id: 1,
    name: 'Doc',
    description: null,
    status: DocumentCustomerStatus.ACCEPTED,
    status_label: 'Validé',
    is_confidential: false,
    file_size: 10,
    file_mimetype: 'application/pdf',
    uploaded_at: new Date(),
    metadata: null,
    category: null,
    ...over,
  };
}

function facture(over: Record<string, any> = {}): any {
  return {
    id: 'f-1',
    numero: 'FAC-001',
    client_id: 83,
    status: StatutFacture.ENVOYEE,
    montantTTC: 1000,
    dateFacture: new Date('2026-10-01'),
    dateEcheance: new Date('2026-12-01'),
    paiements: [],
    dossier: { id: 91, dossier_number: 'D-91', object: 'Litige' },
    original_facture_id: null,
    ...over,
  };
}

describe('ClientPortalService', () => {
  let dossierRepo: any;
  let docRepo: any;
  let categoryRepo: any;
  let factureRepo: any;
  let paiementRepo: any;
  let messageRepo: any;
  let documentService: any;
  let service: ClientPortalService;

  beforeEach(() => {
    dossierRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === 91 && where.client_id === 83 ? { id: 91 } : null,
      ),
      count: jest.fn(async () => 2),
    };
    docRepo = { find: jest.fn(async () => []), count: jest.fn(async () => 0) };
    categoryRepo = { findOne: jest.fn(async () => ({ id: 7, code: 'client' })) };
    factureRepo = {
      findOne: jest.fn(async () => facture()),
      find: jest.fn(async () => []),
    };
    paiementRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ ...v, id: 'p-1' })),
    };
    messageRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ ...v, id: 5, created_at: new Date() })),
      find: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({})),
    };
    documentService = {
      create: jest.fn(async (dto: any) => ({ id: 33, name: dto.name })),
      getMimeType: jest.fn(() => 'application/octet-stream'),
    };
    service = new ClientPortalService(
      dossierRepo,
      docRepo,
      categoryRepo,
      factureRepo,
      paiementRepo,
      {} as any,
      { findOne: jest.fn(async () => ({ id: 50, first_name: 'Jo', last_name: 'Client' })) } as any,
      messageRepo,
      { findOne: jest.fn(async () => ({ currency: 'XAF', bank_account: 'CM21' })) } as any,
      documentService,
    );
  });

  it('refuse un compte sans fiche client', async () => {
    await expect(service.listFactures({ id: 1, role: 'client' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('documents', () => {
    it("n'expose que les dépôts du client et les pièces « client » validées", async () => {
      docRepo.find.mockResolvedValue([
        doc({ id: 1, name: 'Mon dépôt', status: DocumentCustomerStatus.PENDING, metadata: { source: 'client_portal' } }),
        doc({ id: 2, name: 'Pièce client', category: { code: 'client' } }),
        doc({ id: 3, name: 'Note interne', category: { code: 'interne' } }),
        doc({ id: 4, name: 'Sans catégorie' }),
        doc({ id: 5, name: 'Confidentielle', is_confidential: true, category: { code: 'client' } }),
        doc({ id: 6, name: 'Brouillon cabinet', status: DocumentCustomerStatus.PENDING, category: { code: 'client' } }),
        doc({ id: 7, name: 'Archivé', status: DocumentCustomerStatus.ARCHIVED, metadata: { source: 'client_portal' } }),
      ]);

      const list = await service.listDocuments(CLIENT, 91);

      expect(list.map((d: any) => d.id)).toEqual([1, 2]);
      expect(list[0]).toMatchObject({ from_client: true });
      // Jamais de chemin ni d'URL de fichier dans la réponse.
      expect(JSON.stringify(list)).not.toMatch(/file_path|file_url/);
    });

    it("404 sur le dossier d'un autre client", async () => {
      await expect(service.listDocuments(CLIENT, 92)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('dépôt : en attente, marqué portail client, nom + fichier uniquement', async () => {
      const result = await service.uploadDocument(CLIENT, 91, '  Passeport ', pdf());

      const [dto, userId, options] = documentService.create.mock.calls[0] as any[];
      expect(dto).toMatchObject({
        dossier_id: 91,
        name: 'Passeport',
        category_id: 7,
        is_confidential: false,
      });
      expect(JSON.parse(dto.metadata)).toMatchObject({ source: 'client_portal' });
      expect(userId).toBe(50);
      expect(options).toEqual({ status: DocumentCustomerStatus.PENDING });
      expect(result.status).toBe(DocumentCustomerStatus.PENDING);
    });

    it.each([
      ['format refusé', { ...pdf(), mimetype: 'application/x-msdownload' }, 'Passeport'],
      ['fichier trop gros', pdf(11 * 1024 * 1024), 'Passeport'],
      ['nom manquant', pdf(), '   '],
      ['fichier manquant', undefined, 'Passeport'],
    ])('dépôt refusé : %s', async (_label, file, name) => {
      await expect(
        service.uploadDocument(CLIENT, 91, name as string, file as any),
      ).rejects.toThrow(BadRequestException);
      expect(documentService.create).not.toHaveBeenCalled();
    });
  });

  describe('paiement déclaré', () => {
    it('est créé EN_ATTENTE, signalé « déclaré par le client »', async () => {
      const result = await service.declarePayment(CLIENT, 'f-1', {
        montant: '400,50',
        mode: 'mobile',
        reference: ' TX-1 ',
      });

      const created = paiementRepo.create.mock.calls[0][0] as any;
      expect(created).toMatchObject({
        montant: 400.5,
        status: StatutPaiement.EN_ATTENTE,
        declared_by_client: true,
        reference: 'TX-1',
      });
      expect(result.status).toBe(StatutPaiement.EN_ATTENTE);
    });

    it('refuse un montant supérieur au reste à payer', async () => {
      await expect(
        service.declarePayment(CLIENT, 'f-1', { montant: 1500, mode: 'virement' }),
      ).rejects.toThrow(/dépasse le reste à payer/);
      expect(paiementRepo.save).not.toHaveBeenCalled();
    });

    it('tient compte des paiements déjà en attente', async () => {
      factureRepo.findOne.mockResolvedValue(
        facture({
          paiements: [
            { montant: 300, status: StatutPaiement.VALIDE },
            { montant: 500, status: StatutPaiement.EN_ATTENTE },
          ],
        }),
      );
      // reste 700, dont 500 déjà déclarés → 200 disponibles
      await expect(
        service.declarePayment(CLIENT, 'f-1', { montant: 250, mode: 'virement' }),
      ).rejects.toThrow(/déjà en attente/);
      await expect(
        service.declarePayment(CLIENT, 'f-1', { montant: 200, mode: 'virement' }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['mode inconnu', { montant: 100, mode: 'bitcoin' }],
      ['montant nul', { montant: 0, mode: 'virement' }],
      ['montant absent', { mode: 'virement' }],
      ['date future', { montant: 100, mode: 'virement', date: '2999-01-01' }],
    ])('refuse : %s', async (_label, body) => {
      await expect(
        service.declarePayment(CLIENT, 'f-1', body as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("404 si la facture n'est pas celle du client (filtrée dans la requête)", async () => {
      factureRepo.findOne.mockResolvedValue(null);
      await expect(
        service.declarePayment(CLIENT, 'f-autre', { montant: 10, mode: 'virement' }),
      ).rejects.toThrow(NotFoundException);
      expect((factureRepo.findOne.mock.calls[0][0] as any).where).toMatchObject({
        client_id: 83,
      });
    });

    it('refuse une facture déjà soldée', async () => {
      factureRepo.findOne.mockResolvedValue(
        facture({ status: StatutFacture.PAYEE }),
      );
      await expect(
        service.declarePayment(CLIENT, 'f-1', { montant: 10, mode: 'virement' }),
      ).rejects.toThrow(/n'est plus à régler/);
    });
  });

  describe('factures', () => {
    it("filtre les statuts par chaînes (ENUM MySQL : un nombre vise l'index, pas le libellé)", async () => {
      await service.listFactures(CLIENT);
      const where = (factureRepo.find.mock.calls[0][0] as any).where;
      // '0' (brouillon) et '5' (annulée) ne doivent jamais passer ; '4' (impayée) oui.
      expect((where.status as any).value).toEqual(['1', '2', '3', '4']);
      expect(where.original_facture_id).toBeDefined();

      await service.summary(CLIENT);
      const payable = (factureRepo.find.mock.calls[1][0] as any).where.status;
      expect((payable as any).value).toEqual(['1', '2', '4']);
      expect((docRepo.count.mock.calls[0][0] as any).where.status).toBe('0');
    });

    it('calcule payé / en attente / reste dû et le caractère payable', async () => {
      factureRepo.find.mockResolvedValue([
        facture({
          paiements: [
            { montant: 300, status: StatutPaiement.VALIDE },
            { montant: 200, status: StatutPaiement.EN_ATTENTE },
            { montant: 999, status: StatutPaiement.REJETE },
          ],
        }),
      ]);
      const [view] = await service.listFactures(CLIENT);
      expect(view).toMatchObject({
        paid_amount: 300,
        pending_amount: 200,
        remaining_amount: 700,
        payable: true,
        status_label: 'À régler',
      });
    });

    it("n'est plus payable quand tout le reste est déjà déclaré", async () => {
      factureRepo.find.mockResolvedValue([
        facture({ paiements: [{ montant: 1000, status: StatutPaiement.EN_ATTENTE }] }),
      ]);
      const [view] = await service.listFactures(CLIENT);
      expect(view.payable).toBe(false);
    });
  });

  describe('messagerie', () => {
    it('le message part du client, rattaché à sa fiche', async () => {
      await service.sendMessage(CLIENT, '  Bonjour  ', 91);
      expect(messageRepo.create.mock.calls[0][0]).toMatchObject({
        customer_id: 83,
        dossier_id: 91,
        sender_type: 'client',
        sender_user_id: 50,
        content: 'Bonjour',
      });
    });

    it('refuse un message vide, trop long ou sur un dossier étranger', async () => {
      await expect(service.sendMessage(CLIENT, '   ')).rejects.toThrow(BadRequestException);
      await expect(service.sendMessage(CLIENT, 'x'.repeat(4001))).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendMessage(CLIENT, 'Salut', 92)).rejects.toThrow(
        NotFoundException,
      );
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('la lecture est filtrée sur la fiche du client', async () => {
      await service.listMessages(CLIENT);
      expect((messageRepo.find.mock.calls[0][0] as any).where).toMatchObject({
        customer_id: 83,
      });
      await service.markMessagesRead(CLIENT);
      expect(messageRepo.update.mock.calls[0][0]).toMatchObject({
        customer_id: 83,
        sender_type: 'cabinet',
      });
    });
  });
});

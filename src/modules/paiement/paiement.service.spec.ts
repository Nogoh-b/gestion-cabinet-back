import { BadRequestException } from '@nestjs/common';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import {
  ModePaiement,
  StatutPaiement,
} from './dto/create-paiement.dto';
import { Paiement } from './entities/paiement.entity';
import { PaiementService } from './paiement.service';

describe('PaiementService - cycle et concurrence', () => {
  const paymentRepository = {
    create: jest.fn(() => ({})),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
  };
  const factureRepository = {
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Paiement ? paymentRepository : factureRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const outbox = { enqueue: jest.fn() };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-1' })),
  };
  const antivirus = { scan: jest.fn() };
  let service: PaiementService;

  const actor = { id: 7, userId: 7 };
  const invoice = (): Facture =>
    ({
      id: 'invoice-1',
      dossier_id: 42,
      status: StatutFacture.VALIDEE,
      montantTTC: 100,
      numero: 'FAC-001',
    }) as Facture;
  const payment = (amount = 60): Paiement =>
    ({
      id: 'payment-1',
      factureId: 'invoice-1',
      montant: amount,
      modePaiement: ModePaiement.VIREMENT,
      datePaiement: new Date('2026-07-01'),
      dateValeur: new Date('2026-07-01'),
      reference: 'VIR-1',
      status: StatutPaiement.EN_ATTENTE,
    }) as Paiement;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentRepository.create.mockReturnValue({});
    paymentRepository.save.mockImplementation(async (value) => value);
    factureRepository.save.mockImplementation(async (value) => value);
    service = new PaiementService(
      paymentRepository as any,
      factureRepository as any,
      {} as any,
      {} as any,
      dataSource as any,
      outbox as any,
      audit as any,
      antivirus as any,
    );
    jest
      .spyOn(service as any, 'getEffectiveInvoiceTotalMinor')
      .mockImplementation(async (_manager: any, facture: Facture) =>
        Math.round(Number(facture.montantTTC) * 100),
      );
  });

  it("interdit de réaffecter un paiement à une autre facture", async () => {
    await expect(
      service.updatePaiement(
        'payment-1',
        { factureId: 'invoice-2' } as any,
        actor,
      ),
    ).rejects.toThrow('ne peut pas être modifiée');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('crée toujours un paiement en attente sans changer la facture', async () => {
    const facture = invoice();
    jest.spyOn(service as any, 'lockFacture').mockResolvedValue(facture);
    jest
      .spyOn(service as any, 'getValidatedTotalMinor')
      .mockResolvedValue(2_000);
    paymentRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 'payment-new',
    }));

    const result = await runWithTenantContext(3, () =>
      service.createPaiement(
        {
          factureId: facture.id,
          montant: 50,
          modePaiement: ModePaiement.VIREMENT,
          datePaiement: new Date('2026-07-10'),
          dateValeur: new Date('2026-07-10'),
        },
        undefined,
        actor,
      ),
    );

    expect(result.statut).toBe(StatutPaiement.EN_ATTENTE);
    expect(facture.status).toBe(StatutFacture.VALIDEE);
    expect(factureRepository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ eventType: 'payment.created' }),
    );
  });

  it('valide sous isolation sérialisable et met la facture en paiement partiel', async () => {
    const facture = invoice();
    const paiement = payment(60);
    jest
      .spyOn(service as any, 'findPaymentForUpdate')
      .mockResolvedValue(paiement);
    jest.spyOn(service as any, 'lockFacture').mockResolvedValue(facture);
    jest.spyOn(service as any, 'lockPayment').mockResolvedValue(paiement);
    jest
      .spyOn(service as any, 'getValidatedTotalMinor')
      .mockResolvedValue(0);

    const result = await runWithTenantContext(3, () =>
      service.validerPaiement(paiement.id, actor),
    );

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(result.statut).toBe(StatutPaiement.VALIDE);
    expect(facture.status).toBe(StatutFacture.PARTIELLEMENT_PAYEE);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'payment.validated',
        idempotencyKey: `payment-validated:${paiement.id}`,
      }),
    );
  });

  it('refuse le second paiement qui dépasserait le solde verrouillé', async () => {
    const facture = invoice();
    const paiement = payment(50);
    jest
      .spyOn(service as any, 'findPaymentForUpdate')
      .mockResolvedValue(paiement);
    jest.spyOn(service as any, 'lockFacture').mockResolvedValue(facture);
    jest.spyOn(service as any, 'lockPayment').mockResolvedValue(paiement);
    jest
      .spyOn(service as any, 'getValidatedTotalMinor')
      .mockResolvedValue(6_000);

    await expect(
      runWithTenantContext(3, () =>
        service.validerPaiement(paiement.id, actor),
      ),
    ).rejects.toThrow('dépasserait le solde');

    expect(paymentRepository.save).not.toHaveBeenCalled();
    expect(factureRepository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('interdit de revalider un paiement déjà terminal', async () => {
    const facture = invoice();
    const paiement = payment();
    paiement.status = StatutPaiement.VALIDE;
    jest
      .spyOn(service as any, 'findPaymentForUpdate')
      .mockResolvedValue(paiement);
    jest.spyOn(service as any, 'lockFacture').mockResolvedValue(facture);
    jest.spyOn(service as any, 'lockPayment').mockResolvedValue(paiement);

    await expect(
      runWithTenantContext(3, () =>
        service.validerPaiement(paiement.id, actor),
      ),
    ).rejects.toThrow('en attente');
  });

  it('interdit toute suppression physique', async () => {
    await expect(service.removePaiement()).rejects.toThrow(
      BadRequestException,
    );
  });
});

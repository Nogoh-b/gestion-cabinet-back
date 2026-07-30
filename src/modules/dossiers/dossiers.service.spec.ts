import { DossiersService } from './dossiers.service';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import {
  ConflictCheckStatus,
  Dossier,
  DossierOutcome,
} from './entities/dossier.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { InstanceStatus } from '../procedure/entities/enums/instance-status.enum';
import {
  ProcedureTemplateLifecycle,
} from '../procedure/entities/procedure-template.entity';
import {
  InvoiceNature,
  StatutFacture,
} from '../facture/dto/create-facture.dto';
import { Cabinet } from '../cabinet/entities/cabinet.entity';

describe('DossiersService - modèle administratif', () => {
  let service: DossiersService;
  const dossierRepository = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DossiersService(
      dossierRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('est instanciable avec ses dépendances explicites', () => {
    expect(service).toBeDefined();
  });

  it("n'expose aucun champ de phase dans la recherche dossier", () => {
    const options = (service as any).getDefaultSearchOptions();
    const fields = [
      ...(options.searchFields ?? []),
      ...(options.exactMatchFields ?? []),
    ].map((field: string) => field.toLowerCase());

    expect(fields).not.toEqual(
      expect.arrayContaining([
        'phase',
        'procedure_phase',
        'procedural_phase',
        'analysis',
        'appeal',
        'cassation',
        'enforcement',
      ]),
    );
  });

  it("verrouille les données structurelles après activation", async () => {
    dossierRepository.findOne.mockResolvedValue({
      id: 12,
      status: DossierStatus.ACTIVE,
      client_id: 7,
      lawyer_id: 9,
      procedure_type_id: 2,
      procedure_subtype_id: 3,
      jurisdiction_id: 4,
    });

    await expect(
      service.update(
        12,
        { procedure_subtype_id: 99 } as any,
        { id: 1, role: UserRole.ADMIN } as any,
      ),
    ).rejects.toThrow('verrouillés après activation');
  });

  it('impose la commande dédiée pour modifier les membres', async () => {
    dossierRepository.findOne.mockResolvedValue({
      id: 12,
      status: DossierStatus.DRAFT,
      client_id: 7,
      lawyer_id: 9,
      procedure_type_id: 2,
      procedure_subtype_id: 3,
      jurisdiction_id: 4,
    });

    await expect(
      service.update(
        12,
        { collaborator_ids: [22] } as any,
        { id: 1, role: UserRole.ADMIN } as any,
      ),
    ).rejects.toThrow('commande dédiée');
  });

  it("crée la facture d'ouverture dans la transaction d'activation", async () => {
    const dossier = {
      id: 12,
      tenant_id: 5,
      status: DossierStatus.DRAFT,
      dossier_number: 'DOS-12',
      client_id: 7,
      client: { id: 7 },
      lawyer_id: 9,
      lawyer: { id: 9 },
      collaborators: [],
      procedure_type_id: 2,
      procedure_subtype_id: 3,
      jurisdiction_id: 4,
      opposing_party_name: 'Partie adverse',
      conflict_check_status: ConflictCheckStatus.CLEARED,
      engagement_document_id: 88,
      financial_terms_confirmed: true,
      confidentiality_level: false,
      procedureInstanceId: null,
    } as any;
    const template = {
      id: 'template-1',
      lifecycleStatus: ProcedureTemplateLifecycle.PUBLISHED,
      contentHash: 'a'.repeat(64),
    };
    const instance = {
      id: 'instance-1',
      templateVersionId: 'template-1',
      status: InstanceStatus.ACTIVE,
    } as any;
    const cabinet = {
      id: 5,
      dossier_opening_fee_enabled: true,
      dossier_opening_fee: 100000,
      dossier_opening_fee_tva: 18,
      dossier_opening_fee_label: "Frais d'ouverture",
    } as any;
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === Dossier) return dossier;
        if (entity === ProcedureType) {
          return { procedure_template: template };
        }
        if (entity === Cabinet) return cabinet;
        return null;
      }),
      save: jest.fn(async (value) => value),
      getRepository: jest.fn(() => memberRepository),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    const activationRepository = {
      ...dossierRepository,
      manager: {
        transaction: jest.fn(async (callback: any) => callback(manager)),
      },
    };
    const audit = {
      append: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
    const facture = {
      createFacture: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    };
    const procedureInstance = {
      create: jest.fn().mockResolvedValue(instance),
    };
    const activatedService = new DossiersService(
      activationRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      procedureInstance as any,
      {} as any,
      {} as any,
      dataSource as any,
      audit as any,
      outbox as any,
      facture as any,
      {} as any,
    );
    jest
      .spyOn(activatedService, 'findOne')
      .mockResolvedValue({ id: 12 } as any);

    await activatedService.activate(
      12,
      { id: 1, role: UserRole.ADMIN } as any,
    );

    expect(facture.createFacture).toHaveBeenCalledWith(
      expect.objectContaining({
        dossierId: 12,
        clientId: 7,
        montantHT: 100000,
        montantTVA: 18000,
        montantTTC: 118000,
      }),
      expect.objectContaining({ manager }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'dossier.activated',
        payload: expect.objectContaining({
          openingInvoiceId: 'invoice-1',
        }),
      }),
    );
  });

  it('clôture sous verrou avec audit et outbox', async () => {
    const dossier = {
      id: 12,
      status: DossierStatus.ACTIVE,
      procedureInstanceId: 'instance-1',
      audiences: [{ status: 1 }],
      factures: [
        {
          status: StatutFacture.PAYEE,
          nature: InvoiceNature.FINAL,
        },
      ],
      lawyer: null,
      collaborators: [],
    } as any;
    const manager = {
      findOne: jest.fn(async (entity: any) =>
        entity === Dossier
          ? dossier
          : ({
              id: 'instance-1',
              status: InstanceStatus.COMPLETED,
            } as ProcedureInstance),
      ),
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      transaction: jest.fn(async (_isolation: string, callback: any) =>
        callback(manager),
      ),
    };
    const audit = {
      append: jest.fn().mockResolvedValue({ id: 'audit-close' }),
    };
    const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
    const closingService = new DossiersService(
      dossierRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      audit as any,
      outbox as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(closingService, 'findOne').mockResolvedValue({ id: 12 } as any);

    await closingService.closeDossier(
      12,
      { id: 1, role: UserRole.ADMIN } as any,
      {
        outcome: DossierOutcome.WON,
        outcome_notes: 'Rapport final validé',
        final_decision_text: 'Décision définitive',
      },
    );

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DossierStatus.CLOSED }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'dossier.closed' }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ eventType: 'dossier.closed' }),
    );
  });
});

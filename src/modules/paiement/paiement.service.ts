import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve } from 'path';
import {
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';

import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AntivirusScannerService } from '../documents/document-customer/antivirus-scanner.service';
import { AntivirusStatus } from '../documents/document-customer/entities/document-version.entity';
import {
  InvoiceNature,
  StatutFacture,
} from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import {
  CreatePaiementDto,
  StatutPaiement,
} from './dto/create-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { Paiement } from './entities/paiement.entity';

export interface PaymentActor {
  id?: number;
  userId?: number;
}

export interface PrivatePaymentProof {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sha256: string;
}

@Injectable()
export class PaiementService extends BaseServiceV1<Paiement> {
  private readonly storageRoot = resolve(
    process.env.PRIVATE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'private'),
  );

  constructor(
    @InjectRepository(Paiement)
    protected readonly repository: Repository<Paiement>,
    @InjectRepository(Facture)
    private readonly factureRepository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
    // Conservé pour les notifications non critiques héritées. Les effets
    // comptables utilisent exclusivement l'outbox persistante.
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
    private readonly antivirusScanner: AntivirusScannerService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reference', 'numeroCheque', 'banque', 'titulaire', 'notes'],
      exactMatchFields: [
        'id',
        'factureId',
        'modePaiement',
        'status',
        'reference',
      ],
      dateRangeFields: [
        'datePaiement',
        'dateValeur',
        'created_at',
        'updated_at',
      ],
      relationFields: ['facture', 'facture.client', 'facture.dossier'],
    };
  }

  async createPaiement(
    createDto: CreatePaiementDto,
    file?: Express.Multer.File,
    actor: PaymentActor = {},
  ): Promise<PaiementResponseDto> {
    const amountMinor = this.toMinorUnits(createDto.montant);
    let storedProof:
      | {
          storageKey: string;
          originalName: string;
          mimeType: string;
          size: number;
          sha256: string;
        }
      | undefined;

    if (file) {
      storedProof = await this.storePrivateProof(file);
    }

    try {
      const saved = await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) => {
          const facture = await this.lockFacture(
            manager,
            String(createDto.factureId),
          );
          this.assertReceivableFacture(facture);

          const paidMinor = await this.getValidatedTotalMinor(
            manager,
            facture.id,
          );
          const invoiceMinor = await this.getEffectiveInvoiceTotalMinor(
            manager,
            facture,
          );
          if (amountMinor > invoiceMinor - paidMinor) {
            throw new BadRequestException(
              'Le montant dépasse le solde restant de la facture',
            );
          }

          const repository = manager.getRepository(Paiement);
          const paiement = repository.create();
          Object.assign(paiement, {
            factureId: facture.id,
            montant: this.fromMinorUnits(amountMinor),
            modePaiement: createDto.modePaiement,
            datePaiement: createDto.datePaiement,
            dateValeur: createDto.dateValeur,
            reference: createDto.reference?.trim() || null,
            numeroCheque: createDto.numeroCheque?.trim() || null,
            banque: createDto.banque?.trim() || null,
            titulaire: createDto.titulaire?.trim() || null,
            notes: createDto.notes?.trim() || null,
            status: StatutPaiement.EN_ATTENTE,
            preuvePaiement: storedProof?.storageKey ?? null,
            preuveOriginalName: storedProof?.originalName ?? null,
            preuveMimeType: storedProof?.mimeType ?? null,
            preuveSize:
              storedProof?.size == null ? null : String(storedProof.size),
            preuveSha256: storedProof?.sha256 ?? null,
            notify_client: false,
            notifyClientRequested: Boolean(createDto.notify_client),
          });
          const result = await repository.save(paiement);

          const audit = await this.auditService.append(manager, {
            actorId: actor.userId ?? actor.id ?? null,
            action: 'payment.created',
            resourceType: 'payment',
            resourceId: result.id,
            dossierId: facture.dossier_id,
            afterState: {
              status: result.status,
              amount: result.montant,
              invoiceId: facture.id,
              hasProof: Boolean(result.preuvePaiement),
            },
          });
          await this.outboxService.enqueue(manager, {
            eventType: 'payment.created',
            aggregateType: 'payment',
            aggregateId: result.id,
            idempotencyKey: `payment-created:${audit.id}`,
            payload: {
              paymentId: result.id,
              invoiceId: facture.id,
              dossierId: facture.dossier_id,
              status: result.status,
            },
          });
          return result;
        },
      );
      return plainToInstance(PaiementResponseDto, saved, {
        excludeExtraneousValues: false,
      });
    } catch (error) {
      if (storedProof) {
        await this.deletePrivateFile(storedProof.storageKey);
      }
      throw error;
    }
  }

  async updatePaiement(
    id: string,
    updateDto: UpdatePaiementDto,
    actor: PaymentActor = {},
  ): Promise<PaiementResponseDto> {
    if (updateDto.factureId !== undefined) {
      throw new BadRequestException(
        "La facture d'un paiement ne peut pas être modifiée",
      );
    }
    const updated = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => {
        const snapshot = await this.findPaymentForUpdate(manager, id);
        const facture = await this.lockFacture(manager, snapshot.factureId);
        const paiement = await this.lockPayment(manager, id);
        if (paiement.status !== StatutPaiement.EN_ATTENTE) {
          throw new BadRequestException(
            'Seul un paiement en attente peut être modifié',
          );
        }

        const amountMinor =
          updateDto.montant == null
            ? this.toMinorUnits(paiement.montant)
            : this.toMinorUnits(updateDto.montant);
        const paidMinor = await this.getValidatedTotalMinor(
          manager,
          facture.id,
        );
        if (
          amountMinor >
          (await this.getEffectiveInvoiceTotalMinor(manager, facture)) -
            paidMinor
        ) {
          throw new BadRequestException(
            'Le montant dépasse le solde restant de la facture',
          );
        }

        const beforeState = this.paymentAuditState(paiement);
        paiement.montant = this.fromMinorUnits(amountMinor);
        if (updateDto.modePaiement !== undefined) {
          paiement.modePaiement = updateDto.modePaiement;
        }
        if (updateDto.datePaiement !== undefined) {
          paiement.datePaiement = updateDto.datePaiement;
        }
        if (updateDto.dateValeur !== undefined) {
          paiement.dateValeur = updateDto.dateValeur;
        }
        for (const field of [
          'reference',
          'numeroCheque',
          'banque',
          'titulaire',
          'notes',
        ] as const) {
          if (updateDto[field] !== undefined) {
            (paiement as any)[field] =
              typeof updateDto[field] === 'string'
                ? updateDto[field]?.trim() || null
                : updateDto[field];
          }
        }
        const saved = await manager.getRepository(Paiement).save(paiement);
        const audit = await this.auditService.append(manager, {
          actorId: actor.userId ?? actor.id ?? null,
          action: 'payment.updated',
          resourceType: 'payment',
          resourceId: saved.id,
          dossierId: facture.dossier_id,
          beforeState,
          afterState: this.paymentAuditState(saved),
        });
        await this.outboxService.enqueue(manager, {
          eventType: 'payment.updated',
          aggregateType: 'payment',
          aggregateId: saved.id,
          idempotencyKey: `payment-updated:${audit.id}`,
          payload: {
            paymentId: saved.id,
            invoiceId: facture.id,
            dossierId: facture.dossier_id,
          },
        });
        return saved;
      },
    );
    return plainToInstance(PaiementResponseDto, updated);
  }

  async validerPaiement(
    id: string,
    actor: PaymentActor = {},
  ): Promise<PaiementResponseDto> {
    const result = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const snapshot = await this.findPaymentForUpdate(manager, id);
        const facture = await this.lockFacture(manager, snapshot.factureId);
        const paiement = await this.lockPayment(manager, id);
        if (paiement.status !== StatutPaiement.EN_ATTENTE) {
          throw new BadRequestException(
            'Seul un paiement en attente peut être validé',
          );
        }
        this.assertReceivableFacture(facture);

        const paidMinor = await this.getValidatedTotalMinor(
          manager,
          facture.id,
        );
        const amountMinor = this.toMinorUnits(paiement.montant);
        const totalMinor = await this.getEffectiveInvoiceTotalMinor(
          manager,
          facture,
        );
        const newPaidMinor = paidMinor + amountMinor;
        if (newPaidMinor > totalMinor) {
          throw new BadRequestException(
            'Validation refusée : le paiement dépasserait le solde de la facture',
          );
        }

        paiement.status = StatutPaiement.VALIDE;
        const saved = await manager.getRepository(Paiement).save(paiement);
        const previousInvoiceStatus = facture.status;
        facture.status =
          newPaidMinor === totalMinor
            ? StatutFacture.PAYEE
            : StatutFacture.PARTIELLEMENT_PAYEE;
        await manager.getRepository(Facture).save(facture);

        const audit = await this.auditService.append(manager, {
          actorId: actor.userId ?? actor.id ?? null,
          action: 'payment.validated',
          resourceType: 'payment',
          resourceId: saved.id,
          dossierId: facture.dossier_id,
          beforeState: {
            paymentStatus: StatutPaiement.EN_ATTENTE,
            invoiceStatus: previousInvoiceStatus,
            paidMinor,
          },
          afterState: {
            paymentStatus: saved.status,
            invoiceStatus: facture.status,
            paidMinor: newPaidMinor,
          },
        });
        await this.outboxService.enqueue(manager, {
          eventType: 'payment.validated',
          aggregateType: 'payment',
          aggregateId: saved.id,
          idempotencyKey: `payment-validated:${saved.id}`,
          payload: {
            auditId: audit.id,
            paymentId: saved.id,
            invoiceId: facture.id,
            dossierId: facture.dossier_id,
            amount: saved.montant,
            modePaiement: saved.modePaiement,
            datePaiement: saved.datePaiement,
            reference: saved.reference,
            invoiceNumber: facture.numero,
            invoiceStatus: facture.status,
          },
        });
        return saved;
      },
    );
    return plainToInstance(PaiementResponseDto, result);
  }

  async rejeterPaiement(
    id: string,
    raison: string,
    actor: PaymentActor = {},
  ): Promise<PaiementResponseDto> {
    return this.transitionPendingPayment(
      id,
      StatutPaiement.REJETE,
      raison,
      actor,
    );
  }

  async annulerPaiement(
    id: string,
    raison: string,
    actor: PaymentActor = {},
  ): Promise<PaiementResponseDto> {
    return this.transitionPendingPayment(
      id,
      StatutPaiement.ANNULE,
      raison,
      actor,
    );
  }

  async removePaiement(): Promise<never> {
    throw new BadRequestException(
      'La suppression d’un paiement est interdite ; utilisez la commande d’annulation',
    );
  }

  async getPaymentDossierId(id: string): Promise<number> {
    const paiement = await this.repository.findOne({
      where: { id },
      relations: ['facture'],
    });
    if (!paiement?.facture) {
      throw new NotFoundException('Paiement introuvable');
    }
    return paiement.facture.dossier_id;
  }

  async getFactureDossierId(factureId: string): Promise<number> {
    const facture = await this.factureRepository.findOne({
      where: { id: factureId },
      select: ['id', 'dossier_id'],
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    return facture.dossier_id;
  }

  async getPrivateProof(
    id: string,
    actor: PaymentActor = {},
  ): Promise<PrivatePaymentProof> {
    const paiement = await this.repository.findOne({
      where: { id },
      relations: ['facture'],
    });
    if (!paiement?.preuvePaiement || !paiement.facture) {
      throw new NotFoundException('Preuve de paiement introuvable');
    }
    const absolutePath = this.resolveStorageKey(paiement.preuvePaiement);
    const buffer = await fs.readFile(absolutePath).catch(() => null);
    if (!buffer) throw new NotFoundException('Fichier de preuve introuvable');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    if (paiement.preuveSha256 && paiement.preuveSha256 !== sha256) {
      throw new BadRequestException(
        'La preuve de paiement a échoué au contrôle d’intégrité',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action: 'payment.proof.downloaded',
        resourceType: 'payment',
        resourceId: paiement.id,
        dossierId: paiement.facture.dossier_id,
        afterState: { sha256, size: buffer.length },
      });
    });
    return {
      buffer,
      filename: paiement.preuveOriginalName ?? `preuve-${paiement.id}`,
      mimeType: paiement.preuveMimeType ?? 'application/octet-stream',
      sha256,
    };
  }

  async searchPaiements(searchDto: SearchPaiementDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };
    if (
      searchDto.montant_min !== undefined ||
      searchDto.montant_max !== undefined
    ) {
      criteria.montant = [
        searchDto.montant_min ?? 0,
        searchDto.montant_max ?? Number.MAX_SAFE_INTEGER,
      ];
    }
    return this.searchWithTransformer(
      criteria,
      PaiementResponseDto,
      searchDto,
      ['facture', 'facture.client', 'facture.dossier'],
      { datePaiement: 'DESC' } as any,
    );
  }

  async getPaiementsByFacture(factureId: string): Promise<Paiement[]> {
    return this.findAllV1({ factureId }, undefined, ['facture']);
  }

  async getPaiementsByClient(clientId: string): Promise<Paiement[]> {
    return this.repository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.facture', 'facture')
      .where('facture.client_id = :clientId', { clientId })
      .andWhere('paiement.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .orderBy('paiement.date_paiement', 'DESC')
      .getMany();
  }

  async getPaiementsEnAttente(): Promise<Paiement[]> {
    return this.findAllV1(
      { status: StatutPaiement.EN_ATTENTE },
      undefined,
      ['facture'],
    );
  }

  async getStatistiquesPaiementsParPeriode(
    dateDebut: Date,
    dateFin: Date,
  ): Promise<any> {
    const query = this.repository
      .createQueryBuilder('paiement')
      .where('paiement.date_paiement BETWEEN :dateDebut AND :dateFin', {
        dateDebut,
        dateFin,
      })
      .andWhere('paiement.status = :status', {
        status: StatutPaiement.VALIDE,
      })
      .andWhere('paiement.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      });
    const [rows, total] = await Promise.all([
      query
        .clone()
        .select('paiement.modePaiement', 'mode')
        .addSelect('COUNT(*)', 'nombre')
        .addSelect('SUM(paiement.montant)', 'montantTotal')
        .groupBy('paiement.modePaiement')
        .getRawMany(),
      query
        .clone()
        .select('SUM(paiement.montant)', 'total')
        .getRawOne(),
    ]);
    return {
      total: Number(total?.total ?? 0),
      parMode: rows.map((row) => ({
        mode: row.mode,
        nombre: Number(row.nombre),
        montantTotal: Number(row.montantTotal),
      })),
    };
  }

  private async transitionPendingPayment(
    id: string,
    target: StatutPaiement.REJETE | StatutPaiement.ANNULE,
    rawReason: string,
    actor: PaymentActor,
  ): Promise<PaiementResponseDto> {
    const reason = rawReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const paiement = await this.lockPayment(manager, id);
      if (paiement.status !== StatutPaiement.EN_ATTENTE) {
        throw new BadRequestException(
          'Seul un paiement en attente peut changer vers cet état',
        );
      }
      const facture = await this.lockFacture(manager, paiement.factureId);
      paiement.status = target;
      paiement.notes = `${reason}${paiement.notes ? `\n${paiement.notes}` : ''}`;
      const result = await manager.getRepository(Paiement).save(paiement);
      const action =
        target === StatutPaiement.REJETE
          ? 'payment.rejected'
          : 'payment.cancelled';
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action,
        resourceType: 'payment',
        resourceId: result.id,
        dossierId: facture.dossier_id,
        beforeState: { status: StatutPaiement.EN_ATTENTE },
        afterState: { status: target },
        justification: reason,
      });
      await this.outboxService.enqueue(manager, {
        eventType: action,
        aggregateType: 'payment',
        aggregateId: result.id,
        idempotencyKey: `${action}:${audit.id}`,
        payload: {
          paymentId: result.id,
          invoiceId: facture.id,
          dossierId: facture.dossier_id,
          reason,
        },
      });
      return result;
    });
    return plainToInstance(PaiementResponseDto, saved);
  }

  private async findPaymentForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<Paiement> {
    const payment = await manager.getRepository(Paiement).findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      select: ['id', 'factureId'],
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  private async lockPayment(
    manager: EntityManager,
    id: string,
  ): Promise<Paiement> {
    const payment = await manager
      .getRepository(Paiement)
      .createQueryBuilder('payment')
      .setLock('pessimistic_write')
      .where('payment.id = :id', { id })
      .andWhere('payment.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .getOne();
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  private async lockFacture(
    manager: EntityManager,
    id: string,
  ): Promise<Facture> {
    const facture = await manager
      .getRepository(Facture)
      .createQueryBuilder('facture')
      .setLock('pessimistic_write')
      .where('facture.id = :id', { id })
      .andWhere('facture.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .getOne();
    if (!facture) throw new NotFoundException('Facture introuvable');
    return facture;
  }

  private async getValidatedTotalMinor(
    manager: EntityManager,
    factureId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(Paiement)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.montant), 0)', 'total')
      .where('payment.facture_id = :factureId', { factureId })
      .andWhere('payment.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('payment.status = :status', {
        status: StatutPaiement.VALIDE,
      })
      .getRawOne<{ total: string }>();
    const total = Number(row?.total ?? 0);
    return total > 0 ? this.toMinorUnits(total) : 0;
  }

  private assertReceivableFacture(facture: Facture): void {
    if (facture.nature === InvoiceNature.CREDIT_NOTE) {
      throw new BadRequestException('Un avoir ne peut pas recevoir de paiement');
    }
    if (
      ![
        StatutFacture.VALIDEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
      ].includes(facture.status)
    ) {
      throw new BadRequestException(
        'La facture doit être validée et non annulée avant de recevoir un paiement',
      );
    }
  }

  private async getEffectiveInvoiceTotalMinor(
    manager: EntityManager,
    facture: Facture,
  ): Promise<number> {
    const row = await manager
      .getRepository(Facture)
      .createQueryBuilder('credit')
      .select('COALESCE(SUM(credit.montant_ttc), 0)', 'total')
      .where('credit.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('credit.original_invoice_id = :invoiceId', {
        invoiceId: facture.id,
      })
      .andWhere('credit.nature = :nature', {
        nature: InvoiceNature.CREDIT_NOTE,
      })
      .andWhere('credit.status = :status', {
        status: StatutFacture.VALIDEE,
      })
      .andWhere('credit.deleted_at IS NULL')
      .getRawOne<{ total: string }>();
    const credited = Number(row?.total ?? 0);
    const effective =
      this.toMinorUnits(facture.montantTTC) -
      (credited > 0 ? this.toMinorUnits(credited) : 0);
    if (effective <= 0) {
      throw new BadRequestException(
        'La facture est intégralement soldée par avoir',
      );
    }
    return effective;
  }

  private toMinorUnits(value: number | string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new BadRequestException('Le montant doit être strictement positif');
    }
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 0.000001) {
      throw new BadRequestException(
        'Le montant ne peut pas contenir plus de deux décimales',
      );
    }
    if (!Number.isSafeInteger(rounded)) {
      throw new BadRequestException('Le montant dépasse la capacité autorisée');
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }

  private paymentAuditState(payment: Paiement): Record<string, unknown> {
    return {
      status: payment.status,
      amount: payment.montant,
      modePaiement: payment.modePaiement,
      datePaiement: payment.datePaiement,
      dateValeur: payment.dateValeur,
      reference: payment.reference,
    };
  }

  private async storePrivateProof(file: Express.Multer.File): Promise<{
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
    sha256: string;
  }> {
    if (!file.buffer?.length) {
      throw new BadRequestException('La preuve de paiement est vide');
    }
    const scan = await this.antivirusScanner.scan(file.buffer);
    if (scan.status !== AntivirusStatus.CLEAN) {
      throw new BadRequestException(
        `Preuve refusée par le contrôle antivirus (${scan.status})`,
      );
    }
    const tenantId = getCurrentTenantId();
    const extension = extname(file.originalname || '')
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .slice(0, 12);
    const storageKey = join(
      String(tenantId),
      'payments',
      `${randomUUID()}${extension}`,
    ).replace(/\\/g, '/');
    const absolutePath = this.resolveStorageKey(storageKey);
    await fs.mkdir(resolve(absolutePath, '..'), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });
    return {
      storageKey,
      originalName: file.originalname || 'preuve',
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private resolveStorageKey(storageKey: string): string {
    if (
      !storageKey ||
      storageKey.includes('://') ||
      storageKey.startsWith('/') ||
      storageKey.startsWith('\\')
    ) {
      throw new BadRequestException(
        'La preuve historique n’est pas disponible dans le stockage privé',
      );
    }
    const resolved = resolve(this.storageRoot, storageKey);
    const rootPrefix = `${this.storageRoot.toLowerCase()}\\`;
    if (
      resolved.toLowerCase() !== this.storageRoot.toLowerCase() &&
      !resolved.toLowerCase().startsWith(rootPrefix)
    ) {
      throw new BadRequestException('Chemin de preuve invalide');
    }
    return resolved;
  }

  private async deletePrivateFile(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveStorageKey(storageKey));
    } catch {
      // La transaction métier reste la source de vérité. Un nettoyeur de
      // fichiers orphelins peut reprendre ce cas sans masquer l'erreur initiale.
    }
  }
}

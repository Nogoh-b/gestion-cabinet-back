import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, extname, isAbsolute, join, resolve, sep } from 'path';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { DataSource, In, Repository } from 'typeorm';
import { DocumentType } from '../document-type/entities/document-type.entity';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import {
  RejectDocumentVersionDto,
  ValidateDocumentVersionDto,
} from './dto/review-document-version.dto';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from './entities/document-customer.entity';
import {
  AntivirusStatus,
  DocumentVersion,
  DocumentVersionStatus,
} from './entities/document-version.entity';
import { AntivirusScannerService } from './antivirus-scanner.service';

@Injectable()
export class DocumentVersionService {
  private readonly storageRoot = resolve(
    process.env.PRIVATE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'private'),
  );

  constructor(
    @InjectRepository(DocumentVersion)
    private readonly versionRepository: Repository<DocumentVersion>,
    @InjectRepository(DocumentCustomer)
    private readonly documentRepository: Repository<DocumentCustomer>,
    private readonly dataSource: DataSource,
    private readonly scanner: AntivirusScannerService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly planQuotaService: PlanQuotaService,
  ) {}

  async createDocument(
    dto: CreateDocumentCustomerDto,
    file: Express.Multer.File,
    actorId: number,
  ): Promise<DocumentCustomer> {
    const buffer = await this.readUpload(file);
    const tenantId = getCurrentTenantId();
    await this.assertStorageQuota(tenantId, buffer.length);
    let writtenPath: string | null = null;
    try {
      return await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const dossier = await manager.findOne(Dossier, {
          where: { id: Number(dto.dossier_id), tenant_id: tenantId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!dossier) throw new NotFoundException('Dossier introuvable');
        const documentType = await manager.findOne(DocumentType, {
          where: { id: Number(dto.document_type_id), tenant_id: tenantId },
        });
        if (!documentType) {
          throw new NotFoundException('Type de document introuvable');
        }
        const category = dto.category_id
          ? await manager.findOne(DocumentCategory, {
              where: {
                id: Number(dto.category_id),
                tenant_id: In(tenantId === 1 ? [1] : [1, tenantId]),
              },
            })
          : null;
        if (dto.category_id && !category) {
          throw new NotFoundException('Catégorie de document introuvable');
        }

        const detectedMime = this.detectMime(buffer, file.originalname);
        this.validateFile(buffer, detectedMime, file, documentType);
        const document = new DocumentCustomer();
        Object.assign(document, {
            name: dto.name?.trim() || this.cleanOriginalName(file.originalname),
            description: dto.description ?? null,
            document_type_id: documentType.id,
            document_type: documentType,
            customer_id: dossier.client_id,
            dossier_id: dossier.id,
            dossier,
            category_id: category?.id ?? null,
            category: category ?? undefined,
            uploaded_by_id: actorId,
            status: DocumentCustomerStatus.PENDING,
            file_path: null,
            file_url: null,
            file_size: buffer.length,
            file_mimetype: detectedMime,
            version: 1,
            is_current_version: true,
            required_for_hearing: dto.required_for_hearing ?? false,
            is_confidential: dto.is_confidential ?? false,
             metadata: this.buildMetadata(dto),
            currentVersionId: null,
        } as any);
        await manager.save(document);
        const versionId = randomUUID();
        const storageKey = this.buildStorageKey(
          tenantId,
          dossier.id,
          document.id,
          versionId,
        );
        writtenPath = this.resolveStorageKey(storageKey);
        await fs.mkdir(dirname(writtenPath), { recursive: true });
        await fs.writeFile(writtenPath, buffer, { flag: 'wx' });
        const scan = await this.scanner.scan(buffer);
        const status =
          scan.status === AntivirusStatus.CLEAN
            ? DocumentVersionStatus.PENDING_REVIEW
            : DocumentVersionStatus.QUARANTINED;
        const version = await manager.save(
          manager.create(DocumentVersion, {
            id: versionId,
            documentId: document.id,
            versionNumber: 1,
            storageKey,
            originalName: this.cleanOriginalName(file.originalname),
            detectedMime,
            sizeBytes: String(buffer.length),
            sha256: createHash('sha256').update(buffer).digest('hex'),
            authorId: actorId,
            status,
            antivirusStatus: scan.status,
            reviewedBy: null,
            reviewedAt: null,
            decisionReason: null,
            signatureValue: null,
            sealedAt: null,
            quarantineReason:
              status === DocumentVersionStatus.QUARANTINED
                ? scan.details ?? 'Analyse antivirus non concluante'
                : null,
            legalHold: false,
          }),
        );
        document.currentVersionId = version.id;
        (document as any).file_path = null;
        (document as any).file_url = null;
        await manager.save(document);
        await this.linkProcedureVisitsIfRequested(
          manager,
          dossier,
          document,
          dto.stage_visit_id,
          dto.sub_stage_visit_id,
        );
        const audit = await this.auditService.append(manager, {
          actorId,
          action: 'document.version.created',
          resourceType: 'DocumentVersion',
          resourceId: version.id,
          dossierId: dossier.id,
          afterState: {
            documentId: document.id,
            versionNumber: 1,
            status,
            antivirusStatus: scan.status,
            sha256: version.sha256,
            sizeBytes: version.sizeBytes,
            stageVisitId: dto.stage_visit_id ?? null,
            subStageVisitId: dto.sub_stage_visit_id ?? null,
          },
        });
        await this.outboxService.enqueue(manager, {
          eventType: 'document.version.created',
          aggregateType: 'Document',
          aggregateId: document.id,
          idempotencyKey: `document-version-created:${audit.id}`,
          payload: {
            documentId: document.id,
            versionId: version.id,
            dossierId: dossier.id,
            status,
            initialVersion: true,
            notifyClient: dto.notify_client === true,
            stageVisitId: dto.stage_visit_id ?? null,
            subStageVisitId: dto.sub_stage_visit_id ?? null,
          },
        });
        return document;
      });
    } catch (error) {
      if (writtenPath) await fs.rm(writtenPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async addVersion(
    documentId: number,
    file: Express.Multer.File,
    actorId: number,
  ): Promise<DocumentVersion> {
    const buffer = await this.readUpload(file);
    const tenantId = getCurrentTenantId();
    await this.assertStorageQuota(tenantId, buffer.length);
    let writtenPath: string | null = null;
    try {
      return await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const document = await manager.findOne(DocumentCustomer, {
          where: { id: documentId, tenant_id: tenantId },
          relations: ['dossier', 'document_type'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!document) throw new NotFoundException('Document introuvable');
        const detectedMime = this.detectMime(buffer, file.originalname);
        this.validateFile(buffer, detectedMime, file, document.document_type);
        const latest = await manager.findOne(DocumentVersion, {
          where: { documentId, tenant_id: tenantId },
          order: { versionNumber: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;
        const id = randomUUID();
        const storageKey = this.buildStorageKey(
          tenantId,
          document.dossier_id!,
          document.id,
          id,
        );
        writtenPath = this.resolveStorageKey(storageKey);
        await fs.mkdir(dirname(writtenPath), { recursive: true });
        await fs.writeFile(writtenPath, buffer, { flag: 'wx' });
        const scan = await this.scanner.scan(buffer);
        const status =
          scan.status === AntivirusStatus.CLEAN
            ? DocumentVersionStatus.PENDING_REVIEW
            : DocumentVersionStatus.QUARANTINED;
        const version = await manager.save(
          manager.create(DocumentVersion, {
            id,
            documentId,
            versionNumber,
            storageKey,
            originalName: this.cleanOriginalName(file.originalname),
            detectedMime,
            sizeBytes: String(buffer.length),
            sha256: createHash('sha256').update(buffer).digest('hex'),
            authorId: actorId,
            status,
            antivirusStatus: scan.status,
            quarantineReason:
              status === DocumentVersionStatus.QUARANTINED
                ? scan.details ?? 'Analyse antivirus non concluante'
                : null,
            reviewedBy: null,
            reviewedAt: null,
            decisionReason: null,
            signatureValue: null,
            sealedAt: null,
            legalHold: false,
          }),
        );
        document.currentVersionId = version.id;
        document.version = versionNumber;
        document.file_size = buffer.length;
        document.file_mimetype = detectedMime;
        document.status = DocumentCustomerStatus.PENDING;
        (document as any).file_path = null;
        (document as any).file_url = null;
        await manager.save(document);
        const audit = await this.auditService.append(manager, {
          actorId,
          action: 'document.version.created',
          resourceType: 'DocumentVersion',
          resourceId: version.id,
          dossierId: document.dossier_id,
          afterState: {
            documentId,
            versionNumber,
            status,
            antivirusStatus: scan.status,
            sha256: version.sha256,
          },
        });
        await this.outboxService.enqueue(manager, {
          eventType: 'document.version.created',
          aggregateType: 'Document',
          aggregateId: documentId,
          idempotencyKey: `document-version-created:${audit.id}`,
          payload: {
            documentId,
            versionId: version.id,
            dossierId: document.dossier_id,
            status,
            initialVersion: false,
            notifyClient: false,
          },
        });
        return version;
      });
    } catch (error) {
      if (writtenPath) await fs.rm(writtenPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async listVersions(documentId: number): Promise<DocumentVersion[]> {
    return this.versionRepository.find({
      where: { documentId, tenant_id: getCurrentTenantId() },
      order: { versionNumber: 'DESC' },
    });
  }

  async getDocument(documentId: number): Promise<DocumentCustomer> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, tenant_id: getCurrentTenantId() },
      relations: ['dossier', 'document_type', 'category', 'currentVersion'],
    });
    if (!document) throw new NotFoundException('Document introuvable');
    return document;
  }

  async listDocuments(dossierIds: number[]): Promise<DocumentCustomer[]> {
    if (dossierIds.length === 0) return [];
    return this.documentRepository.find({
      where: {
        dossier_id: In(dossierIds),
        tenant_id: getCurrentTenantId(),
      },
      relations: ['dossier', 'document_type', 'category', 'currentVersion'],
      order: { uploaded_at: 'DESC' },
    });
  }

  async readContent(
    documentId: number,
    versionId: string,
    actorId: number,
    requestContext?: {
      ip?: string | null;
      userAgent?: string | null;
      requestId?: string | null;
    },
  ): Promise<{ version: DocumentVersion; buffer: Buffer }> {
    const version = await this.versionRepository.findOne({
      where: {
        id: versionId,
        documentId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['document'],
    });
    if (!version) throw new NotFoundException('Version documentaire introuvable');
    if (version.status === DocumentVersionStatus.QUARANTINED) {
      throw new BadRequestException('Le fichier est encore en quarantaine');
    }
    const buffer = await fs.readFile(this.resolveStorageKey(version.storageKey));
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hash !== version.sha256) {
      throw new BadRequestException("L'intégrité du fichier ne peut pas être vérifiée");
    }
    await this.dataSource.transaction(async (manager) => {
      await this.auditService.append(manager, {
        actorId,
        action: 'document.version.downloaded',
        resourceType: 'DocumentVersion',
        resourceId: version.id,
        dossierId: version.document?.dossier_id ?? null,
        afterState: { sha256: version.sha256, sizeBytes: version.sizeBytes },
        ip: requestContext?.ip ?? null,
        userAgent: requestContext?.userAgent ?? null,
        requestId: requestContext?.requestId ?? null,
      });
    });
    return { version, buffer };
  }

  async validate(
    documentId: number,
    versionId: string,
    dto: ValidateDocumentVersionDto,
    actorId: number,
  ): Promise<DocumentVersion> {
    return this.review(
      documentId,
      versionId,
      DocumentVersionStatus.ACCEPTED,
      dto.reason ?? null,
      actorId,
      dto.signatureValue ?? null,
    );
  }

  async rescan(
    documentId: number,
    versionId: string,
    actorId: number,
  ): Promise<DocumentVersion> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const version = await manager.findOne(DocumentVersion, {
        where: { id: versionId, documentId, tenant_id: tenantId },
        relations: ['document'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Version documentaire introuvable');
      if (version.status !== DocumentVersionStatus.QUARANTINED) {
        throw new BadRequestException(
          'Seule une version en quarantaine peut être réanalysée',
        );
      }
      const buffer = await fs.readFile(this.resolveStorageKey(version.storageKey));
      const hash = createHash('sha256').update(buffer).digest('hex');
      if (hash !== version.sha256) {
        throw new BadRequestException("L'empreinte du fichier a changé");
      }
      const result = await this.scanner.scan(buffer);
      version.antivirusStatus = result.status;
      version.quarantineReason = result.details;
      if (result.status === AntivirusStatus.CLEAN) {
        version.status = DocumentVersionStatus.PENDING_REVIEW;
        version.quarantineReason = null;
      }
      await manager.save(version);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'document.version.antivirus_scanned',
        resourceType: 'DocumentVersion',
        resourceId: version.id,
        dossierId: version.document?.dossier_id ?? null,
        afterState: {
          antivirusStatus: version.antivirusStatus,
          status: version.status,
          sha256: version.sha256,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'document.version.antivirus_scanned',
        aggregateType: 'Document',
        aggregateId: documentId,
        idempotencyKey: `document-version-antivirus-scanned:${audit.id}`,
        payload: {
          documentId,
          versionId,
          antivirusStatus: version.antivirusStatus,
          status: version.status,
        },
      });
      return version;
    });
  }

  async reject(
    documentId: number,
    versionId: string,
    dto: RejectDocumentVersionDto,
    actorId: number,
  ): Promise<DocumentVersion> {
    return this.review(
      documentId,
      versionId,
      DocumentVersionStatus.REFUSED,
      dto.reason,
      actorId,
      null,
    );
  }

  async revoke(
    documentId: number,
    versionId: string,
    dto: RejectDocumentVersionDto,
    actorId: number,
  ): Promise<DocumentVersion> {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Le motif de révocation est obligatoire');
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const version = await manager.findOne(DocumentVersion, {
        where: { id: versionId, documentId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Version documentaire introuvable');
      if (version.status !== DocumentVersionStatus.ACCEPTED) {
        throw new BadRequestException('Seule une version acceptée peut être révoquée');
      }
      version.status = DocumentVersionStatus.REVOKED;
      version.reviewedBy = actorId;
      version.reviewedAt = new Date();
      version.decisionReason = dto.reason.trim();
      await manager.save(version);
      const document = await manager.findOneByOrFail(DocumentCustomer, {
        id: documentId,
        tenant_id: tenantId,
      });
      if (document.currentVersionId === version.id) {
        document.status = DocumentCustomerStatus.REFUSED;
        await manager.save(document);
      }
      await this.recordDecision(
        manager,
        document,
        version,
        actorId,
        'document.version.revoked',
      );
      return version;
    });
  }

  private async review(
    documentId: number,
    versionId: string,
    target: DocumentVersionStatus.ACCEPTED | DocumentVersionStatus.REFUSED,
    reason: string | null,
    actorId: number,
    signatureValue: string | null,
  ): Promise<DocumentVersion> {
    if (target === DocumentVersionStatus.REFUSED && !reason?.trim()) {
      throw new BadRequestException('Le motif de refus est obligatoire');
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const version = await manager.findOne(DocumentVersion, {
        where: { id: versionId, documentId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Version documentaire introuvable');
      if (version.status !== DocumentVersionStatus.PENDING_REVIEW) {
        throw new BadRequestException(
          'Seule une version en attente de revue peut être décidée',
        );
      }
      if (
        target === DocumentVersionStatus.ACCEPTED &&
        version.antivirusStatus !== AntivirusStatus.CLEAN
      ) {
        throw new BadRequestException(
          "Une version sans résultat antivirus CLEAN ne peut pas être acceptée",
        );
      }
      const document = await manager.findOne(DocumentCustomer, {
        where: { id: documentId, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!document) {
        throw new NotFoundException('Document introuvable');
      }
      if (document.currentVersionId !== version.id) {
        throw new BadRequestException(
          'Seule la version courante peut faire l’objet d’une décision',
        );
      }
      version.status = target;
      version.reviewedBy = actorId;
      version.reviewedAt = new Date();
      version.decisionReason = reason?.trim() || null;
      version.signatureValue = signatureValue;
      version.sealedAt = target === DocumentVersionStatus.ACCEPTED ? new Date() : null;
      await manager.save(version);

      document.currentVersionId = version.id;
      document.status =
        target === DocumentVersionStatus.ACCEPTED
          ? DocumentCustomerStatus.ACCEPTED
          : DocumentCustomerStatus.REFUSED;
      (document as any).date_validation =
        target === DocumentVersionStatus.ACCEPTED ? new Date() : null;
      (document as any).date_ejected =
        target === DocumentVersionStatus.REFUSED ? new Date() : null;
      await manager.save(document);
      await this.recordDecision(
        manager,
        document,
        version,
        actorId,
        target === DocumentVersionStatus.ACCEPTED
          ? 'document.version.accepted'
          : 'document.version.refused',
      );
      return version;
    });
  }

  private async recordDecision(
    manager: any,
    document: DocumentCustomer,
    version: DocumentVersion,
    actorId: number,
    action: string,
  ): Promise<void> {
    const audit = await this.auditService.append(manager, {
      actorId,
      action,
      resourceType: 'DocumentVersion',
      resourceId: version.id,
      dossierId: document.dossier_id,
      afterState: {
        documentId: document.id,
        versionNumber: version.versionNumber,
        status: version.status,
        sha256: version.sha256,
        reviewedAt: version.reviewedAt,
      },
      justification: version.decisionReason,
    });
    await this.outboxService.enqueue(manager, {
      eventType: action,
      aggregateType: 'Document',
      aggregateId: document.id,
      idempotencyKey: `${action}:${audit.id}`,
      payload: {
        documentId: document.id,
        versionId: version.id,
        dossierId: document.dossier_id,
        status: version.status,
      },
    });
  }

  private async linkProcedureVisitsIfRequested(
    manager: any,
    dossier: Dossier,
    document: DocumentCustomer,
    stageVisitId: unknown,
    subStageVisitId: unknown,
  ): Promise<void> {
    if (!stageVisitId && !subStageVisitId) return;
    const tenantId = getCurrentTenantId();
    let stageVisit: StageVisit | null = null;
    if (stageVisitId) {
      stageVisit = await manager.findOne(StageVisit, {
        where: { id: String(stageVisitId), tenant_id: tenantId },
        relations: ['documents'],
      });
      if (
        !stageVisit ||
        stageVisit.instanceId !== dossier.procedureInstanceId
      ) {
        throw new BadRequestException(
          "L'étape n'appartient pas à l'instance du dossier",
        );
      }
    }

    if (subStageVisitId) {
      const subStageVisit = await manager.findOne(SubStageVisit, {
        where: { id: String(subStageVisitId), tenant_id: tenantId },
        relations: ['stageVisit', 'stageVisit.documents', 'documents'],
      });
      if (
        !subStageVisit ||
        subStageVisit.stageVisit?.instanceId !== dossier.procedureInstanceId ||
        (stageVisit && subStageVisit.stageVisitId !== stageVisit.id)
      ) {
        throw new BadRequestException(
          "La sous-étape n'appartient pas à l'instance et à l'étape indiquées",
        );
      }
      subStageVisit.documents = this.appendDocument(
        subStageVisit.documents,
        document,
      );
      await manager.save(subStageVisit);
      stageVisit = stageVisit ?? subStageVisit.stageVisit;
    }

    if (stageVisit) {
      stageVisit.documents = this.appendDocument(
        stageVisit.documents,
        document,
      );
      await manager.save(stageVisit);
    }
  }

  private appendDocument(
    existing: DocumentCustomer[] | undefined,
    document: DocumentCustomer,
  ): DocumentCustomer[] {
    const byId = new Map(
      [...(existing ?? []), document].map((item) => [item.id, item]),
    );
    return [...byId.values()];
  }

  private buildMetadata(
    dto: CreateDocumentCustomerDto,
  ): Record<string, any> | null {
    const metadata = this.parseMetadata(dto.metadata) ?? {};
    if (dto.keywords?.trim()) {
      metadata.keywords = dto.keywords
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean);
    }
    if (dto.document_date) {
      metadata.document_date = dto.document_date;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private async readUpload(file: Express.Multer.File): Promise<Buffer> {
    if (!file) throw new BadRequestException('Fichier obligatoire');
    if (file.buffer?.length) return file.buffer;
    if (file.path) return fs.readFile(file.path);
    throw new BadRequestException('Contenu du fichier absent');
  }

  private async assertStorageQuota(
    tenantId: number,
    additionalBytes: number,
  ): Promise<void> {
    const row = await this.versionRepository
      .createQueryBuilder('version')
      .select(
        'COALESCE(SUM(CAST(version.size_bytes AS DECIMAL(65, 0))), 0)',
        'total',
      )
      .where('version.tenant_id = :tenantId', { tenantId })
      .andWhere('version.deleted_at IS NULL')
      .getRawOne<{ total: string }>();
    const currentBytes = Number(row?.total ?? 0);
    if (!Number.isSafeInteger(currentBytes) || currentBytes < 0) {
      throw new BadRequestException(
        "Le volume de stockage du cabinet ne peut pas être déterminé",
      );
    }
    await this.planQuotaService.checkStorageLimit(
      tenantId,
      currentBytes,
      additionalBytes,
    );
  }

  private validateFile(
    buffer: Buffer,
    detectedMime: string,
    file: Express.Multer.File,
    documentType: DocumentType,
  ): void {
    if (buffer.length === 0) throw new BadRequestException('Fichier vide');
    const configuredMax = Number(documentType.max_size);
    const max = Number.isFinite(configuredMax) && configuredMax > 0
      ? configuredMax
      : 50 * 1024 * 1024;
    if (buffer.length > max) {
      throw new BadRequestException(`Fichier supérieur à la limite de ${max} octets`);
    }
    if (detectedMime === 'application/octet-stream') {
      throw new BadRequestException('Type binaire inconnu ou non autorisé');
    }
    const expected = documentType.mimetype?.trim();
    if (
      expected &&
      expected !== '*/*' &&
      !expected
        .split(',')
        .map((item) => item.trim())
        .some(
          (item) =>
            detectedMime === item ||
            (item.endsWith('/') && detectedMime.startsWith(item)) ||
            (item.endsWith('/*') &&
              detectedMime.startsWith(item.slice(0, -1))),
        )
    ) {
      throw new BadRequestException(
        `Type détecté ${detectedMime} incompatible avec ${expected}`,
      );
    }
    if (
      file.mimetype &&
      file.mimetype !== 'application/octet-stream' &&
      !this.mimeCompatible(file.mimetype, detectedMime)
    ) {
      throw new BadRequestException(
        `Le type déclaré ${file.mimetype} ne correspond pas au contenu ${detectedMime}`,
      );
    }
  }

  private mimeCompatible(claimed: string, detected: string): boolean {
    if (claimed === detected) return true;
    return (
      (claimed.includes('wordprocessingml') &&
        detected.includes('wordprocessingml')) ||
      (claimed.includes('spreadsheetml') &&
        detected.includes('spreadsheetml')) ||
      (claimed.startsWith('text/') && detected === 'text/plain')
    );
  }

  private detectMime(buffer: Buffer, originalName: string): string {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
      return 'image/gif';
    }
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(buffer[2])
    ) {
      const index = buffer.toString('latin1');
      if (index.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (index.includes('xl/')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
      return 'application/zip';
    }
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    const printable = [...sample].filter(
      (byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127),
    ).length;
    if (sample.length > 0 && printable / sample.length > 0.95) {
      const extension = extname(originalName).toLowerCase();
      return extension === '.csv' ? 'text/csv' : 'text/plain';
    }
    return 'application/octet-stream';
  }

  private parseMetadata(value?: string): Record<string, any> | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      throw new BadRequestException('Métadonnées JSON invalides');
    }
  }

  private cleanOriginalName(value: string): string {
    return value.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f]/g, '').slice(0, 255);
  }

  private buildStorageKey(
    tenantId: number,
    dossierId: number,
    documentId: number,
    versionId: string,
  ): string {
    return [String(tenantId), String(dossierId), String(documentId), versionId].join('/');
  }

  private resolveStorageKey(storageKey: string): string {
    if (isAbsolute(storageKey) || storageKey.includes('..')) {
      throw new BadRequestException('Clé de stockage invalide');
    }
    const target = resolve(this.storageRoot, storageKey);
    if (target !== this.storageRoot && !target.startsWith(`${this.storageRoot}${sep}`)) {
      throw new BadRequestException('Clé de stockage hors périmètre');
    }
    return target;
  }
}

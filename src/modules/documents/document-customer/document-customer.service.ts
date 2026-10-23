import { plainToInstance } from 'class-transformer';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import {
  UPLOAD_DOCS_PATH,
  UPLOAD_PATH,
} from 'src/core/common/constants/constants';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { FilesUtil, UploadedFileInfo } from 'src/core/shared/utils/file.util';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { CabinetService } from 'src/modules/cabinet/cabinet.service';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { CustomersService } from 'src/modules/customer/customer/customer.service';
import { CustomerResponseDto } from 'src/modules/customer/customer/dto/customer-response.dto';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentCategoryService } from 'src/modules/document-category/document-category.service';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { DossiersService } from 'src/modules/dossiers/dossiers.service';

import { DossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  forwardRef,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import { DocumentType } from '../document-type/entities/document-type.entity';

import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import {
  CreateDocumentFromCotiDto,
  KycSyncDto,
} from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { UpdateDocumentCustomerDto } from './dto/update-document-customer.dto';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from './entities/document-customer.entity';
import {
  DocumentCustomerVersion,
  type DocumentVersionSource,
} from './entities/document-customer-version.entity';
import { signUploadUrl } from 'src/core/security/uploads-access';
import { withDocumentMeta } from './document-metadata';

/** Ligne de l'historique des versions (la version courante comprise). */
export interface DocumentVersionView {
  /** null pour la version courante (le document lui-même). */
  id: number | null;
  version: number;
  current: boolean;
  name: string;
  file_size: number | null;
  file_mimetype: string | null;
  source: DocumentVersionSource;
  comment: string | null;
  created_by: { id: number; name: string } | null;
  created_at: Date | null;
}

/** Émis quand le cabinet valide ou refuse un document en attente. */
export const DOCUMENT_REVIEWED_EVENT = 'document-customer.reviewed';

export class DocumentCustomerService extends BaseServiceV1<DocumentCustomer> {
  constructor(
    @InjectRepository(DocumentCustomer)
    private docRepository: Repository<DocumentCustomer>,

    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,
    private procedureInstanceService: ProcedureInstanceService,
    @InjectRepository(SubStageVisit)
    private subStageVisitRepository: Repository<SubStageVisit>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @Inject(forwardRef(() => CustomersService))
    private customerService: CustomersService,
    @Inject(forwardRef(() => DossiersService))
    private dossierService: DossiersService,
    protected readonly paginationService: PaginationServiceV1,
    private documentCategoryService: DocumentCategoryService,
    // @Inject(forwardRef(() => StepsService))
    // private stepsService: StepsService,
    private cabinetService: CabinetService,
    private planQuotaService: PlanQuotaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional()
    @InjectRepository(DocumentCustomerVersion)
    private readonly versionRepository?: Repository<DocumentCustomerVersion>,
  ) {
    super(docRepository, paginationService);
  }

  /** Volume total déjà stocké (octets) par le cabinet courant, versions archivées comprises. */
  private async currentStorageBytes(): Promise<number> {
    let qb = this.docRepository
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.file_size), 0)', 'total');
    qb = addTenantCondition(qb, 'd');
    const row = await qb.getRawOne<{ total: string }>();
    let archived = 0;
    if (this.versionRepository) {
      let versions = this.versionRepository
        .createQueryBuilder('v')
        .select('COALESCE(SUM(v.file_size), 0)', 'total');
      versions = addTenantCondition(versions, 'v');
      const archivedRow = await versions
        .getRawOne<{ total: string }>()
        .catch(() => null);
      archived = Number(archivedRow?.total ?? 0) || 0;
    }
    return (Number(row?.total ?? 0) || 0) + archived;
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs pour la recherche globale (texte)
      searchFields: [
        'name',
        'description',
        'document_type.name',
        'document_type.code',
        'customer.customer_code',
        'customer.last_name',
        'customer.first_name',
        'customer.company_name',
        'dossier.object',
        'uploaded_by.first_name',
        'uploaded_by.last_name',
        'metadata.keywords',
      ],

      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'status',
        'category',
        'version',
        'is_current_version',
        'required_for_hearing',
        'is_confidential',
        'document_type_id',
        'dossier_id',
        'customer_id',
        'uploaded_by_id',
        'previous_version_id',
      ],

      // Champs pour ranges de dates
      dateRangeFields: [
        'uploaded_at',
        'last_modified',
        'date_validation',
        'date_ejected',
        'date_expired',
      ],

      // Champs de relations pour filtrage
      relationFields: [
        'document_type',
        'customer',
        'category',
        'dossier',
        'uploaded_by',
        'previous_version',
        'stageVisits',
        'sub_stage_visits',
      ],
    };
  }

  async findOne(id: number): Promise<DocumentCustomerResponseDto> {
    const document = await this.repository.findOne({
      where: { id },
      relations: [
        'customer',
        'document_type',
        'uploaded_by',
        'dossier',
        'category',
      ], // si tu veux inclure les relations
    });

    if (!document) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }

    return plainToInstance(DocumentCustomerResponseDto, document);
  }

  /**
   * Recherche avancée de documents avec jointures
   */
  private async searchDocuments(params: {
    documentTypeId?: number;
    customerId?: number;
    status?: DocumentCustomerStatus | DocumentCustomerStatus[];
  }): Promise<DocumentCustomer[]> {
    const { documentTypeId, customerId, status } = params;

    const query = this.docRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.document_type', 'document_type')
      .leftJoinAndSelect('doc.customer', 'customer')
      .leftJoinAndSelect('doc.dossier', 'dossier')
      .leftJoinAndSelect('doc.uploaded_by', 'uploaded_by');
    // Isolation multi-tenant.
    addTenantCondition(query, 'doc');

    if (documentTypeId) {
      query.andWhere('document_type.id = :documentTypeId', { documentTypeId });
    }

    if (customerId) {
      query.andWhere('customer.id = :customerId', { customerId });
    }

    if (status) {
      if (Array.isArray(status)) {
        query.andWhere('doc.status IN (:...status)', { status });
      } else {
        query.andWhere('doc.status = :status', { status });
      }
    }

    return query.getMany();
  }

  /**
   * Crée un nouveau document client
   */
  async create(
    createDto: CreateDocumentCustomerDto & { file: Express.Multer.File },
    uploadedByUserId?: number,
    options?: { status?: DocumentCustomerStatus },
  ): Promise<DocumentCustomerResponseDto | any> {
    const {
      document_type_id,
      customer_id,
      category_id,
      dossier_id,
      loan_id,
      file,
      strict = true,
      audience_id,
      audience_phase,
      keywords,
      document_date,
      ...restDto
    } = createDto;
    const metadata = withDocumentMeta(restDto.metadata, { keywords, document_date });

    try {
      // 1. Validation du dossier : le client est déduit de cette relation.
      const dossier: DossierResponseDto = await this.validateDossier(
        dossier_id,
        strict,
      );
      if (!dossier && !strict) return null;

      // 1 bis. Pièce pour préparer une audience : audience du même dossier.
      if (audience_id) {
        await this.validateHearing(audience_id, dossier_id);
        // Seule la préparation est « requise pour l'audience ».
        if (audience_phase !== 'after') restDto.required_for_hearing = true;
      }

      // 2. Le type et la catégorie sont des informations complémentaires.
      const docType = document_type_id
        ? await this.validateDocumentType(document_type_id, strict)
        : null;
      const customer = await this.validateCustomer(
        dossier.client.id,
        document_type_id ?? 0,
        strict,
      );
      if (!customer && !strict) return null;
      const category = category_id
        ? await this.documentCategoryService.findOne(category_id)
        : null;

      // 5. Vérification des documents similaires existants
      const hasSimilarDocs = document_type_id
        ? await this.checkSimilarDocuments(document_type_id, dossier.client.id)
        : false;
      if (hasSimilarDocs && strict) {
        // throw new ConflictException(`Un document de ce type a déjà été soumis ou validé`);
      }
      if (hasSimilarDocs && !strict) return null;

      // 6. Validation du fichier
      if (docType) await this.validateFile(file, docType, strict);
      if (!file && strict) {
        throw new BadRequestException('Aucun fichier uploadé');
      }
      if (!file && !strict) return null;

      // 7. Récupération du nom du cabinet depuis le tenant
      const tenantId = getCurrentTenantId();

      // ── Quota de stockage : refuse l'upload AVANT d'écrire le fichier ──────
      if (tenantId && file?.size) {
        const used = await this.currentStorageBytes();
        await this.planQuotaService.checkStorageLimit(
          tenantId,
          used,
          Number(file.size) || 0,
        );
      }

      let cabinetName = 'cabinet';
      try {
        const cabinet = await this.cabinetService.findById(tenantId);
        if (cabinet?.name) {
          cabinetName = FilesUtil.sanitizeName(cabinet.name).toLowerCase();
        }
      } catch {
        cabinetName = 'cabinet';
      }

      const categoryName = category?.name ?? 'Documents non classés';
      const typeName = docType?.name ?? 'Pièces diverses';
      const dir = `${cabinetName}/${dossier.dossier_number}/${categoryName}/${typeName}`;
      // 8. Upload du fichier
      const docName = restDto.name || path.parse(file.originalname).name;
      const uploadedFile = await this.uploadFile(file, dir, docName);

      // 🔍 RÉCUPÉRATION DE L'INSTANCE DE PROCÉDURE ACTIVE
      // let procedureInstance: ProcedureInstance | null = null;
      // let subStage: SubStage | null = null;

      // if (dossier.procedureInstance) {
      //   // Sinon, prendre l'instance active du dossier
      //   procedureInstance =  dossier.procedureInstance;
      // }

      // // 🔍 RÉCUPÉRATION DE LA SOUS-ÉTAPE CORRESPONDANTE
      // if (procedureInstance && procedureInstance.currentStage) {
      //   // Option: prendre la première sous-étape obligatoire non complétée
      //   const currentStage = procedureInstance.currentStage;
      //   const completedSubStages = procedureInstance.completedSubStages || [];

      //   subStage = currentStage.subStages?.find(
      //     (ss: SubStage) =>
      //       ss.isMandatory &&
      //       !completedSubStages.includes(ss.id)
      //   ) || currentStage.subStages?.[0];
      // }

      // 8. Création du document
      const document = await this.createDocument({
        ...restDto,
        metadata,
        document_type: docType ?? undefined,
        customer,
        status: options?.status ?? DocumentCustomerStatus.ACCEPTED,
        category: category
          ? plainToInstance(DocumentCategory, category)
          : undefined,
        dossier: plainToInstance(Dossier, dossier), // ou gardez l'objet tel quel
        notify_client: !!createDto.notify_client,
        uploadedFile,

        uploadedByUserId,
      });

      // const currentStep = await this.stepsService.getCurrentStep(createDto.dossier_id);

      // // Lier automatiquement le document à l'étape courante (Many-to-Many)
      // if (currentStep) {
      //   await this.stepsService.linkDocumentToStep(document.id, currentStep.id);
      // }
      // if (currentStep) {
      //   await this.stepsService.syncActionWithStep('document', document.id, currentStep.id);
      // }
      // Si des diligences ou audiences sont spécifiées dans le formulaire
      // if (createDto.diligence_ids?.length) {
      //   await this.stepsService.linkDocumentToMultipleEntities(document.id, {
      //     diligenceIds: createDto.diligence_ids
      //   });
      // }

      // if (createDto.audience_ids?.length) {
      //   await this.stepsService.linkDocumentToMultipleEntities(document.id, {
      //     audienceIds: createDto.audience_ids
      //   });
      // }

      // 9. Validation automatique si demandée
      // if (createDto.status === DocumentCustomerStatus.ACCEPTED) {
      //   await this.stepsService.updateStepMetrics(document.id);
      // }
      if (audience_id) {
        await this.docRepository.manager.query(
          'INSERT IGNORE INTO audience_documents (audience_id, document_id, phase) VALUES (?, ?, ?)',
          [audience_id, document.id, audience_phase === 'after' ? 'after' : 'preparation'],
        );
      }
      if (createDto.sub_stage_visit_id) {
        await this.linkDocumentsToSubStage(
          [document.id],
          createDto.sub_stage_visit_id,
        );
      }

      return plainToInstance(DocumentCustomerResponseDto, document);
    } catch (error) {
      if (!strict) return null;
      throw error;
    }
  }

  /** L'audience visée existe dans le cabinet et appartient au dossier du document. */
  private async validateHearing(audienceId: number, dossierId: number): Promise<void> {
    const rows: Array<{ dossier_id: number | null }> =
      await this.docRepository.manager.query(
        'SELECT dossier_id FROM audiences WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [audienceId, getCurrentTenantId()],
      );
    if (!rows.length) {
      throw new NotFoundException(`Audience ${audienceId} introuvable`);
    }
    if (Number(rows[0].dossier_id) !== Number(dossierId)) {
      throw new BadRequestException(
        "L'audience choisie n'appartient pas au dossier du document.",
      );
    }
  }

  /**
   * Met à jour un document client existant
   */
  async update(
    id: number,
    updateDto: UpdateDocumentCustomerDto & { file?: Express.Multer.File },
    userId?: number,
  ): Promise<DocumentCustomerResponseDto> {
    const existing = await this.docRepository.findOne({
      where: { id },
      relations: ['customer', 'document_type', 'dossier', 'category'],
    });

    if (!existing) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }

    const { file, ...restDto } = updateDto;

    // 1. Nouveau fichier : nouvelle version du même document (l'ancien
    //    fichier est archivé, jamais écrasé ni dupliqué).
    if (file) {
      await this.replaceFile(existing, file, userId, {
        source: 'upload',
        name: restDto.name || existing.name,
      });
    }

    // 2. Si document_type_id change, valider le nouveau type
    if (
      updateDto.document_type_id &&
      updateDto.document_type_id !== existing.document_type_id
    ) {
      const docType = await this.validateDocumentType(
        updateDto.document_type_id,
        true,
      );
      if (docType) {
        existing.document_type = docType;
        existing.document_type_id = docType.id;
      }
    }

    // 3. Si dossier_id change, valider le nouveau dossier
    if (updateDto.dossier_id && updateDto.dossier_id !== existing.dossier_id) {
      const dossier = await this.validateDossier(updateDto.dossier_id, true);
      if (dossier) {
        existing.dossier = plainToInstance(Dossier, dossier);
        existing.dossier_id = dossier.id;
      }
    }

    // 4. Si customer_id change, valider le nouveau client
    if (
      updateDto.customer_id &&
      updateDto.customer_id !== existing.customer_id
    ) {
      const customer = await this.validateCustomer(
        updateDto.customer_id,
        existing.document_type_id ?? 0,
        true,
      );
      if (customer) {
        existing.customer = customer;
        existing.customer_id = customer.id;
      }
    }

    // 5. Si category_id change, valider la nouvelle catégorie
    if (
      updateDto.category_id &&
      updateDto.category_id !== existing.category_id
    ) {
      const category = await this.documentCategoryService.findOne(
        updateDto.category_id,
      );
      if (category) {
        existing.category = plainToInstance(DocumentCategory, category);
        existing.category_id = category.id;
      }
    }

    // 6. Mise à jour des champs simples
    if (updateDto.name !== undefined) existing.name = updateDto.name;
    if (updateDto.description !== undefined)
      existing.description = updateDto.description;
    if (updateDto.required_for_hearing !== undefined)
      existing.required_for_hearing = updateDto.required_for_hearing;
    if (updateDto.is_confidential !== undefined)
      existing.is_confidential = updateDto.is_confidential;
    if (updateDto.status !== undefined) existing.status = updateDto.status;
    if (updateDto.metadata !== undefined) {
      try {
        existing.metadata =
          typeof updateDto.metadata === 'string'
            ? JSON.parse(updateDto.metadata)
            : updateDto.metadata;
      } catch {
        // existing.metadata = { error: 'Invalid JSON format' };
      }
    }
    // Mots-clés et date saisis à plat : fusionnés dans les métadonnées.
    if (updateDto.keywords !== undefined || updateDto.document_date !== undefined) {
      existing.metadata = withDocumentMeta(existing.metadata, {
        keywords: updateDto.keywords,
        document_date: updateDto.document_date,
      }) as DocumentCustomer['metadata'];
    }

    // 7. Versioning : seul un nouveau fichier change la version (cf. replaceFile).
    const saved = await this.docRepository.save(existing);
    return plainToInstance(DocumentCustomerResponseDto, saved);
  }

  // ==================== VERSIONS ====================

  /**
   * Nouvelle version d'un document classé (fichier remplacé à la main, ou
   * document modifié depuis le studio du chat) : même id, version suivante,
   * l'ancien fichier rejoint l'historique.
   */
  async addVersion(
    id: number,
    file: Express.Multer.File,
    userId?: number,
    options: { source?: DocumentVersionSource; comment?: string; name?: string } = {},
  ): Promise<DocumentCustomerResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni pour la nouvelle version');
    }
    const existing = await this.docRepository.findOne({
      where: { id },
      relations: ['customer', 'document_type', 'dossier', 'category'],
    });
    if (!existing) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }
    await this.replaceFile(existing, file, userId, options);
    const saved = await this.docRepository.save(existing);
    return plainToInstance(DocumentCustomerResponseDto, saved);
  }

  /** Versions du document, la courante en premier. */
  async listVersions(id: number): Promise<DocumentVersionView[]> {
    const document = await this.docRepository.findOne({
      where: { id },
      relations: ['uploaded_by'],
    });
    if (!document) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }
    const archived = this.versionRepository
      ? await this.versionRepository.find({
          where: { document_id: id },
          relations: ['created_by'],
          order: { version: 'DESC' },
        })
      : [];
    const meta: any = document.metadata ?? {};
    const userName = (user: any) =>
      user
        ? String(
            user.full_name ||
              [user.first_name, user.last_name].filter(Boolean).join(' ') ||
              user.username ||
              `#${user.id}`,
          ).trim()
        : '';
    const currentAuthorId = Number(meta.version_by ?? document.uploaded_by_id) || null;
    const currentAuthor =
      currentAuthorId && currentAuthorId === document.uploaded_by_id
        ? document.uploaded_by
        : null;
    return [
      {
        id: null,
        version: document.version ?? 1,
        current: true,
        name: document.name,
        file_size: document.file_size ?? null,
        file_mimetype: document.file_mimetype ?? null,
        source: (meta.version_source as DocumentVersionSource) ?? 'upload',
        comment: meta.version_comment ?? null,
        created_by: currentAuthorId
          ? { id: currentAuthorId, name: userName(currentAuthor) || meta.version_by_name || '' }
          : null,
        created_at: meta.version_at ? new Date(meta.version_at) : document.uploaded_at ?? null,
      },
      ...archived.map((row) => ({
        id: row.id,
        version: row.version,
        current: false,
        name: row.name,
        file_size: row.file_size,
        file_mimetype: row.file_mimetype,
        source: row.source,
        comment: row.comment,
        created_by: row.created_by_id
          ? { id: row.created_by_id, name: userName(row.created_by) }
          : null,
        created_at: row.created_at ?? null,
      })),
    ];
  }

  /** Octets d'une version archivée (fichier local, sinon son URL). */
  async readVersionFile(
    id: number,
    versionId: number,
  ): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const version = this.versionRepository
      ? await this.versionRepository.findOne({
          where: { id: versionId, document_id: id },
        })
      : null;
    if (!version) throw new NotFoundException('Version introuvable');
    const buffer = await this.readStoredFile(version.file_path, version.file_url);
    const ext = path.extname(version.file_path || version.file_url || '');
    const name = version.name.toLowerCase().endsWith(ext.toLowerCase())
      ? version.name
      : `${version.name}${ext}`;
    return {
      buffer,
      mimeType: version.file_mimetype || this.getMimeType(ext.replace('.', '')),
      name,
    };
  }

  /** Restaure une version archivée : elle redevient courante, en version suivante. */
  async restoreVersion(
    id: number,
    versionId: number,
    userId?: number,
  ): Promise<DocumentCustomerResponseDto> {
    const version = this.versionRepository
      ? await this.versionRepository.findOne({
          where: { id: versionId, document_id: id },
        })
      : null;
    if (!version) throw new NotFoundException('Version introuvable');
    const { buffer, mimeType, name } = await this.readVersionFile(id, versionId);
    const file = {
      buffer,
      size: buffer.length,
      mimetype: mimeType,
      originalname: name,
      fieldname: 'file',
      encoding: '7bit',
    } as Express.Multer.File;
    return this.addVersion(id, file, userId, {
      source: 'restore',
      comment: `Restauration de la version ${version.version}`,
      name: version.name,
    });
  }

  /**
   * Archive le fichier courant puis enregistre `file` à sa place (même
   * dossier sur le disque, nom libre trouvé par l'upload) ; à sauvegarder.
   */
  private async replaceFile(
    existing: DocumentCustomer,
    file: Express.Multer.File,
    userId?: number,
    options: { source?: DocumentVersionSource; comment?: string; name?: string } = {},
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (tenantId && file?.size) {
      await this.planQuotaService.checkStorageLimit(
        tenantId,
        await this.currentStorageBytes(),
        Number(file.size) || 0,
      );
    }
    const name = options.name || existing.name;
    const uploadedFile = await this.uploadFile(
      file,
      await this.storageDir(existing),
      name,
    );

    const meta: any = existing.metadata ?? {};
    if (existing.file_path || existing.file_url) {
      if (!this.versionRepository) {
        throw new InternalServerErrorException('Historique des versions indisponible');
      }
      // La ligne décrit la version archivée : son auteur et son origine.
      await this.versionRepository.save(
        this.versionRepository.create({
          document_id: existing.id,
          version: existing.version ?? 1,
          name: existing.name,
          file_path: existing.file_path ?? null,
          file_url: existing.file_url ?? null,
          file_size: existing.file_size ?? null,
          file_mimetype: existing.file_mimetype ?? null,
          source: (meta.version_source as DocumentVersionSource) ?? 'upload',
          comment: meta.version_comment ?? null,
          created_by_id: Number(meta.version_by ?? existing.uploaded_by_id) || null,
        }),
      );
    }

    const version = (existing.version ?? 1) + 1;
    existing.name = name;
    existing.file_path = uploadedFile.filePath;
    existing.file_url = uploadedFile.fileUrl;
    existing.file_size = uploadedFile.fileSize;
    existing.file_mimetype = uploadedFile.mimeType;
    existing.version = version;
    existing.is_current_version = true;
    existing.metadata = {
      ...meta,
      original_filename: file.originalname,
      version_source: options.source ?? 'upload',
      version_comment: options.comment ?? null,
      version_by: userId ?? null,
      version_at: new Date().toISOString(),
      audit_trail: [
        ...(Array.isArray(meta.audit_trail) ? meta.audit_trail : []),
        {
          action: 'new_version',
          user_id: userId ?? 0,
          timestamp: new Date(),
          details: `Version ${version}${options.comment ? ` — ${options.comment}` : ''}`,
        },
      ],
    };
  }

  /** Dossier de stockage d'un document, comme à sa création. */
  private async storageDir(document: DocumentCustomer): Promise<string> {
    let cabinetName = 'cabinet';
    try {
      const cabinet = await this.cabinetService.findById(getCurrentTenantId());
      if (cabinet?.name) {
        cabinetName = FilesUtil.sanitizeName(cabinet.name).toLowerCase();
      }
    } catch {
      cabinetName = 'cabinet';
    }
    const dossierNumber =
      document.dossier?.dossier_number ??
      (document.dossier_id
        ? (await this.dossierService.findOne(document.dossier_id).catch(() => null))
            ?.dossier_number
        : null);
    if (!dossierNumber) return `${cabinetName}/documents`;
    const categoryName = document.category?.name ?? 'Documents non classés';
    const typeName = document.document_type?.name ?? 'Pièces diverses';
    return `${cabinetName}/${dossierNumber}/${categoryName}/${typeName}`;
  }

  /** Fichier stocké : chemin local d'abord, sinon son URL signée. */
  private async readStoredFile(
    filePath?: string | null,
    fileUrl?: string | null,
  ): Promise<Buffer> {
    if (filePath) {
      const local = filePath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
      if (fs.existsSync(local)) return fs.readFileSync(local);
    }
    if (fileUrl && fileUrl.startsWith('http')) {
      const upstream = await fetch(signUploadUrl(fileUrl));
      if (upstream.ok) return Buffer.from(await upstream.arrayBuffer());
    }
    throw new NotFoundException('Fichier de la version introuvable');
  }

  /**
   * Valide le type de document.
   * Le TenantRepositoryPatch injecte automatiquement tenant_id IN (1, tenantId) :
   * types du cabinet courant + types globaux seedés sont inclus.
   */
  private async validateDocumentType(
    documentTypeId: number,
    strict: boolean,
  ): Promise<DocumentType | null> {
    const docType = await this.docTypeRepository.findOne({
      where: { id: documentTypeId },
    });

    if (!docType && strict) {
      throw new NotFoundException('Type de document non trouvé');
    }

    return docType;
  }

  /**
   * Valide le client et vérifie les documents requis
   */
  private async validateCustomer(
    customerId: number,
    documentTypeId: number,
    strict: boolean,
  ): Promise<Customer | any> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['type_customer', 'type_customer.requiredDocuments'],
    });

    if (!customer && strict) {
      throw new NotFoundException(`Client ${customerId} non trouvé`);
    }
    if (!customer) return null;

    // Vérification si le type de document est autorisé pour ce type de client
    const isDocumentAllowed = customer.type_customer?.requiredDocuments?.some(
      (doc) => doc.id === documentTypeId,
    );

    // if (!isDocumentAllowed && strict) {
    //   throw new NotAcceptableException(
    //     `Ce type de document n'est pas autorisé pour ce type de client`
    //   );
    // }

    if (!isDocumentAllowed && !strict) return null;

    return customer;
  }

  /**
   * Valide le dossier
   */
  private async validateDossier(
    dossierId: number,
    strict: boolean,
  ): Promise<Dossier | any> {
    const dossier = await this.dossierService.findOne(dossierId);

    if (!dossier && strict) {
      throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
    }

    return dossier;
  }

  /**
   * Vérifie l'existence de documents similaires
   */
  private async checkSimilarDocuments(
    documentTypeId: number,
    customerId: number,
  ): Promise<boolean> {
    const similarDocs = await this.searchDocuments({
      documentTypeId,
      customerId,
      status: [DocumentCustomerStatus.ACCEPTED, DocumentCustomerStatus.PENDING],
    });

    return similarDocs.length > 0;
  }

  /**
   * Valide le fichier uploadé
   */
  private async validateFile(
    file: Express.Multer.File,
    docType: DocumentType,
    strict: boolean,
  ): Promise<void> {
    if (!file) return;

    // Vérification du type MIME
    if (!file.mimetype.startsWith(docType.mimetype)) {
      if (strict) {
        // throw new BadRequestException(
        //   `Le fichier doit être de type : ${docType.mimetype}`
        // );
      }
      return;
    }

    // Vérification de la taille (3MB max)
    const maxSize = 3 * 1024 * 1024; // 3MB en bytes
    if (file.size > maxSize) {
      if (strict) {
        throw new BadRequestException(
          'Le fichier est trop volumineux (max 3MB)',
        );
      }
    }
  }

  /**
   * Upload le fichier
   */
  private async uploadFile(
    file: Express.Multer.File,
    dir: string,
    fileName?: string,
  ): Promise<UploadedFileInfo> {
    try {
      console.log(join(UPLOAD_DOCS_PATH, dir));
      return await FilesUtil.uploadFileV1(file, join(UPLOAD_DOCS_PATH, dir), {
        maxSizeKB: 3072, // 3MB
        width: 1600,
        quality: 75,
        ...(fileName && { fileName }),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Erreur lors de l'upload du fichier: ${error.message}`,
      );
    }
  }

  async linkDocumentsToSubStage(
    documentIds: number[],
    currentSubStageVisitId: any,
  ): Promise<void> {
    if (!documentIds || documentIds.length === 0) {
      throw new Error('Aucun document fourni');
    }

    // Vérifier que le subStage existe
    const subStage = await this.subStageVisitRepository.findOne({
      where: { id: currentSubStageVisitId },
      relations: ['documents'], // Assurez-vous que la relation est chargée
    });
    const nonexistentDocIds = documentIds.filter(
      (id) =>
        !subStage?.documents.some((doc) => doc.id.toString() === id.toString()),
    );
    console.log(
      'SubStage trouvé:',
      subStage?.documents.map((doc) => doc.id),
      ' pour les documents à lier:',
      documentIds,
      ' - Non trouvés:',
      nonexistentDocIds,
    );
    // if (nonexistentDocIds.length > 0) {
    //   throw new NotFoundException(`Documents avec les IDs ${nonexistentDocIds.join(', ')} non trouvés pour ce subStage`);
    // }
    console.log('Documents à lier:', nonexistentDocIds);

    if (!currentSubStageVisitId) {
      throw new NotFoundException(`Sous étape non trouvé`);
    }

    // 🔗 Ajout en masse (table pivot)
    await this.repository
      .createQueryBuilder()
      .relation('sub_stage_visits')
      .of(nonexistentDocIds) // 👈 tableau ici
      .add(currentSubStageVisitId);
  }
  /**
   * Crée l'entité document
   */
  private async createDocument(params: {
    document_type?: DocumentType;
    customer: Customer;
    dossier: Dossier;
    uploadedFile: UploadedFileInfo;
    uploadedByUserId?: number;
    description?: string;
    name?: string;
    category?: DocumentCategory;
    status?: DocumentCustomerStatus;
    required_for_hearing?: boolean;
    is_confidential?: boolean;
    notify_client?: boolean;
    metadata?: string | Record<string, any>;
  }): Promise<DocumentCustomer | any> {
    const {
      document_type,
      customer,
      dossier,
      category,
      uploadedFile,
      uploadedByUserId,
      ...restParams
    } = params;
    const documentData: Partial<any> = {
      ...restParams,
      document_type,
      customer,
      dossier,
      name: restParams.name ?? document_type?.name ?? uploadedFile.fileName,
      file_path: uploadedFile.filePath,
      file_url: uploadedFile.fileUrl,
      file_size: uploadedFile.fileSize,
      file_mimetype: uploadedFile.mimeType,
      ...(uploadedByUserId ? { uploaded_by_id: uploadedByUserId } : {}),
      status: restParams.status || DocumentCustomerStatus.PENDING,
      category,
      required_for_hearing: restParams.required_for_hearing || false,
      is_confidential: restParams.is_confidential || false,
    };

    // Gestion des métadonnées
    if (restParams.metadata) {
      try {
        documentData.metadata =
          typeof restParams.metadata === 'string'
            ? JSON.parse(restParams.metadata)
            : restParams.metadata;
      } catch (error) {
        documentData.metadata = { error: 'Invalid JSON format' };
      }
    }

    const document = this.docRepository.create(documentData);
    // Champ transient consommé par le DocumentCustomerSubscriber.
    (document as any).notify_client = !!(documentData as any).notify_client;
    return this.docRepository.save(document);
  }

  async createMany(dto: CreateDocumentCustomerDto[] | any[]): Promise<any> {
    const savedDocs: DocumentCustomerResponseDto[] = [];
    for (const doc of dto) {
      await validateDto(CreateDocumentFromCotiDto, doc);
      savedDocs.push(await this.create(doc));
    }
    return savedDocs;
  }

  async findCustomerByCode(code: string): Promise<CustomerResponseDto> {
    return await this.customerService.findOneByCode(code);
  }

  async findByCustomer(customerId: number, accepted = false): Promise<any[]> {
    const where = accepted
      ? {
          customer: { id: customerId },
          status: DocumentCustomerStatus.ACCEPTED,
        }
      : { customer: { id: customerId } };
    return await this.docRepository.find({
      where,
      relations: ['document_type', 'customer'],
    });
  }

  async findByCustomerCode(
    customer_code: string,
    accepted = false,
    strict = true,
  ): Promise<any[]> {
    const customer = await this.customerService.findOneByCode(
      customer_code,
      strict,
    );
    if (customer) return await this.findByCustomer(customer?.id, accepted);
    return [];
  }

  async findByType(typeCode: string): Promise<DocumentCustomer | null> {
    const where = { name: typeCode };
    return this.docRepository.findOne({
      where,
      relations: ['document_type'],
    });
  }
  async findByTypeId(
    id_customer: number,
    id_type = 3,
  ): Promise<DocumentCustomer | null> {
    return this.docRepository.findOne({
      where: {
        document_type: {
          id: id_type,
        },
        customer: {
          id: id_customer,
        },
      },
      relations: ['document_type', 'customer'],
    });
  }

  async findByIds(documentIds: number[]) {
    const documents = await this.repository.findByIds(documentIds);
    return documents;
  }

  async validate(document_id: number): Promise<DocumentCustomer | any> {
    const doc = await this.docRepository.findOne({
      where: { id: document_id },
      relations: ['customer'],
    });
    console.log('findByCustomer', await this.findByCustomer(49, true));

    if (!doc) throw new NotFoundException('Document non trouvé');
    console.log('doccccc ', doc);
    if (doc.status !== DocumentCustomerStatus.PENDING)
      throw new NotFoundException('Document déja traité');

    this.docRepository.update(document_id, {
      status: DocumentCustomerStatus.ACCEPTED,
      date_validation: new Date(),
    } as any);
    doc.status = DocumentCustomerStatus.ACCEPTED;
    doc.date_validation = new Date();
    await this.docRepository.save(doc);
    this.eventEmitter?.emit(DOCUMENT_REVIEWED_EVENT, {
      documentId: doc.id,
      status: DocumentCustomerStatus.ACCEPTED,
    });
    const customer = await this.customerRepository.findOne({
      where: { id: doc.customer.id },
      relations: ['type_customer', 'type_customer.requiredDocuments'],
    });
    const validateDocs = await this.findByCustomer(customer!.id, true);
    console.log('validateDocs.length', validateDocs.length);
    console.log(
      'customer?.type_customer.requiredDocuments.length',
      customer?.type_customer.requiredDocuments.length,
    );
    // if (validateDocs.length === customer?.type_customer.requiredDocuments.length) {
    //     await this.customerRepository.update(customer.id, {
    //       status: CustomerStatus.ACTIVE,
    //     })
    // }

    return doc;
  }

  async refuse(document_id: number): Promise<DocumentCustomer | null> {
    const doc = await this.docRepository.findOne({
      where: { id: document_id },
      relations: ['customer'],
    });
    if (!doc) throw new NotFoundException('Document non trouvé');
    console.log('doc------- ', doc);
    if (doc.status != DocumentCustomerStatus.PENDING)
      throw new NotFoundException('Document déja traité');
    doc.status = DocumentCustomerStatus.REFUSED;
    doc.date_ejected = new Date();

    await this.docRepository.save(doc);
    this.eventEmitter?.emit(DOCUMENT_REVIEWED_EVENT, {
      documentId: doc.id,
      status: DocumentCustomerStatus.REFUSED,
    });
    // this.docRepository.update(document_id, { status: DocumentCustomerStatus.REFUSED, date_ejected: new Date() } as any)
    return await this.docRepository.findOneBy({ id: document_id });
  }

  getRepository(): Repository<DocumentCustomer> {
    return this.docRepository;
  }

  async sync(dto: KycSyncDto) {
    const r: any = [];
    // for (const data of dto.items) {
    //     const docs = plainToInstance(DocumentCustomerResponseDto , await this.findByCustomerCode(data.code_customer,true, false))
    //     if(docs && docs.length > 0){
    //       r.push(docs)
    //       for (const doc of docs) {
    //         console.log('doc ' ,doc.document_type_id , process.env[`DOC_${doc.document_type_id}`] )
    //         if(process.env[`DOC_${doc.document_type_id}`])
    //           await this.mcotiService.uploadKycToCoti(data.personne_id,{document_type_name : process.env[`DOC_${doc.document_type_id}`] , bank_system_idbank_system : 1 },doc.file_url);
    //       }

    //     }
    // }
    return r;
  }

  async getDocumentStream(
    id: any,
    userId: any,
  ): Promise<{ stream: fs.ReadStream; mimeType: string; fileName: string }> {
    const document = await this.findOne(id);

    // const uploadPath = this.configService.get('UPLOAD_PATH', './uploads');
    const filePath =
      document.file_path ?? path.join(UPLOAD_PATH, document?.filename || '');

    if (!fs.existsSync(filePath)) {
      console.log(
        'Fichier physique non trouvé ' + filePath,
        ' ',
        document.file_path,
      );
      throw new NotFoundException('Fichier physique non trouvé ' + filePath);
    }

    const stream = fs.createReadStream(filePath);
    const mimeType = this.getMimeType(document.file_mimetype || '');

    return { stream, mimeType, fileName: document.original_name };
  }

  getMimeType(fileType: string): string {
    const mimeTypes = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeTypes[fileType] || 'application/octet-stream';
  }

  /**
   * Returns the base64 encoded content of a document file.
   */
  async getBase64(id: number): Promise<{
    base64: string;
    mimeType: string;
    fileName: string;
    fileSize?: number;
  }> {
    const document = await this.findOne(id);

    if (!document || !document.file_path) {
      throw new NotFoundException(
        `Document avec l'ID ${id} introuvable ou fichier manquant`,
      );
    }

    let filePath = document.file_path;
    filePath = filePath.replace(/\\/g, path.sep).replace(/\//g, path.sep);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Fichier physique non trouvé: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const mimeType =
      document.file_mimetype ||
      this.getMimeType(path.extname(filePath).replace('.', ''));
    const fileName = document.original_name || path.basename(filePath);

    return { base64, mimeType, fileName, fileSize: document.file_size ?? 0 };
  }
}

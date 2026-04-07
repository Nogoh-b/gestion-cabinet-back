// src/modules/audiences/audiences.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudienceTypeService } from '../audience-type/audience-type.service';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { AudienceResponseDto } from './dto/response-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { Audience, AudienceStatus, AudienceType1, } from './entities/audience.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { EmployeeService } from '../agencies/employee/employee.service';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { DateUtils } from 'src/core/shared/utils/date.util.';
import { subMonths } from 'date-fns';
import { AudienceStatsDto, UpcomingAudienceDto } from './dto/audience-stats.dto';
import { JurisdictionService } from '../jurisdiction/jurisdiction.service';
import { AudienceType } from '../audience-type/entities/audience-type.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { StepsService } from '../dossiers/step.service';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { SubStage } from '../procedure/entities/sub-stage.entity';
import { Stage } from '../procedure/entities/stage.entity';



@Injectable()
export class AudiencesService extends BaseServiceV1<Audience> {
  constructor(
    @InjectRepository(Audience)
    protected readonly repository: Repository<Audience>,
    protected readonly paginationService: PaginationServiceV1,
    @Inject(forwardRef(() => DossiersService))
    private readonly dossierService: DossiersService,
    private readonly audienceTypeService: AudienceTypeService,
    private readonly employeeService: EmployeeService,
    private readonly jurisdictionService: JurisdictionService,
    private readonly documentCustomerService: DocumentCustomerService,
    @Inject(forwardRef(() => StepsService))
    private stepsService: StepsService,
    protected readonly emailsService?: MailService, // Optionnel
    
  ) {
    super(repository, paginationService, emailsService);
    console.log(forwardRef)

  }

  /**
   * 🔍 Configuration de la recherche par défaut
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['jurisdiction', 'judge_name', 'room', 'outcome', 'notes', 'dossier', 'dossier.client','audience_type'],
      exactMatchFields: ['status', 'type', 'jurisdiction_id' , 'dossier_id', 'audience_type_id'],
      dateRangeFields: ['audience_date', 'postponed_to', 'created_at'],
      relationFields: ['dossier', 'dossier.client', 'jurisdiction','audience_type', 'documents', 'documents.document_type', 'documents.category','subStage'],
    };
  }

  /**
   * ➕ Création d'une audience
   */
  async create(dto: CreateAudienceDto): Promise<AudienceResponseDto | Audience | null> {
    console.log('-------dto ', dto);
    
    const dossier = await this.dossierService.findOne(dto.dossier_id);
    const audience_type = await this.audienceTypeService.findOne(dto.audience_type_id);

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }
    if (!audience_type) {
      throw new NotFoundException('Type d\'audience non trouvé');
    }

    // ✅ VÉRIFICATION DU STATUT DU DOSSIER
    // Vérifier si l'audience est compatible avec le statut actuel
    this.validateAudienceForDossierStatus(dossier, dto.type as AudienceType1);
    let procedureInstance: ProcedureInstance | null = null;
    let subStage: SubStage | null = null;
    let stage: Stage | null = null;

    if (dossier.procedureInstance) {
      // Sinon, prendre l'instance active du dossier
      procedureInstance =  dossier.procedureInstance;
    }

    // 🔍 RÉCUPÉRATION DE LA SOUS-ÉTAPE CORRESPONDANTE
    if (procedureInstance && procedureInstance.currentStage) {
      // Option: prendre la première sous-étape obligatoire non complétée
      const currentStage = procedureInstance.currentStage;
      const completedSubStages = procedureInstance.completedSubStages || [];
            
      subStage = currentStage.subStages?.find(
        (ss: any) => ss.status === 'in_progress'
      ) || null;
      console.log('SubStage trouvé pour la diligence :', (subStage)?.id);

      if (!subStage) {
        throw new Error(
          `Aucun subStage en cours (in_progress) trouvé pour le stage ${currentStage.id}`
        );
      }

      stage = currentStage;
    }

    // 🧠 Conversion explicite pour éviter l’erreur
    const audience = this.repository.create({
      audience_date: dto.audience_date,
      audience_time: dto.audience_time,
      jurisdiction: { id: dto.jurisdiction_id } as Jurisdiction,
      room: dto.room,
      duration_minutes: dto.duration_minutes,
      judge_name: dto.judge_name,
      notes: dto.notes,
      postponed_to: dto.postponed_to,
      audience_type,
      type: audience_type.code as unknown as AudienceType1,
      dossier: { id: dossier.id },
      status: AudienceStatus.SCHEDULED,
      procedure_instance_id: procedureInstance?.id,
      sub_stage_id: subStage?.id,
      stageVisit_id: stage?.id
    });

    if (dto?.document_ids) {
      const documents = await this.documentCustomerService.findByIds(dto?.document_ids);
      audience.documents = documents;
    }

    let aud = await this.repository.save(audience);
    
    // ✅ Mettre à jour le dossier si nécessaire (ex: première audience en contentieux)
    await this.updateDossierStatusOnAudience(aud[0], dossier);

    const currentStep = await this.stepsService.getCurrentStep(dto.dossier_id);
  
    // Lier l'audience à l'étape (Many-to-One)
    if (currentStep) {
      await this.stepsService.syncActionWithStep('audience', aud[0].id, currentStep.id);
    }
    return await this.findOneV1(aud[0].id, this.getDefaultSearchOptions().relationFields, AudienceResponseDto);
  }

/**
 * ✅ Valider si l'audience est compatible avec le statut du dossier
 */
private validateAudienceForDossierStatus(dossier: Dossier, audienceType: AudienceType1): void {
  const dossierStatus = dossier.status;
  
  // Audience de conciliation uniquement en phase transactionnelle ou préliminaire
  if (audienceType === AudienceType1.CONCILIATION) {
    if (dossierStatus !== DossierStatus.AMICABLE && dossierStatus !== DossierStatus.PRELIMINARY_ANALYSIS) {
      throw new BadRequestException(
        `Les audiences de conciliation ne sont possibles qu'en phase transactionnelle. Statut actuel: ${dossierStatus}`
      );
    }
  }
  
  // Audience de jugement uniquement en phase contentieuse
  if (audienceType === AudienceType1.JUDGMENT) {
    if (dossierStatus !== DossierStatus.LITIGATION && dossierStatus !== DossierStatus.APPEAL) {
      throw new BadRequestException(
        `Les audiences de jugement ne sont possibles qu'en phase contentieuse. Statut actuel: ${dossierStatus}`
      );
    }
  }
  
  // Audience d'appel uniquement en phase d'appel
  if (audienceType === AudienceType1.DELIBERATION && dossierStatus === DossierStatus.APPEAL) {
    // C'est valide
  }
}

/**
 * ✅ Mettre à jour le statut du dossier lors de la première audience
 */
private async updateDossierStatusOnAudience(audience: Audience, dossier: Dossier): Promise<void> {
  // Si c'est la première audience en contentieux et que le dossier est encore en préliminaire
  if (dossier.status === DossierStatus.PRELIMINARY_ANALYSIS && 
      audience.type === AudienceType1.HEARING) {
    // Option: on pourrait automatiquement passer en contentieux si décision déjà prise
    // ou laisser le workflow normal via processClientDecision
  }
}
  /**
   * 📄 Récupération de toutes les audiences (avec relations)
   */
  findAll(): Promise<Audience[]> {
    return this.repository.find({
      relations: ['dossier', 'dossier.client', 'documents'],
      order: { audience_date: 'DESC' },
    });
  }

  /**
   * 🔎 Trouver une audience par ID
   */
  async findOne(id: number): Promise<AudienceResponseDto | any> {
    const audience = await this.repository.findOne({
      where: { id },
      relations: ['dossier', 'dossier.client', 'documents',  'jurisdiction','audience_type','decision_documents'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${id} introuvable`);
    }

    // return audience;
    return plainToInstance(AudienceResponseDto,audience);
  }

  /**
   * ✏️ Mise à jour d'une audience
   */
  // Dans votre service
async update(id: number, dto: UpdateAudienceDto): Promise<Audience | AudienceResponseDto | any> {
  const audience = await this.findOneV1(id, this.getDefaultSearchOptions().relationFields, Audience);
  
  if (!audience) {
    return null;
  }
  
  // ✅ VÉRIFICATION: Si on tente de marquer l'audience comme tenue (HELD)
  if (dto.status !== undefined && dto.status === AudienceStatus.HELD) {
    const now = new Date();
    const audienceDateTime = new Date(`${audience.audience_date}T${audience.audience_time}`);
    
    // Vérifier si la date de l'audience n'est pas encore passée
    if (audienceDateTime > now) {
      throw new BadRequestException(
        `Impossible de marquer l'audience comme tenue car elle n'a pas encore eu lieu. ` +
        `Date de l'audience: ${audience.audience_date} à ${audience.audience_time}`
      );
    }
  }
  
  // Gestion pour jurisdiction_id - ignorer si null
  if (dto.jurisdiction_id !== undefined && dto.jurisdiction_id !== null) {
    audience.jurisdiction = plainToInstance(Jurisdiction, await this.jurisdictionService.findOne(dto.jurisdiction_id));
  }
  
  if (dto.audience_type_id !== undefined && dto.audience_type_id !== null) {
    audience.audience_type = plainToInstance(AudienceType, await this.audienceTypeService.findOne(dto.audience_type_id));
  }
  
  // Gestion spéciale pour document_ids
  if (dto.document_ids !== undefined && dto.document_ids !== null) {
    const documents = await this.documentCustomerService.findByIds(dto.document_ids);
    audience.documents = documents;
  }
  
  // Pour les autres champs, exclure document_ids et jurisdiction_id déjà traités
  const otherFields = { ...dto };
  delete otherFields.document_ids;
  delete otherFields.jurisdiction_id;
  delete otherFields.audience_type_id;
  
  // 🔥 IMPORTANT: Assigner les autres champs
  Object.assign(audience, otherFields);
  
  return plainToInstance(AudienceResponseDto, await this.repository.save(audience));
}

  /**
   * ❌ Suppression d'une audience 
   */
  async remove(id: number): Promise<void> {
    const audience = await this.findOne(id); 
    await this.repository.remove(plainToInstance(Audience,audience));
  }

  /**
   * 🔁 Reporter une audience
   */
  async postpone(id: number, newDate: Date, reason?: string): Promise<Audience> {
    const audience = await this.findOne(id);
    (plainToInstance(Audience , audience)).postpone(newDate, reason);
    return this.repository.save((plainToInstance(Audience , audience)));
  }

  /**
   * ✅ Marquer une audience comme tenue
   */
  async markAsHeld(id: number, decision?: string, outcome?: string): Promise<Audience> {
    const audience = await this.findOne(id);
    (plainToInstance(Audience , audience)).mark_as_held(decision, outcome);
    return this.repository.save((plainToInstance(Audience , audience)));
  }

  /**
   * 🚫 Annuler une audience
   */
  async cancel(id: number, reason?: string): Promise<Audience> {
    const audience = await this.findOne(id);
    (plainToInstance(Audience , audience)).cancel(reason);
    return this.repository.save((plainToInstance(Audience , audience)));
  }

  /**
   * 📅 Récupérer toutes les audiences à venir
   */
  async findUpcoming(): Promise<Audience[]> {
    const now = new Date();
    return this.repository.find({
      where: { audience_date: MoreThan(now) },
      relations: ['dossier', 'dossier.client'],
      order: { audience_date: 'ASC' },
    });
  }


  /**
   * ⏰ Récupérer les audiences nécessitant un rappel (48h avant)
   */
  async findNeedsReminder(): Promise<Audience[]> {
    const audiences = await this.repository.find({
      where: { reminder_sent: false },
    });

    return audiences.filter((a) => a.needs_reminder);
  }

  /**
   * 📨 Marquer un rappel comme envoyé
   */
  async markReminderSent(id: number): Promise<Audience> {
    const audience = await this.findOne(id);
    audience.reminder_sent = true;
    (plainToInstance(Audience , audience)).reminder_sent_at = new Date();
    return this.repository.save((plainToInstance(Audience , audience)));
  }


// audiences.service.ts
async addDocumentsToAudience(audienceId: number, documentIds: number[]) {
  const audience = await this.repository.findOne({
    where: { id: audienceId },
    relations: this.getDefaultSearchOptions().relationFields,
  });

  if (!audience) throw new NotFoundException('Audience non trouvée');
  if(!documentIds) return audience

  const documents = await this.documentCustomerService.findByIds(documentIds);

  audience.documents = [...(audience.documents || []), ...documents];
  return await this.repository.save(audience);
}
// audiences.service.ts
  async sendEmails(audienceId: number, entityManager?: EntityManager) {
    try {

      const repo = entityManager ? entityManager.getRepository(Audience) : this.repository;
      
      const data = await repo
      .createQueryBuilder('audience')
      .leftJoinAndSelect('audience.documents', 'documents')
      .leftJoinAndSelect('audience.dossier', 'dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('audience.jurisdiction', 'jurisdiction')
      .leftJoinAndSelect('audience.audience_type', 'audience_type')
      .leftJoinAndSelect('documents.document_type', 'document_type')
      .leftJoinAndSelect('documents.category', 'category')
      .where('audience.id = :id', { id: audienceId })
      .getOne();
      const audience = plainToInstance(AudienceResponseDto,data)
// 'dossier', 'dossier.client', 'jurisdiction','audience_type', 'documents', 'documents.document_type', 'documents.category'
      console.log('QueryBuilder result - documents count:', audience?.documents?.length);
      console.log('QueryBuilder result - documents:', audience?.status_label);
      if (!audience) {
        throw new Error(`Audience ${audienceId} non trouvée`);
      }

      const users = await this.employeeService.findAllV1(undefined,undefined, ['user']);
      const attachments = await this.prepareAttachments(audience.documents);

      let mailDto = new CreateMailDto() 
      const deduplicationKey = `commande-${audience.id}-confirmation-${audience.status}`;
      mailDto.templateName = "entities/audience/audience-created"
      mailDto.context = audience
      mailDto.to = ['nogohbrice@gmail.com']//users.map(u => u.email)
      mailDto.subject = "Creation de l'audience Concernant le dossier " + audience?.dossier_details?.dossier_number
      mailDto.attachments = attachments; // Ajouter les pièces jointes

      console.log(mailDto.context.documents)
      await this.sendMail(mailDto, deduplicationKey)
      const deduplicationKey1 = `commande-${audience.id}-confirmation-${audience.status}-3`;
      mailDto.templateName = "entities/audience/audience-remider-3"
      mailDto.scheduledAt = DateUtils.getDateNJoursAvant(audience.audience_date, 3)
      await this.sendMail(mailDto, deduplicationKey1)
      const deduplicationKey2 = `commande-${audience.id}-confirmation-${audience.status}-1`;
      mailDto.templateName = "entities/audience/audience-remider-1"
      mailDto.scheduledAt = DateUtils.getDateNJoursAvant(audience.audience_date, 1)
      await this.sendMail(mailDto, deduplicationKey2)

    } catch (error) { 
      console.log(error.message)  
    }
  }

  private prepareAttachments(documents: any[]): any[] {
    if (!documents || documents.length === 0) { 
      return []; 
    }
    
    return documents.map(doc => ({
      filename: doc.name || 'document.pdf',
      href: doc.file_url, // L'URL accessible du document
      contentType: doc.file_mimetype, 
    }));
  }




   async getStats(filters?: {
    startDate?: Date;
    endDate?: Date;
    lawyerId?: number;
    dossierId?: number;
  }): Promise<AudienceStatsDto> {
    const [
      total,
      byStatus,
      evolution,
      upcoming,
      pastStats,
      monthlyTrend,
      weeklyDist
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getDistributionByStatus(filters),
      this.getEvolution(filters),
      this.getUpcomingAudiences(filters),
      this.getPastAudiencesStats(filters),
      this.getMonthlyTrend(filters),
      this.getWeeklyDistribution(filters),
    ]);

    return {
      total,
      scheduled: byStatus.find(s => s.name === 'Planifiée')?.value || 0,
      held: byStatus.find(s => s.name === 'Tenue')?.value || 0,
      postponed: byStatus.find(s => s.name === 'Reportée')?.value || 0,
      cancelled: byStatus.find(s => s.name === 'Annulée')?.value || 0,
      byStatus,
      byType: await this.getDistributionByType(filters),
      byJurisdiction: await this.getDistributionByJurisdiction(filters),
      byDossier: await this.getDistributionByDossier(filters),
      evolution,
      upcomingAudiences: upcoming,
      pastAudiences: pastStats,
      monthlyTrend,
      weeklyDistribution: weeklyDist,
    };
  }

  private async getTotalCount(filters?: any): Promise<number> {
    const query = this.repository.createQueryBuilder('audience');
    this.applyFilters(query, filters);
    return query.getCount();
  }

  private async getDistributionByStatus(filters?: any): Promise<any[]> {
    const query = this.repository.createQueryBuilder('audience')
      .select('audience.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audience.status');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [AudienceStatus.SCHEDULED]: 'Planifiée',
      [AudienceStatus.HELD]: 'Tenue',
      [AudienceStatus.POSTPONED]: 'Reportée',
      [AudienceStatus.CANCELLED]: 'Annulée',
    };

    const statusColors = {
      [AudienceStatus.SCHEDULED]: '#3b82f6', // bleu
      [AudienceStatus.HELD]: '#10b981', // vert
      [AudienceStatus.POSTPONED]: '#f59e0b', // orange
      [AudienceStatus.CANCELLED]: '#ef4444', // rouge
    };

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByType(filters?: any): Promise<any[]> {
    const query = this.repository.createQueryBuilder('audience')
      .select('audience.audience_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audience.audience_type');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.type || 'Non spécifié',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
    }));
  }

  private async getDistributionByJurisdiction(filters?: any): Promise<any[]> {
    const query = this.repository.createQueryBuilder('audience')
      .leftJoin('audience.jurisdiction', 'jurisdiction')
      .select('jurisdiction.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('jurisdiction.id IS NOT NULL')
      .groupBy('jurisdiction.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
    }));
  }

  private async getDistributionByDossier(filters?: any): Promise<any[]> {
    const query = this.repository.createQueryBuilder('audience')
      .leftJoin('audience.dossier', 'dossier')
      .select('dossier.dossier_number', 'dossierNumber')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.id IS NOT NULL')
      .groupBy('dossier.dossier_number')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.dossierNumber || 'Dossier inconnu',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
    }));
  }

  private async getEvolution(filters?: any): Promise<any[]> {
    const { startDate = subMonths(new Date(), 6), endDate = new Date() } = filters || {};

    const query = this.repository.createQueryBuilder('audience')
      .select("DATE_FORMAT(audience.audience_date, '%Y-%m-%d')", 'date')
      .addSelect("SUM(CASE WHEN audience.status = 'scheduled' THEN 1 ELSE 0 END)", 'scheduled')
      .addSelect("SUM(CASE WHEN audience.status = 'held' THEN 1 ELSE 0 END)", 'held')
      .addSelect("SUM(CASE WHEN audience.status = 'postponed' THEN 1 ELSE 0 END)", 'postponed')
      .where('audience.audience_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(audience.audience_date, '%Y-%m-%d')")
      .orderBy('date', 'ASC');

    this.applyFilters(query, filters);

    return query.getRawMany();
  }

  private async getUpcomingAudiences(filters?: any): Promise<UpcomingAudienceDto[]> {
    const query = this.repository.createQueryBuilder('audience')
      .leftJoinAndSelect('audience.dossier', 'dossier')
      .leftJoinAndSelect('audience.jurisdiction', 'jurisdiction')
      .leftJoinAndSelect('dossier.client', 'client')
      .select([
        'audience.id',
        'audience.audience_date',
        'audience.status',
        'jurisdiction.name',
        'dossier.dossier_number',
        'client'
      ])
      .where('audience.audience_date >= :now', { now: new Date() })
      .andWhere('audience.status = :status', { status: AudienceStatus.SCHEDULED })
      .orderBy('audience.audience_date', 'ASC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getMany();

    return results.map(a => ({
      id: a.id,
      date: a.audience_date,
      jurisdiction: a.jurisdiction?.name || 'Inconnue',
      dossierNumber: a.dossier?.dossier_number || 'N/A',
      clientName: a.dossier?.client?.full_name || 'Client inconnu',
      status: a.status,
    }));
  }

  private async getPastAudiencesStats(filters?: any): Promise<any> {
    const query = this.repository.createQueryBuilder('audience')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(TIMESTAMPDIFF(MINUTE, audience.audience_date, audience.audience_time))', 'avgDuration')
      .addSelect("SUM(CASE WHEN audience.status = 'held' THEN 1 ELSE 0 END) / COUNT(*) * 100", 'successRate')
      .where('audience.audience_date < :now', { now: new Date() });

    this.applyFilters(query, filters);

    const result = await query.getRawOne();

    return {
      total: parseInt(result.total || 0),
      averageDuration: Math.round(parseFloat(result.avgDuration || 0)),
      successRate: Math.round(parseFloat(result.successRate || 0)),
    };
  }

  private async getMonthlyTrend(filters?: any): Promise<any[]> {
    const { startDate = subMonths(new Date(), 12), endDate = new Date() } = filters || {};

    const query = this.repository.createQueryBuilder('audience')
      .select("DATE_FORMAT(audience.audience_date, '%Y-%m')", 'month')
      .addSelect("SUM(CASE WHEN audience.status = 'scheduled' THEN 1 ELSE 0 END)", 'scheduled')
      .addSelect("SUM(CASE WHEN audience.status = 'held' THEN 1 ELSE 0 END)", 'held')
      .where('audience.audience_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(audience.audience_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters);

    return query.getRawMany();
  }

  private async getWeeklyDistribution(filters?: any): Promise<any[]> {
    const query = this.repository.createQueryBuilder('audience')
      .select('DAYNAME(audience.audience_date)', 'dayOfWeek')
      .addSelect('COUNT(*)', 'count')
      .groupBy('DAYNAME(audience.audience_date)')
      .orderBy("FIELD(DAYNAME(audience.audience_date), 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')");

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const dayNames = {
      'Monday': 'Lundi',
      'Tuesday': 'Mardi',
      'Wednesday': 'Mercredi',
      'Thursday': 'Jeudi',
      'Friday': 'Vendredi',
      'Saturday': 'Samedi',
      'Sunday': 'Dimanche'
    };

    return results.map(r => ({
      dayOfWeek: dayNames[r.dayOfWeek] || r.dayOfWeek,
      count: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
    }));
  }

  private applyFilters(query: any, filters?: any, alias: string = 'audience'): void {
    if (!filters) return;

    if (filters.startDate) {
      query.andWhere(`${alias}.audience_date >= :startDate`, { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere(`${alias}.audience_date <= :endDate`, { endDate: filters.endDate });
    }

    if (filters.lawyerId) {
      query.andWhere(`${alias}.lawyer_id = :lawyerId`, { lawyerId: filters.lawyerId });
    }

    if (filters.dossierId) {
      query.andWhere(`${alias}.dossier_id = :dossierId`, { dossierId: filters.dossierId });
    }
  }


}

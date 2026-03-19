// src/modules/audiences/audiences.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudienceTypeService } from '../audience-type/audience-type.service';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { AudienceResponseDto } from './dto/response-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { Audience, AudienceStatus, } from './entities/audience.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { EmployeeService } from '../agencies/employee/employee.service';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { DateUtils } from 'src/core/shared/utils/date.util.';
import { subMonths } from 'date-fns';
import { AudienceStatsDto, UpcomingAudienceDto } from './dto/audience-stats.dto';



@Injectable()
export class AudiencesService extends BaseServiceV1<Audience> {
  constructor(
    @InjectRepository(Audience)
    protected readonly repository: Repository<Audience>,
    protected readonly paginationService: PaginationServiceV1,
    private readonly dossierService: DossiersService,
    private readonly audienceTypeService: AudienceTypeService,
    private readonly employeeService: EmployeeService,
    private readonly documentCustomerService: DocumentCustomerService,
    protected readonly emailsService?: MailService, // Optionnel
  ) {
    super(repository, paginationService, emailsService);
  }

  /**
   * 🔍 Configuration de la recherche par défaut
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['jurisdiction', 'judge_name', 'room', 'outcome', 'notes', 'dossier', 'dossier.client','audience_type'],
      exactMatchFields: ['status', 'type', 'jurisdiction_id' , 'dossier_id', 'audience_type_id'],
      dateRangeFields: ['audience_date', 'postponed_to', 'created_at'],
      relationFields: ['dossier', 'dossier.client', 'jurisdiction','audience_type', 'documents', 'documents.document_type', 'documents.category'],
    };
  }

  /**
   * ➕ Création d'une audience
   */
  async create(dto: CreateAudienceDto): Promise<AudienceResponseDto | Audience | null> {
    console.log('-------dto ', dto)
    const dossier = await this.dossierService.findOne(dto.dossier_id);
    const audience_type = await this.audienceTypeService.findOne(dto.audience_type_id);

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }
    if (!audience_type) {
      throw new NotFoundException('Type d\'audience  non trouvé');
    }

    // 🧠 Conversion explicite pour éviter l’erreur
    const audience = this.repository.create({
      audience_date: dto.audience_date,
      audience_time: dto.audience_time,
      jurisdiction: {id: dto.jurisdiction_id} as Jurisdiction,
      room: dto.room,
      duration_minutes: dto.duration_minutes,
      judge_name: dto.judge_name,
      notes: dto.notes,
      postponed_to: dto.postponed_to,
      // ⚠️ Si c’est un enum côté entité
      audience_type,
      type: dto.type ? 1 : 0,
      dossier: { id: dossier.id }, // ✅ relation proprement liée
      status: AudienceStatus.SCHEDULED,
    });
     if(dto?.document_ids) {
      const documents = await this.documentCustomerService.findByIds(dto?.document_ids);
      audience.documents = documents;
     }

    // let mailDto = new CreateMailDto() 
    // const users = await this.employeeService.findAllV1(undefined,undefined, ['user']);
    let aud = await this.repository.save(audience);
    return await this.findOneV1(aud.id,this.getDefaultSearchOptions().relationFields,AudienceResponseDto)
    return plainToInstance(AudienceResponseDto,await this.findOneV1(aud.id,this.getDefaultSearchOptions().relationFields))
    // aud = await this.addDocumentsToAudience(aud?.id, dto?.document_ids)
    // mailDto.templateName = "entities/dossier/dossier-created-creator"
    // mailDto.context = aud
    // mailDto.to = users.map(u => u.email)
    // mailDto.subject = "Creation d'un nouveau dossier"
    // this.sendMail(mailDto)
    return plainToInstance(AudienceResponseDto,aud)
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
      relations: ['dossier', 'dossier.client', 'documents',  'jurisdiction','audience_type'],
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
  async update(id: number, dto: UpdateAudienceDto): Promise<Audience> {
    const audience = plainToInstance(Audience,await this.findOne(id));
    Object.assign(audience, dto);
    return this.repository.save(audience);
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

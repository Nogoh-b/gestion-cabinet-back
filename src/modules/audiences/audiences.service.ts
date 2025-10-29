// src/modules/audiences/audiences.service.ts
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { MoreThan, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';











import { DossiersService } from '../dossiers/dossiers.service';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { Audience, AudienceStatus, AudienceType } from './entities/audience.entity';
import { plainToInstance } from 'class-transformer';
import { AudienceResponseDto } from './dto/response-audience.dto';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';












@Injectable()
export class AudiencesService extends BaseServiceV1<Audience> {
  constructor(
    @InjectRepository(Audience)
    protected readonly repository: Repository<Audience>,
    protected readonly paginationService: PaginationServiceV1,
    private readonly dossierService: DossiersService,
    private readonly documentCustomerService: DocumentCustomerService,
  ) {
    super(repository, paginationService);
  }

  /**
   * 🔍 Configuration de la recherche par défaut
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['jurisdiction', 'judge_name', 'room', 'outcome', 'notes'],
      exactMatchFields: ['status', 'type'],
      dateRangeFields: ['audience_date', 'postponed_to', 'created_at'],
      relationFields: ['dossier'],
    };
  }

  /**
   * ➕ Création d'une audience
   */
  async create(dto: CreateAudienceDto): Promise<Audience> {
    console.log('-------dto ', dto)
    const dossier = await this.dossierService.findOne(dto.dossier_id);

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }

    // 🧠 Conversion explicite pour éviter l’erreur
    const audience = this.repository.create({
      audience_date: dto.audience_date,
      jurisdiction: dto.jurisdiction,
      room: dto.room,
      judge_name: dto.judge_name,
      notes: dto.notes,
      postponed_to: dto.postponed_to,
      // ⚠️ Si c’est un enum côté entité
      type: dto.type ? (dto.type as unknown as AudienceType) : 0,
      dossier: { id: dossier.id }, // ✅ relation proprement liée
      status: AudienceStatus.SCHEDULED,
    });

    return await this.repository.save(audience);
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
  async findOne(id: number): Promise<AudienceResponseDto> {
    const audience = await this.repository.findOne({
      where: { id },
      relations: ['dossier', 'dossier.client', 'documents'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${id} introuvable`);
    }

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
    relations: ['documents'],
  });

  if (!audience) throw new NotFoundException('Audience non trouvée');

  const documents = await this.documentCustomerService.findByIds(documentIds);

  audience.documents = [...(audience.documents || []), ...documents];
  return await this.repository.save(audience);
}


}

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { CreateMailDto } from './dto/create-mail.dto';
import { SendMailResponseDto } from './dto/send-mail-response.dto';
import { MailService } from './emails.service';

@ApiTags('Mails')
@Controller('mails')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un email programmé' })
  @ApiBody({ type: CreateMailDto })
  @ApiResponse({
    status: 201,
    description: 'Email créé avec succès',
    type: SendMailResponseDto,
  })
  async create(
    @Body() createMailDto: CreateMailDto,
  ): Promise<SendMailResponseDto> {
    const mail = await this.mailService.create(createMailDto);
    return {
      id: mail.id,
      status: mail.status,
      scheduledAt: mail.scheduledAt,
      message: 'Email créé avec succès',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les emails' })
  @ApiResponse({ status: 200, description: 'Liste des emails' })
  async findAll() {
    return this.mailService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un email par ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Email trouvé' })
  async findOne(@Param('id') id: string) {
    return this.mailService.findOne(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Annuler un email programmé' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Email annulé' })
  async cancel(@Param('id') id: string) {
    const mail = await this.mailService.cancel(id);
    return { id: mail.id, status: mail.status, message: 'Email annulé' };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envoyer immédiatement un email' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 202,
    description: 'Envoi déclenché',
  })
  async sendNow(@Param('id') id: string) {
    await this.mailService.sendMail(id);
    return { id, message: 'Envoi déclenché' };
  }

  /**
   * Envoi (immédiat ou programmé) — TOUJOURS persisté en base pour avoir un
   * historique consultable et un audit trail.
   *   - Sans `scheduledAt` → `mailService.create()` persiste puis déclenche
   *     l'envoi en arrière-plan (fire-and-forget).
   *   - Avec `scheduledAt`   → persisté en PENDING ; le cron l'enverra.
   */
  @Post('send-direct')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Créer puis envoyer/programmer un email (toujours persisté)' })
  @ApiBody({ type: CreateMailDto })
  async sendDirect(@Body() dto: CreateMailDto): Promise<{ id: string; status: string; message: string }> {
    const mail = await this.mailService.create(dto);
    return {
      id:      mail.id,
      status:  mail.status,
      message: dto.scheduledAt ? 'Email programmé' : 'Email envoyé',
    };
  }

  /**
   * Lister les mails liés à une entité métier
   * (filtre sur `metadata.linkedEntity.type` et `metadata.linkedEntity.id`).
   */
  @Get('by-entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Lister les mails liés à une entité (dossier, facture, audience…)' })
  @ApiParam({ name: 'entityType', type: String })
  @ApiParam({ name: 'entityId',   type: String })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId')   entityId: string,
  ) {
    return this.mailService.findByEntity(entityType, entityId);
  }

  /**
   * Lister tous les mails d'un client (directs ou via ses dossiers).
   */
  @Get('by-client/:clientId')
  @ApiOperation({ summary: 'Lister tous les mails liés à un client (direct ou via ses dossiers)' })
  @ApiParam({ name: 'clientId', type: String })
  async findByClient(@Param('clientId') clientId: string) {
    return this.mailService.findByClient(clientId);
  }
}
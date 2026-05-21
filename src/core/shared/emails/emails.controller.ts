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
   * Envoi direct (sans persistance) — utilisé par le front pour les emails
   * "à la volée" qui n'ont pas vocation à être reprogrammés.
   *
   * Si `scheduledAt` est fourni dans le body, on bascule sur `create()` qui
   * persiste et laisse le cron envoyer plus tard.
   */
  @Post('send-direct')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envoyer immédiatement un email sans le persister (ou le programmer)' })
  @ApiBody({ type: CreateMailDto })
  async sendDirect(@Body() dto: CreateMailDto): Promise<{ status: string; message: string; id?: string }> {
    // Programmation explicite → on passe par create() pour persister
    if (dto.scheduledAt) {
      const mail = await this.mailService.create(dto);
      return { id: mail.id, status: mail.status, message: 'Email programmé' };
    }

    await this.mailService.sendDirect({
      to:           dto.to,
      cc:           dto.cc,
      bcc:          dto.bcc,
      subject:      dto.subject,
      html:         dto.html,
      text:         dto.text,
      templateName: dto.templateName,
      context:      dto.context,
      attachments:  dto.attachments as any,
    });
    return { status: 'sent', message: 'Email envoyé directement' };
  }
}
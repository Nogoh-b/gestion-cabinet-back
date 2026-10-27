import { AllowClient } from 'src/core/decorators/allow-client.decorator';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  CLIENT_DOCUMENT_MAX_BYTES,
  CLIENT_PROOF_MAX_BYTES,
  ClientPortalService,
} from './client-portal.service';
import { SendClientMessageDto } from './dto/send-client-message.dto';

/**
 * Espace client. Contrôleur entier ouvert aux comptes `client` (@AllowClient) :
 * chaque méthode du service se borne à `req.user.customerId`. Les comptes du
 * cabinet y reçoivent un 403 (pas de fiche client dans leur jeton).
 */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('client-portal')
@AllowClient()
export class ClientPortalController {
  constructor(private readonly portal: ClientPortalService) {}

  @Get('summary')
  @ApiOperation({ summary: "Synthèse de l'espace client" })
  summary(@CurrentUser() user: any) {
    return this.portal.summary(user);
  }

  // ── Documents ──────────────────────────────────────────────────────────

  @Get('dossiers/:id/documents')
  @ApiOperation({ summary: "Documents d'un de mes dossiers" })
  documents(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portal.listDocuments(user, id);
  }

  @Post('dossiers/:id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Déposer un document (nom + fichier)' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CLIENT_DOCUMENT_MAX_BYTES } }),
  )
  uploadDocument(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.portal.uploadDocument(user, id, name, file);
  }

  @Get('documents/:id/file')
  @ApiOperation({ summary: "Ouvrir un document qui m'est accessible" })
  documentFile(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portal.downloadDocument(user, id);
  }

  // ── Factures ───────────────────────────────────────────────────────────

  @Get('factures')
  @ApiOperation({ summary: 'Mes factures' })
  factures(@CurrentUser() user: any) {
    return this.portal.listFactures(user);
  }

  @Get('factures/:id')
  @ApiOperation({ summary: "Détail d'une de mes factures" })
  facture(@CurrentUser() user: any, @Param('id') id: string) {
    return this.portal.getFacture(user, id);
  }

  @Post('factures/:id/paiements')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déclarer un paiement (soumis à validation du cabinet)',
  })
  @UseInterceptors(
    FileInterceptor('proof', { limits: { fileSize: CLIENT_PROOF_MAX_BYTES } }),
  )
  declarePayment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @UploadedFile() proof?: Express.Multer.File,
  ) {
    return this.portal.declarePayment(
      user,
      id,
      {
        montant: body?.montant,
        mode: body?.mode,
        reference: body?.reference,
        notes: body?.notes,
        date: body?.date,
      },
      proof,
    );
  }

  // ── Messagerie ─────────────────────────────────────────────────────────

  @Get('messages')
  @ApiOperation({ summary: 'Mes échanges avec le cabinet' })
  messages(@CurrentUser() user: any, @Query('dossierId') dossierId?: string) {
    const id = dossierId ? Number(dossierId) : undefined;
    return this.portal.listMessages(
      user,
      id !== undefined && Number.isInteger(id) ? id : undefined,
    );
  }

  @Post('messages')
  @ApiOperation({ summary: 'Écrire au cabinet' })
  send(@CurrentUser() user: any, @Body() dto: SendClientMessageDto) {
    return this.portal.sendMessage(user, dto.content, dto.dossier_id);
  }

  @Post('messages/read')
  @ApiOperation({ summary: 'Marquer les réponses du cabinet comme lues' })
  markRead(@CurrentUser() user: any) {
    return this.portal.markMessagesRead(user);
  }
}

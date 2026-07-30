import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Response } from 'express';

import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';
import { CreatePaiementDto } from './dto/create-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { PaymentTransitionDto } from './dto/payment-transition.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { PaiementService } from './paiement.service';

@ApiTags('paiements')
@ApiBearerAuth()
@Controller('paiements')
@UseGuards(RolesGuard, PermissionsGuard)
export class PaiementController {
  constructor(
    private readonly paiementService: PaiementService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  private actor(user: any): ResourceActor {
    return {
      id: Number(user?.id),
      userId: Number(user?.userId ?? user?.id),
      tenantId: Number(
        user?.tenantId ?? user?.tenant_id ?? user?.cabinetId ?? user?.cabinet_id,
      ),
      role: user?.role,
      permissions: Array.isArray(user?.permissions) ? user.permissions : [],
      customerId: user?.customerId ?? user?.customer_id ?? null,
    };
  }

  private async assertPaymentAccess(
    id: string,
    user: any,
    mode: 'read' | 'write',
    permission: string,
  ): Promise<void> {
    const dossierId = await this.paiementService.getPaymentDossierId(id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      mode,
      permission,
    );
  }

  @Post()
  @RequirePermissions('create_paiement')
  @UseInterceptors(
    FileInterceptor('preuve', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary:
      'Enregistrer un paiement en attente avec une preuve privée optionnelle',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaiementResponseDto })
  async create(
    @Body() dto: CreatePaiementDto,
    @CurrentUser() user: any,
    @UploadedFile() preuve?: Express.Multer.File,
  ) {
    const dossierId = await this.paiementService.getFactureDossierId(
      dto.factureId,
    );
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      'write',
      'create_paiement',
    );
    return this.paiementService.createPaiement(dto, preuve, this.actor(user));
  }

  @Get()
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: 'Rechercher les paiements accessibles' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  async search(@Query() searchDto: SearchPaiementDto, @CurrentUser() user: any) {
    const result: any = await this.paiementService.searchPaiements(searchDto);
    const accessible = new Set(
      await this.resourcePolicy.getAccessibleDossierIds(this.actor(user)),
    );
    if (Array.isArray(result)) {
      return result.filter((payment) =>
        accessible.has(Number(payment.facture?.dossier?.id)),
      );
    }
    if (Array.isArray(result?.data)) {
      result.data = result.data.filter((payment) =>
        accessible.has(Number(payment.facture?.dossier?.id)),
      );
      if (result.meta) {
        result.meta.total = result.data.length;
        result.meta.total_pages = result.data.length ? 1 : 0;
      }
    }
    return result;
  }

  @Get('statut/en-attente')
  @RequirePermissions('manage_payments')
  async getEnAttente(@CurrentUser() user: any) {
    return this.filterAccessible(
      await this.paiementService.getPaiementsEnAttente(),
      user,
    );
  }

  @Get('analytics/statistiques')
  @RequirePermissions('manage_payments')
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getStatistiques(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
    @CurrentUser() user: any,
  ) {
    const actor = this.actor(user);
    if (
      actor.role !== 'admin' &&
      !actor.permissions?.includes('SUPER_ADMIN')
    ) {
      throw new ForbiddenException(
        'Les statistiques consolidées sont réservées à l’administration',
      );
    }
    return this.paiementService.getStatistiquesPaiementsParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get('facture/:factureId')
  @RequirePermissions('manage_payments')
  async getByFacture(
    @Param('factureId', ParseUUIDPipe) factureId: string,
    @CurrentUser() user: any,
  ) {
    const dossierId =
      await this.paiementService.getFactureDossierId(factureId);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      'read',
      'manage_payments',
    );
    return this.paiementService.getPaiementsByFacture(factureId);
  }

  @Get('client/:clientId')
  @RequirePermissions('manage_payments')
  async getByClient(
    @Param('clientId') clientId: string,
    @CurrentUser() user: any,
  ) {
    return this.filterAccessible(
      await this.paiementService.getPaiementsByClient(clientId),
      user,
    );
  }

  @Get(':id/preuve')
  @RequirePermissions('manage_payments')
  async downloadProof(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res() response: Response,
  ) {
    await this.assertPaymentAccess(id, user, 'read', 'manage_payments');
    const proof = await this.paiementService.getPrivateProof(
      id,
      this.actor(user),
    );
    response.setHeader('Content-Type', proof.mimeType);
    response.setHeader('Content-Length', String(proof.buffer.length));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-SHA256', proof.sha256);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(proof.filename)}`,
    );
    response.send(proof.buffer);
  }

  @Get(':id')
  @RequirePermissions('manage_payments')
  @ApiParam({ name: 'id', type: String })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'read', 'manage_payments');
    return plainToInstance(
      PaiementResponseDto,
      await this.paiementService.findOneV1(id, [
        'facture',
        'facture.client',
        'facture.dossier',
      ]),
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_paiement')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaiementDto,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'write', 'edit_paiement');
    return this.paiementService.updatePaiement(id, dto, this.actor(user));
  }

  @Post(':id/validate')
  @RequirePermissions('manage_payments')
  async validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'write', 'manage_payments');
    return this.paiementService.validerPaiement(id, this.actor(user));
  }

  @Post(':id/reject')
  @RequirePermissions('manage_payments')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTransitionDto,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'write', 'manage_payments');
    return this.paiementService.rejeterPaiement(
      id,
      dto.raison,
      this.actor(user),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('manage_payments')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTransitionDto,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'write', 'manage_payments');
    return this.paiementService.annulerPaiement(
      id,
      dto.raison,
      this.actor(user),
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_paiement')
  @ApiOperation({ summary: 'Suppression physique interdite' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertPaymentAccess(id, user, 'write', 'delete_paiement');
    return this.paiementService.removePaiement();
  }

  private async filterAccessible(
    payments: any[],
    user: any,
  ): Promise<any[]> {
    const accessible = new Set(
      await this.resourcePolicy.getAccessibleDossierIds(this.actor(user)),
    );
    return payments.filter((payment) =>
      accessible.has(
        Number(
          payment.facture?.dossier_id ??
            payment.facture?.dossier?.id,
        ),
      ),
    );
  }
}

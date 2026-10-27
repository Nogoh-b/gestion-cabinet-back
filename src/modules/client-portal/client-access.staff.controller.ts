import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClientPortalService } from './client-portal.service';
import { SendClientMessageDto } from './dto/send-client-message.dto';

/**
 * Côté cabinet : échanges avec un client et état de son accès à l'espace
 * client. Fermé aux comptes `client` (pas de @AllowClient).
 */
@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer')
@UseGuards(PermissionsGuard)
export class ClientAccessStaffController {
  constructor(private readonly portal: ClientPortalService) {}

  @Get(':id/access-status')
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: "État de l'accès du client à son espace" })
  accessStatus(@Param('id', ParseIntPipe) id: number) {
    return this.portal.accessStatus(id);
  }

  @Get(':id/messages')
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: 'Échanges avec le client (espace client)' })
  messages(@Param('id', ParseIntPipe) id: number) {
    return this.portal.listMessagesForCabinet(id);
  }

  @Post(':id/messages')
  @RequirePermissions('edit_client')
  @ApiOperation({ summary: 'Répondre au client' })
  reply(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendClientMessageDto,
  ) {
    return this.portal.replyAsCabinet(user, id, dto.content, dto.dossier_id);
  }

  @Post(':id/messages/read')
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: 'Marquer les messages du client comme lus' })
  markRead(@Param('id', ParseIntPipe) id: number) {
    return this.portal.markReadByCabinet(id);
  }
}

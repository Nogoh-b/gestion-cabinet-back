// src/modules/notification/notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateBulkNotificationDto, CreateNotificationDto, MarkReadDto } from './dto/create-notification.dto';
import { UserRole } from '../../core/enums/user-role.enum';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { Roles } from 'src/core/decorators/roles.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Récupérer les notifications de l\'utilisateur' })
  async getMyNotifications(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('unread_only') unreadOnly: boolean = false
  ) {
    return this.notificationService.getUserNotifications(req.user.id, page, limit, unreadOnly);
  }

  @Get('unread/count')
  @ApiOperation({ summary: 'Compter les notifications non lues' })
  async countUnread(@Request() req) {
    const count = await this.notificationService.countUnread(req.user.id);
    return { count };
  }

  @Get('unread')
  @ApiOperation({ summary: 'Récupérer les notifications non lues' })
  async getUnread(@Request() req) {
    return this.notificationService.getUnreadNotifications(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques des notifications' })
  async getStats(@Request() req, @Query('days') days: number = 7) {
    return this.notificationService.getNotificationStats(req.user.id, days);
  }

  @Post()
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Créer une notification (admin)' })
  async create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationService.create(createNotificationDto);
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Créer plusieurs notifications (admin)' })
  async createBulk(@Body() createNotificationDtos: CreateBulkNotificationDto, @Request() req) {
    return this.notificationService.createBulk(createNotificationDtos, req.user.id);
  }

  @Patch('mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer des notifications comme lues' })
  async markAsRead(@Request() req, @Body() markReadDto: MarkReadDto) {
    if (markReadDto.mark_all) {
      await this.notificationService.markAllAsRead(req.user.id);
    } else if (markReadDto.notification_ids?.length) {
      await this.notificationService.markAsRead(markReadDto.notification_ids, req.user.id);
    }
    return { success: true };
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiver une notification' })
  async archive(@Request() req, @Param('id') id: string) {
    await this.notificationService.archive(+id, req.user.id);
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une notification' })
  async remove(@Request() req, @Param('id') id: string) {
    await this.notificationService.remove(+id, req.user.id);
    return { success: true };
  }

  @Delete()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Nettoyer les vieilles notifications (admin)' })
  async cleanup(@Query('days') days: number = 30) {
    const count = await this.notificationService.cleanupOldNotifications(days);
    return { deleted: count };
  }
}
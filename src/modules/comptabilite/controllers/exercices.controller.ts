import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ExercicesService } from '../services/exercices.service';
import { CloseExerciceDto } from '../dto/close-exercice.dto';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';

@ApiTags('comptabilite-exercices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/exercices')
export class ExercicesController {
  constructor(private readonly service: ExercicesService) {}

  @Get()
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Liste tous les exercices comptables' })
  findAll() {
    return this.service.findAll();
  }

  @Get('ouvert')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: "Retourne l'exercice actuellement ouvert" })
  findOuvert() {
    return this.service.findOuvert();
  }

  @Post()
  @RequirePermissions('open_exercice')
  @ApiOperation({ summary: 'Ouvrir un nouvel exercice pour une année donnée' })
  create(@Body('annee') annee: number, @CurrentUser() user: any) {
    return this.service.create(annee, {
      userId: user?.userId ?? user?.id ?? null,
    });
  }

  @Patch(':id/cloturer')
  @RequirePermissions('close_exercice')
  @ApiOperation({ summary: 'Clôturer un exercice (verrouille toutes ses écritures)' })
  cloturer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseExerciceDto,
    @CurrentUser() user: any,
  ) {
    return this.service.cloturer(id, dto, {
      userId: user?.userId ?? user?.id ?? null,
    });
  }
}

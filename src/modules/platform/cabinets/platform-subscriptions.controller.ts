import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformCabinetsService } from './platform-cabinets.service';
import { PlatformCabinetQueryDto } from './dto/platform-cabinet.dto';

/** Vue transversale des abonnements courants (un par cabinet). */
@ApiTags('Plateforme — Abonnements')
@Controller('platform/subscriptions')
@PlatformRoute()
export class PlatformSubscriptionsController {
  constructor(private readonly service: PlatformCabinetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Abonnements courants (filtres statut, plan, échéance proche)',
  })
  list(@Query() query: PlatformCabinetQueryDto) {
    return this.service.listSubscriptions(query);
  }
}

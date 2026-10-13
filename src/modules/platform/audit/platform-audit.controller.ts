import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformAuditQuery, PlatformAuditService } from './platform-audit.service';

@ApiTags('Plateforme — Journal')
@Controller('platform/audit')
@PlatformRoute()
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Journal des actions plateforme (filtres admin, action, cabinet, période)',
  })
  list(@Query() query: PlatformAuditQuery) {
    return this.audit.list(query);
  }
}

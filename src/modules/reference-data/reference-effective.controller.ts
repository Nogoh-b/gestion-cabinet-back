import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReferenceDataService } from './reference-data.service';

@ApiTags('Référentiels effectifs')
@ApiBearerAuth()
@Controller('reference-data')
@UseGuards(AuthGuard('jwt'))
export class ReferenceEffectiveController {
  constructor(private readonly references: ReferenceDataService) {}
  @Get('effective')
  effective(@Req() req: any) {
    return this.references.effective(req.user.tenantId);
  }
}

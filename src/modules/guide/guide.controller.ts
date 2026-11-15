import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { GuideService } from './guide.service';

/** Modifications de la prise en main publiées par la plateforme, pour l'utilisateur connecté. */
@ApiTags('guide')
@ApiBearerAuth()
@Controller('api/guide')
@UseGuards(JwtAuthGuard)
export class GuideController {
  constructor(private readonly guide: GuideService) {}

  @Get('overrides')
  @ApiOperation({ summary: 'Visites, aide, astuces et nouveautés modifiées par la plateforme (filtrées par droits)' })
  async overrides(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as any;
    const { payload, etag } = await this.guide.forCaller({
      tenantId: Number(user?.tenantId),
      userId: Number(user?.id),
      role: user?.role,
      base_role: user?.base_role,
      permissions: user?.permissions,
    });
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return undefined;
    }
    return payload;
  }
}

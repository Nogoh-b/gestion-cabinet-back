import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { GlobalSearchDto, SearchUser } from './search.dto';
import { GlobalSearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(private readonly service: GlobalSearchService) {}

  @Get()
  search(@Query() query: GlobalSearchDto, @Req() req: { user: SearchUser }) {
    return this.service.search(query, req.user);
  }
}

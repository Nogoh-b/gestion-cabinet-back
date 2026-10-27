import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { GlobalSearchDto, MentionSearchDto, SearchUser } from './search.dto';
import { GlobalSearchService } from './search.service';
import { MentionSearchService } from './mention-search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(
    private readonly service: GlobalSearchService,
    private readonly mentions: MentionSearchService,
  ) {}

  @Get()
  search(@Query() query: GlobalSearchDto, @Req() req: { user: SearchUser }) {
    return this.service.search(query, req.user);
  }

  /** Menu @ du chat IA : toutes les catégories permises en une requête. */
  @Get('mentions')
  searchMentions(
    @Query(new ValidationPipe({ transform: true })) query: MentionSearchDto,
    @Req() req: { user: SearchUser },
  ) {
    return this.mentions.search(query, req.user);
  }
}

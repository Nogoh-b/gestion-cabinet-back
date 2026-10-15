import { Module } from '@nestjs/common';
import { GlobalSearchController } from './search.controller';
import { GlobalSearchService } from './search.service';

@Module({
  controllers: [GlobalSearchController],
  providers: [GlobalSearchService],
})
export class GlobalSearchModule {}

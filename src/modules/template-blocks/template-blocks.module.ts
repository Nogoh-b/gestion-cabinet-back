import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateBlock } from './entities/template-block.entity';
import { TemplateBlocksService } from './template-blocks.service';
import { TemplateBlocksController } from './template-blocks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateBlock])],
  controllers: [TemplateBlocksController],
  providers: [TemplateBlocksService],
  exports: [TemplateBlocksService],
})
export class TemplateBlocksModule {}

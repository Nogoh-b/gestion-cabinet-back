import { PartialType } from '@nestjs/swagger';
import { CreateAiDatabaseDto } from './create-ai-database.dto';

export class UpdateAiDatabaseDto extends PartialType(CreateAiDatabaseDto) {}

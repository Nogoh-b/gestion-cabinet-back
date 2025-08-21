import { Controller, Post, Body } from '@nestjs/common';
import { QueueService } from './queue.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JobOptions } from 'bull';

class AddJobDto {
  // Définis ici les propriétés attendues dans le corps de la requête
  foo: string;
  recurring?: boolean;
}

@ApiTags('queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('add')
  @ApiOperation({ summary: 'Ajouter un job (ponctuel ou mensuel)' })
  @ApiBody({ type: AddJobDto })
  @ApiResponse({ status: 201, description: 'Job créé', schema: { properties: { jobId: { type: 'string' } } } })
  async addJob(@Body() data: AddJobDto) {
    // Options Bull de base
    const opts: JobOptions = { attempts: 3, backoff: { type: 'fixed', delay: 5000 } };
    if (data.recurring) {
      // Planifie le job chaque mois à minuit à la date du jour
      const now = new Date();
      const day = now.getDate();
      opts.repeat = { cron: `0 0 ${day} * *` };
    }
    const job = await this.queueService.addTask(data, opts);
    return { jobId: job.id };
  }
}

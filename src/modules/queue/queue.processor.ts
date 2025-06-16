import { Job } from 'bull';
import { Processor, Process } from '@nestjs/bull';



@Processor('task-queue')
export class QueueProcessor {
  @Process('task-name')
  async handleTask(job: Job) {
    console.log('Processing job11 :', job.id);
    // votre logique métier ici
  }
}

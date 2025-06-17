import { Queue, Job, JobOptions } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';



@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('task-queue') private readonly queue: Queue,
  ) {}


    async addTask(data: any, opts: JobOptions = {}): Promise<Job> {
    // Options par défaut et fusion
    const defaultOpts: JobOptions = { attempts: 3, backoff: { type: 'fixed', delay: 5000 } };
    const jobOptions = { ...defaultOpts, ...opts };
    return this.queue.add('task-name', data, jobOptions);
  }
    async addTaskBuyInterest(data: any, opts: JobOptions = {}): Promise<Job> {
    // Options par défaut et fusion
    const defaultOpts: JobOptions = { attempts: 3, backoff: { type: 'fixed', delay: 5000 } };
    const jobOptions = { ...defaultOpts, ...opts };
    return this.queue.add('deduct-fee', { accountId: data }, jobOptions);
  }
}
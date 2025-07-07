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
    const now = new Date();
    const day = now.getDate();
    // opts.repeat = { cron: `0 0 ${day} * *` };
    opts.repeat = { cron: '*/5 * * * * *' }; // Toutes les 5 secondes
    const jobOptions = { ...defaultOpts, ...opts };
    return this.queue.add('deduct-fee', { accountId: data }, jobOptions);
  }

  async addTaskCheckPayment(data: any, opts: JobOptions = {}): Promise<Job> {
    // Options par défaut et fusion
    const defaultOpts: JobOptions = { attempts: 3, backoff: { type: 'fixed', delay: 5000 } };
    const now = new Date();
    const day = now.getDate();
    // opts.repeat = { cron: `0 0 ${day} * *` };
    // opts.repeat = { cron: '*/5 * * * * *' }; // Toutes les 5 secondes
      // cron: '0 */3 * * * *', // à 0s de chaque minute divisible par 3

    opts.repeat = {
      cron: '*/5 * * * * *', // à 0s de chaque minute divisible par 3
      limit: 3,              // stop après 3 runs :contentReference[oaicite:0]{index=0}
    };
    const jobOptions = { ...defaultOpts, ...opts };
    return this.queue.add('check-payment', { txId: data }, jobOptions);
  }
  

}
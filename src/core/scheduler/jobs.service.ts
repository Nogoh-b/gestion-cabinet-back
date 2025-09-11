import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class JobsService {
  static lock: boolean = false;
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  setLock() {
    if (JobsService.lock) {
      return console.log('JobsService is already lock');
    }
    JobsService.lock = true;
  }
  setUnlock() {
    JobsService.lock = false;
  }

  addCronJob(name: string, time: string, callback: any) {
    const job = new CronJob(`${time}`, callback);
    // @ts-ignore
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
  }

  getCrons() {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((value, key, map) => {
      let next;
      try {
        next = value.nextDate().toJSDate();
      } catch (e) {
        next = 'error: next fire date is in the past!';
      }
      console.log(`job: ${key} -> next: ${next}`);
    });
  }

  getCronJob(name: string): [string, any] | undefined {
    const jobs = this.schedulerRegistry.getCronJobs();
    return Array.from(jobs).find((value) => value[0] === name);
  }

  deleteCron(name: string) {
    this.schedulerRegistry.deleteCronJob(name);
    console.log(`job ${name} deleted!`);
  }
}

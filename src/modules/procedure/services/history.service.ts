// services/history.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoryEntry } from '../entities/history-entry.entity';
import { EventType } from '../entities/enums/instance-status.enum';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(HistoryEntry)
    private historyRepository: Repository<HistoryEntry>,
  ) {}

  async log(
    instanceId: string,
    eventType: EventType,
    stageId: string | null,
    userId: string | null,
    metadata?: any,
  ): Promise<HistoryEntry> {
    const entry = this.historyRepository.create({
      instanceId,
      eventType,
      stageId,
      userId: userId || 'system',
      metadata: metadata || {},
    });

    return this.historyRepository.save(entry);
  }

  async findByInstance(instanceId: string): Promise<HistoryEntry[]> {
    return this.historyRepository.find({
      where: { instanceId },
      order: { createdAt: 'ASC' },
    });
  }

  async getTimeline(instanceId: string): Promise<any[]> {
    const entries = await this.findByInstance(instanceId);
    
    return entries.map(entry => ({
      date: entry.createdAt,
      event: entry.eventType,
      stageId: entry.stageId,
      user: entry.userId,
      details: entry.metadata,
    }));
  }
}
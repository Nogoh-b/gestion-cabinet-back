import { BaseEntity } from 'src/core/entities/baseEntity';
import { Repository, EntityRepository, UpdateResult } from 'typeorm';

@EntityRepository()
export class BaseRepository<T extends BaseEntity> extends Repository<T> {
  async softDelete(id: string): Promise<UpdateResult> {
    return this.update(id, { status: 'inactive' } as any);
  }
}
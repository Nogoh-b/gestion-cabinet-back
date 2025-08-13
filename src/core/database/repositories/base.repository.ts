import { Base } from 'src/core/entities/base';
import { Repository, EntityRepository, UpdateResult } from 'typeorm';

@EntityRepository()
export class BaseRepository<T extends Base> extends Repository<T> {
  async softDelete(id: string): Promise<UpdateResult> {
    return this.update(id, { status: 'inactive' } as any);
  }
}
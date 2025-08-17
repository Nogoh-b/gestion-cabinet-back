import { HttpStatus, Injectable } from '@nestjs/common';
import { TypeCredit } from './entities/typeCredit.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeCreditDto } from './dto/typeCredit.dto';

@Injectable()
export class TypeCreditService {
  constructor(
    @InjectRepository(TypeCredit)
    private readonly typeCreditRepository: Repository<TypeCredit>,
  ) {}
  async findAllTypeCredits() {
    return await this.typeCreditRepository.find();
  }

  async findOneTypeCredits(id: number) {
    const typeCredit = await this.typeCreditRepository.findOneBy({ id });
    if (!typeCredit)
      return {
        success: false,
        message: 'No such type',
        status: HttpStatus.NOT_FOUND,
      };
    return typeCredit;
  }

  async addTypeCredit(data: TypeCreditDto) {
    const typeCredit = this.typeCreditRepository.create(data);
    return await this.typeCreditRepository.save(typeCredit);
  }

  async updateTypeCredit(id: number, data: Partial<TypeCreditDto>) {
    await this.typeCreditRepository.update(id, { ...data });
    return true;
  }

  async deleteTypeCredit(id: number) {
    await this.typeCreditRepository.delete(id);
    return true;
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeGuaranty } from './entity/type_guaranty.entity';
import { Repository } from 'typeorm';
import { TypeGuarantyDto } from './dto/type_guaranty.dto';

@Injectable()
export class TypeGuarantyService {
  constructor(
    @InjectRepository(TypeGuaranty)
    private readonly typeGuarantyRepository: Repository<TypeGuaranty>,
  ) {}
  async addTypeGuaranty(data: TypeGuarantyDto) {
    const guaranty = this.typeGuarantyRepository.create(data);
    return await this.typeGuarantyRepository.save(guaranty);
  }

  async deleteTypeGuaranty(id: number) {
    await this.typeGuarantyRepository.delete(id);
    return true;
  }

  async findOneTypeGuaranty(id: number) {
    const typeGuaranty = await this.typeGuarantyRepository.findOneBy({ id });
    if (!typeGuaranty)
      return {
        success: false,
        status: HttpStatus.NOT_FOUND,
        message: 'type guaranty Not Found',
      };
    return typeGuaranty;
  }

  async findAllTypeGuaranty(id: number) {
    return await this.typeGuarantyRepository.find({
      where: { typeCredits: { id } },
    });
  }
}

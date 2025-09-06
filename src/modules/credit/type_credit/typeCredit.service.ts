import { Repository } from 'typeorm';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { DocumentType } from '../../documents/document-type/entities/document-type.entity';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';
import { TypeCreditDto } from './dto/typeCredit.dto';
import { TypeCredit } from './entities/typeCredit.entity';




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
    const typeCredit = await this.typeCreditRepository.findOne({
      where: {
        id,
      },
      relations: { typeGuaranties: true, typeOfDocuments: true },
    });
    if (!typeCredit)
      return {
        success: false,
        message: 'No such type credit',
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

  async deleteTypeOfGuarantyToTypeCredit(
    typeCredit: TypeCredit,
    guaranty: number,
  ) {
    const index = typeCredit.typeGuaranties.findIndex((g) => g.id === guaranty);
    if (index === -1)
      return {
        success: false,
        message: 'No such type guaranty found',
        status: HttpStatus.NOT_FOUND,
      };
    typeCredit.typeGuaranties.splice(index, 1);
    await this.typeCreditRepository.save(typeCredit);
    return true;
  }

  async addTypeOfGuarantyToTypeCredit(
    typeCredit: TypeCredit,
    guaranty: TypeGuaranty,
  ) {
    typeCredit.typeGuaranties = [...typeCredit.typeGuaranties, guaranty];
    await this.typeCreditRepository.save(typeCredit);
    return true;
  }

  async addTypeOfDocumentsToTypeCredit(
    typeCredit: TypeCredit,
    doc: DocumentType,
  ) {
    typeCredit.typeOfDocuments = [...typeCredit.typeOfDocuments, doc];
    await this.typeCreditRepository.save(typeCredit);
    return true;
  }

  async deleteTypeCredit(id: number) {
    await this.typeCreditRepository.delete(id);
    return true;
  }
}

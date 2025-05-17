import { Injectable } from '@nestjs/common';
import { AddDocumentTypesToTypeDto, CreateTypeSavingsAccountDto, RemoveDocumentTypeFromTypeDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeSavingsAccount } from './entities/type-savings-account.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';

@Injectable()
export class TypeSavingsAccountService {
  constructor(
    @InjectRepository(TypeSavingsAccount)
    private readonly repo: Repository<TypeSavingsAccount>,
    @InjectRepository(DocumentType)
    private readonly typeRepo: Repository<DocumentType>,
  ) {}

  findAll(): Promise<TypeSavingsAccount[]> {
    return this.repo.find({ relations: ['documentTypes'] });
  }

  findOne(id: number): Promise<any> {
    return this.repo.findOne({ where: { id }, relations: ['documentTypes'] });
  }

  create(dto: CreateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  update(id: number, dto: UpdateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    return this.repo.save({ id, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  async addDocumentTypes(
    id: number,
    dto: AddDocumentTypesToTypeDto,
  ): Promise<any> {
   /* const type = await this.repo.findOne({ where: { id }, relations: ['documentTypes'] });
    const newDocs = dto.documentTypeIds.map(dtId => ({ id: dtId } as DocumentType));
    if(!type){
      throw new NotFoundException('Type not found');
    }
    type.documentTypes = [...type.documentTypes, ...newDocs];*/
    return null;
  }

  async removeDocumentType(
    id: number,
    dto: RemoveDocumentTypeFromTypeDto,
  ): Promise<void> {
  /*  const type = await this.repo.findOne({ where: { id }, relations: ['documentTypes'] });
    if(!type){
      throw new NotFoundException('Type not found');
    }
    type.documentTypes = type.documentTypes.filter(
      dt => dt.id !== dto.documentTypeId,
    );
    await this.repo.save(type);*/
  }
}

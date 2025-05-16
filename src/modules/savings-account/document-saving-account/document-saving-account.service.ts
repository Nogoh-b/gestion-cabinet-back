import { Injectable } from '@nestjs/common';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { UpdateDocumentSavingAccountDto } from './dto/update-document-saving-account.dto';

@Injectable()
export class DocumentSavingAccountService {
  create(createDocumentSavingAccountDto: CreateDocumentSavingAccountDto) {
    return 'This action adds a new documentSavingAccount';
  }

  findAll() {
    return `This action returns all documentSavingAccount`;
  }

  findOne(id: number) {
    return `This action returns a #${id} documentSavingAccount`;
  }

  update(id: number, updateDocumentSavingAccountDto: UpdateDocumentSavingAccountDto) {
    return `This action updates a #${id} documentSavingAccount`;
  }

  remove(id: number) {
    return `This action removes a #${id} documentSavingAccount`;
  }
}

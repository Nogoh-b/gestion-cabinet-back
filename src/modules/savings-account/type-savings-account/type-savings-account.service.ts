import { Injectable } from '@nestjs/common';
import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';

@Injectable()
export class TypeSavingsAccountService {
  create(createTypeSavingsAccountDto: CreateTypeSavingsAccountDto) {
    return 'This action adds a new typeSavingsAccount';
  }

  findAll() {
    return `This action returns all typeSavingsAccount`;
  }

  findOne(id: number) {
    return `This action returns a #${id} typeSavingsAccount`;
  }

  update(id: number, updateTypeSavingsAccountDto: UpdateTypeSavingsAccountDto) {
    return `This action updates a #${id} typeSavingsAccount`;
  }

  remove(id: number) {
    return `This action removes a #${id} typeSavingsAccount`;
  }
}

import { Injectable } from '@nestjs/common';
import { CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';

@Injectable()
export class SavingsAccountService {
  create(createSavingsAccountDto: CreateSavingsAccountDto) {
    return 'This action adds a new savingsAccount';
  }

  findAll() {
    return `This action returns all savingsAccount`;
  }

  findOne(id: number) {
    return `This action returns a #${id} savingsAccount`;
  }

  update(id: number, updateSavingsAccountDto: UpdateSavingsAccountDto) {
    return `This action updates a #${id} savingsAccount`;
  }

  remove(id: number) {
    return `This action removes a #${id} savingsAccount`;
  }
}

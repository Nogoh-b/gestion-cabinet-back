import { Injectable } from '@nestjs/common';
import { CreateInterestSavingAccountDto } from './dto/create-interest-saving-account.dto';
import { UpdateInterestSavingAccountDto } from './dto/update-interest-saving-account.dto';

@Injectable()
export class InterestSavingAccountService {
  create(createInterestSavingAccountDto: CreateInterestSavingAccountDto) {
    return 'This action adds a new interestSavingAccount';
  }

  findAll() {
    return `This action returns all interestSavingAccount`;
  }

  findOne(id: number) {
    return `This action returns a #${id} interestSavingAccount`;
  }

  update(id: number, updateInterestSavingAccountDto: UpdateInterestSavingAccountDto) {
    return `This action updates a #${id} interestSavingAccount`;
  }

  remove(id: number) {
    return `This action removes a #${id} interestSavingAccount`;
  }
}

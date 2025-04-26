import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { BaseRepository } from 'src/core/database/repositories/base.repository';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UserService {
    constructor(
    @InjectRepository(User)
    private userRepository: BaseRepository<User>,
  ) {}
  async create(createUserDto: CreateUserDto) {
  const hashedPassword = await bcrypt.hash(createUserDto.password!, 10);
  const user = this.userRepository.create(createUserDto);
  user.password = hashedPassword;
  if (!user) {
    throw new BadRequestException('User data is missing');
  }

  const userEntity = plainToInstance(User, user);

  return this.userRepository.save(userEntity);
  }

  async updateStatus(userId: number, status: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    user!.status = status;
    if (!user) {
      throw new Error('User not found');
    }
    return await this.userRepository.save(user);
  }

  async findAll() {
    return await this.userRepository.find();
  }

  async findOne(id: number) {
    return await this.userRepository.findOne({ where: {id: id} });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  async remove(id: number) {
    return `This action removes a #${id} user`;
  }
}

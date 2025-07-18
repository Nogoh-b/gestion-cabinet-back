import { Injectable } from '@nestjs/common';
import { CreateRessourceTypeDto } from './dto/create-ressource-type.dto';
import { UpdateRessourceTypeDto } from './dto/update-ressource-type.dto';

@Injectable()
export class RessourceTypeService {
  create(createRessourceTypeDto: CreateRessourceTypeDto) {
    return 'This action adds a new ressourceType';
  }

  findAll() {
    return `This action returns all ressourceType`;
  }

  findOne(id: number) {
    return `This action returns a #${id} ressourceType`;
  }

  update(id: number, updateRessourceTypeDto: UpdateRessourceTypeDto) {
    return `This action updates a #${id} ressourceType`;
  }

  remove(id: number) {
    return `This action removes a #${id} ressourceType`;
  }
}

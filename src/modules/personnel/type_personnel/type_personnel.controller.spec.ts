import { Test, TestingModule } from '@nestjs/testing';
import { TypePersonnelController } from './type_personnel.controller';
import { TypePersonnelService } from './type_personnel.service';

describe('TypePersonnelController', () => {
  let controller: TypePersonnelController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TypePersonnelController],
      providers: [TypePersonnelService],
    }).compile();

    controller = module.get<TypePersonnelController>(TypePersonnelController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

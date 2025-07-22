import { Test, TestingModule } from '@nestjs/testing';
import { LocationCityController } from './location_city.controller';
import { LocationCityService } from './location_city.service';

describe('LocationCityController', () => {
  let controller: LocationCityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationCityController],
      providers: [LocationCityService],
    }).compile();

    controller = module.get<LocationCityController>(LocationCityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

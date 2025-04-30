import { Test, TestingModule } from '@nestjs/testing';
import { LocationCityService } from './location_city.service';

describe('LocationCityService', () => {
  let service: LocationCityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocationCityService],
    }).compile();

    service = module.get<LocationCityService>(LocationCityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

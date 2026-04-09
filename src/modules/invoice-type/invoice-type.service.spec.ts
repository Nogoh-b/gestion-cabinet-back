import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceTypeService } from './invoice-type.service';

describe('InvoiceTypeService', () => {
  let service: InvoiceTypeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceTypeService],
    }).compile();

    service = module.get<InvoiceTypeService>(InvoiceTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

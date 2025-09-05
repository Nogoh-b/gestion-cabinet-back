import { Test, TestingModule } from '@nestjs/testing';
import { DocumentSavingAccountService } from './document-saving-account.service';

describe('DocumentSavingAccountService', () => {
  let service: DocumentSavingAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentSavingAccountService],
    }).compile();

    service = module.get<DocumentSavingAccountService>(DocumentSavingAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

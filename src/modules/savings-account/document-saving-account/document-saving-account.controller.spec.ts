import { Test, TestingModule } from '@nestjs/testing';
import { DocumentSavingAccountController } from './document-saving-account.controller';
import { DocumentSavingAccountService } from './document-saving-account.service';

describe('DocumentSavingAccountController', () => {
  let controller: DocumentSavingAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentSavingAccountController],
      providers: [DocumentSavingAccountService],
    }).compile();

    controller = module.get<DocumentSavingAccountController>(DocumentSavingAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DocumentCategoryService } from './document-category.service';

describe('DocumentCategoryService', () => {
  let service: DocumentCategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentCategoryService],
    }).compile();

    service = module.get<DocumentCategoryService>(DocumentCategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

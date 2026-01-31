import { Test, TestingModule } from '@nestjs/testing';
import { DocumentCategoryController } from './document-category.controller';
import { DocumentCategoryService } from './document-category.service';

describe('DocumentCategoryController', () => {
  let controller: DocumentCategoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentCategoryController],
      providers: [DocumentCategoryService],
    }).compile();

    controller = module.get<DocumentCategoryController>(DocumentCategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

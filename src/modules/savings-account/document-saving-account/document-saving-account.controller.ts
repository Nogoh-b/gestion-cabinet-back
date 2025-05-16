import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DocumentSavingAccountService } from './document-saving-account.service';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { UpdateDocumentSavingAccountDto } from './dto/update-document-saving-account.dto';

@Controller('document-saving-account')
export class DocumentSavingAccountController {
  constructor(private readonly documentSavingAccountService: DocumentSavingAccountService) {}

  @Post()
  create(@Body() createDocumentSavingAccountDto: CreateDocumentSavingAccountDto) {
    return this.documentSavingAccountService.create(createDocumentSavingAccountDto);
  }

  @Get()
  findAll() {
    return this.documentSavingAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentSavingAccountService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentSavingAccountDto: UpdateDocumentSavingAccountDto) {
    return this.documentSavingAccountService.update(+id, updateDocumentSavingAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentSavingAccountService.remove(+id);
  }
}

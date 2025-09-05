import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  GuarantyChangeCreditsDto,
  DocumentsCreditsDto,
  TypeCreditDto,
  UpdateTypeCredit,
} from './dto/typeCredit.dto';
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';
import { TypeCreditService } from './typeCredit.service';
import { TypeCredit } from './entities/typeCredit.entity';
import { TypeGuarantyService } from '../guaranty/type_guaranty/type_guaranty.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';
import { DocumentTypeService } from '../../documents/document-type/document-type.service';
import { DocumentType } from '../../documents/document-type/entities/document-type.entity';

@Controller('type-credit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class TypeCreditController {
  constructor(
    private readonly typeCreditService: TypeCreditService,
    private readonly typeGuarantyService: TypeGuarantyService,
    private readonly typeOfDocumentService: DocumentTypeService,
  ) {}

  @Get('all')
  async findAllTypeCredits() {
    return await this.typeCreditService.findAllTypeCredits();
  }

  @Get(':typeCreditId')
  async findOneTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return result;
  }

  @Post('add')
  async createTypeCredit(@Body() body: TypeCreditDto) {
    return await this.typeCreditService.addTypeCredit(body);
  }

  @Put(':typeCreditId')
  async updateTypeCredit(
    @Param('typeCreditId') id: number,
    @Body() body: UpdateTypeCredit,
  ) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeCreditService.updateTypeCredit(id, body);
  }

  @Delete('/guaranty/:typeCreditId/:guarantyId')
  async deleteTypeGuarantyOfTypeCredit(
    @Param('typeCreditId') id: number,
    @Param('guarantyId') guarantyId: number,
  ) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeCreditService.deleteTypeOfGuarantyToTypeCredit(
      result as TypeCredit,
      guarantyId,
    );
  }

  @Delete(':typeCreditId')
  async deleteTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeCreditService.deleteTypeCredit(id);
  }

  @Get('guaranty/:typeCreditId')
  async findAllTypeOfGuarantyOfTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyService.findAllTypeGuarantyBy(id);
  }

  @Put('set/guaranty/:typeCreditId')
  async setTypeOfGuarantyOfTypeCredit(
    @Param('typeCreditId') id: number,
    @Body() body: DocumentsCreditsDto,
  ) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });

    const typeGuaranty = await this.typeGuarantyService.findOneTypeGuaranty(
      body.id,
    );
    if (typeGuaranty.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...typeGuaranty,
      });
    console.log(typeGuaranty);

    return await this.typeCreditService.addTypeOfGuarantyToTypeCredit(
      result as TypeCredit,
      typeGuaranty as TypeGuaranty,
    );
  }

  @Put('set/type-document/:typeCreditId')
  async setTypeOfDocumentOfTypeCredit(
    @Param('typeCreditId') id: number,
    @Body() body: DocumentsCreditsDto,
  ) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });

    const typeDoc = await this.typeOfDocumentService.findOne(body.id);
    return await this.typeCreditService.addTypeOfDocumentsToTypeCredit(
      result as TypeCredit,
      typeDoc,
    );
  }
}

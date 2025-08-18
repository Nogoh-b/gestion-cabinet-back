import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param, Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GuarantyCreditsDto, TypeCreditDto } from './dto/typeCredit.dto';
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';
import { TypeCreditService } from './typeCredit.service';
import { TypeCredit } from './entities/typeCredit.entity';
import { TypeGuarantyService } from '../guaranty/type_guaranty/type_guaranty.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';

@Controller('type-credit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class TypeCreditController {
  constructor(
    private readonly typeCreditService: TypeCreditService,
    private readonly typeGuarantyService: TypeGuarantyService,
  ) {}

  @Get('all')
  async findAllTypeCredits() {
    return {
      data: await this.typeCreditService.findAllTypeCredits(),
      success: true,
      status: HttpStatus.OK,
    };
  }

  @Get(':typeCreditId')
  async findOneTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      success: true,
      data: result,
      status: HttpStatus.OK,
    }
  }

  @Post('add')
  async createTypeCredit(@Body() body: TypeCreditDto){
    return {
      data: await this.typeCreditService.addTypeCredit(body),
      success: true,
      status: HttpStatus.OK,
    }
  }

  @Post(':typeCreditId')
  async activeTypeCredit(@Body() credit: TypeCreditDto) {}

  @Put(':typeCreditId')
  async updateTypeCredit(
    @Param('typeCreditId') id: number,
    @Body() body: Partial<TypeCreditDto>,
  ) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      data: await this.typeCreditService.updateTypeCredit(id, body),
      success: true,
      status: HttpStatus.OK,
    };
  }

  @Delete(':typeCreditId')
  async deleteTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      success: true,
      status: HttpStatus.OK,
      data: await this.typeCreditService.deleteTypeCredit(id),
    };
  }

  @Get('guaranty/:typeCreditId')
  async findAllTypeOfGuarantyOfTypeCredit(@Param('typeCreditId') id: number) {
    const result = await this.typeCreditService.findOneTypeCredits(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      success: true,
      status: HttpStatus.OK,
      data: await this.typeGuarantyService.findAllTypeGuarantyBy(id),
    };
  }

  @Put('set/guaranty/:typeCreditId')
  async setTypeOfGuarantyOfTypeCredit(
    @Param('typeCreditId') id: number,
    @Body() body: GuarantyCreditsDto,
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

    return {
      success: true,
      status: HttpStatus.OK,
      data: await this.typeCreditService.updateTypeOfGuarantyToTypeCredit(
        result as TypeCredit,
        typeGuaranty as TypeGuaranty,
      ),
    };
  }
}

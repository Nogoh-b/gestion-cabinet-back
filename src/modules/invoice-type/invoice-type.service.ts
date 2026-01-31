import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { CreateInvoiceTypeDto } from './dto/create-invoice-type.dto';
import { InvoiceTypeResponseDto } from './dto/invoice-type-response.dto';
import { UpdateInvoiceTypeDto } from './dto/update-invoice-type.dto';
import { InvoiceType } from './entities/invoice-type.entity';



@Injectable()
export class InvoiceTypeService extends BaseServiceV1<InvoiceType> {
  constructor(
    @InjectRepository(InvoiceType)
    private invoiceTypeRepository: Repository<InvoiceType>,
    protected readonly paginationService: PaginationServiceV1
  ) {
    super(invoiceTypeRepository, paginationService);
  }

  async create(dto: CreateInvoiceTypeDto): Promise<InvoiceTypeResponseDto> {
    const existing = await this.invoiceTypeRepository.findOne({
      where: { code: dto.code }
    });
    
    if (existing) {
      throw new ConflictException(`Un type de facture avec le code ${dto.code} existe déjà`);
    }

    const invoiceType = this.invoiceTypeRepository.create({
      ...dto,
      metadata: {
        accounting_code: dto.accounting_code,
        default_unit: dto.default_unit,
        default_price: dto.default_price,
        vat_exempt: dto.vat_exempt
      }
    });
    
    const saved = await this.invoiceTypeRepository.save(invoiceType);
    return plainToInstance(InvoiceTypeResponseDto, saved);
  }

  async findAll(): Promise<InvoiceTypeResponseDto[]> {
    const types = await this.invoiceTypeRepository.find({
      where: { is_active: true },
      order: { category: 'ASC', name: 'ASC' }
    });
    
    return plainToInstance(InvoiceTypeResponseDto, types);
  }

  async findOne(id: number): Promise<InvoiceTypeResponseDto> {
    const type = await this.invoiceTypeRepository.findOne({
      where: { id },
      relations: ['invoices']
    });

    if (!type) {
      throw new NotFoundException(`Type de facture avec l'ID ${id} introuvable`);
    }

    return plainToInstance(InvoiceTypeResponseDto, type);
  }

  async update(id: number, dto: UpdateInvoiceTypeDto): Promise<InvoiceTypeResponseDto> {
    const type = await this.findOne(id);
    
    Object.assign(type, dto);
    const updated = await this.invoiceTypeRepository.save(type);
    
    return plainToInstance(InvoiceTypeResponseDto, updated);
  }
}
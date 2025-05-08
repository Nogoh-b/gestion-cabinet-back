import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';
import { TypeCustomersService } from '../type-customer/type-customer.service';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';
import { plainToInstance } from 'class-transformer';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { DocumentCustomerService } from 'src/modules/documents/document-customer/document-customer.service';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { CreateDocumentCustomerDto } from 'src/modules/documents/document-customer/dto/create-document-customer.dto';
import { CreateDocumentFromCotiDto, DocTypeNameOnline } from 'src/modules/documents/document-customer/dto/create-document-from-coti.dto';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { TypeCustomer } from '../type-customer/entities/type_customer.entity';
import { GenCOde } from 'src/core/shared/utils/generation.util';
import { BranchService } from 'src/modules/agencies/branch/branch.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,    
    
    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,   
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
    private typeCustomerService: TypeCustomersService,
    private locationcityService: LocationCitiesService ,
    private documentCustomerService: DocumentCustomerService ,
    private branchService: BranchService ,
    private readonly dataSource: DataSource,

  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return await this.dataSource.transaction(async manager => {

      // const customerRes = new CustomerResponseDto()
      // customerRes.customer_code = GenCOde.generateCode(10)
      // return customerRes
      const errors = await validateDto(CreateCustomerDto,createCustomerDto);

      const existing = await this.customerRepository.findOneBy({ number_phone_1 : createCustomerDto.number_phone_1 });
      if (existing) throw new ConflictException('Numero deja attribué à un compte');
      const type_customer = await this.typeCustomerService.findOne( createCustomerDto.type_customer_id);
      // return new CustomerResponseDto()
      const location_city = await this.locationcityService.findOne(createCustomerDto.location_city_id);
      if (!type_customer || !location_city) throw new NotFoundException('Le type de client ou la location invalide');

      const branch = await this.branchService.findOne(createCustomerDto.branch_id);
      if (!branch) throw new NotFoundException('Branche invalide');

      if (createCustomerDto.email) {
        const emailExists = await this.customerRepository.findOneBy({ email: createCustomerDto.email });
        if (emailExists) throw new ConflictException('L\'adresse mail existe deja');
      }

      const customer = this.customerRepository.create({
        ...createCustomerDto,
        type_customer,
        location_city,
      });
      customer.status = 0

      const savedClient = await manager.save(customer)
      let code: string;
      let attempts = 0;
      do {
        code = GenCOde.generateCode(savedClient.id, attempts);
        attempts++;
      } while (!(await this.isClientCodeUnique(code)) && attempts < 5);

      if (attempts >= 5) {
        throw new Error('Échec de génération d’un code client unique');
      }
      savedClient.customer_code = code;

      return plainToInstance(
        CustomerResponseDto,
        await manager.save(customer),
      );
    })

  }

  async createFromCoti(createCustomerDto: CreateCustomerFromCotiDto, files: Express.Multer.File[]): Promise<any> {
    let documents : CreateDocumentFromCotiDto[]= createCustomerDto.documents;
    if (documents.length !== files.length) {
      throw new BadRequestException('Mismatch between files and documents metadata.');
    }
    const documentsWithFiles  = documents.map((doc, index) => ({
      ...doc,
      file: files[index]
    }));

    if(documents.length < 3)
      throw new BadRequestException('Document(s) manquants');

  
    const customerDto = plainToInstance(CreateCustomerDto, {
      ...createCustomerDto
    });
    const docs : CreateDocumentCustomerDto[]  = []
    for (const document of documentsWithFiles) {
      if(!Object.values(DocTypeNameOnline).includes(document.document_type_name as DocTypeNameOnline))
        throw new BadRequestException(`${document.document_type_name} manquant`);
        const doc_type = await this.docTypeRepository.findOne({
          where: { name: document.document_type_name },
          select: ['id'],
        });
        document.document_type_id = doc_type!.id
        docs.push(await validateDto(CreateDocumentCustomerDto, document))
    }

    
    const customer = await this.create(customerDto)
    for (const document of documentsWithFiles) {
      document.customer_id = customer.id
    }
    
    return  {customer,documents: await this.documentCustomerService.createMany(documentsWithFiles)}
    return (documentsWithFiles);




  }

  async findAll(): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.find({relations : ['type_customer','location_city']})
    return plainToInstance(CustomerResponseDto, customers );
  }

  async findOne(id: number): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { id } , relations : ['type_customer','location_city'] });
    if (!customer) throw new NotFoundException();
    return plainToInstance(CustomerResponseDto, customer);
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.findOne(id);
    
    if (dto.email && dto.email !== customer.email) {
      const emailExists = await this.customerRepository.findOneBy({ email: dto.email });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    Object.assign(customer, dto);
    return plainToInstance(CustomerResponseDto , this.customerRepository.save(customer));
  }

  async remove(id: number): Promise<void> {
    const result = await this.customerRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException();
  }

  async isClientCodeUnique(code: string): Promise<boolean> {
    const existing = await this.customerRepository.findOne({ where: { customer_code: code } });
    return !existing;
  }
}
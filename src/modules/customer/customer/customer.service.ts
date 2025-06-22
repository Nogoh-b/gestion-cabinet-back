import { plainToInstance } from 'class-transformer';
import { AdvancedSearchOptionsDto } from 'src/core/shared/dto/advanced-search.dto';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { GenCOde } from 'src/core/shared/utils/generation.util';
import { BranchService } from 'src/modules/agencies/branch/branch.service';
import { DocumentCustomerService } from 'src/modules/documents/document-customer/document-customer.service';
import { CreateDocumentCustomerDto } from 'src/modules/documents/document-customer/dto/create-document-customer.dto';
import { CreateDocumentFromCotiDto, DocTypeNameOnline } from 'src/modules/documents/document-customer/dto/create-document-from-coti.dto';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';






import { InjectRepository } from '@nestjs/typeorm';




import { TypeCustomer } from '../type-customer/entities/type_customer.entity';
import { TypeCustomersService } from '../type-customer/type-customer.service';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerCreatedFrom, CustomerStatus } from './entities/customer.entity';











@Injectable()
export class CustomersService extends BaseService<Customer> {
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

    
  ) {super();}

  async create(createCustomerDto: CreateCustomerDto): Promise<any> {
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
        first_name : createCustomerDto.firt_name,
        type_customer,
        location_city,
      });
      customer.status = CustomerStatus.INACTIVE
      customer.customer_code = '_'
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

    const numberOfRequiredDocs = Object.values(DocTypeNameOnline).length;
    if(documents.length < numberOfRequiredDocs)
      throw new BadRequestException('Document(s) manquants');

  
    const customerDto = plainToInstance(CreateCustomerDto, {
      ...createCustomerDto
    });
    const docs : CreateDocumentCustomerDto[]  = []
    for (const document of documentsWithFiles) {
        if (!Object.values(DocTypeNameOnline).includes(document.document_type_name as DocTypeNameOnline)) {
          const expectedValues = Object.values(DocTypeNameOnline).join(', ');
          throw new BadRequestException(
            `${document.document_type_name} non attendu. Valeurs attendues : ${expectedValues}`
          );
        }
        const doc_type = await this.docTypeRepository.findOne({
          where: { code: document.document_type_name },
          select: ['id'],
        });
        document.document_type_id = doc_type!.id
        docs.push(await validateDto(CreateDocumentCustomerDto, document))
    }
    customerDto.created_from = CustomerCreatedFrom.ONLINE
    
    const customer = await this.create(customerDto)
    for (const document of documentsWithFiles) {
      document.customer_id = customer.id
    }
    
    return  {customer,documents: await this.documentCustomerService.createMany(documentsWithFiles)}
    return (documentsWithFiles);




  }

  async search(params: AdvancedSearchOptionsDto){
    return this.enhancedSearch(params)
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
    if(dto.location_city_id){
      customer.location_city = await this.locationcityService.findOneSimple(
        dto.location_city_id,
      );
    }
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

    getRepository(): Repository<Customer> {
      return this.customerRepository;
    }
}
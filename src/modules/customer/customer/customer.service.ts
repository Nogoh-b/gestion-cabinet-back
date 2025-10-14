import { plainToInstance } from 'class-transformer';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions as SearchOptionV1 } from 'src/core/shared/interfaces/pagination.interface';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { BranchService } from 'src/modules/agencies/branch/branch.service';
import { DocumentCustomerService } from 'src/modules/documents/document-customer/document-customer.service';
import { CreateDocumentCustomerDto } from 'src/modules/documents/document-customer/dto/create-document-customer.dto';
import {
  CreateDocumentFromCotiDto,
  DocTypeNameOnline,
  KycSyncDto,
} from 'src/modules/documents/document-customer/dto/create-document-from-coti.dto';

import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from 'src/modules/documents/document-customer/entities/document-customer.entity';

import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';

import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';

import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { DataSource, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';






import { TypeCustomer } from '../type-customer/entities/type_customer.entity';
import { TypeCustomersService } from '../type-customer/type-customer.service';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  Customer,
  CustomerCreatedFrom,
  CustomerStatus,
} from './entities/customer.entity';







@Injectable()
export class CustomersService extends BaseServiceV1<Customer> {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,

    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
    private typeCustomerService: TypeCustomersService,
    @Inject(forwardRef(() => SavingsAccountService))
    private savingsAccountService: SavingsAccountService,
    private locationcityService: LocationCitiesService,
    private documentCustomerService: DocumentCustomerService,
    @Inject(forwardRef(() => BranchService))
    private branchService: BranchService,
    protected readonly oldPaginationService: PaginationService,
    protected readonly paginationServiceV1: PaginationServiceV1,
    private readonly dataSource: DataSource,
  ) {
    console.log(forwardRef);
    super(customerRepository, paginationServiceV1);
  }

  protected getDefaultSearchOptions(): SearchOptions {
      return {
        // Champs pour la recherche globale
        searchFields: [
          'last_name',
          'first_name',
          'company_name',
          'address',
          'postal_code',
          'country',
          'billing_type',
          'professional_phone',
          'fax',
          'siret',
          'tva_number',
          'legal_form',
          'reference',
          'number_phone_1',
          'number_phone_2',
          'email',
          'customer_code',
          'type_customer.name',
          'location_city.name',
          'nui',
          'rccm',
          'birthday',
        ],
        
        // Champs pour recherche exacte
        exactMatchFields: [
          'type_customer.name',
          'location_city.name',
        ],
        
        // Champs pour ranges de dates
        /*dateRangeFields: [
          'created_at',
          'updated_at',
          'opening_date',
          'closing_date'
        ],*/
        
        // Champs de relations pour filtrage
        relationFields: ['type_customer', 'location_city']
      };
    }

  async create(createCustomerDto: CreateCustomerDto): Promise<any> {
    return await this.dataSource.transaction(async (manager) => {
      // const customerRes = new CustomerResponseDto()
      // customerRes.customer_code = GenCOde.generateCode(10)
      // return customerRes
      const errors = await validateDto(CreateCustomerDto, createCustomerDto);

      // const existing = await this.customerRepository.findOneBy({ number_phone_1 : createCustomerDto.number_phone_1 });
      // if (existing) throw new ConflictException('Numero deja attribué à un compte');
      const type_customer = await this.typeCustomerService.findOne(
        createCustomerDto.type_customer_id,
      );
      // return new CustomerResponseDto()
      const location_city = await this.locationcityService.findOne(
        createCustomerDto.location_city_id,
      );
      if (!type_customer || !location_city)
        throw new NotFoundException(
          'Le type de client ou la location invalide',
        );

      const branch = await this.branchService.findOne(
        createCustomerDto.branch_id,
      );
      if (!branch) throw new NotFoundException('Branche invalide');

      if (createCustomerDto.email) {
        /*const emailExists = await this.customerRepository.findOneBy({ email: createCustomerDto.email });
        if (emailExists) throw new ConflictException('L\'adresse mail existe deja');*/
      }

      const customer = this.customerRepository.create({
        ...createCustomerDto,
        first_name: createCustomerDto.first_name ?? createCustomerDto.first_name,
        type_customer,
        location_city,
      });
      customer.status = CustomerStatus.INACTIVE;
      customer.customer_code = '_';
      const savedClient = await manager.save(customer);
      let code: string;
      const attempts = 0;
      code = await this.generateNextCustomerCode();
      /*do {
        attempts++;
      } while (!(await this.isClientCodeUnique(code)) && attempts < 5);*/

      if (attempts >= 5) {
        throw new Error('Échec de génération d’un code client unique');
      }
      savedClient.customer_code = code;
      return plainToInstance(CustomerResponseDto, await manager.save(customer));
    });
  }

  async createFromCoti(
    createCustomerDto: CreateCustomerFromCotiDto,
    files: Express.Multer.File[],
  ): Promise<any> {
    const documents: CreateDocumentFromCotiDto[] = createCustomerDto.documents;
    if (documents.length !== files.length) {
      throw new BadRequestException(
        'Mismatch between files and documents metadata.',
      );
    }
    const documentsWithFiles = documents.map((doc, index) => ({
      ...doc,
      file: files[index],
    }));

    const numberOfRequiredDocs = Object.values(DocTypeNameOnline).length;
    if (documents.length < numberOfRequiredDocs)
      throw new BadRequestException('Document(s) manquants');

    const customerDto = plainToInstance(CreateCustomerDto, {
      ...createCustomerDto,
    });
    const docs: CreateDocumentCustomerDto[] = [];
    for (const document of documentsWithFiles) {
      if (
        !Object.values(DocTypeNameOnline).includes(document.document_type_name)
      ) {
        const expectedValues = Object.values(DocTypeNameOnline).join(', ');
        throw new BadRequestException(
          `${document.document_type_name} non attendu. Valeurs attendues : ${expectedValues}`,
        );
      }
      const doc_type = await this.docTypeRepository.findOne({
        where: { code: document.document_type_name },
        select: ['id'],
      });
      document.document_type_id = doc_type!.id;
      docs.push(await validateDto(CreateDocumentCustomerDto, document));
    }
    customerDto.created_from = CustomerCreatedFrom.ONLINE;

    const customer = await this.create(customerDto);
    for (const document of documentsWithFiles) {
      document.customer_id = customer.id;
    }

    return {
      customer,
      documents:
        await this.documentCustomerService.createMany(documentsWithFiles, 1),
    };
    return documentsWithFiles;
  }

  // async search(params: AdvancedSearchOptionsDto) {
  //   return null// this.enhancedSearch(params);
  // }

  async findAll(): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.find({
      relations: ['type_customer', 'location_city'],
    });
    return plainToInstance(CustomerResponseDto, customers);
  }

  async findAllV2(page = 1, limit = 10,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string): Promise<PaginatedResult<CustomerResponseDto>>  {

    const qb = this.customerRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.branch', 'branch')
      .leftJoinAndSelect('c.loans', 'loans')
      .leftJoinAndSelect('c.type_customer', 'type_customer')
      .leftJoinAndSelect('c.location_city', 'location_city')

      const options: PaginationOptions & {
        search?: SearchOptionV1;
        dateRange?: DateRange;
      } = { page, limit };
      if (term) options.search = { term, fields, exact };
      if (from || to)
        options.dateRange = {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        };
      console.log('------options---- ', options);
      const result = await this.oldPaginationService.paginate(qb, options);

      // transformer chaque item en DTO
      return {
        ...result,
        data: result.data.map((customer) =>
          plainToInstance(CustomerResponseDto, customer)
        ),
      };

    /*const customers = await this.customerRepository.find({
      relations: ['type_customer', 'location_city'],
    });
    return plainToInstance(CustomerResponseDto, customers);*/
  }

  async findOne(id: number): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ['type_customer', 'location_city'],
    });
    if (!customer) throw new NotFoundException();
    return plainToInstance(CustomerResponseDto, customer);
  }

  async findOneByCode(
    customer_code: string,
    strict = true,
  ): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { customer_code },
      relations: ['type_customer', 'location_city'],
    });
    if (!customer && strict)
      throw new NotFoundException(`client ${customer_code} non trouvé`);
    if (!strict) console.log(`client ${customer_code} non trouvé`);
    return plainToInstance(CustomerResponseDto, customer);
  }

  async findDocumentsOne(customer_code: string): Promise<any> {
    const customer = await this.customerRepository.findOne({
      where: { customer_code },
      relations: ['type_customer', 'location_city'],
    });
    if (!customer) throw new NotFoundException();
    return await this.documentCustomerService.findByCustomer(customer.id);
  }
  // async findByType(typeCode: string): Promise<any> {
  //   doc
  // }

  async update(
    id: number,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    const customer = (await this.findOne(id)) as any;

    if (dto.email && dto.email !== customer.email) {
      const emailExists = await this.customerRepository.findOneBy({
        email: dto.email,
      });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    Object.assign(customer, dto);
    if (dto.location_city_id) {
      customer.location_city = await this.locationcityService.findOneSimple(
        dto.location_city_id,
      );
    }
    return plainToInstance(
      CustomerResponseDto,
      this.customerRepository.save(customer),
    );
  }

  async remove(id: number): Promise<void> {
    const result = await this.customerRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException();
  }

  async isClientCodeUnique(code: string): Promise<boolean> {
    const existing = await this.customerRepository.findOne({
      where: { customer_code: code },
    });
    return !existing;
  }

  getRepository(): Repository<Customer> {
    return this.customerRepository;
  }

  async generateNextCustomerCode(): Promise<string> {
    // 1) Récupère la plus grande valeur numérique de `code`
    const raw = await this.customerRepository
      .createQueryBuilder('c')
      .select('MAX(CAST(c.customer_code AS UNSIGNED))', 'max')
      .getRawOne<{ max: string }>();

    // 2) Parse ou démarre à 0
    const maxValue = raw?.max ? parseInt(raw.max, 10) : 0;

    // 3) Calcule le prochain
    const next = maxValue + 1;

    // 4) Sécurité overflow
    if (next > 9_999_999) {
      throw new Error(
        'Plus de codes clients disponibles (limite 7 chiffres atteinte)',
      );
    }

    // 5) Retourne formatté sur 7 chiffres
    return next.toString().padStart(7, '0');
  }

  async findOneStats(id: number): Promise<any> {
    console.log('stats');

    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ['savings_accounts'],
    });
    if (!customer) throw new NotFoundException(`Compte ${id} introuvable`);

    const stats = {
    };



    return stats;
  }

  async sync(dto: KycSyncDto) {
    return await this.documentCustomerService.sync(dto);
  }

  // ...
  async emailExists(email: string): Promise<boolean> {
    if (!email) return false; // sécurité si email est vide
    
    const customer = await this.customerRepository.findOne({
      where: { email },
    });

    return !!customer; // true si trouvé, false sinon
  }
  async findCustomersWithMissingKyc() {
    return await this.customerRepository
      .createQueryBuilder('c')
      .leftJoin('c.type_customer', 'tc')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(DISTINCT tcd.document_type_id)', 'requiredCount')
          .from('type_customer_document_type', 'tcd')
          .where('tcd.type_customer_id = tc.id');
      }, 'requiredCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(DISTINCT dc.document_type_id)', 'sentCount')
          .from(DocumentCustomer, 'dc')
          .where('dc.customer_id = c.id')
          .andWhere('dc.status = :accepted', {
            accepted: DocumentCustomerStatus.ACCEPTED,
          });
      }, 'sentCount')
      .having('sentCount < requiredCount')
      .getMany();
  }
}

import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';
import { Repository } from 'typeorm';



import { forwardRef, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';






import { EmployeeResponseDto } from '../employee/dto/response-employee.dto';
import { EmployeeService } from '../employee/employee.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Branch } from './entities/branch.entity';
import { BranchResponseDto } from './dto/response-branch.dto';
import { plainToInstance } from 'class-transformer';









@Injectable()
export class BranchService  extends BaseServiceV1<Branch> {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private locationCityService: LocationCitiesService,
    private employeeService: EmployeeService,
    protected readonly paginationService: PaginationServiceV1,) {
    console.log(forwardRef);
        super(branchRepository, paginationService);
  }


    protected getDefaultSearchOptions(): SearchOptions {
      return {
        // Champs pour la recherche globale
        searchFields: [
          'id',
          'code',
          'name',
          'location_city.name',
          'status',
        ],
        
        // Champs pour recherche exacte
        exactMatchFields: [
          'id',
          'status',
          'confidentiality_level',
          'priority_level',
          'budget_estimate',
          'danger_level'
        ],
        
        // Champs pour ranges de dates
        /*dateRangeFields: [
          'created_at',
          'updated_at',
          'opening_date',
          'closing_date'
        ],*/
        
        // Champs de relations pour filtrage
        relationFields: ['employees', 'customers', 'location_city','location_city.district','location_city.district.division','location_city.district.division.region','location_city.district.division.region.country']
      };
    }


    async testSearch() {
  const result = await this.branchRepository.find({
    relations: ['location_city', 'location_city.district', 'location_city.district.division', 'employees']
  });
  console.log('First branch location_city:', result[0]?.location_city);
  console.log('First branch district:', result[0]?.location_city?.district);
  return result;
}


  // Branches
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    // Vérification de l'existence de la ville
    const city = await this.locationCityService.findOne(dto.location_city_id);

    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }
    const code: string = await this.generateNextBranchCode();
    /*let attempts = 0;
    do {
      code = GenCOde.randomDigits(3);
      attempts++;
    } while (!(await this.isBranchCodeUnique(code)) && attempts < 10);

    if (attempts >= 5) {
      throw new Error('Échec de génération d’un code de la branche');
    }*/
    dto.code = await this.generateNextBranchCode();
    // await validateDto(CreateBranchDto, dto);
    const branch = this.branchRepository.create({
      ...dto,
      code,
      location_city: city, // Assignation de l'entité complète
    });
    return await this.branchRepository.save(branch);
  }

  async findAllBranches(status = 1): Promise<Branch[]> {
    return this.branchRepository.find({
      relations: ['location_city', 'customers'],
      where: { status },
    });
  }

  async updateBranch(id: number, dto: UpdateBranchDto): Promise<Branch> {
    // 1. Vérifier l'existence de la branche
    const existingBranch = await this.branchRepository.findOneBy({ id });
    if (!existingBranch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }

    // 2. Si location_city_id est fourni dans le DTO
    /*if (dto.location_city_id) {
      const city = await this.locationCityService.findOne(dto.location_city_id);

      if (!city) {
        throw new NotFoundException(
          `City with ID ${dto.location_city_id} not found`,
        );
      }
      existingBranch.location_city = city;
      delete dto.location_city_id; // Pour éviter de l'envoyer deux fois
    }*/

    // 3. Fusionner les modifications
    this.branchRepository.merge(existingBranch, dto);

    // 4. Sauvegarder et retourner l'entité complète
    return await this.branchRepository.save(existingBranch);
  }

  async deleteBranch(id: number): Promise<void> {
    await this.branchRepository.delete(id);
  }
  async isBranchCodeUnique(code: string): Promise<boolean> {
    const existing = await this.branchRepository.findOne({ where: { code } });
    return !existing;
  }

  async findOne(id: number, all = false): Promise<BranchResponseDto> {
    const relations = all ? ['employees', 'employees.user', 'customers', 'location_city',
    'location_city.district',
        'location_city.district.division',
        'location_city.district.division.region',
        'location_city.district.division.region.country',] : [];
    const branch = await this.branchRepository.findOne({ 
      where: { id, status: 1 },
      relations,
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    return plainToInstance(BranchResponseDto,branch);
  }

  async findEmployeesByBranchId(id: number): Promise<EmployeeResponseDto[]> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
      relations: ['employees', 'employees'],
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    this.employeeService.findAllEmployees(branch.id);
    return await this.employeeService.findAllEmployees(branch.id);
  }

  async activate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 0 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch.status = 1;
    branch?.save();
    return branch;
  }
  async deactivate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch.status = 0;
    branch?.save();
    return branch;
  }




  /**
   * Génère le prochain code de branche incrémental sur 3 chiffres (000 à 999).
   */
  async generateNextBranchCode(): Promise<string> {
    // 1) Récupère la valeur max des 3 derniers caractères de `code`
    const raw = await this.branchRepository
      .createQueryBuilder('b')
      .select('MAX(CAST(RIGHT(b.code, 3) AS UNSIGNED))', 'max')
      .getRawOne<{ max: string }>();

    // 2) Convertit en number (ou 0 si table vide)
    const maxValue = raw?.max ? parseInt(raw.max, 10) : 0;

    // 3) Incrémente, et vérifie qu’on reste sous 1000
    const next = maxValue + 1;
    if (next > 999) {
      throw new Error(
        'Impossible de générer un nouveau code : seuil maximal (999) atteint',
      );
    }

    // 4) Formate sur 3 chiffres
    return next.toString().padStart(3, '0');
  }
}

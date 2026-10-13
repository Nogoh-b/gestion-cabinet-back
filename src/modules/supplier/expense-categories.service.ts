import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { ExpenseCategory } from './entities/expense-line.entity';
import { ExpenseCategoryEntity } from './entities/expense-category.entity';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

/** Catégories historiques (enum) garanties présentes dans chaque cabinet. */
export const LEGACY_EXPENSE_CATEGORIES: Array<{ code: string; label: string }> =
  [
    { code: ExpenseCategory.TRANSPORT, label: 'Transport' },
    { code: ExpenseCategory.ACCOMMODATION, label: 'Hébergement' },
    { code: ExpenseCategory.MEAL, label: 'Repas' },
    { code: ExpenseCategory.BAILIFF, label: 'Huissier' },
    { code: ExpenseCategory.COURT_FEES, label: 'Frais de justice' },
    { code: ExpenseCategory.OFFICE_SUPPLIES, label: 'Fournitures de bureau' },
    { code: ExpenseCategory.OTHER, label: 'Autre' },
  ];

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'categorie';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategoryEntity)
    private readonly repository: Repository<ExpenseCategoryEntity>,
  ) {}

  /** Liste active (seed des valeurs historiques + créations du cabinet). */
  async list(search?: string): Promise<ExpenseCategoryEntity[]> {
    const tenantId = getCurrentTenantId();
    await this.ensureLegacySeeded(tenantId);
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      is_active: true,
    };
    if (search?.trim()) where.label = Like(`%${search.trim()}%`);
    return this.repository.find({
      where: where as FindOptionsWhere<ExpenseCategoryEntity>,
      order: { label: 'ASC' },
    });
  }

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryEntity> {
    const tenantId = getCurrentTenantId();
    await this.ensureLegacySeeded(tenantId);
    const label = dto.label.trim();
    if (!label) throw new ConflictException('Le libellé est requis');
    const code = await this.uniqueCode(tenantId, slugify(label));
    const entity: ExpenseCategoryEntity = this.repository.create({
      code,
      label,
      is_active: dto.status ?? true,
    });
    return this.repository.save(entity);
  }

  async update(
    id: number,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryEntity> {
    const tenantId = getCurrentTenantId();
    const category: ExpenseCategoryEntity | null =
      await this.repository.findOne({
        where: {
          id,
          tenant_id: tenantId,
        } as FindOptionsWhere<ExpenseCategoryEntity>,
      });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) throw new ConflictException('Le libellé est requis');
      category.label = label;
    }
    if (dto.status !== undefined) category.is_active = dto.status;
    return this.repository.save(category);
  }

  async remove(id: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const category: ExpenseCategoryEntity | null =
      await this.repository.findOne({
        where: {
          id,
          tenant_id: tenantId,
        } as FindOptionsWhere<ExpenseCategoryEntity>,
      });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    // Suppression logique pour conserver l'historique des lignes existantes.
    category.is_active = false;
    await this.repository.save(category);
  }

  private async ensureLegacySeeded(tenantId: number): Promise<void> {
    for (const legacy of LEGACY_EXPENSE_CATEGORIES) {
      const exists: ExpenseCategoryEntity | null =
        await this.repository.findOne({
          where: {
            tenant_id: tenantId,
            code: legacy.code,
          } as FindOptionsWhere<ExpenseCategoryEntity>,
        });
      if (!exists) {
        await this.repository.save(
          this.repository.create({
            code: legacy.code,
            label: legacy.label,
            is_active: true,
          }),
        );
      }
    }
  }

  private async uniqueCode(tenantId: number, base: string): Promise<string> {
    let code = base;
    let attempt = 0;
    while (
      (await this.repository.findOne({
        where: {
          tenant_id: tenantId,
          code,
        } as FindOptionsWhere<ExpenseCategoryEntity>,
      })) !== null
    ) {
      attempt += 1;
      code = `${base}_${attempt}`;
    }
    return code;
  }
}

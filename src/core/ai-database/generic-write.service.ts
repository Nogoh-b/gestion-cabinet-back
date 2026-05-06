import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Employee } from "src/modules/agencies/employee/entities/employee.entity";
import { Customer } from "src/modules/customer/customer/entities/customer.entity";
import { Dossier } from "src/modules/dossiers/entities/dossier.entity";
import { DataSource, Repository } from "typeorm";
import { WriteIntent } from "./interface/write-intent.interface";

// generic-write.service.ts
@Injectable()
export class GenericWriteService {
  private readonly logger = new Logger(GenericWriteService.name);

  // Mapping entity name → repository token
  // À adapter selon vos entités réelles
  private readonly ENTITY_MAP: Record<string, any> = {
    dossier: Dossier,
    customer: Customer,
    employee: Employee,
    // Ajoutez vos entités ici
  };

  // Champs protégés : le LLM ne peut JAMAIS les modifier
  private readonly PROTECTED_FIELDS = new Set([
    'id', 'created_at', 'deleted_at', 'deleted_by',
    'password', 'token', 'secret',
  ]);

  // Champs autorisés par entité (whitelist stricte)
  private readonly ALLOWED_FIELDS: Record<string, Set<string>> = {
    dossier: new Set([
      'object', 'status', 'danger_level', 'priority_level',
      'description', 'court_name', 'opposing_party_name',
      'success_probability', 'budget_estimate', 'closing_date',
      'analysis_notes', 'outcome', 'outcome_notes',
      'client_satisfaction', 'final_decision',
    ]),
    customer: new Set([
      'first_name', 'last_name', 'email', 'phone',
      'address', 'company_name', 'status',
    ]),
    // Ajoutez selon vos besoins
  };

  constructor(private readonly dataSource: DataSource) {}

  async execute(intent: WriteIntent, userId: string): Promise<WriteResult> {
    const entityClass = this.ENTITY_MAP[intent.entity.toLowerCase()];
    
    if (!entityClass) {
      throw new BadRequestException(
        `Entité "${intent.entity}" non reconnue ou non autorisée pour l'écriture`
      );
    }

    // Filtrer les champs autorisés
    const safeFields = this.sanitizeFields(intent.entity, intent.fields);
    
    if (Object.keys(safeFields).length === 0) {
      throw new BadRequestException('Aucun champ valide à modifier');
    }

    const repository = this.dataSource.getRepository(entityClass);

    switch (intent.operation) {
      case 'INSERT':
        return this.performInsert(repository, safeFields, userId);
      
      case 'UPDATE':
        if (!intent.entityId) {
          throw new BadRequestException('ID requis pour une mise à jour');
        }
        return this.performUpdate(repository, intent.entityId, safeFields, userId);
      
      case 'DELETE':
        throw new BadRequestException(
          'La suppression via IA n\'est pas autorisée. Utilisez l\'interface dédiée.'
        );
      
      default:
        throw new BadRequestException(`Opération "${intent.operation}" non supportée`);
    }
  }

  private sanitizeFields(
    entity: string,
    fields: Record<string, any>
  ): Record<string, any> {
    const allowed = this.ALLOWED_FIELDS[entity.toLowerCase()];
    const safe: Record<string, any> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (this.PROTECTED_FIELDS.has(key)) {
        this.logger.warn(`Champ protégé ignoré: ${key}`);
        continue;
      }
      if (allowed && !allowed.has(key)) {
        this.logger.warn(`Champ non autorisé pour ${entity}: ${key}`);
        continue;
      }
      safe[key] = value;
    }

    return safe;
  }

  private async performInsert(
    repository: Repository<any>,
    fields: Record<string, any>,
    userId: string
  ): Promise<WriteResult> {
    const entity = repository.create({
      ...fields,
      created_by: userId,
    });

    const saved = await repository.save(entity);
    
    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Enregistrement créé avec succès (ID: ${saved.id})`,
    };
  }

  private async performUpdate(
    repository: Repository<any>,
    entityId: string | number,
    fields: Record<string, any>,
    userId: string
  ): Promise<WriteResult> {
    const existing = await repository.findOne({ where: { id: entityId as any } });
    
    if (!existing) {
      throw new NotFoundException(`Enregistrement ID ${entityId} non trouvé`);
    }

    Object.assign(existing, fields, { updated_by: userId });
    const saved = await repository.save(existing);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Enregistrement ${entityId} mis à jour avec succès`,
    };
  }
}

export interface WriteResult {
  success: boolean;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  entityId?: string | number;
  affected: number;
  data?: any;
  message: string;
}
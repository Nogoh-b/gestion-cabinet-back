// src/modules/agencies/employee/employee-write.handler.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee, EmployeePosition, EmployeeStatus } from './entities/employee.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Handler custom pour les collaborateurs (Employee).
 *
 * ⚠️ Particularité : Employee.id = User.id (OneToOne via JoinColumn).
 * Un Employee ne peut PAS exister sans un User préalable.
 *
 * Politique de sécurité :
 *   - INSERT REFUSÉ via IA : la création d'un Employee nécessiterait de créer
 *     un User (mot de passe, rôles, etc.) — trop sensible pour passer par l'IA.
 *     Le LLM reçoit un message explicite.
 *   - UPDATE autorisé sur les champs métier (specialization, hourly_rate,
 *     is_available, max_dossiers, status, etc.)
 */
@Injectable()
export class EmployeeWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {
    super('employee', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    // Annoter clairement que INSERT n'est pas possible
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      position: { description: 'avocat, secretaire, assistant, stagiaire, huissier, administratif' },
      specialization: { description: 'Spécialisation juridique', example: 'Droit des affaires' },
      bar_association_number: { description: "Numéro d'inscription au barreau" },
      bar_association_city: { description: "Ville d'inscription au barreau", example: 'Paris' },
      hourly_rate: { description: 'Tarif horaire (€)', example: '150.00' },
      is_available: { description: '1=disponible pour nouveaux dossiers, 0=indisponible' },
      max_dossiers: { description: 'Capacité max de dossiers simultanés' },
      status: { description: '1=Actif, 0=Inactif, -1=Suspendu, 2=Vacation' },
      branch_id: { description: 'ID agence. Peut fournir "branch".' },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    return fields;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    if (operation === 'INSERT') {
      // 🚫 INSERT interdit via IA
      errors.push(
        'La création d\'un collaborateur n\'est pas possible via l\'IA. ' +
        'Un Employee dépend d\'un User existant (authentification, rôles, mot de passe). ' +
        'Veuillez créer le collaborateur via l\'interface RH dédiée.',
      );
    }
    if (operation === 'UPDATE') {
      if (fields.hourly_rate !== undefined && Number(fields.hourly_rate) < 0) {
        errors.push('Le taux horaire ne peut pas être négatif');
      }
      if (fields.max_dossiers !== undefined && Number(fields.max_dossiers) < 0) {
        errors.push('La capacité maximale ne peut pas être négative');
      }
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  protected async doInsert(fields: Record<string, any>, userId: string): Promise<WriteResult> {
    // Sécurité : on bloque même si quelqu'un by-pass validateFields
    throw new BadRequestException(
      'Création de collaborateur refusée : utilisez l\'interface RH pour créer un User puis un Employee.',
    );
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const employee = await this.employeeRepo.findOne({
      where: { id: entityId as any },
      relations: ['user'],
    });
    if (!employee) throw new NotFoundException(`Collaborateur ${entityId} introuvable`);

    // Champs autorisés pour la mise à jour métier
    const ALLOWED_UPDATE_FIELDS = new Set([
      'position', 'specialization', 'bar_association_number', 'bar_association_city',
      'years_of_experience', 'hourly_rate', 'is_available', 'max_dossiers',
      'bio', 'languages', 'expertise_areas', 'birth_date',
      'professional_address', 'professional_phone',
      'status', 'branch_id', 'hireDate', 'hire_date',
    ]);

    const safeFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (ALLOWED_UPDATE_FIELDS.has(k)) {
        safeFields[k] = v;
      } else {
        this.logger.debug(`🔒 Champ ignoré (non modifiable via IA): ${k}`);
      }
    }

    Object.assign(employee, safeFields);
    const saved = await this.employeeRepo.save(employee);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Collaborateur ${entityId} mis à jour`,
    };
  }
}

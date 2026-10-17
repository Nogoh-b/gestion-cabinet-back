// src/modules/agencies/employee/employee-write.handler.ts
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { DataSource, Repository } from 'typeorm';
import {
  Injectable,
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { EmployeeService } from './employee.service';
import { Employee } from './entities/employee.entity';

/**
 * Champs du formulaire de création (`CreateUserDto`) que l'IA peut renseigner.
 * Volontairement absents : `role` (profil d'accès déduit de la fonction, jamais
 * admin), `password` (mot de passe temporaire généré par le service),
 * `tenant_id`, `status`, `username`, `employee_number`.
 */
const INSERT_DTO_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'position',
  'branch_id',
  'specialization',
  'bar_association_number',
  'bar_association_city',
  'years_of_experience',
  'hourly_rate',
  'salary',
  'is_available',
  'max_dossiers',
  'bio',
  'languages',
  'expertise_areas',
  'birth_date',
  'birth_place',
  'home_address',
  'personal_phone',
  'marital_status',
  'children_count',
  'professional_address',
  'professional_phone',
  'siret_number',
  'tva_number',
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isFilled = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  !(typeof value === 'string' && !value.trim());

/**
 * Handler custom pour les collaborateurs (Employee).
 *
 * ⚠️ Particularité : Employee.id = User.id (OneToOne via JoinColumn).
 * Un Employee ne peut PAS exister sans un User préalable.
 *
 * Politique :
 *   - INSERT délégué à `EmployeeService.createEmployee`, comme le formulaire
 *     RH : un nom suffit (création minimale), le service crée le User, le
 *     profil d'accès par défaut (déduit de la fonction), le mot de passe
 *     temporaire et l'agence par défaut. Les identifiants (si un email est
 *     fourni) partent après validation du plan entier (`afterCommit`). Le LLM
 *     ne choisit jamais mot de passe, rôle ni tenant. Si le plan échoue
 *     ensuite, `rollbackInsert` désactive aussi le User et rien n'est envoyé.
 *   - UPDATE autorisé sur les champs métier du formulaire (specialization,
 *     hourly_rate, is_available, max_dossiers, status, etc.)
 */
@Injectable()
export class EmployeeWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly employeeService: EmployeeService,
  ) {
    super('employee', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      position: {
        required: false,
        description:
          'avocat, collaborateur, juriste, comptable, secretaire, assistant, stagiaire, huissier, administratif. Défaut : collaborateur.',
      },
      hire_date: {
        required: false,
        description: "Date d'embauche. Défaut : aujourd'hui.",
      },
      specialization: {
        description: 'Spécialisation juridique',
        example: 'Droit des affaires',
      },
      bar_association_number: {
        description: "Numéro d'inscription au barreau",
      },
      bar_association_city: {
        description: "Ville d'inscription au barreau",
        example: 'Paris',
      },
      hourly_rate: { description: 'Tarif horaire (€)', example: '150.00' },
      is_available: {
        description: '1=disponible pour nouveaux dossiers, 0=indisponible',
      },
      max_dossiers: { description: 'Capacité max de dossiers simultanés' },
      status: {
        description:
          'BD: 1=ACTIVE/Actif, 0=INACTIVE/Inactif, -1=SUSPENDED/Suspendu, 2=VACATION. Toujours Actif à la création.',
      },
      branch_id: {
        description:
          'ID agence. Peut fournir "branch". Défaut : première agence active.',
      },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }

    // Champs portés par le compte utilisateur (table user), acceptés à la
    // création comme dans le formulaire RH.
    const userFields: WriteableFieldSchema[] = [
      {
        name: 'full_name',
        label: 'Nom complet',
        type: 'string',
        required: true,
        description:
          'Prénom et nom du collaborateur (création : seul champ obligatoire)',
        example: 'Jean Dupont',
      },
      {
        name: 'email',
        label: 'Email',
        type: 'string',
        required: false,
        description:
          'Email de connexion ; les identifiants lui sont envoyés. Facultatif.',
        example: 'jean.dupont@cabinet.com',
      },
      {
        name: 'phone_number',
        label: 'Téléphone',
        type: 'string',
        required: false,
        description: 'Téléphone du collaborateur',
        example: '+237 690 00 00 00',
      },
    ];
    for (const extra of userFields) {
      if (!fields.some((f) => f.name === extra.name)) fields.push(extra);
    }
    return fields;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    let transformedFields = fields;
    if (operation === 'INSERT') {
      transformedFields = { ...fields };
      // Alias de nom souvent produit par le LLM
      if (!isFilled(transformedFields.full_name) && isFilled(fields.name)) {
        transformedFields.full_name = fields.name;
      }
      delete transformedFields.name;
      // Même exigence que EmployeeService.createEmployee : un nom, rien d'autre.
      if (
        !isFilled(transformedFields.full_name) &&
        !isFilled(transformedFields.first_name) &&
        !isFilled(transformedFields.last_name)
      ) {
        errors.push('Le nom du collaborateur est obligatoire (nom et prénom).');
      }
    }
    if (fields.hourly_rate !== undefined && Number(fields.hourly_rate) < 0) {
      errors.push('Le taux horaire ne peut pas être négatif');
    }
    if (fields.max_dossiers !== undefined && Number(fields.max_dossiers) < 0) {
      errors.push('La capacité maximale ne peut pas être négative');
    }
    return { valid: errors.length === 0, errors, transformedFields };
  }

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const { dto, notes } = this.buildCreateDto(fields);

    // Idempotence (comme le handler générique sur une clé forte) : un même
    // prompt rejoué ne crée pas un second compte pour le même email.
    if (dto.email) {
      const existing = await this.employeeRepo.findOne({
        where: { user: { email: dto.email } },
        relations: ['user'],
      });
      if (existing) {
        this.logger.warn(
          `♻️  Doublon évité pour employee: email ${dto.email} déjà utilisé (ID: ${existing.id})`,
        );
        return {
          success: true,
          operation: 'INSERT',
          entityId: existing.id,
          affected: 0,
          data: this.summarize(existing),
          message: `Le collaborateur ${existing.user?.full_name || dto.email} existe déjà — aucun doublon n'a été créé`,
        };
      }
    }

    // Les identifiants ne partent qu'une fois le plan entier validé
    // (`afterCommit`) : si une opération suivante échoue, `rollbackInsert`
    // désactive le compte et aucun mail ne doit pointer vers lui.
    let created: any;
    let sendCredentials: () => Promise<void>;
    try {
      ({ employee: created, sendCredentials } =
        await this.employeeService.createEmployeeDeferringCredentials(dto));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(this.translateDbError(error));
    }

    const data = this.summarize(created, dto);
    const access = data.email
      ? `identifiants envoyés à ${data.email}`
      : `identifiant de connexion ${data.username} ; email à compléter sur la fiche pour lui envoyer ses accès`;
    const message = [
      `Collaborateur ${data.full_name} créé avec succès (${access})`,
      ...notes,
    ].join(' ; ');

    return {
      success: true,
      operation: 'INSERT',
      entityId: created.id,
      affected: 1,
      data,
      message,
      afterCommit: sendCredentials,
    };
  }

  /**
   * Annule un collaborateur créé par ce plan quand une opération suivante
   * échoue. `createEmployee` a aussi créé le compte User (même id) et son
   * profil d'accès : comme la désactivation manuelle (`descativeUser`), ils
   * passent à status 0, et ils sont soft-deletés avec la fiche. Aucun compte
   * ne reste actif avec un mot de passe temporaire inconnu, et une reprise
   * du plan recrée le collaborateur sans buter sur l'ancien compte (la
   * recherche par email du login ignore les lignes soft-deletées).
   */
  async rollbackInsert(entityId: string | number): Promise<void> {
    const id = Number(entityId);
    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Employee, id);
      await manager.update(UserRoleAssignment, { user_id: id }, { status: 0 });
      await manager.softDelete(UserRoleAssignment, { user_id: id });
      await manager.update(User, id, { status: 0 });
      await manager.softDelete(User, id);
    });
    this.logger.log(
      `🧹 Nettoyage: collaborateur ${id}, son compte et ses profils d'accès désactivés`,
    );
  }

  /**
   * Traduit les champs du plan IA en `CreateUserDto`, en ne gardant que les
   * champs du formulaire RH (liste blanche) et en assouplissant les formats.
   */
  private buildCreateDto(fields: Record<string, any>): {
    dto: CreateUserDto;
    notes: string[];
  } {
    const dto: Record<string, any> = {};
    const notes: string[] = [];
    for (const key of INSERT_DTO_FIELDS) {
      const value = fields[key];
      if (!isFilled(value)) continue;
      dto[key] = typeof value === 'string' ? value.trim() : value;
    }

    const hireDate = fields.hireDate ?? fields.hire_date;
    if (isFilled(hireDate)) dto.hire_date = this.toDateString(hireDate);
    if (dto.birth_date) dto.birth_date = this.toDateString(dto.birth_date);
    for (const key of ['languages', 'expertise_areas']) {
      if (typeof dto[key] === 'string') {
        dto[key] = dto[key]
          .split(/[,;]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }

    // Un email illisible ne bloque pas la création (le formulaire le
    // laisserait vide) : on l'écarte et on le signale.
    if (dto.email && !EMAIL_PATTERN.test(String(dto.email))) {
      notes.push(`email ignoré : « ${dto.email} » n'est pas une adresse valide`);
      delete dto.email;
    }

    const ignored = ['role', 'password', 'username', 'tenant_id'].filter(
      (key) => fields[key] !== undefined,
    );
    if (ignored.length > 0) {
      this.logger.warn(
        `🔒 Champs ignorés (non modifiables via IA): ${ignored.join(', ')}`,
      );
    }

    return { dto: dto as CreateUserDto, notes };
  }

  private toDateString(value: unknown): string {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);
  }

  /** Résumé non sensible du collaborateur (jamais le compte User complet). */
  private summarize(employee: any, dto?: CreateUserDto) {
    const user = employee?.user ?? {};
    return {
      id: employee?.id,
      full_name:
        user.full_name ||
        employee?.full_name ||
        dto?.full_name ||
        [dto?.first_name, dto?.last_name].filter(Boolean).join(' '),
      email: user.email ?? employee?.email ?? null,
      username: user.username ?? employee?.username ?? null,
      position: employee?.position,
      branch_id: employee?.branch?.id ?? employee?.branch_id ?? null,
      hireDate: employee?.hireDate,
      status: employee?.status,
      employee_number: employee?.employee_number,
    };
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
    if (!employee)
      throw new NotFoundException(`Collaborateur ${entityId} introuvable`);

    // Champs autorisés pour la mise à jour métier (ceux du formulaire RH)
    const ALLOWED_UPDATE_FIELDS = new Set([
      'position',
      'specialization',
      'bar_association_number',
      'bar_association_city',
      'years_of_experience',
      'hourly_rate',
      'salary',
      'is_available',
      'max_dossiers',
      'bio',
      'languages',
      'expertise_areas',
      'birth_date',
      'birth_place',
      'home_address',
      'personal_phone',
      'marital_status',
      'children_count',
      'professional_address',
      'professional_phone',
      'siret_number',
      'tva_number',
      'status',
      'branch_id',
      'hireDate',
      'hire_date',
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
      // Pas l'entité brute : sa relation `user` porte le hash du mot de passe.
      data: { ...this.summarize(saved), ...safeFields },
      message: `Collaborateur ${entityId} mis à jour`,
    };
  }
}

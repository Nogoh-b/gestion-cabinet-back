// src/modules/customer/customer/customer-write.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Customer,
  CustomerStatus,
  CustomerCreatedFrom,
} from './entities/customer.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { TypeCustomer } from '../type-customer/entities/type_customer.entity';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Handler custom pour les clients.
 * Logique métier :
 *   - un nom suffit (full_name, prénom, nom ou raison sociale), comme la
 *     création manuelle ; agence/type/ville par défaut si absents
 *   - customer_code généré par @BeforeInsert (déjà stripped via AUTO_GENERATED_FIELDS)
 *   - Dédup par email > téléphone > (first_name + last_name) > company_name (via BaseWriteHandler)
 *   - status par défaut : ACTIVE
 *   - created_from par défaut : AGENCY
 */
@Injectable()
export class CustomerWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {
    super('customer', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      first_name: {
        description: 'Prénom (facultatif)',
        example: 'Jean',
        required: false,
      },
      last_name: {
        description: 'Nom (un nom, un prénom ou une raison sociale suffit)',
        example: 'Dupont',
        required: false,
      },
      full_name: {
        description:
          'Nom complet en un seul champ (alternative à prénom + nom)',
        required: false,
      },
      company_name: {
        description: 'Raison sociale (clients professionnels)',
        example: 'SARL Dupont',
      },
      email: {
        description: 'Email du client (sert à la déduplication)',
        example: 'jean.dupont@mail.fr',
      },
      number_phone_1: {
        description: 'Téléphone principal',
        example: '+33 6 12 34 56 78',
      },
      type_customer_id: {
        description:
          'ID du type. Peut fournir "type_customer" avec le code (PART/PRO/ENT/ASSO).',
      },
      branch_id: { description: 'ID de l\'agence. Peut fournir "branch".' },
      location_city_id: {
        description:
          'ID de la ville. Peut fournir "location_city" avec le nom.',
      },
      status: {
        description:
          'BD: 1=ACTIVE/Actif, 0=INACTIVE/Inactif, -1=DELETED/Supprimé, -2=BLOCKED, -3=SUSPENDED, -4=LOCKED.',
        example: '1',
      },
      created_from: {
        description: 'BD: 0=AGENCY/Agence, 1=ONLINE/En ligne.',
        example: '0',
      },
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
    const transformed = { ...fields };
    const text = (v: any) => (typeof v === 'string' ? v.trim() : '');
    if (operation === 'INSERT') {
      // Comme CustomerService.create : un nom suffit (full_name, prénom OU
      // nom). Un client professionnel peut n'avoir que sa raison sociale.
      const first = text(fields.first_name);
      const last = text(fields.last_name);
      const full = text(fields.full_name);
      const company = text(fields.company_name);
      if (!full && !(first && last)) {
        if (first || last) {
          // Un seul des deux : Customer.syncNameFields() le range en « nom ».
          transformed.full_name = first || last;
          delete transformed.first_name;
          delete transformed.last_name;
        } else if (company) {
          transformed.full_name = company.slice(0, 45).trim();
        } else {
          errors.push(
            'Le nom du client est obligatoire (nom, prénom ou raison sociale).',
          );
        }
      }
    }
    // Email : vide = non renseigné (comme le formulaire) ; sinon format vérifié.
    if (fields.email !== undefined && fields.email !== null) {
      const email = String(fields.email).replace(/\s+/g, '');
      if (!email) delete transformed.email;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.push(`Format d'email invalide : « ${fields.email} »`);
      else transformed.email = email;
    }
    return {
      valid: errors.length === 0,
      errors,
      transformedFields: transformed,
    };
  }

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    // Le strip AUTO_GENERATED_FIELDS + findDuplicateBy se font dans super.doInsert
    // donc on délègue après avoir injecté les défauts métier.
    const enriched: Record<string, any> = {
      ...fields,
      status:
        fields.status !== undefined
          ? Number(fields.status)
          : CustomerStatus.ACTIVE,
      created_from:
        fields.created_from !== undefined
          ? Number(fields.created_from)
          : CustomerCreatedFrom.AGENCY,
    };
    // Agence, type et ville facultatifs : mêmes valeurs par défaut que la
    // création manuelle minimale (« + Créer » avec seulement le nom).
    // branch_id est une vraie colonne ; type et ville ne sont que des relations.
    if (!enriched.branch && !enriched.branch_id) {
      const branch = await this.firstRow(Branch, { status: 1 });
      if (branch) enriched.branch_id = branch.id;
    }
    if (!enriched.type_customer && !enriched.type_customer_id) {
      const type = await this.firstRow(TypeCustomer, { status: 1 });
      if (type) enriched.type_customer = { id: type.id };
    }
    if (!enriched.location_city && !enriched.location_city_id) {
      const city = await this.firstRow(LocationCity, {});
      if (city) enriched.location_city = { id: city.id };
    }
    // Appel direct au flow standard avec les enrichissements
    return super.doInsert(enriched, userId);
  }

  private async firstRow(
    entity: any,
    where: Record<string, any>,
  ): Promise<{ id: number } | null> {
    try {
      return (await this.dataSource
        .getRepository(entity)
        .findOne({ where, order: { id: 'ASC' } as any })) as {
        id: number;
      } | null;
    } catch {
      return null;
    }
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const customer = await this.customerRepo.findOne({
      where: { id: entityId as any },
    });
    if (!customer)
      throw new NotFoundException(`Client ${entityId} introuvable`);

    const safeFields = this.stripAutoGeneratedFields(
      this.filterKnownColumns(fields),
    );
    // Ne jamais écraser le customer_code
    delete safeFields['customer_code'];

    Object.assign(customer, safeFields);
    const saved = await this.customerRepo.save(customer);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Client ${customer.customer_code} mis à jour`,
    };
  }
}

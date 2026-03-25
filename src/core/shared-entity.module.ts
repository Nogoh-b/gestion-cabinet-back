// shared/shared-entity.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entités IAM
import { User } from '../modules/iam/user/entities/user.entity';
import { Permission } from '../modules/iam/permission/entities/permission.entity';
import { RolePermission } from '../modules/iam/role-permission/entities/role-permission.entity';
import { UserRole } from '../modules/iam/user-role/entities/user-role.entity';

// Entités métier
import { Branch } from '../modules/agencies/branch/entities/branch.entity';
import { Employee } from '../modules/agencies/employee/entities/employee.entity';
import { Customer } from '../modules/customer/customer/entities/customer.entity';
import { TypeCustomer } from '../modules/customer/type-customer/entities/type_customer.entity';
import { DocumentCustomer } from '../modules/documents/document-customer/entities/document-customer.entity';
import { DocumentType } from '../modules/documents/document-type/entities/document-type.entity';
import { Dossier } from '../modules/dossiers/entities/dossier.entity';
import { Audience } from '../modules/audiences/entities/audience.entity';
import { Diligence } from '../modules/diligence/entities/diligence.entity';
import { Facture } from '../modules/facture/entities/facture.entity';
import { Paiement } from '../modules/paiement/entities/paiement.entity';
import { Step } from 'src/modules/dossiers/entities/step.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // IAM
      User,
      Permission,
      RolePermission,
      UserRole,
      // Agences
      Branch,
      Employee,
      // Customer
      Customer,
      TypeCustomer,
      // Documents
      DocumentCustomer,
      DocumentType,
      // Dossiers
      Dossier,
      Step,
      Audience,
      Diligence,
      Facture,
      Paiement,
    ]),
  ],
  exports: [
    TypeOrmModule, // Exporter pour que les repositories soient disponibles partout
  ],
})
export class SharedEntityModule {}
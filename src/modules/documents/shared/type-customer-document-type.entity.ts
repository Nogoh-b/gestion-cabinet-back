import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import { Entity, PrimaryColumn, ManyToOne } from 'typeorm';
import { DocumentType } from '../document-type/entities/document-type.entity';

@Entity('type_customer_document_type')
export class TypeCustomerDocumentType {
  @PrimaryColumn({ name: 'type_customer_id' })
  typeCustomerId: number;

  @PrimaryColumn({ name: 'document_type_id' })
  document_type_id: number;

  @ManyToOne(() => TypeCustomer, typeCustomer => typeCustomer.requiredDocuments)
  typeCustomer: TypeCustomer;

  @ManyToOne(() => DocumentType, document_type => document_type.customerTypes)
  document_type: DocumentType;
}
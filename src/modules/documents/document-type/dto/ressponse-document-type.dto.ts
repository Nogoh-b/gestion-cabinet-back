// src/core/document/dto/document-type-response.dto.ts
import { Expose, Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

import { DocumentTypeStatus, DocumentTypeCode } from "../entities/document-type.entity";


export class DocumentTypeResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({
    enum: DocumentTypeCode,
    example: DocumentTypeCode.CNI_AVANT,
  })
  @Expose()
  code: string;

  @ApiProperty({ example: "Carte Nationale d'Identité (Recto)" })
  @Expose()
  name: string;

  @ApiProperty({
    example: "Scan recto de la CNI en cours de validité",
    required: false,
  })
  @Expose()
  description?: string;

  @ApiProperty({
    example: 365,
    description: "Durée de validité en jours",
    required: false,
  })
  @Expose({ name: "validity_duration" })
  validityDuration?: number;

  @ApiProperty({ example: "image/jpeg", required: false })
  @Expose()
  mimetype?: string;

  @ApiProperty({
    example: "3145728",
    description: "Taille maximale en octets",
    required: false,
  })
  @Expose()
  max_size?: string;

  @ApiProperty({ example: true })
  @Expose({ name: "is_required" })
  isRequired: boolean;

  @ApiProperty({
    enum: DocumentTypeStatus,
    example: DocumentTypeStatus.ACCEPTED,
  })
  @Expose()
  status: number;

  // Relations : Type de client
  @ApiProperty({
    type: [Object],
    example: [
      { id: 1, name: "Particulier", code: "PART" },
    ],
  })
  @Expose()
  @Transform(({ obj }) =>
    obj.customerTypes?.map((type: any) => ({
      id: type.id,
      name: type.name,
      code: type.code,
    })) || []
  )
  customer_types?: Array<{ id: number; name: string; code: string }>;

  // Relations : Type de crédit
  @ApiProperty({
    type: [Object],
    example: [
      { id: 1, name: "Crédit Personnel", code: "CPERS" },
    ],
  })
  @Expose()
  @Transform(({ obj }) =>
    obj.typeCredits?.map((type: any) => ({
      id: type.id,
      name: type.name,
      code: type.code,
    })) || []
  )
  type_credits?: Array<{ id: number; name: string; code: string }>;

  // Nombre de documents
  @ApiProperty({ example: 25, description: "Nombre de documents de ce type" })
  @Expose()
  @Transform(({ obj }) => obj.documents?.length || 0)
  document_count: number;

  // Taille max formatée
  @ApiProperty({ example: "3 MB" })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.max_size) return "Non limité";
    const size = parseInt(obj.max_size);
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} octets`;
  })
  max_size_formatted: string;

  // Durée de validité formatée
  @ApiProperty({ example: "1 an", required: false })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.validityDuration) return "Illimité";
    const d = obj.validityDuration;
    if (d >= 365) return d / 365 === 1 ? "1 an" : `${d / 365} ans`;
    if (d >= 30) return d / 30 === 1 ? "1 mois" : `${d / 30} mois`;
    return `${d} jours`;
  })
  validity_duration_formatted: string;

  // Statut et libellé
  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => obj.status === DocumentTypeStatus.ACCEPTED)
  is_active: boolean;

  @ApiProperty({ example: "🟢 Actif" })
  @Expose()
  @Transform(({ obj }) => {
    const labels = {
      [DocumentTypeStatus.PENDING]: "🟡 En attente",
      [DocumentTypeStatus.ACCEPTED]: "🟢 Actif",
      [DocumentTypeStatus.REFUSED]: "🔴 Refusé",
    };
    return labels[obj.status] || "Inconnu";
  })
  status_label: string;

  // Catégorie de fichier
  @ApiProperty({ example: "image" })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.mimetype?.startsWith("image/")) return "image";
    if (obj.mimetype?.startsWith("application/pdf")) return "pdf";
    if (obj.mimetype?.startsWith("application/")) return "document";
    return "fichier";
  })
  file_category: string;
}

export class DocumentTypeListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "CNI AVANT" })
  @Expose()
  code: string;

  @ApiProperty({ example: "Carte Nationale d'Identité (Recto)" })
  @Expose()
  name: string;

  @ApiProperty({ example: true })
  @Expose({ name: "is_required" })
  isRequired: boolean;

  @ApiProperty({ example: 1 })
  @Expose()
  status: number;

  @ApiProperty({ example: 25 })
  @Expose()
  @Transform(({ obj }) => obj.documents?.length || 0)
  document_count: number;

  @ApiProperty({ example: 3 })
  @Expose()
  @Transform(({ obj }) => obj.customerTypes?.length || 0)
  customer_type_count: number;

  @ApiProperty({ example: 2 })
  @Expose()
  @Transform(({ obj }) => obj.typeCredits?.length || 0)
  type_credit_count: number;

  @ApiProperty({ example: "🟢 Actif" })
  @Expose()
  @Transform(({ obj }) => {
    const labels = {
      [DocumentTypeStatus.PENDING]: "🟡 En attente",
      [DocumentTypeStatus.ACCEPTED]: "🟢 Actif",
      [DocumentTypeStatus.REFUSED]: "🔴 Refusé",
    };
    return labels[obj.status] || "Inconnu";
  })
  status_label: string;

  @ApiProperty({ example: "2024-01-15T08:00:00Z" })
  @Expose()
  @Transform(({ obj }) => obj.created_at)
  created_at: Date;
}

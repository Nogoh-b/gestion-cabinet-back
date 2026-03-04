// src/modules/audiences/dto/audience-response.dto.ts
import { Expose, Transform } from "class-transformer";




import { Jurisdiction } from "src/modules/jurisdiction/entities/jurisdiction.entity";




import { ApiProperty } from "@nestjs/swagger";

import { AudienceStatus, AudienceType1 } from "../entities/audience.entity";










export class AudienceResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "2024-12-15" })
  @Expose()
  audience_date: Date;

  @ApiProperty({ example: "14:30" })
  @Expose()
  audience_time: string;

  @ApiProperty({ example: "Tribunal de Grande Instance de Paris" })
  @Expose()
  jurisdiction: Jurisdiction;

  @ApiProperty({ example: "Salle 4B", required: false })
  @Expose()
  room?: string;

  @ApiProperty({ 
    example: AudienceType1 
  })
  @Expose()
  type: AudienceType1;

  @ApiProperty({ 
    enum: AudienceStatus,
    example: AudienceStatus.SCHEDULED 
  })
  @Expose()
  status: AudienceStatus;

  @ApiProperty({ example: "Notes importantes sur l'audience", required: false })
  @Expose()
  notes?: string;

  @ApiProperty({ example: "Décision rendue...", required: false })
  @Expose()
  decision?: string;

  @ApiProperty({ example: "2024-12-20", required: false })
  @Expose()
  postponed_to?: Date;

  @ApiProperty({ example: false })
  @Expose()
  reminder_sent: boolean;

  @ApiProperty({ example: 120, required: false })
  @Expose()
  duration_minutes?: number;

  @ApiProperty({ example: "Juge Dupont", required: false })
  @Expose()
  judge_name?: string;

  @ApiProperty({ example: "favorable", required: false })
  @Expose()
  outcome?: string;

  // Relations
  @ApiProperty({ example: 1 })
  @Expose()
  dossier_id: number;

  @ApiProperty({ 
    example: {
      id: 1,
      reference: "DOS-2024-001",
      objet: "Affaire commerciale"
    }
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.dossier?.id,
    dossier_number: obj.dossier?.dossier_number,
    object: obj.dossier?.object,
    full_name: obj.dossier?.full_name
  }))
  dossier?: {
    id: number;
    dossier_number?: string;
    object?: string;
    full_name?: string;
  };

  @ApiProperty({ 
    type: [Object],
    example: [
      {
        id: 1,
        name: "Convocation",
        document_type: "CONVOCATION"
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.documents) return undefined;
    return obj.documents.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      document_type: doc.document_type,
      file_url: doc.file_url
    }));
  })
  documents?: Array<{
    id: number;
    name: string;
    document_type: string;
    file_url?: string;
  }>;

  // Computed fields
  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => {
    const today = new Date();
    const audienceDateTime = new Date(`${obj.audience_date}T${obj.audience_time}`);
    return audienceDateTime < today;
  })
  is_past: boolean;

  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => {
    const today = new Date();
    const audienceDateTime = new Date(`${obj.audience_date}T${obj.audience_time}`);
    return audienceDateTime > today;
  })
  is_upcoming: boolean;

  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => {
    const today = new Date().toDateString();
    const audienceDate = new Date(obj.audience_date).toDateString();
    return today === audienceDate;
  })
  is_today: boolean;

  @ApiProperty({ example: "2024-12-15T14:30:00.000Z" })
  @Expose()
  @Transform(({ obj }) => new Date(`${obj.audience_date}T${obj.audience_time}`))
  full_datetime: Date;

  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.reminder_sent || obj.is_past) return false;
    const audienceDateTime = new Date(`${obj.audience_date}T${obj.audience_time}`);
    const now = new Date();
    const diffHours = (audienceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours <= 48;
  })
  needs_reminder: boolean;

  @ApiProperty({ example: "Audience d'appel" })
  @Expose()
  @Transform(({ obj }) => obj.code)
  type_label: string;


  @ApiProperty({ example: "Planifiée" })
  @Expose()
  @Transform(({ obj }) => {
    const statusLabels = {
      [AudienceStatus.SCHEDULED]: "Planifiée",
      [AudienceStatus.HELD]: "Tenue",
      [AudienceStatus.POSTPONED]: "Reportée",
      [AudienceStatus.CANCELLED]: "Annulée"
    };
    return statusLabels[obj.status] || "Inconnu";
  })
  status_label: string;

  @ApiProperty({ example: "Dans 3 jours" })
  @Expose()
  @Transform(({ obj }) => {
    const now = new Date();
    const audienceDate = new Date(obj.audience_date);
    const diffTime = audienceDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Demain";
    if (diffDays > 1) return `Dans ${diffDays} jours`;
    if (diffDays === -1) return "Hier";
    return `Il y a ${Math.abs(diffDays)} jours`;
  })
  relative_date: string;
}

// DTO simplifié pour les listes
export class AudienceListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "2024-12-15" })
  @Expose()
  audience_date: Date;

  @ApiProperty({ example: "14:30" })
  @Expose()
  audience_time: string;

  @ApiProperty({ example: "Tribunal de Grande Instance de Paris" })
  @Expose()
  jurisdiction: Jurisdiction;

  @ApiProperty({ example: "Salle 4B" })
  @Expose()
  room?: string;

  @ApiProperty({ enum: AudienceType1 })
  @Expose()
  type: AudienceType1;

  @ApiProperty({ enum: AudienceStatus })
  @Expose()
  status: AudienceStatus;

  @ApiProperty({ example: "Juge Dupont" })
  @Expose()
  judge_name?: string;

  @ApiProperty({ example: "DOS-2024-001" })
  @Expose()
  @Transform(({ obj }) => obj.dossier?.reference)
  dossier_reference: string;

  @ApiProperty({ example: "Affaire commerciale" })
  @Expose()
  @Transform(({ obj }) => obj.dossier?.objet)
  dossier_objet: string;

  @ApiProperty({ example: "Société ABC" })
  @Expose()
  @Transform(({ obj }) => obj.dossier?.client?.company_name || obj.dossier?.client?.full_name)
  client_name: string;

  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => {
    const today = new Date();
    const audienceDateTime = new Date(`${obj.audience_date}T${obj.audience_time}`);
    return audienceDateTime < today;
  })
  is_past: boolean;

  @ApiProperty({ example: "Planifiée" })
  @Expose()
  @Transform(({ obj }) => {
    const statusLabels = {
      [AudienceStatus.SCHEDULED]: "Planifiée",
      [AudienceStatus.HELD]: "Tenue",
      [AudienceStatus.POSTPONED]: "Reportée",
      [AudienceStatus.CANCELLED]: "Annulée"
    };
    return statusLabels[obj.status] || "Inconnu";
  })
  status_label: string;
}
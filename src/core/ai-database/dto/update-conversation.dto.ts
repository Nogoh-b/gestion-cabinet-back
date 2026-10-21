import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Renommer et/ou épingler une conversation du chat IA. */
export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

/**
 * État d'une carte du chat, gardé avec la réponse : brouillon modifié
 * (e-mail, WhatsApp, courrier, document) et statut (envoyé, annulé, classé…).
 * `null` efface la valeur.
 */
export class UpdateMessageStateDto {
  @IsOptional()
  @IsObject()
  draftState?: Record<string, any> | null;

  @IsOptional()
  @IsObject()
  cardStatus?: Record<string, any> | null;
}

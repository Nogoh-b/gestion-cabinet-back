import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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

// src/modules/notification/dto/create-notification.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsObject, IsArray, IsBoolean, IsEmpty } from 'class-validator';
import { NotificationType } from '../enum/notification-type.enum';

export class CreateNotificationDto {
  @IsNotEmpty()
  @IsNumber()
  user_id: number;

  @IsNotEmpty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  data?: any;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  actions?: any[];

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsBoolean()
  is_push_sent?: boolean;
}

// DTO pour création multiple
export class CreateBulkNotificationDto {
  @IsArray()
  @IsNumber({}, { each: true })
  user_ids: number[];

  @IsNotEmpty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsEmpty()
  @IsBoolean()
  broadcast?: boolean;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  data?: any;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  actions?: any[];

  @IsOptional()
  @IsString()
  image_url?: string;
}


// src/modules/notification/dto/mark-read.dto.ts
export class MarkReadDto {
  @IsOptional()
  @IsArray()
  notification_ids?: number[];

  @IsOptional()
  mark_all?: boolean;
}
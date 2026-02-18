// src/modules/notification/dto/create-notification.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsObject, IsArray } from 'class-validator';
import { NotificationPriority, NotificationType } from '../enum/notification-type.enum';

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
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

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
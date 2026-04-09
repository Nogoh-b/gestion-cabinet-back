// src/modules/notification/dto/notification-response.dto.ts
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class NotificationResponseDto {
  @Expose()
  id: number;

  @Expose()
  type: string;

  @Expose()
  title: string;

  @Expose()
  content: string;

  @Expose()
  data: any;

  @Expose()
  link: string;

  @Expose()
  priority: string;

  @Expose()
  created_at: Date;

  @Expose()
  is_read: boolean;

  @Expose()
  read_at: Date;

  @Expose()
  image_url: string;

  @Expose()
  actions: any[];

  @Expose()
  time_ago: string;

  constructor(partial: Partial<NotificationResponseDto>) {
    Object.assign(this, partial);
    this.time_ago = this.getTimeAgo();
  }

  private getTimeAgo(): string {
    const now = new Date();
    const diff = now.getTime() - new Date(this.created_at).getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days < 7) return `Il y a ${days} j`;
    
    return new Date(this.created_at).toLocaleDateString('fr-FR');
  }
}

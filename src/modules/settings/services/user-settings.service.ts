import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from '../entities/user-settings.entity';
import { UserSettingsDto } from '../dto/user-settings.dto';

const DEFAULT_USER_SETTINGS: Partial<UserSettings> = {
  user_theme: 'system',
  user_font_size: 'md',
  user_language: 'fr',
  user_notifications_enabled: true,
  user_email_notifications: true,
  user_in_app_notifications: true,
  user_sidebar_collapsed: false,
  user_items_per_page: 10,
  user_default_dashboard: '/dashboard',
  user_signature: null,
  user_avatar: null,
  user_phone: '',
};

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private readonly userSettingsRepository: Repository<UserSettings>,
  ) {}

  async findByUser(userId: number): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    if (!settings) {
      settings = this.userSettingsRepository.create({
        user_id: userId,
        ...DEFAULT_USER_SETTINGS,
      });
      settings = await this.userSettingsRepository.save(settings);
    }

    return settings;
  }

  async update(userId: number, dto: UserSettingsDto): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    if (!settings) {
      settings = this.userSettingsRepository.create({
        user_id: userId,
        ...DEFAULT_USER_SETTINGS,
        ...dto,
      });
    } else {
      Object.assign(settings, dto);
    }

    return this.userSettingsRepository.save(settings);
  }
}
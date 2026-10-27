import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { UserSettings } from '../entities/user-settings.entity';
import { UserSettingsDto } from '../dto/user-settings.dto';
import {
  APPEARANCE_FALLBACK,
  isFontSize,
  isSidebarStyle,
  isThemeName,
} from '../appearance.constants';

const DEFAULT_USER_SETTINGS: Partial<UserSettings> = {
  user_theme: 'system',
  user_font_size: 'lg',
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
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
  ) {}

  async findByUser(userId: number, tenantId?: number): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    if (!settings) {
      settings = this.userSettingsRepository.create({
        user_id: userId,
        ...DEFAULT_USER_SETTINGS,
        ...(await this.cabinetAppearanceDefaults(tenantId)),
      });
      settings = await this.userSettingsRepository.save(settings);
    }

    return settings;
  }

  async update(
    userId: number,
    dto: UserSettingsDto,
    tenantId?: number,
  ): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    if (!settings) {
      settings = this.userSettingsRepository.create({
        user_id: userId,
        ...DEFAULT_USER_SETTINGS,
        ...(await this.cabinetAppearanceDefaults(tenantId)),
        ...dto,
      });
    } else {
      Object.assign(settings, dto);
    }

    return this.userSettingsRepository.save(settings);
  }

  /**
   * Recopie l'apparence par défaut du cabinet sur TOUS ses membres existants
   * (action explicite de l'administrateur). Le mode clair/sombre reste
   * personnel. Les membres sans préférences les recevront à leur prochaine
   * connexion. Retourne le nombre de comptes mis à jour.
   */
  async applyCabinetAppearanceToMembers(tenantId: number): Promise<number> {
    const defaults = await this.cabinetAppearanceDefaults(tenantId);
    const result = await this.userSettingsRepository
      .createQueryBuilder()
      .update(UserSettings)
      .set({
        user_theme_name: defaults.user_theme_name,
        user_font_ui: defaults.user_font_ui,
        user_font_heading: defaults.user_font_heading,
        user_font_mono: defaults.user_font_mono,
        user_font_size: defaults.user_font_size,
        user_sidebar_style: defaults.user_sidebar_style,
      })
      .where('tenant_id = :tenantId', { tenantId })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Apparence initiale d'un nouveau membre : copie des défauts de son
   * cabinet, avec repli sur le défaut produit pour toute valeur absente.
   */
  private async cabinetAppearanceDefaults(
    tenantId?: number,
  ): Promise<Partial<UserSettings>> {
    const cabinet = tenantId
      ? await this.cabinetRepository.findOne({
          where: { id: tenantId },
          select: [
            'id',
            'theme_name',
            'font_ui',
            'font_heading',
            'font_mono',
            'default_font_size',
            'default_sidebar_style',
          ],
        })
      : null;

    return {
      user_theme_name: isThemeName(cabinet?.theme_name)
        ? cabinet.theme_name
        : APPEARANCE_FALLBACK.theme_name,
      user_font_ui: cabinet?.font_ui || APPEARANCE_FALLBACK.font_ui,
      user_font_heading: cabinet?.font_heading || APPEARANCE_FALLBACK.font_heading,
      user_font_mono: cabinet?.font_mono || APPEARANCE_FALLBACK.font_mono,
      user_font_size: isFontSize(cabinet?.default_font_size)
        ? cabinet.default_font_size
        : APPEARANCE_FALLBACK.font_size,
      user_sidebar_style: isSidebarStyle(cabinet?.default_sidebar_style)
        ? cabinet.default_sidebar_style
        : APPEARANCE_FALLBACK.sidebar_style,
    };
  }
}

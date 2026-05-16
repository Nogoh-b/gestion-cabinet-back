import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../entities/app-settings.entity';
import { AppSettingsDto } from '../dto/app-settings.dto';

const DEFAULT_APP_SETTINGS: Partial<AppSettings> = {
  cabinet_name: 'MonCabinet',
  cabinet_logo: null,
  theme_primary_color: '#2563eb',
  theme_secondary_color: '#7c3aed',
  theme_accent_color: '#f59e0b',
  theme_sidebar_color: '#1e293b',
  theme_sidebar_text: '#ffffff',
  theme_radius: '0.5rem',
  cabinet_address: '',
  cabinet_phone: '',
  cabinet_email: '',
  cabinet_website: '',
  cabinet_slogan: '',
  cabinet_rccm: '',
  cabinet_nina: '',
  cabinet_bank_account: '',
  app_locale: 'fr',
  date_format: 'dd/MM/yyyy',
  currency: 'XAF',
  invoice_prefix: 'FAC-',
  dossier_prefix: 'DOS-',
  working_hours_start: '08:00',
  working_hours_end: '17:00',
  notification_email: true,
  notification_sms: false,
  smtp_config: null,
  payslip_template: null,
  invoice_template: null,
  dossier_template: null,
};

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly appSettingsRepository: Repository<AppSettings>,
  ) {}

  async findByCabinet(cabinetId?: number): Promise<AppSettings> {
    if (!cabinetId) {
      // Retourner les valeurs par défaut si pas de cabinet
      return Object.assign(new AppSettings(), {
        ...DEFAULT_APP_SETTINGS,
        id: undefined,
        cabinet_id: undefined,
      });
    }

    let settings = await this.appSettingsRepository.findOne({
      where: { cabinet_id: cabinetId },
    });

    if (!settings) {
      settings = this.appSettingsRepository.create({
        cabinet_id: cabinetId,
        ...DEFAULT_APP_SETTINGS,
      });
      settings = await this.appSettingsRepository.save(settings);
    }

    return settings;
  }

  async update(cabinetId: number, dto: AppSettingsDto): Promise<AppSettings> {
    let settings = await this.appSettingsRepository.findOne({
      where: { cabinet_id: cabinetId },
    });

    if (!settings) {
      settings = this.appSettingsRepository.create({
        cabinet_id: cabinetId,
        ...DEFAULT_APP_SETTINGS,
        ...dto,
      });
    } else {
      Object.assign(settings, dto);
    }

    return this.appSettingsRepository.save(settings);
  }

  async reset(cabinetId: number): Promise<AppSettings> {
    let settings = await this.appSettingsRepository.findOne({
      where: { cabinet_id: cabinetId },
    });

    if (!settings) {
      settings = this.appSettingsRepository.create({
        cabinet_id: cabinetId,
        ...DEFAULT_APP_SETTINGS,
      });
    } else {
      Object.assign(settings, DEFAULT_APP_SETTINGS);
    }

    return this.appSettingsRepository.save(settings);
  }
}
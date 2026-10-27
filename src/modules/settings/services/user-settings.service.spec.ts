import { Repository } from 'typeorm';
import { describe, expect, it, jest } from '@jest/globals';

import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { UserSettings } from '../entities/user-settings.entity';
import { UserSettingsService } from './user-settings.service';

function makeService(cabinet: Partial<Cabinet> | null) {
  const repository = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as unknown as Repository<UserSettings>;
  const cabinetRepository = {
    findOne: jest.fn(async () => cabinet),
  } as unknown as Repository<Cabinet>;
  return {
    repository,
    cabinetRepository,
    service: new UserSettingsService(repository, cabinetRepository),
  };
}

describe('UserSettingsService', () => {
  it('crée les nouvelles préférences avec la taille de texte grande', async () => {
    const { service, repository } = makeService(null);

    await service.findByUser(42);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 42, user_font_size: 'lg' }),
    );
  });

  it("copie l'apparence par défaut du cabinet sur un nouveau membre", async () => {
    const { service, repository, cabinetRepository } = makeService({
      id: 7,
      theme_name: 'emerald',
      font_ui: 'inter',
      font_heading: 'lora',
      font_mono: 'fira_code',
      default_font_size: 'md',
      default_sidebar_style: 'dark',
    });

    await service.findByUser(42, 7);

    expect(cabinetRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_theme_name: 'emerald',
        user_font_ui: 'inter',
        user_font_heading: 'lora',
        user_font_mono: 'fira_code',
        user_font_size: 'md',
        user_sidebar_style: 'dark',
      }),
    );
  });

  it('retombe sur le défaut produit (Minuit, Outfit, grande, teintée) sans cabinet', async () => {
    const { service, repository } = makeService(null);

    await service.findByUser(42, 99);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_theme_name: 'midnight',
        user_font_ui: 'outfit',
        user_font_heading: 'outfit',
        user_font_mono: 'jetbrains_mono',
        user_font_size: 'lg',
        user_sidebar_style: 'tinted',
      }),
    );
  });

  it("recopie l'apparence du cabinet sur tous ses membres, sans toucher au mode clair/sombre", async () => {
    const execute = jest.fn(async () => ({ affected: 3 }));
    const set = jest.fn();
    const where = jest.fn();
    const builder: any = { update: () => builder, set: (v: unknown) => (set(v), builder), where: (...a: unknown[]) => (where(...a), builder), execute };
    const { service, repository } = makeService({
      id: 7,
      theme_name: 'slate',
      font_ui: 'inter',
      font_heading: 'lora',
      font_mono: 'fira_code',
      default_font_size: 'md',
      default_sidebar_style: 'dark',
    });
    (repository as any).createQueryBuilder = () => builder;

    const updated = await service.applyCabinetAppearanceToMembers(7);

    expect(updated).toBe(3);
    expect(where).toHaveBeenCalledWith('tenant_id = :tenantId', { tenantId: 7 });
    expect(set).toHaveBeenCalledWith({
      user_theme_name: 'slate',
      user_font_ui: 'inter',
      user_font_heading: 'lora',
      user_font_mono: 'fira_code',
      user_font_size: 'md',
      user_sidebar_style: 'dark',
    });
  });

  it("ne remplace pas une préférence existante par les défauts du cabinet", async () => {
    const existing = { user_id: 42, user_theme_name: 'rose' } as UserSettings;
    const { service, repository, cabinetRepository } = makeService({
      id: 7,
      theme_name: 'emerald',
    });
    (repository.findOne as jest.Mock<any>).mockResolvedValue(existing);

    const result = await service.findByUser(42, 7);

    expect(result.user_theme_name).toBe('rose');
    expect(cabinetRepository.findOne).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

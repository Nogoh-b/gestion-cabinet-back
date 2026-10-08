import { Repository } from 'typeorm';
import { describe, expect, it, jest } from '@jest/globals';

import { UserSettings } from '../entities/user-settings.entity';
import { UserSettingsService } from './user-settings.service';

describe('UserSettingsService', () => {
  it('crée les nouvelles préférences avec la taille de texte grande', async () => {
    const repository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<UserSettings>;
    const service = new UserSettingsService(repository);

    await service.findByUser(42);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 42, user_font_size: 'lg' }),
    );
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserRole } from 'src/core/enums/user-role.enum';
import { AudiencesService } from './audiences.service';
import { audienceStatusParam, AudienceStatus } from './entities/audience.entity';

describe('AudiencesService', () => {
  let service: AudiencesService;

  beforeEach(() => {
    service = Object.create(AudiencesService.prototype) as AudiencesService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findInProgress', () => {
    function withRepository() {
      const find = jest.fn(async (_options: unknown) => []);
      (service as any).repository = { find };
      return find;
    }

    it('borne un avocat aux audiences de ses dossiers', async () => {
      const find = withRepository();

      await service.findInProgress({ id: 3, role: UserRole.AVOCAT });

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: audienceStatusParam(AudienceStatus.IN_PROGRESS),
            dossier: { lawyer: { id: 3 } },
          },
        }),
      );
    });

    it('ne restreint pas un administrateur', async () => {
      const find = withRepository();

      await service.findInProgress({ id: 1, role: UserRole.ADMIN });

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: audienceStatusParam(AudienceStatus.IN_PROGRESS) },
        }),
      );
    });
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyAudienceStatusChange,
  finishAudienceWithManager,
  startAudienceWithManager,
} from './audience-workflow';
import { Audience, AudienceStatus } from './entities/audience.entity';

const NOW = new Date('2026-10-28T10:00:00');

function audience(overrides: Partial<Audience> = {}): Audience {
  return Object.assign(new Audience(), {
    id: 7,
    tenant_id: 1,
    audience_date: '2026-10-28',
    audience_time: '09:00',
    status: AudienceStatus.SCHEDULED,
    started_at: null,
    ended_at: null,
    ...overrides,
  });
}

function managerWith(found: Audience | null) {
  const repository = {
    findOne: jest.fn(async (_options: unknown) => found),
    save: jest.fn(async (entity: unknown) => entity),
  };
  const manager = { getRepository: () => repository };
  return { manager: manager as any, repository };
}

describe('startAudienceWithManager', () => {
  it('passe SCHEDULED → IN_PROGRESS et horodate started_at', async () => {
    const { manager, repository } = managerWith(audience());

    const saved = await startAudienceWithManager(manager, 7, {}, NOW);

    expect(saved.status).toBe(AudienceStatus.IN_PROGRESS);
    expect(saved.started_at).toEqual(NOW);
    expect(saved.ended_at).toBeNull();
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('refuse une audience introuvable (autre cabinet ou hors portée)', async () => {
    const { manager } = managerWith(null);

    await expect(startAudienceWithManager(manager, 7, {}, NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('borne la recherche au dossier de l’avocat', async () => {
    const { manager, repository } = managerWith(audience());

    await startAudienceWithManager(manager, 7, { lawyer: { id: 3 } }, NOW);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 7, tenant_id: 1, dossier: { lawyer: { id: 3 } } },
    });
  });

  it.each([
    AudienceStatus.HELD,
    AudienceStatus.POSTPONED,
    AudienceStatus.CANCELLED,
  ])('refuse de démarrer une audience au statut %s', async (status) => {
    const { manager, repository } = managerWith(audience({ status }));

    await expect(startAudienceWithManager(manager, 7, {}, NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('refuse de démarrer deux fois', async () => {
    const { manager } = managerWith(
      audience({ status: AudienceStatus.IN_PROGRESS }),
    );

    await expect(startAudienceWithManager(manager, 7, {}, NOW)).rejects.toThrow(
      /déjà en cours/,
    );
  });

  it('accepte une audience programmée avant le jour prévu', async () => {
    const { manager } = managerWith(
      audience({ audience_date: '2026-10-29' as any }),
    );

    const saved = await startAudienceWithManager(manager, 7, {}, NOW);

    expect(saved.status).toBe(AudienceStatus.IN_PROGRESS);
  });

  it('accepte une audience dont le jour est passé (retard de saisie)', async () => {
    const { manager } = managerWith(
      audience({ audience_date: '2026-10-20' as any }),
    );

    const saved = await startAudienceWithManager(manager, 7, {}, NOW);

    expect(saved.status).toBe(AudienceStatus.IN_PROGRESS);
  });
});

describe('finishAudienceWithManager', () => {
  it('passe IN_PROGRESS → HELD et horodate ended_at', async () => {
    const started = new Date('2026-10-28T09:05:00');
    const { manager } = managerWith(
      audience({ status: AudienceStatus.IN_PROGRESS, started_at: started }),
    );

    const saved = await finishAudienceWithManager(manager, 7, {}, NOW);

    expect(saved.status).toBe(AudienceStatus.HELD);
    expect(saved.started_at).toEqual(started);
    expect(saved.ended_at).toEqual(NOW);
  });

  it("refuse de terminer une audience qui n'est pas en cours", async () => {
    const { manager, repository } = managerWith(audience());

    await expect(
      finishAudienceWithManager(manager, 7, {}, NOW),
    ).rejects.toThrow(/en cours/);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('applyAudienceStatusChange', () => {
  it("n'entre en cours que depuis « Programmée »", () => {
    expect(() =>
      applyAudienceStatusChange(
        audience({ status: AudienceStatus.HELD }),
        AudienceStatus.IN_PROGRESS,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepte le statut sous forme de chaîne (enum MariaDB)', () => {
    const a = audience();
    applyAudienceStatusChange(a, '4', NOW);
    expect(a.status).toBe(AudienceStatus.IN_PROGRESS);
    expect(a.started_at).toEqual(NOW);
  });

  it('sortie vers Tenue : horodate ended_at', () => {
    const a = audience({ status: AudienceStatus.IN_PROGRESS });
    applyAudienceStatusChange(a, AudienceStatus.HELD, NOW);
    expect(a.status).toBe(AudienceStatus.HELD);
    expect(a.ended_at).toEqual(NOW);
  });

  it('retour à Programmée : annule le démarrage', () => {
    const a = audience({
      status: AudienceStatus.IN_PROGRESS,
      started_at: NOW,
    });
    applyAudienceStatusChange(a, AudienceStatus.SCHEDULED, NOW);
    expect(a.status).toBe(AudienceStatus.SCHEDULED);
    expect(a.started_at).toBeNull();
  });

  it('ne touche pas aux autres transitions', () => {
    const a = audience();
    applyAudienceStatusChange(a, AudienceStatus.CANCELLED, NOW);
    expect(a.status).toBe(AudienceStatus.SCHEDULED); // appliquée par l'appelant
    expect(a.started_at).toBeNull();
  });
});

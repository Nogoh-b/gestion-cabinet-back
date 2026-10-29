/// <reference types="jest" />
// Fil de notes d'un document : tout lecteur écrit, seul l'auteur ou un admin
// modifie ou supprime ; la note garde la version du document.
import { ForbiddenException } from '@nestjs/common';

import { canEditNote, DocumentNotesService } from './document-notes.service';

jest.mock('src/core/tenant/tenant.context', () => ({
  getCurrentTenantId: () => 22,
  hasActiveTenant: () => true,
}));

function setup() {
  const rows: any[] = [];
  const documents = { findOne: jest.fn(async () => ({ id: 41, version: 3 })) };
  const notes = {
    create: (value: any) => value,
    save: jest.fn(async (value: any) => {
      const existing = rows.find((row) => row.id === value.id);
      if (existing) return Object.assign(existing, value, { updated_at: new Date(2026, 9, 28, 11) });
      const row = { id: rows.length + 1, created_at: new Date(2026, 9, 28, 10), updated_at: new Date(2026, 9, 28, 10), author: { id: value.author_id, first_name: 'Awa', last_name: 'Kaby' }, ...value };
      rows.push(row);
      return row;
    }),
    find: jest.fn(async () => [...rows].reverse()),
    findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id && row.document_id === where.document_id) ?? null),
    softDelete: jest.fn(async ({ id }: any) => rows.splice(rows.findIndex((row) => row.id === id), 1)),
  };
  const service = new DocumentNotesService(documents as any, notes as any);
  return { service, rows, notes };
}

describe('notes des documents', () => {
  it('ajoute une note avec son auteur et la version du document', async () => {
    const { service } = setup();
    const note = await service.create(41, '  Clause 4 à revoir  ', { userId: 12 });

    expect(note).toMatchObject({ content: 'Clause 4 à revoir', version: 3, author: { id: 12, name: 'Awa Kaby' }, can_edit: true });
  });

  it('refuse une note vide', async () => {
    const { service } = setup();
    await expect(service.create(41, '   ', { userId: 12 })).rejects.toThrow('La note est vide');
  });

  it('seul l’auteur ou un admin modifie ou supprime', async () => {
    const { service, rows } = setup();
    const note = await service.create(41, 'Première lecture', { userId: 12 });

    await expect(service.update(41, note.id, 'Autre texte', { userId: 7 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(41, note.id, { userId: 7 })).rejects.toBeInstanceOf(ForbiddenException);

    const edited = await service.update(41, note.id, 'Relue', { userId: 12 });
    expect(edited).toMatchObject({ content: 'Relue', edited: true });

    await service.remove(41, note.id, { userId: 7, role: 'admin' });
    expect(rows).toHaveLength(0);
  });

  it('les autres lecteurs voient la note sans pouvoir la modifier', async () => {
    const { service } = setup();
    await service.create(41, 'Pour info', { userId: 12 });

    const [seen] = await service.list(41, { userId: 7 });
    expect(seen.can_edit).toBe(false);
    expect(canEditNote({ author_id: 12 }, { userId: 7, permissions: ['SUPER_ADMIN'] })).toBe(true);
  });
});

/// <reference types="jest" />
import * as fs from 'fs';
import { NotFoundException } from '@nestjs/common';
import { UPLOAD_PATH } from 'src/core/common/constants/constants';
import { DossierExportStore } from './dossier-export.store';

const admin = { id: 1, role: 'admin', permissions: [] };
const avocat = { id: 31, role: 'avocat', permissions: ['view_dossiers'] };

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tenant_id: 5,
  created_by: 31,
  dossier_ids: [7],
  file_name: 'dossier-7_2026.zip',
  file_path: 'exports/5/abcd_dossier-7_2026.zip',
  file_size: '2048',
  created_at: new Date('2026-10-01T10:00:00Z'),
  ...over,
});

function setup(rows = [row(), row({ id: 2, created_by: 32, dossier_ids: [8, 9] })]) {
  const repo = {
    find: jest.fn(async ({ where }: any) =>
      rows.filter((r) => where.created_by === undefined || r.created_by === where.created_by),
    ),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    remove: jest.fn(async (r: any) => r),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 3, ...v })),
  };
  const dossierRepo = {
    find: jest.fn(async () => [
      { id: 7, dossier_number: 'DOS-7', object: 'Recouvrement' },
      { id: 8, dossier_number: 'DOS-8', object: 'Bail' },
    ]),
  };
  const users = {
    find: jest.fn(async () => [
      { id: 31, full_name: 'Me Ndi' },
      { id: 32, full_name: 'Me Kamga' },
    ]),
  };
  const db = { getRepository: jest.fn(() => users) };
  const store = new DossierExportStore(repo as any, dossierRepo as any, db as any);
  return { store, repo };
}

describe('DossierExportStore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lists only my exports, with dossier numbers and sizes', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const { store, repo } = setup();

    const mine = await store.list(avocat);

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { created_by: 31 } }));
    expect(mine).toEqual([
      expect.objectContaining({
        id: 1,
        file_size: 2048,
        created_by_name: 'Me Ndi',
        missing: false,
        dossiers: [{ id: 7, dossier_number: 'DOS-7', object: 'Recouvrement' }],
      }),
    ]);
  });

  it('lets an admin see the whole cabinet and flags a vanished file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { store, repo } = setup();

    const all = await store.list(admin);

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(all.map((e) => e.id)).toEqual([1, 2]);
    expect(all.every((e) => e.missing)).toBe(true);
  });

  it("hides a colleague's export from download and delete", async () => {
    const { store, repo } = setup();

    await expect(store.downloadable(2, avocat)).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.remove(2, avocat)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('resolves the file under uploads and 404s when it vanished', async () => {
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const { store } = setup();

    const { absPath, fileName } = await store.downloadable(1, avocat);
    expect(fileName).toBe('dossier-7_2026.zip');
    expect(absPath.replace(/\\/g, '/')).toBe(
      `${UPLOAD_PATH.replace(/\\/g, '/')}/exports/5/abcd_dossier-7_2026.zip`,
    );

    exists.mockReturnValue(false);
    await expect(store.downloadable(1, avocat)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a path that leaves uploads/exports', async () => {
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
    const { store } = setup([row({ file_path: '../../.env' })]);

    await expect(store.downloadable(1, avocat)).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.remove(1, avocat)).rejects.toBeInstanceOf(NotFoundException);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('deletes the file and the row', async () => {
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
    const { store, repo } = setup();

    await store.remove(1, avocat);

    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('abcd_dossier-7_2026.zip'));
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('still removes the row when the file is already gone', async () => {
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('absent'), { code: 'ENOENT' });
    });
    const { store, repo } = setup();

    await store.remove(1, avocat);

    expect(repo.remove).toHaveBeenCalled();
  });

  it('records a written ZIP', async () => {
    const { store, repo } = setup();

    await store.record({
      userId: 31,
      dossierIds: [7],
      fileName: 'a.zip',
      relPath: 'exports/5/x_a.zip',
      fileSize: 10,
    });

    expect(repo.save).toHaveBeenCalledWith({
      created_by: 31,
      dossier_ids: [7],
      file_name: 'a.zip',
      file_path: 'exports/5/x_a.zip',
      file_size: 10,
    });
  });
});

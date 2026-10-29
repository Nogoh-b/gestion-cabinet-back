import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import type { WriteStream } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { DataSource, In, Repository } from 'typeorm';

import { businessRole } from 'src/core/auth/business-role';
import { UPLOAD_PATH } from 'src/core/common/constants/constants';
import { UserRole } from 'src/core/enums/user-role.enum';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { User } from '../iam/user/entities/user.entity';
import { DossierExport } from './entities/dossier-export.entity';

/** Dossier de stockage des exports ZIP : `uploads/exports/<tenant>/`. */
export const EXPORT_PATH = join(UPLOAD_PATH, 'exports');

/** Appelant tel que le porte le JWT. */
export interface ExportOwner {
  id?: number | null;
  role?: string | null;
  base_role?: string | null;
  permissions?: readonly string[] | null;
}

export interface ExportFileTarget {
  /** Chemin absolu du ZIP en cours d'écriture. */
  absPath: string;
  /** Chemin relatif à `uploads/`, tel qu'enregistré en base. */
  relPath: string;
  stream: WriteStream;
}

export interface ExportListItem {
  id: number;
  file_name: string;
  file_size: number;
  created_at: Date;
  created_by: number | null;
  created_by_name: string | null;
  dossiers: { id: number; dossier_number: string | null; object: string | null }[];
  /** Le ZIP n'est plus sur le disque (téléchargement impossible). */
  missing: boolean;
}

/**
 * Copies serveur des exports : écriture dans `uploads/exports/<tenant>/`,
 * enregistrement `dossier_exports`, liste, téléchargement et suppression.
 * L'espace qu'elles occupent est compté par StorageUsageService.
 */
@Injectable()
export class DossierExportStore {
  private readonly logger = new Logger(DossierExportStore.name);

  constructor(
    @InjectRepository(DossierExport)
    private readonly repo: Repository<DossierExport>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** L'administrateur voit les exports de tout le cabinet ; les autres, les leurs. */
  static seesAll(user?: ExportOwner | null): boolean {
    return (
      !!user &&
      (businessRole(user as any) === UserRole.ADMIN ||
        user.permissions?.includes('SUPER_ADMIN') === true)
    );
  }

  /** Ouvre le fichier de destination d'un export du cabinet `tenantId`. */
  open(tenantId: number, uniqueName: string): ExportFileTarget {
    const dir = join(EXPORT_PATH, String(tenantId));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const absPath = join(dir, uniqueName);
    return {
      absPath,
      relPath: relative(UPLOAD_PATH, absPath).replace(/\\/g, '/'),
      stream: createWriteStream(absPath),
    };
  }

  sizeOf(absPath: string): number {
    return statSync(absPath).size;
  }

  /** Supprime un fichier d'export (absent = déjà fait). */
  discard(absPath: string): void {
    try {
      unlinkSync(absPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`[Export] Suppression de ${absPath} impossible : ${(e as Error).message}`);
      }
    }
  }

  /** Enregistre un ZIP écrit : il compte désormais dans l'espace du cabinet. */
  record(entry: {
    userId?: number | null;
    dossierIds: number[];
    fileName: string;
    relPath: string;
    fileSize: number;
  }): Promise<DossierExport> {
    return this.repo.save(
      this.repo.create({
        created_by: entry.userId ?? null,
        dossier_ids: entry.dossierIds,
        file_name: entry.fileName,
        file_path: entry.relPath,
        file_size: entry.fileSize,
      }),
    );
  }

  async list(user: ExportOwner): Promise<ExportListItem[]> {
    const rows = await this.repo.find({
      where: DossierExportStore.seesAll(user) ? {} : { created_by: user.id ?? -1 },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    if (!rows.length) return [];

    const dossierIds = [...new Set(rows.flatMap((r) => r.dossier_ids ?? []))];
    const dossiers = dossierIds.length
      ? await this.dossierRepo.find({ where: { id: In(dossierIds) } })
      : [];
    const byId = new Map(dossiers.map((d) => [Number(d.id), d]));

    const authorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is number => !!id))];
    const authors = authorIds.length
      ? await this.db
          .getRepository(User)
          .find({ where: { id: In(authorIds) } })
          .catch(() => [] as User[])
      : [];
    const authorName = new Map(authors.map((u) => [Number(u.id), (u as any).full_name ?? null]));

    return rows.map((row) => ({
      id: row.id,
      file_name: row.file_name,
      file_size: Number(row.file_size) || 0,
      created_at: row.created_at,
      created_by: row.created_by,
      created_by_name: row.created_by ? (authorName.get(row.created_by) ?? null) : null,
      dossiers: (row.dossier_ids ?? []).map((id) => ({
        id,
        dossier_number: byId.get(id)?.dossier_number ?? null,
        object: byId.get(id)?.object ?? null,
      })),
      missing: !existsSync(this.resolvePath(row.file_path)),
    }));
  }

  /** Export visible par l'appelant (les siens, ou tous pour un administrateur). */
  async find(id: number, user: ExportOwner): Promise<DossierExport> {
    const row = await this.repo.findOne({ where: { id } });
    if (
      !row ||
      (!DossierExportStore.seesAll(user) && (row.created_by ?? -1) !== (user.id ?? -2))
    ) {
      throw new NotFoundException('Export introuvable');
    }
    return row;
  }

  /** Chemin absolu du ZIP à télécharger ; 404 si le fichier a disparu du disque. */
  async downloadable(
    id: number,
    user: ExportOwner,
  ): Promise<{ absPath: string; fileName: string }> {
    const row = await this.find(id, user);
    const absPath = this.resolvePath(row.file_path);
    if (!existsSync(absPath)) {
      throw new NotFoundException(
        "Le fichier de cet export n'est plus sur le serveur. Supprimez-le de la liste et relancez l'export.",
      );
    }
    return { absPath, fileName: row.file_name };
  }

  /** Supprime le fichier et la ligne : l'espace est libéré. */
  async remove(id: number, user: ExportOwner): Promise<void> {
    const row = await this.find(id, user);
    this.discard(this.resolvePath(row.file_path));
    await this.repo.remove(row);
  }

  /** Résout `file_path` sous `uploads/exports` ; refuse tout chemin qui en sort. */
  private resolvePath(filePath: string): string {
    const abs = resolve(UPLOAD_PATH, filePath);
    const rel = relative(EXPORT_PATH, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new NotFoundException('Export introuvable');
    }
    return abs;
  }
}

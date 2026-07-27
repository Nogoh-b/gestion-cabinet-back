import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';

const execFileAsync = promisify(execFile);

export interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

/** Portée d'une opération de sauvegarde. */
export interface BackupScope {
  /** true = super-admin (toute la base) ; false = un seul cabinet. */
  full: boolean;
  /** Cabinet concerné quand full=false. */
  tenantId?: number;
}

/**
 * Sauvegarde / restauration via mysqldump / mysql.
 *
 *  - SUPER_ADMIN  → export de TOUTE la base.
 *  - Admin cabinet → export des SEULES données du cabinet (toutes les tables
 *    portant une colonne `tenant_id`, filtrées sur `tenant_id = <cabinet>`).
 *
 * Le mot de passe transite par MYSQL_PWD (jamais en argument CLI).
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly dir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private cfg() {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '3306',
      user: process.env.DB_USER || 'root',
      pass: process.env.DB_PASSWORD || '',
      name: process.env.DB_NAME || 'core',
    };
  }

  /**
   * Résout le chemin du binaire mysqldump / mysql.
   * Priorité : variable d'env (MYSQLDUMP_PATH / MYSQL_PATH) → emplacements
   * usuels (XAMPP, WAMP, Laragon, MySQL/MariaDB Server) → PATH système.
   */
  private resolveBin(bin: 'mysqldump' | 'mysql'): string {
    const envPath = bin === 'mysqldump' ? process.env.MYSQLDUMP_PATH : process.env.MYSQL_PATH;
    if (envPath && existsSync(envPath)) return envPath;

    const win = process.platform === 'win32';
    const exe = win ? `${bin}.exe` : bin;
    const candidates: string[] = [];

    if (win) {
      candidates.push(
        `C:\\xampp\\mysql\\bin\\${exe}`,
        `C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\${exe}`,
      );
      // Scan dynamique de Program Files (MySQL/MariaDB versionnés) et WAMP.
      for (const root of [
        'C:\\Program Files\\MySQL',
        'C:\\Program Files\\MariaDB',
        'C:\\Program Files (x86)\\MySQL',
        'C:\\wamp64\\bin\\mysql',
        'C:\\wamp\\bin\\mysql',
        'C:\\laragon\\bin\\mysql',
      ]) {
        try {
          for (const sub of readdirSync(root)) {
            candidates.push(join(root, sub, 'bin', exe));
          }
        } catch {
          /* dossier absent */
        }
      }
    } else {
      candidates.push(`/usr/bin/${bin}`, `/usr/local/bin/${bin}`, `/opt/homebrew/bin/${bin}`);
    }

    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return bin; // dernier recours : PATH système
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private safePath(name: string): string {
    const base = basename(name);
    if (!/^[\w.\-]+\.sql$/.test(base)) {
      throw new BadRequestException('Nom de sauvegarde invalide');
    }
    return join(this.dir, base);
  }

  /** Préfixe de fichier selon la portée (sert au filtrage par cabinet). */
  private prefix(scope: BackupScope): string {
    return scope.full ? 'backup-full-' : `backup-cab${scope.tenantId}-`;
  }

  /** Vérifie qu'un fichier appartient bien à la portée demandée. */
  private assertOwnership(name: string, scope: BackupScope): void {
    if (scope.full) return; // super-admin voit tout
    if (!basename(name).startsWith(this.prefix(scope))) {
      throw new ForbiddenException('Sauvegarde non accessible pour ce cabinet');
    }
  }

  /** Tables portant une colonne tenant_id (= données propres aux cabinets). */
  private async tenantTables(): Promise<string[]> {
    const rows: Array<{ t: string }> = await this.dataSource.query(
      `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'tenant_id'`,
      [this.cfg().name],
    );
    return rows.map((r) => r.t).filter(Boolean);
  }

  list(scope: BackupScope): BackupFile[] {
    this.ensureDir();
    const prefix = this.prefix(scope);
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.sql') && (scope.full || f.startsWith(prefix)))
      .map((name) => {
        const st = statSync(join(this.dir, name));
        return { name, size: st.size, created_at: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async create(scope: BackupScope): Promise<BackupFile> {
    this.ensureDir();
    const c = this.cfg();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${this.prefix(scope)}${stamp}.sql`;
    const file = join(this.dir, name);

    const args = ['-h', c.host, '-P', c.port, '-u', c.user, '--single-transaction'];
    if (scope.full) {
      args.push('--routines', '--result-file', file, c.name);
    } else {
      if (!scope.tenantId) throw new BadRequestException('Cabinet non résolu');
      const tables = await this.tenantTables();
      if (!tables.length) {
        throw new BadRequestException('Aucune donnée de cabinet à exporter');
      }
      // --where s'applique à toutes les tables listées (toutes ont tenant_id).
      args.push(`--where=tenant_id=${scope.tenantId}`, '--result-file', file, c.name, ...tables);
    }

    try {
      await execFileAsync(this.resolveBin('mysqldump'), args, {
        env: { ...process.env, MYSQL_PWD: c.pass },
        maxBuffer: 1024 * 1024 * 64,
      });
    } catch (e: any) {
      this.logger.error(`[Backup] mysqldump échec: ${e?.message ?? e}`);
      const hint = /ENOENT/.test(String(e?.message))
        ? " — binaire 'mysqldump' introuvable. Renseignez MYSQLDUMP_PATH dans le .env (ex: C:\\xampp\\mysql\\bin\\mysqldump.exe)."
        : '';
      throw new BadRequestException(`Échec de la sauvegarde : ${e?.message ?? e}${hint}`);
    }
    const st = statSync(file);
    this.logger.log(
      `[Backup] créé: ${name} (${st.size} o, ${scope.full ? 'complet' : `cabinet ${scope.tenantId}`})`,
    );
    return { name, size: st.size, created_at: st.mtime.toISOString() };
  }

  streamFor(name: string, scope: BackupScope) {
    this.assertOwnership(name, scope);
    const path = this.safePath(name);
    if (!existsSync(path)) throw new NotFoundException('Sauvegarde introuvable');
    return { stream: createReadStream(path), name: basename(path) };
  }

  remove(name: string, scope: BackupScope): void {
    this.assertOwnership(name, scope);
    const path = this.safePath(name);
    if (!existsSync(path)) throw new NotFoundException('Sauvegarde introuvable');
    unlinkSync(path);
  }

  /** Restauration de la base entière (SUPER_ADMIN uniquement, géré au contrôleur). */
  async restore(name: string): Promise<{ success: boolean }> {
    const path = this.safePath(name);
    if (!existsSync(path)) throw new NotFoundException('Sauvegarde introuvable');
    const c = this.cfg();
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.resolveBin('mysql'), ['-h', c.host, '-P', c.port, '-u', c.user, c.name], {
        env: { ...process.env, MYSQL_PWD: c.pass },
      });
      createReadStream(path).pipe(proc.stdin);
      let err = '';
      proc.stderr.on('data', (d) => (err += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `mysql code ${code}`))));
    }).catch((e) => {
      this.logger.error(`[Backup] restore échec: ${e?.message ?? e}`);
      throw new BadRequestException(`Échec de la restauration : ${e?.message ?? e}`);
    });
    this.logger.warn(`[Backup] restauration effectuée depuis ${name}`);
    return { success: true };
  }
}

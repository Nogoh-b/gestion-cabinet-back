import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { execFile, spawn } from 'child_process';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { basename, join } from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { DataSource } from 'typeorm';

const execFileAsync = promisify(execFile);
const MAGIC = Buffer.from('KABYBK1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

export interface BackupScope {
  full: boolean;
  tenantId?: number;
}

/**
 * Service d'exploitation hors HTTP.
 *
 * Les fichiers sont chiffrés en AES-256-GCM et la restauration exige un mode
 * maintenance explicite. Le module n'expose volontairement aucun contrôleur.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly dir =
    process.env.BACKUP_DIR || join(process.cwd(), 'backups-private');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(scope: BackupScope = { full: true }): Promise<BackupFile> {
    this.ensureDirectory();
    const config = this.databaseConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = scope.full
      ? 'backup-full-'
      : `backup-cab${this.requiredTenantId(scope)}-`;
    const name = `${prefix}${timestamp}.sql.enc`;
    const encryptedPath = join(this.dir, name);
    const temporarySql = join(
      this.dir,
      `.${name}.${process.pid}.temporary.sql`,
    );
    const args = [
      '-h',
      config.host,
      '-P',
      config.port,
      '-u',
      config.user,
      '--single-transaction',
    ];
    if (scope.full) {
      args.push('--routines', '--result-file', temporarySql, config.name);
    } else {
      const tables = await this.tenantTables();
      if (tables.length === 0) {
        throw new BadRequestException('Aucune table de cabinet à sauvegarder');
      }
      args.push(
        `--where=tenant_id=${scope.tenantId}`,
        '--result-file',
        temporarySql,
        config.name,
        ...tables,
      );
    }

    try {
      await execFileAsync(this.resolveBinary('mysqldump'), args, {
        env: { ...process.env, MYSQL_PWD: config.password },
        maxBuffer: 64 * 1024 * 1024,
      });
      await this.encryptFile(temporarySql, encryptedPath);
    } catch (error: any) {
      if (existsSync(encryptedPath)) unlinkSync(encryptedPath);
      const hint = /ENOENT/.test(String(error?.message))
        ? ' Configurez MYSQLDUMP_PATH.'
        : '';
      throw new BadRequestException(
        `Échec de la sauvegarde: ${error?.message ?? error}.${hint}`,
      );
    } finally {
      if (existsSync(temporarySql)) unlinkSync(temporarySql);
    }

    const stats = statSync(encryptedPath);
    this.logger.log(`Sauvegarde chiffrée créée: ${name}`);
    return {
      name,
      size: stats.size,
      created_at: stats.mtime.toISOString(),
    };
  }

  list(scope: BackupScope = { full: true }): BackupFile[] {
    this.ensureDirectory();
    const prefix = scope.full
      ? 'backup-full-'
      : `backup-cab${this.requiredTenantId(scope)}-`;
    return readdirSync(this.dir)
      .filter(
        (name) =>
          name.endsWith('.sql.enc') &&
          (scope.full ? name.startsWith(prefix) : name.startsWith(prefix)),
      )
      .map((name) => {
        const stats = statSync(join(this.dir, name));
        return {
          name,
          size: stats.size,
          created_at: stats.mtime.toISOString(),
        };
      })
      .sort((left, right) =>
        left.created_at < right.created_at ? 1 : -1,
      );
  }

  /**
   * Restaure une sauvegarde complète. Cette méthode est destinée au script
   * `backup:restore` exécuté pendant une fenêtre de maintenance.
   */
  async restoreInMaintenance(name: string): Promise<{ success: true }> {
    if (process.env.MAINTENANCE_MODE !== 'true') {
      throw new ForbiddenException(
        'La restauration exige MAINTENANCE_MODE=true',
      );
    }
    if (!basename(name).startsWith('backup-full-')) {
      throw new ForbiddenException(
        'Seule une sauvegarde complète peut restaurer la base',
      );
    }
    const encryptedPath = this.safePath(name);
    if (!existsSync(encryptedPath)) {
      throw new NotFoundException('Sauvegarde introuvable');
    }
    const temporarySql = join(
      this.dir,
      `.restore-${process.pid}-${Date.now()}.temporary.sql`,
    );
    const config = this.databaseConfig();
    try {
      await this.decryptFile(encryptedPath, temporarySql);
      await new Promise<void>((resolve, reject) => {
        const processHandle = spawn(
          this.resolveBinary('mysql'),
          [
            '-h',
            config.host,
            '-P',
            config.port,
            '-u',
            config.user,
            config.name,
          ],
          { env: { ...process.env, MYSQL_PWD: config.password } },
        );
        createReadStream(temporarySql).pipe(processHandle.stdin);
        let standardError = '';
        processHandle.stderr.on(
          'data',
          (data) => (standardError += data.toString()),
        );
        processHandle.on('error', reject);
        processHandle.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(standardError || `mysql a retourné ${code}`),
              ),
        );
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Échec de la restauration: ${error?.message ?? error}`,
      );
    } finally {
      if (existsSync(temporarySql)) unlinkSync(temporarySql);
    }
    this.logger.warn(`Base restaurée depuis ${name}`);
    return { success: true };
  }

  /** Vérifie l'authenticité sans modifier la base. */
  async verify(name: string): Promise<{ valid: true; bytes: number }> {
    this.ensureDirectory();
    const encryptedPath = this.safePath(name);
    if (!existsSync(encryptedPath)) {
      throw new NotFoundException('Sauvegarde introuvable');
    }
    const temporarySql = join(
      this.dir,
      `.verify-${process.pid}-${Date.now()}.temporary.sql`,
    );
    try {
      await this.decryptFile(encryptedPath, temporarySql);
      const stats = statSync(temporarySql);
      const descriptor = openSync(temporarySql, 'r');
      const sampleBuffer = Buffer.alloc(Math.min(stats.size, 64 * 1024));
      try {
        readSync(descriptor, sampleBuffer, 0, sampleBuffer.length, 0);
      } finally {
        closeSync(descriptor);
      }
      if (
        !/-- MySQL dump|CREATE TABLE|INSERT INTO/i.test(
          sampleBuffer.toString('utf8'),
        )
      ) {
        throw new BadRequestException(
          'Le contenu déchiffré ne ressemble pas à une sauvegarde SQL',
        );
      }
      return { valid: true, bytes: stats.size };
    } finally {
      if (existsSync(temporarySql)) unlinkSync(temporarySql);
    }
  }

  private databaseConfig() {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '3306',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      name: process.env.DB_NAME || 'core',
    };
  }

  private requiredTenantId(scope: BackupScope): number {
    const tenantId = Number(scope.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new BadRequestException('Cabinet de sauvegarde invalide');
    }
    return tenantId;
  }

  private ensureDirectory(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    }
  }

  private safePath(name: string): string {
    const safeName = basename(name);
    if (!/^[\w.-]+\.sql\.enc$/.test(safeName) || safeName !== name) {
      throw new BadRequestException('Nom de sauvegarde invalide');
    }
    return join(this.dir, safeName);
  }

  private encryptionKey(): Buffer {
    const raw = process.env.BACKUP_ENCRYPTION_KEY ?? '';
    const key = /^[a-f0-9]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'BACKUP_ENCRYPTION_KEY doit contenir 32 octets (hex ou base64)',
      );
    }
    return key;
  }

  private async tenantTables(): Promise<string[]> {
    const rows: Array<{ tableName: string }> = await this.dataSource.query(
      `SELECT TABLE_NAME AS tableName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'tenant_id'`,
      [this.databaseConfig().name],
    );
    return rows.map((row) => row.tableName).filter(Boolean);
  }

  private resolveBinary(binary: 'mysqldump' | 'mysql'): string {
    const configured =
      binary === 'mysqldump'
        ? process.env.MYSQLDUMP_PATH
        : process.env.MYSQL_PATH;
    if (configured) return configured;
    if (process.platform !== 'win32') return binary;
    const executable = `${binary}.exe`;
    const candidates = [
      `C:\\xampp\\mysql\\bin\\${executable}`,
      `C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\${executable}`,
    ];
    return candidates.find(existsSync) ?? executable;
  }

  private async encryptFile(input: string, output: string): Promise<void> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encryption = new Transform({
      transform(chunk, _encoding, callback) {
        try {
          callback(null, cipher.update(chunk));
        } catch (error) {
          callback(error as Error);
        }
      },
      flush(callback) {
        try {
          this.push(cipher.final());
          this.push(cipher.getAuthTag());
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    });
    const destination = createWriteStream(output, {
      flags: 'wx',
      mode: 0o600,
    });
    destination.write(Buffer.concat([MAGIC, iv]));
    await pipeline(createReadStream(input), encryption, destination);
  }

  private async decryptFile(input: string, output: string): Promise<void> {
    const size = statSync(input).size;
    const headerLength = MAGIC.length + IV_LENGTH;
    if (size <= headerLength + TAG_LENGTH) {
      throw new BadRequestException('Sauvegarde chiffrée invalide');
    }
    const descriptor = openSync(input, 'r');
    const header = Buffer.alloc(headerLength);
    const tag = Buffer.alloc(TAG_LENGTH);
    try {
      readSync(descriptor, header, 0, header.length, 0);
      readSync(descriptor, tag, 0, tag.length, size - TAG_LENGTH);
    } finally {
      closeSync(descriptor);
    }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BadRequestException('Format de sauvegarde inconnu');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      header.subarray(MAGIC.length),
    );
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(input, {
        start: headerLength,
        end: size - TAG_LENGTH - 1,
      }),
      decipher,
      createWriteStream(output, { flags: 'wx', mode: 0o600 }),
    );
  }
}

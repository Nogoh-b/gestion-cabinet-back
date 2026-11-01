import { createHash, randomUUID } from 'crypto';
import { constants, promises as fs } from 'fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
  sep,
} from 'path';
import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

interface LegacyAttachmentRow {
  id: number;
  tenant_id: number;
  filePath: string | null;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailPath: string | null;
  mimeType: string | null;
  messageId: number | null;
  conversationId: number | null;
  uploadedById: number | null;
  storage_key: string | null;
}

interface RollbackAttachmentRow {
  id: number;
  tenant_id: number;
  storage_key: string;
  original_name: string | null;
  fileName: string | null;
}

export class SecureChatAttachments1785169035000 implements MigrationInterface {
  name = 'SecureChatAttachments1785169035000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumns(queryRunner);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_attachment_migration_report (
        attachment_id INT NOT NULL PRIMARY KEY,
        tenant_id INT NOT NULL,
        legacy_path TEXT NULL,
        migration_status VARCHAR(32) NOT NULL,
        details TEXT NULL,
        migrated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB
    `);

    const rows = await queryRunner.query(`
      SELECT
        a.id,
        a.tenant_id,
        a.filePath,
        a.fileName,
        a.fileUrl,
        a.thumbnailPath,
        a.mimeType,
        a.messageId,
        m.conversationId,
        s.id AS uploadedById,
        a.storage_key
      FROM attachment a
      LEFT JOIN message m ON m.id = a.messageId AND m.tenant_id = a.tenant_id
      LEFT JOIN employee s ON s.id = m.senderId AND s.tenant_id = a.tenant_id
    `) as LegacyAttachmentRow[];

    const privateRoot = resolve(
      process.env.PRIVATE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'private'),
    );
    const legacyRoot = resolve(process.cwd(), 'uploads', 'docs');

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE attachment
         SET conversation_id = COALESCE(conversation_id, ?),
             uploaded_by_id = COALESCE(uploaded_by_id, ?),
             original_name = COALESCE(original_name, fileName),
             detected_mime = COALESCE(detected_mime, mimeType),
             fileUrl = NULL,
             thumbnailUrl = NULL
         WHERE id = ? AND tenant_id = ?`,
        [row.conversationId, row.uploadedById, row.id, row.tenant_id],
      );

      if (row.storage_key) {
        await this.removeLegacyCopy(row.filePath, legacyRoot);
        await this.record(queryRunner, row, 'ALREADY_MIGRATED', null);
        continue;
      }

      const source = this.resolveLegacyPath(row.filePath, legacyRoot);
      if (!source || !(await this.exists(source))) {
        await queryRunner.query(
          `UPDATE attachment
           SET security_status = 'MISSING'
           WHERE id = ? AND tenant_id = ?`,
          [row.id, row.tenant_id],
        );
        await this.record(
          queryRunner,
          row,
          'MISSING',
          'Fichier historique absent ou chemin hors du repertoire autorise',
        );
        continue;
      }

      const extension = /^\.[a-z0-9]{1,10}$/i.test(extname(source))
        ? extname(source).toLowerCase()
        : '';
      const storageKey =
        `tenants/${row.tenant_id}/chat/legacy/${row.id}-${randomUUID()}${extension}`;
      const target = resolve(privateRoot, storageKey);
      if (!target.startsWith(`${privateRoot}${sep}`)) {
        throw new Error('Cible de migration de pièce jointe invalide');
      }

      await fs.mkdir(dirname(target), { recursive: true });
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      const buffer = await fs.readFile(target);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      await queryRunner.query(
        `UPDATE attachment
         SET storage_key = ?,
             sha256 = ?,
             filePath = ?,
             fileSize = ?,
             original_name = COALESCE(original_name, ?),
             detected_mime = COALESCE(detected_mime, mimeType),
             fileUrl = NULL,
             thumbnailUrl = NULL
         WHERE id = ? AND tenant_id = ?`,
        [
          storageKey,
          sha256,
          storageKey,
          buffer.length,
          basename(row.fileName || source).slice(0, 255),
          row.id,
          row.tenant_id,
        ],
      );
      buffer.fill(0);
      await fs.rm(source, { force: true });
      await this.removeLegacyCopy(row.thumbnailPath, legacyRoot);
      await this.record(queryRunner, row, 'MIGRATED', null);
    }

    const table = await queryRunner.getTable('attachment');
    if (!table?.indices.some(index => index.name === 'IDX_attachment_tenant_conversation')) {
      await queryRunner.createIndex(
        'attachment',
        new TableIndex({
          name: 'IDX_attachment_tenant_conversation',
          columnNames: ['tenant_id', 'conversation_id'],
        }),
      );
    }
    if (!table?.indices.some(index => index.name === 'IDX_attachment_tenant_uploader')) {
      await queryRunner.createIndex(
        'attachment',
        new TableIndex({
          name: 'IDX_attachment_tenant_uploader',
          columnNames: ['tenant_id', 'uploaded_by_id'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const privateRoot = resolve(
      process.env.PRIVATE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'private'),
    );
    const legacyRoot = resolve(process.cwd(), 'uploads', 'docs');
    const rows = await queryRunner.query(`
      SELECT id, tenant_id, storage_key, original_name, fileName
      FROM attachment
      WHERE storage_key IS NOT NULL
    `) as RollbackAttachmentRow[];
    for (const row of rows) {
      if (
        isAbsolute(row.storage_key) ||
        row.storage_key.includes('\0')
      ) {
        throw new Error(`Clé privée invalide pour la pièce jointe ${row.id}`);
      }
      const source = resolve(privateRoot, row.storage_key);
      if (
        !source.startsWith(`${privateRoot}${sep}`) ||
        !(await this.exists(source))
      ) {
        throw new Error(
          `Rollback impossible : fichier privé absent pour la pièce jointe ${row.id}`,
        );
      }
      const safeName = basename(
        row.original_name || row.fileName || `attachment-${row.id}`,
      ).replace(/[\u0000-\u001f\u007f]/g, '');
      const target = resolve(
        legacyRoot,
        'chat-migration-rollback',
        String(row.tenant_id),
        `${row.id}-${randomUUID()}-${safeName}`,
      );
      if (!target.startsWith(`${legacyRoot}${sep}`)) {
        throw new Error('Cible de rollback de pièce jointe invalide');
      }
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      await queryRunner.query(
        `UPDATE attachment
         SET filePath = ?, fileUrl = NULL, thumbnailUrl = NULL
         WHERE id = ? AND tenant_id = ?`,
        [target, row.id, row.tenant_id],
      );
    }

    const table = await queryRunner.getTable('attachment');
    for (const indexName of [
      'IDX_attachment_tenant_conversation',
      'IDX_attachment_tenant_uploader',
    ]) {
      if (table?.indices.some(index => index.name === indexName)) {
        await queryRunner.dropIndex('attachment', indexName);
      }
    }

    for (const column of [
      'detected_mime',
      'security_status',
      'original_name',
      'sha256',
      'storage_key',
      'uploaded_by_id',
      'conversation_id',
    ]) {
      if (await queryRunner.hasColumn('attachment', column)) {
        await queryRunner.dropColumn('attachment', column);
      }
    }
    await queryRunner.dropTable('chat_attachment_migration_report', true);
  }

  private async addColumns(queryRunner: QueryRunner): Promise<void> {
    const definitions = [
      new TableColumn({ name: 'conversation_id', type: 'int', isNullable: true }),
      new TableColumn({ name: 'uploaded_by_id', type: 'int', isNullable: true }),
      new TableColumn({ name: 'storage_key', type: 'varchar', length: '512', isNullable: true }),
      new TableColumn({ name: 'sha256', type: 'char', length: '64', isNullable: true }),
      new TableColumn({ name: 'original_name', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'detected_mime', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({
        name: 'security_status',
        type: 'enum',
        enum: ['QUARANTINED', 'CLEAN', 'REJECTED', 'MISSING'],
        default: "'QUARANTINED'",
      }),
    ];
    for (const column of definitions) {
      if (!(await queryRunner.hasColumn('attachment', column.name))) {
        await queryRunner.addColumn('attachment', column);
      }
    }
  }

  private resolveLegacyPath(
    rawPath: string | null,
    legacyRoot: string,
  ): string | null {
    if (!rawPath || rawPath.includes('\0')) return null;
    const candidate = isAbsolute(rawPath)
      ? resolve(rawPath)
      : resolve(process.cwd(), rawPath);
    if (candidate === legacyRoot || candidate.startsWith(`${legacyRoot}${sep}`)) {
      return candidate;
    }
    return null;
  }

  private async removeLegacyCopy(
    rawPath: string | null,
    legacyRoot: string,
  ): Promise<void> {
    const candidate = this.resolveLegacyPath(rawPath, legacyRoot);
    if (candidate) await fs.rm(candidate, { force: true }).catch(() => undefined);
  }

  private async exists(path: string): Promise<boolean> {
    return fs.access(path).then(() => true).catch(() => false);
  }

  private async record(
    queryRunner: QueryRunner,
    row: LegacyAttachmentRow,
    status: string,
    details: string | null,
  ): Promise<void> {
    await queryRunner.query(
      `INSERT INTO chat_attachment_migration_report
         (attachment_id, tenant_id, legacy_path, migration_status, details)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         migration_status = VALUES(migration_status),
         details = VALUES(details),
         migrated_at = CURRENT_TIMESTAMP(6)`,
      [row.id, row.tenant_id, row.filePath, status, details],
    );
  }
}

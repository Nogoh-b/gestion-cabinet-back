import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, isAbsolute, join, resolve } from 'path';
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class VersionPrivateDocuments1785169012000
  implements MigrationInterface
{
  name = 'VersionPrivateDocuments1785169012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_versions (
        id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        document_id INT NOT NULL,
        version_number INT NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        detected_mime VARCHAR(150) NOT NULL,
        size_bytes BIGINT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        author_id INT NULL,
        status ENUM('QUARANTINED','PENDING_REVIEW','ACCEPTED','REFUSED','REVOKED')
          NOT NULL DEFAULT 'QUARANTINED',
        antivirus_status ENUM('PENDING','CLEAN','INFECTED','UNAVAILABLE','ERROR')
          NOT NULL DEFAULT 'PENDING',
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        decision_reason TEXT NULL,
        signature_value TEXT NULL,
        sealed_at DATETIME NULL,
        quarantine_reason TEXT NULL,
        legal_hold TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_document_version (tenant_id, document_id, version_number),
        KEY idx_document_hash (tenant_id, sha256),
        KEY idx_document_review (tenant_id, status, antivirus_status)
      ) ENGINE=InnoDB
    `);
    if (
      !(await queryRunner.hasColumn('document_customer', 'current_version_id'))
    ) {
      await queryRunner.addColumn(
        'document_customer',
        new TableColumn({
          name: 'current_version_id',
          type: 'char',
          length: '36',
          isNullable: true,
        }),
      );
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_migration_issues (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        document_id INT NOT NULL,
        issue_code VARCHAR(80) NOT NULL,
        details JSON NULL,
        resolved_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_document_migration_issue
          (tenant_id, document_id, issue_code)
      ) ENGINE=InnoDB
    `);

    const documents: Array<{
      id: number;
      tenant_id: number;
      dossier_id: number | null;
      name: string | null;
      file_path: string | null;
      file_url: string | null;
      file_mimetype: string | null;
      uploaded_by_id: number | null;
    }> = await queryRunner.query(`
      SELECT id, tenant_id, dossier_id, name, file_path, file_url,
             file_mimetype, uploaded_by_id
      FROM document_customer
      WHERE current_version_id IS NULL
    `);
    const storageRoot = resolve(
      process.env.PRIVATE_STORAGE_ROOT ??
        join(process.cwd(), 'storage', 'private'),
    );

    for (const document of documents) {
      const sourcePath = document.file_path
        ? isAbsolute(document.file_path)
          ? document.file_path
          : resolve(process.cwd(), document.file_path)
        : null;
      if (!sourcePath || !(await this.exists(sourcePath))) {
        await queryRunner.query(
          `INSERT IGNORE INTO document_migration_issues
           (tenant_id, document_id, issue_code, details)
           VALUES (?, ?, ?, ?)`,
          [
            document.tenant_id,
            document.id,
            document.file_url ? 'REMOTE_FILE_NOT_IMPORTED' : 'FILE_MISSING',
            JSON.stringify({
              filePath: document.file_path,
              fileUrl: document.file_url,
            }),
          ],
        );
        continue;
      }

      const buffer = await fs.readFile(sourcePath);
      const versionId = randomUUID();
      const storageKey = [
        document.tenant_id,
        document.dossier_id ?? 'unassigned',
        document.id,
        versionId,
      ].join('/');
      const targetPath = resolve(storageRoot, storageKey);
      await fs.mkdir(resolve(targetPath, '..'), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const originalName = (
        document.name ||
        basename(sourcePath) ||
        `document-${document.id}`
      ).slice(0, 255);
      await queryRunner.query(
        `INSERT INTO document_versions (
          id, tenant_id, document_id, version_number, storage_key,
          original_name, detected_mime, size_bytes, sha256, author_id,
          status, antivirus_status, quarantine_reason
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'QUARANTINED',
                  'UNAVAILABLE', ?)` ,
        [
          versionId,
          document.tenant_id,
          document.id,
          storageKey,
          originalName,
          document.file_mimetype || 'application/octet-stream',
          buffer.length,
          sha256,
          document.uploaded_by_id,
          'Reprise historique : analyse antivirus obligatoire avant revue',
        ],
      );
      await queryRunner.query(
        `UPDATE document_customer
         SET current_version_id = ?, version = 1, is_current_version = 1,
             status = 0, file_path = NULL, file_url = NULL,
             file_size = ?, file_mimetype = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          versionId,
          buffer.length,
          document.file_mimetype || 'application/octet-stream',
          document.id,
          document.tenant_id,
        ],
      );
      await queryRunner.query(
        `INSERT IGNORE INTO document_migration_issues
         (tenant_id, document_id, issue_code, details)
         VALUES (?, ?, 'ANTIVIRUS_RESCAN_REQUIRED', ?)`,
        [
          document.tenant_id,
          document.id,
          JSON.stringify({ versionId, sha256 }),
        ],
      );
    }

    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_document_version_immutable',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_document_version_protected_delete',
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_document_version_immutable
      BEFORE UPDATE ON document_versions
      FOR EACH ROW
      BEGIN
        IF NEW.document_id <> OLD.document_id
          OR NEW.version_number <> OLD.version_number
          OR NEW.storage_key <> OLD.storage_key
          OR NEW.original_name <> OLD.original_name
          OR NEW.detected_mime <> OLD.detected_mime
          OR NEW.size_bytes <> OLD.size_bytes
          OR NEW.sha256 <> OLD.sha256
          OR NOT (NEW.author_id <=> OLD.author_id)
        THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'document version binary metadata is immutable';
        END IF;
        IF OLD.status = 'ACCEPTED'
          AND NEW.status NOT IN ('ACCEPTED', 'REVOKED')
        THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'accepted document version can only be revoked';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_document_version_protected_delete
      BEFORE DELETE ON document_versions
      FOR EACH ROW
      BEGIN
        IF OLD.status IN ('ACCEPTED', 'REVOKED') OR OLD.legal_hold = 1 THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'protected document version cannot be deleted';
        END IF;
      END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_document_version_immutable',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_document_version_protected_delete',
    );
    if (
      await queryRunner.hasColumn('document_customer', 'current_version_id')
    ) {
      await queryRunner.dropColumn('document_customer', 'current_version_id');
    }
    await queryRunner.query('DROP TABLE IF EXISTS document_versions');
    await queryRunner.query('DROP TABLE IF EXISTS document_migration_issues');
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

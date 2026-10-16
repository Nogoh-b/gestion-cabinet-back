import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds configuration storage without changing any cabinet's reference values. */
export class ReferenceDataManagement1792300000000
  implements MigrationInterface
{
  async up(q: QueryRunner): Promise<void> {
    const existingFks: any[] =
      await q.query(`SELECT k.TABLE_NAME AS table_name,k.CONSTRAINT_NAME AS name,k.COLUMN_NAME AS column_name,
      k.REFERENCED_TABLE_NAME AS referenced_table,k.REFERENCED_COLUMN_NAME AS referenced_column,
      r.DELETE_RULE AS delete_rule,r.UPDATE_RULE AS update_rule
      FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
      WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IN ('user_role','permission')`);
    const quote = (name: string) => '`' + name.replace(/`/g, '``') + '`';
    for (const fk of existingFks)
      await q.query(
        'ALTER TABLE ' +
          quote(fk.table_name) +
          ' DROP FOREIGN KEY ' +
          quote(fk.name),
      );
    await q.query(
      'ALTER TABLE user_role MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT, MODIFY code VARCHAR(64) NOT NULL, MODIFY name VARCHAR(150) NOT NULL',
    );
    await q.query(
      'ALTER TABLE permission MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT',
    );
    const columns = new Set<string>();
    for (const fk of existingFks)
      columns.add(fk.table_name + '/' + fk.column_name);
    for (const pair of [
      'role_permission/role_id',
      'role_permission/permission_id',
      'user_role_assignment/role_id',
    ])
      columns.add(pair);
    for (const pair of columns) {
      const [table, column] = pair.split('/');
      if (await q.hasTable(table))
        await q.query(
          'ALTER TABLE ' +
            quote(table) +
            ' MODIFY ' +
            quote(column) +
            ' INT UNSIGNED NOT NULL',
        );
    }
    for (const fk of existingFks)
      await q.query(
        'ALTER TABLE ' +
          quote(fk.table_name) +
          ' ADD CONSTRAINT ' +
          quote(fk.name) +
          ' FOREIGN KEY (' +
          quote(fk.column_name) +
          ') REFERENCES ' +
          quote(fk.referenced_table) +
          ' (' +
          quote(fk.referenced_column) +
          ') ON DELETE ' +
          fk.delete_rule +
          ' ON UPDATE ' +
          fk.update_rule,
      );
    if (!(await q.hasColumn('user_role', 'base_role')))
      await q.query(
        "ALTER TABLE user_role ADD base_role VARCHAR(30) NOT NULL DEFAULT 'collaborateur'",
      );
    await q.query(
      "UPDATE user_role SET base_role=code WHERE code IN ('admin','avocat','collaborateur','comptable','secretaire','client','stagiaire','huissier','support','apporteur_affaire')",
    );
    await q.query(
      "ALTER TABLE user MODIFY role VARCHAR(64) NOT NULL DEFAULT 'avocat'",
    );
    if (!(await q.hasColumn('cabinets', 'reference_profile_id')))
      await q.query(
        'ALTER TABLE cabinets ADD reference_profile_id VARCHAR(36) NULL',
      );
    if (!(await q.hasColumn('cabinets', 'default_chat_group_name')))
      await q.query(
        "ALTER TABLE cabinets ADD default_chat_group_name VARCHAR(150) NOT NULL DEFAULT 'Cabinet - Tous les collaborateurs'",
      );
    const stamp =
      'created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)';
    const update =
      'updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    const definitions: Record<string, string> = {
      reference_profiles: `id VARCHAR(36) PRIMARY KEY,name VARCHAR(150) NOT NULL,description TEXT NULL,is_default TINYINT NOT NULL DEFAULT 0,is_active TINYINT NOT NULL DEFAULT 1,published_revision_id VARCHAR(36) NULL,draft_revision_id VARCHAR(36) NULL,${stamp},${update}`,
      reference_revisions: `id VARCHAR(36) PRIMARY KEY,profile_id VARCHAR(36) NOT NULL,number INT NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'draft',content LONGTEXT NOT NULL,lock_version INT NOT NULL DEFAULT 1,created_by INT NULL,published_by INT NULL,published_at DATETIME NULL,${stamp},UNIQUE KEY UQ_reference_revision(profile_id,number)`,
      reference_tenant_bindings: `cabinet_id INT PRIMARY KEY,profile_id VARCHAR(36) NOT NULL,revision_id VARCHAR(36) NOT NULL,currencies JSON NOT NULL,${update}`,
      reference_provenance: `id VARCHAR(36) PRIMARY KEY,cabinet_id INT NOT NULL,kind VARCHAR(60) NOT NULL,item_key VARCHAR(191) NOT NULL,local_id VARCHAR(64) NULL,revision_id VARCHAR(36) NOT NULL,applied JSON NOT NULL,${update},UNIQUE KEY UQ_reference_provenance(cabinet_id,kind,item_key)`,
      reference_deployments: `id VARCHAR(36) PRIMARY KEY,revision_id VARCHAR(36) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'preview',created_by INT NOT NULL,${stamp},${update}`,
      reference_deployment_targets: `id VARCHAR(36) PRIMARY KEY,deployment_id VARCHAR(36) NOT NULL,cabinet_id INT NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'preview',changes LONGTEXT NOT NULL,overrides JSON NOT NULL,error TEXT NULL,result JSON NULL,${update},UNIQUE KEY UQ_reference_target(deployment_id,cabinet_id),KEY IDX_reference_pending(status,updated_at)`,
      reference_ai_messages: `id VARCHAR(36) PRIMARY KEY,admin_id INT NOT NULL,profile_id VARCHAR(36) NOT NULL,role VARCHAR(20) NOT NULL,content TEXT NOT NULL,${stamp},KEY IDX_reference_ai(admin_id,profile_id)`,
      reference_ai_proposals: `id VARCHAR(36) PRIMARY KEY,admin_id INT NOT NULL,profile_id VARCHAR(36) NOT NULL,revision_id VARCHAR(36) NOT NULL,draft_version INT NOT NULL,explanation TEXT NOT NULL,items LONGTEXT NOT NULL,warnings JSON NOT NULL,accepted TINYINT NOT NULL DEFAULT 0,${stamp}`,
    };
    for (const [table, definition] of Object.entries(definitions))
      await q.query(
        'CREATE TABLE IF NOT EXISTS ' +
          quote(table) +
          ' (' +
          definition +
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      );
  }
  async down(): Promise<void> {
    throw new Error(
      'Migration de données conservatrice : restaurer la sauvegarde pour revenir aux rôles ENUM. Les profils et rôles personnalisés ne peuvent pas être supprimés automatiquement.',
    );
  }
}

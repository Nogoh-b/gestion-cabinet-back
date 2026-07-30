import 'dotenv/config';
import mysql from 'mysql2/promise';

const failures = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est obligatoire`);
  return value;
}

function parsePort(value) {
  const port = Number(value ?? 3306);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('DB_PORT est invalide');
  }
  return port;
}

function fail(label, total) {
  if (total > 0) failures.push(`${label}: ${total}`);
}

const database = required('DB_NAME');
if (
  !/^[A-Za-z0-9_]+$/.test(database) ||
  ['mysql', 'information_schema', 'performance_schema', 'sys'].includes(
    database.toLowerCase(),
  )
) {
  throw new Error('DB_NAME ne peut pas désigner une base système');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parsePort(process.env.DB_PORT),
  user: required('DB_USER'),
  password: process.env.DB_PASSWORD || '',
  database,
});

async function count(label, sql, parameters = []) {
  const [rows] = await connection.query(sql, parameters);
  const total = Number(rows[0]?.total ?? 0);
  fail(label, total);
  return total;
}

try {
  await count(
    'Dossiers sans ligne de rapprochement de cycle de vie',
    `SELECT COUNT(*) AS total
       FROM dossiers d
       LEFT JOIN dossier_lifecycle_migration_audit a
         ON a.dossier_id = d.id
      WHERE a.dossier_id IS NULL
         OR NOT (a.tenant_id <=> d.tenant_id)`,
  );
  await count(
    'Cycles de vie historiques en attente de validation',
    `SELECT COUNT(*) AS total
       FROM dossier_lifecycle_migration_audit
      WHERE review_status IN ('PENDING', 'REJECTED')`,
  );
  await count(
    'Dossiers brouillon avec instance procédurale',
    `SELECT COUNT(*) AS total
       FROM dossiers
      WHERE status = 'DRAFT'
        AND procedureInstanceId IS NOT NULL`,
  );
  await count(
    'Dossiers actifs sans instance procédurale fiable',
    `SELECT COUNT(*) AS total
       FROM dossiers d
       LEFT JOIN procedure_instances pi
         ON pi.id = d.procedureInstanceId
        AND pi.tenant_id = d.tenant_id
      WHERE d.status = 'ACTIVE'
        AND (
          d.procedureInstanceId IS NULL
          OR pi.id IS NULL
          OR pi.status = 'CANCELLED'
        )`,
  );
  await count(
    'Dossiers clos ou archivés avec instance non terminée',
    `SELECT COUNT(*) AS total
       FROM dossiers d
       LEFT JOIN procedure_instances pi
         ON pi.id = d.procedureInstanceId
        AND pi.tenant_id = d.tenant_id
       LEFT JOIN dossier_lifecycle_migration_audit a
         ON a.dossier_id = d.id
      WHERE d.status IN ('CLOSED', 'ARCHIVED')
        AND (pi.id IS NULL OR pi.status <> 'COMPLETED')
        AND NOT (
          a.review_status = 'VALIDATED'
          AND a.reviewed_by_id IS NOT NULL
          AND a.reviewed_at IS NOT NULL
          AND NULLIF(TRIM(a.review_note), '') IS NOT NULL
        )`,
  );
  await count(
    'Liens dossier-instance inter-cabinets ou orphelins',
    `SELECT COUNT(*) AS total
       FROM dossiers d
       LEFT JOIN procedure_instances pi ON pi.id = d.procedureInstanceId
      WHERE d.procedureInstanceId IS NOT NULL
        AND (pi.id IS NULL OR pi.tenant_id <> d.tenant_id)`,
  );

  await count(
    'Instances sans version exacte, snapshot ou empreinte cohérente',
    `SELECT COUNT(*) AS total
       FROM procedure_instances pi
       LEFT JOIN procedure_templates pt
         ON pt.id = pi.template_version_id
        AND pt.tenant_id = pi.tenant_id
      WHERE pt.id IS NULL
         OR pi.templateId <> pi.template_version_id
         OR pi.template_family_id <> pt.family_id
         OR pi.template_snapshot IS NULL
         OR pi.template_snapshot_hash IS NULL
         OR pi.template_snapshot_hash NOT REGEXP '^[0-9a-f]{64}$'
         OR pt.content_hash IS NULL
         OR pi.template_snapshot_hash <> pt.content_hash`,
  );
  await count(
    'Templates publiés sans empreinte',
    `SELECT COUNT(*) AS total
       FROM procedure_templates
      WHERE lifecycle_status = 'PUBLISHED'
        AND (
          content_hash IS NULL
          OR content_hash NOT REGEXP '^[0-9a-f]{64}$'
          OR published_at IS NULL
        )`,
  );
  await count(
    'Étapes courantes étrangères à la version de template',
    `SELECT COUNT(*) AS total
       FROM procedure_instances pi
       LEFT JOIN stages s
         ON s.id = pi.currentStageId
        AND s.templateId = pi.template_version_id
        AND s.tenant_id = pi.tenant_id
      WHERE pi.status = 'ACTIVE'
        AND s.id IS NULL`,
  );
  await count(
    'Instances actives sans exactement une visite active cohérente',
    `SELECT COUNT(*) AS total
       FROM procedure_instances pi
       LEFT JOIN (
         SELECT instanceId,
                COUNT(*) AS active_count,
                MAX(stageId) AS active_stage_id
           FROM stage_visits
          WHERE exitedAt IS NULL
          GROUP BY instanceId
       ) visits ON visits.instanceId = pi.id
      WHERE pi.status = 'ACTIVE'
        AND (
          COALESCE(visits.active_count, 0) <> 1
          OR visits.active_stage_id <> pi.currentStageId
        )`,
  );

  await count(
    'Documents sans version courante privée cohérente',
    `SELECT COUNT(*) AS total
       FROM document_customer d
       LEFT JOIN document_versions v
         ON v.id = d.current_version_id
        AND v.document_id = d.id
        AND v.tenant_id = d.tenant_id
      WHERE d.deleted_at IS NULL
        AND (
          d.current_version_id IS NULL
          OR v.id IS NULL
          OR v.storage_key IS NULL
          OR v.sha256 NOT REGEXP '^[0-9a-f]{64}$'
        )`,
  );
  await count(
    'Documents conservant un chemin ou une URL historique',
    `SELECT COUNT(*) AS total
       FROM document_customer
      WHERE file_path IS NOT NULL
         OR file_url IS NOT NULL`,
  );
  await count(
    'Anomalies documentaires non résolues',
    `SELECT COUNT(*) AS total
       FROM document_migration_issues
      WHERE resolved_at IS NULL`,
  );

  await count(
    'Anomalies procédurales non résolues',
    `SELECT COUNT(*) AS total
       FROM procedure_repair_issues
      WHERE status IN ('OPEN', 'REVIEWED')`,
  );
  await count(
    'Justificatifs fournisseurs à reprendre',
    `SELECT COUNT(*) AS total
       FROM supplier_evidence_migration_issues
      WHERE resolution_status = 'PENDING'`,
  );
  await count(
    'Commissions apporteur à rapprocher',
    `SELECT COUNT(*) AS total
       FROM referral_commission_migration_issues
      WHERE resolution_status = 'PENDING'`,
  );
  await count(
    'Pièces de chat à reprendre',
    `SELECT COUNT(*) AS total
       FROM chat_attachment_migration_report
      WHERE resolution_status = 'PENDING'`,
  );

  for (const table of ['supplier_invoice', 'expense_line']) {
    await count(
      `Métadonnées de justificatif incomplètes dans ${table}`,
      `SELECT COUNT(*) AS total
         FROM ${table}
        WHERE (
          attachment_url IS NULL
          AND (
            attachment_original_name IS NOT NULL
            OR attachment_mime_type IS NOT NULL
            OR attachment_size IS NOT NULL
            OR attachment_sha256 IS NOT NULL
          )
        ) OR (
          attachment_url IS NOT NULL
          AND (
            attachment_original_name IS NULL
            OR attachment_mime_type IS NULL
            OR attachment_size IS NULL
            OR attachment_sha256 IS NULL
            OR attachment_sha256 NOT REGEXP '^[0-9a-f]{64}$'
          )
        )`,
    );
  }

  if (failures.length) {
    throw new Error(
      `Certification des données migrées en échec:\n- ${failures.join('\n- ')}`,
    );
  }
  console.log(
    'Données migrées certifiées : cycles dossier, instances, templates, visites, documents et reprises sans anomalie bloquante.',
  );
} finally {
  await connection.end();
}

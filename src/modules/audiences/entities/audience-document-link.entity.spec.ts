import { beforeAll, describe, expect, it } from '@jest/globals';
import { join } from 'path';
import { DataSource, EntityMetadata } from 'typeorm';
import { Audience } from './audience.entity';
import { AudienceDocumentLink } from './audience-document-link.entity';

/**
 * `audience_documents.phase` disparaissait à chaque script lancé en
 * `synchronize:true` (seed…) : la jointure `Audience.documents` ne la
 * connaissait pas. Ces tests vérifient, sans base, que seule
 * AudienceDocumentLink synchronise la table et qu'elle reproduit la jointure.
 */
describe('audience_documents (jointure Audience.documents + phase)', () => {
  let dataSource: DataSource;
  let junction: EntityMetadata;
  let link: EntityMetadata;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mariadb',
      host: 'localhost',
      username: 'metadata-only',
      database: 'metadata-only',
      entities: [join(__dirname, '..', '..', '..', '**', '*.entity.{ts,js}')],
    });
    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    junction = dataSource
      .getMetadata(Audience)
      .findRelationWithPropertyPath('documents')!.junctionEntityMetadata!;
    link = dataSource.getMetadata(AudienceDocumentLink);
  }, 60_000);

  it('ne laisse que AudienceDocumentLink synchroniser la table', () => {
    expect(junction.tableName).toBe('audience_documents');
    expect(junction.synchronize).toBe(false);

    const synchronized = dataSource.entityMetadatas.filter(
      (meta) => meta.tableName === 'audience_documents' && meta.synchronize,
    );
    expect(synchronized).toEqual([link]);
  });

  it('déclare la colonne phase', () => {
    const phase = link.findColumnWithDatabaseName('phase');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('varchar');
    expect(phase!.length).toBe('20');
    expect(phase!.default).toBe('preparation');
    expect(phase!.isNullable).toBe(false);
  });

  it('reprend clés, index et clés étrangères de la jointure', () => {
    const names = (meta: EntityMetadata) => ({
      primary: meta.primaryColumns.map((c) => c.databaseName).sort(),
      indices: meta.indices.map((i) => i.name).sort(),
      foreignKeys: meta.foreignKeys
        .map((fk) => `${fk.name}:${fk.onDelete}:${fk.onUpdate}`)
        .sort(),
    });
    expect(names(link)).toEqual(names(junction));
  });
});

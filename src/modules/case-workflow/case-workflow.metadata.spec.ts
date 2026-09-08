import { describe, expect, it } from '@jest/globals';
import { join } from 'path';
import { DataSource } from 'typeorm';

describe('case-workflow MariaDB metadata', () => {
  it('construit toutes les métadonnées TypeORM sans type Object implicite', async () => {
    const dataSource = new DataSource({
      type: 'mariadb',
      host: 'localhost',
      username: 'metadata-only',
      database: 'metadata-only',
      entities: [join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
    });

    await expect(
      (
        dataSource as unknown as { buildMetadatas(): Promise<void> }
      ).buildMetadatas(),
    ).resolves.toBeUndefined();
  }, 60_000);
});

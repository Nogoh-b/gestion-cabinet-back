import {
  BeforeInsert,
  Column,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseWriteHandler } from './base-write-handler';

enum TestStatus {
  SCHEDULED = 0,
  HELD = 1,
}

@Entity('lenient_test_rows')
class LenientTestRow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'varchar', length: 30 })
  slug_label: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'date', nullable: true })
  due_date: string;

  @Column({ type: 'enum', enum: TestStatus, default: TestStatus.SCHEDULED })
  status: TestStatus;

  @Column({ type: 'boolean', default: false })
  urgent: boolean;

  @BeforeInsert()
  fillSlug() {
    if (!this.slug_label && this.title)
      this.slug_label = this.title.slice(0, 30);
  }
}

describe('BaseWriteHandler — saisie tolérante', () => {
  let handler: BaseWriteHandler;

  beforeAll(async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      database: 'lenient_test',
      entities: [LenientTestRow],
    });
    // Métadonnées seules : aucune connexion à la base.
    await (dataSource as any).buildMetadatas();
    const schemaMetadata = {
      getColumnMetadataMap: () => undefined,
      getBusinessLabel: (_t: string, c: string) => c,
      getTableLabel: () => 'Ligne de test',
      formatTechnicalName: (c: string) => c,
    };
    handler = new BaseWriteHandler(
      'lenient_test_rows',
      dataSource,
      schemaMetadata as any,
      {} as any,
    );
  });

  it('convertit les valeurs « humaines » vers le type des colonnes', () => {
    const { fields, notes } = (handler as any).coerceFieldValues(
      {
        title: '  Relance  ',
        amount: '1 500 000 FCFA',
        due_date: '15/06/2026',
        status: 'held',
        urgent: 'oui',
      },
      'INSERT',
    );

    expect(fields).toEqual({
      title: 'Relance',
      amount: 1500000,
      due_date: '2026-06-15',
      status: TestStatus.HELD,
      urgent: true,
    });
    expect(notes).toEqual([]);
  });

  it('ignore une valeur inexploitable et le signale au lieu d’échouer', () => {
    const { fields, notes } = (handler as any).coerceFieldValues(
      { title: 'Relance', status: 'peut-être', amount: '' },
      'UPDATE',
    );

    expect(fields).toEqual({ title: 'Relance' });
    expect(notes).toEqual([
      'status ignoré(e) : valeur « peut-être » non reconnue',
    ]);
  });

  it('n’exige pas une colonne remplie par un hook @BeforeInsert', async () => {
    const result = await handler.validateFields({ title: 'Relance' }, 'INSERT');

    expect(result.valid).toBe(true);
  });

  it('présente au planificateur les mêmes champs obligatoires que la validation', async () => {
    const schema = await handler.getWriteableFieldsSchema();
    const required = Object.fromEntries(
      schema.map((f) => [f.name, f.required]),
    );

    // urgent a un défaut « false » : il était marqué obligatoire à tort.
    expect(required).toMatchObject({
      title: true,
      amount: false,
      status: false,
      urgent: false,
    });
  });

  it('exige toujours une colonne obligatoire sans valeur par défaut', async () => {
    const result = await handler.validateFields({ amount: 10 }, 'INSERT');

    expect(result.valid).toBe(false);
    // Sans titre, le hook ne peut pas non plus remplir slug_label.
    expect(result.errors).toEqual([
      expect.stringContaining('(title) est requis'),
      expect.stringContaining('(slug_label) est requis'),
    ]);
  });
});

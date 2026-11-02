import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { Dossier } from './dossier.entity';

describe('Dossier — cycle administratif indépendant', () => {
  it('ne déclare aucune colonne de phase procédurale', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === Dossier)
      .map((column) => String(column.propertyName).toLowerCase());

    expect(columns).not.toEqual(
      expect.arrayContaining([
        'phase',
        'procedurephase',
        'proceduralphase',
        'procedural_phase',
        'phase_procedurale',
        'client_decision',
        'recommendation',
        'analysis_date',
        'analysis_notes',
        'key_dates',
        'next_steps',
      ]),
    );
  });

  it("n'expose aucun ancien modèle Step en parallèle du template", () => {
    const relations = getMetadataArgsStorage()
      .relations.filter((relation) => relation.target === Dossier)
      .map((relation) => String(relation.propertyName).toLowerCase());

    expect(relations).not.toContain('steps');
    expect(relations).not.toContain('legacysteps');
  });

  it('limite le statut du dossier aux quatre états administratifs', () => {
    expect(Object.values(DossierStatus).sort()).toEqual(
      ['ACTIVE', 'ARCHIVED', 'CLOSED', 'DRAFT'].sort(),
    );
  });

  it("ne déplace jamais l'instance lors d'un changement de cycle de vie", () => {
    const dossier = new Dossier();
    dossier.status = DossierStatus.DRAFT;
    dossier.procedureInstance = {
      id: 'instance-1',
      currentStageId: 'stage-template-1',
    } as any;

    dossier.change_status(DossierStatus.ACTIVE);

    expect(dossier.status).toBe(DossierStatus.ACTIVE);
    expect(dossier.procedureInstance.currentStageId).toBe('stage-template-1');
  });
});

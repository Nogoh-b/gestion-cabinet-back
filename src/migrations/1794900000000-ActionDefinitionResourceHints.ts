import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Catalogue d'actions : `case_action_definitions.resource_hints` — fiches liées
 * à créer ou à mettre à jour en fin d'action (audience, document, diligence,
 * dossier). NULL = conseils par défaut du catalogue (resource-hints.ts).
 */
export class ActionDefinitionResourceHints1794900000000
  implements MigrationInterface
{
  name = 'ActionDefinitionResourceHints1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'case_action_definitions',
        'resource_hints',
      ))
    ) {
      await queryRunner.addColumn(
        'case_action_definitions',
        new TableColumn({
          name: 'resource_hints',
          type: 'json',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn('case_action_definitions', 'resource_hints')
    ) {
      await queryRunner.dropColumn('case_action_definitions', 'resource_hints');
    }
  }
}

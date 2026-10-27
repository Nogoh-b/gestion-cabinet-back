import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pose les liaisons « champ d'action → champ d'audience » sur le catalogue
 * déjà déployé chez les cabinets existants.
 *
 * `ActionCatalogService.ensureDefaults()` ne met jamais à jour une définition
 * qui existe déjà : il ne crée que ce qui manque. Les liaisons ajoutées aux
 * valeurs par défaut ne profiteraient donc qu'aux nouveaux cabinets sans cette
 * migration.
 *
 * Deux garde-fous, pour ne jamais écraser le travail d'un cabinet :
 *  - la définition doit être restée en version 1, sans aucune version
 *    ultérieure (une révision signifie que le cabinet a pris la main) ;
 *  - la liaison visée ne doit pas déjà exister.
 *
 * Aucune relation obligatoire n'est imposée : une liaison sans audience liée
 * est un no-op silencieux côté service, donc la migration ne peut pas bloquer
 * la clôture d'actions en cours.
 */
export class SeedAudienceFieldBindings1789500000000
  implements MigrationInterface
{
  name = 'SeedAudienceFieldBindings1789500000000';

  /** Définitions laissées telles quelles par le cabinet (v1 sans révision). */
  private static readonly UNTOUCHED_V1 = `
    LEFT JOIN (
      SELECT \`tenant_id\`, \`code\`
      FROM \`case_action_definitions\`
      WHERE \`version\` > 1
      GROUP BY \`tenant_id\`, \`code\`
    ) \`revised\`
      ON \`revised\`.\`tenant_id\` = \`d\`.\`tenant_id\`
     AND \`revised\`.\`code\` = \`d\`.\`code\`
  `;

  /** Schéma posé sur « Traiter le report d'audience », qui n'avait aucun champ. */
  private static readonly POSTPONED_SCHEMA = JSON.stringify({
    type: 'object',
    properties: {
      confirmed_room: {
        type: 'string',
        multiline: false,
        label: 'Salle confirmée',
        binding: { entity: 'audience', field: 'room' },
      },
      confirmed_judge: {
        type: 'string',
        multiline: false,
        label: 'Magistrat confirmé',
        binding: { entity: 'audience', field: 'judge_name' },
      },
    },
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rapport d'audience : rend explicite la liaison jusqu'ici codée en dur.
    await this.bindExistingProperty(
      queryRunner,
      'WRITE_HEARING_REPORT',
      'report_content',
      'report_content',
    );

    // 2. Assister à l'audience : le résultat consigné alimente la décision.
    //    `decision` est un texte long, contrairement à `outcome` plafonné à
    //    100 caractères qui refuserait un compte rendu un peu détaillé.
    await this.bindExistingProperty(
      queryRunner,
      'ATTEND_HEARING',
      'hearingOutcome',
      'decision',
    );

    // 3. Traiter le report : la définition livrée n'a aucun champ. On ne la
    //    remplit que si elle est restée vide, pour ne rien écraser.
    await queryRunner.query(
      `UPDATE \`case_action_definitions\` \`d\`
       ${SeedAudienceFieldBindings1789500000000.UNTOUCHED_V1}
       SET \`d\`.\`specific_fields_schema\` = ?
       WHERE \`d\`.\`code\` = 'PROCESS_POSTPONED_HEARING'
         AND \`d\`.\`version\` = 1
         AND \`revised\`.\`tenant_id\` IS NULL
         AND (
           \`d\`.\`specific_fields_schema\` IS NULL
           OR JSON_EXTRACT(\`d\`.\`specific_fields_schema\`, '$.properties') IS NULL
           OR JSON_LENGTH(JSON_EXTRACT(\`d\`.\`specific_fields_schema\`, '$.properties')) = 0
         )`,
      [SeedAudienceFieldBindings1789500000000.POSTPONED_SCHEMA],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.unbindProperty(
      queryRunner,
      'WRITE_HEARING_REPORT',
      'report_content',
      'report_content',
    );
    await this.unbindProperty(
      queryRunner,
      'ATTEND_HEARING',
      'hearingOutcome',
      'decision',
    );

    // Ne remet à vide que le schéma exactement tel que posé par `up()`.
    await queryRunner.query(
      `UPDATE \`case_action_definitions\` \`d\`
       ${SeedAudienceFieldBindings1789500000000.UNTOUCHED_V1}
       SET \`d\`.\`specific_fields_schema\` = '{"type":"object","properties":{}}'
       WHERE \`d\`.\`code\` = 'PROCESS_POSTPONED_HEARING'
         AND \`d\`.\`version\` = 1
         AND \`revised\`.\`tenant_id\` IS NULL
         AND JSON_CONTAINS(\`d\`.\`specific_fields_schema\`, ?)
         AND JSON_CONTAINS(?, \`d\`.\`specific_fields_schema\`)`,
      [
        SeedAudienceFieldBindings1789500000000.POSTPONED_SCHEMA,
        SeedAudienceFieldBindings1789500000000.POSTPONED_SCHEMA,
      ],
    );
  }

  /** Ajoute `properties.<source>.binding` si la propriété existe et n'est pas déjà liée. */
  private bindExistingProperty(
    queryRunner: QueryRunner,
    definitionCode: string,
    sourceKey: string,
    audienceField: string,
  ): Promise<unknown> {
    return queryRunner.query(
      `UPDATE \`case_action_definitions\` \`d\`
       ${SeedAudienceFieldBindings1789500000000.UNTOUCHED_V1}
       SET \`d\`.\`specific_fields_schema\` = JSON_SET(
         \`d\`.\`specific_fields_schema\`,
         '$.properties.${sourceKey}.binding',
         JSON_OBJECT('entity', 'audience', 'field', ?)
       )
       WHERE \`d\`.\`code\` = ?
         AND \`d\`.\`version\` = 1
         AND \`revised\`.\`tenant_id\` IS NULL
         AND JSON_EXTRACT(\`d\`.\`specific_fields_schema\`, '$.properties.${sourceKey}') IS NOT NULL
         AND JSON_EXTRACT(\`d\`.\`specific_fields_schema\`, '$.properties.${sourceKey}.binding') IS NULL`,
      [audienceField, definitionCode],
    );
  }

  /** Retire la liaison, uniquement si elle vise bien la colonne posée par `up()`. */
  private unbindProperty(
    queryRunner: QueryRunner,
    definitionCode: string,
    sourceKey: string,
    audienceField: string,
  ): Promise<unknown> {
    return queryRunner.query(
      `UPDATE \`case_action_definitions\` \`d\`
       ${SeedAudienceFieldBindings1789500000000.UNTOUCHED_V1}
       SET \`d\`.\`specific_fields_schema\` = JSON_REMOVE(
         \`d\`.\`specific_fields_schema\`,
         '$.properties.${sourceKey}.binding'
       )
       WHERE \`d\`.\`code\` = ?
         AND \`d\`.\`version\` = 1
         AND \`revised\`.\`tenant_id\` IS NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(
               \`d\`.\`specific_fields_schema\`,
               '$.properties.${sourceKey}.binding.field'
             )) = ?`,
      [definitionCode, audienceField],
    );
  }
}

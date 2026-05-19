import { DataSource } from 'typeorm';
import { ProcedureType } from '../src/modules/procedures/entities/procedure.entity';

async function addTrafficOffenses() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '',
    database: 'core_banking_mendo_2025_07',
    entities: [ProcedureType],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('✅ Connecté à la base de données');

  const repo = dataSource.getRepository(ProcedureType);

  // Récupérer le parent "Procédure Pénale"
  const criminalParent = await repo.findOne({ where: { code: 'CRIMINAL' } });
  if (!criminalParent) {
    console.error('❌ Type parent CRIMINAL introuvable');
    await dataSource.destroy();
    return;
  }
  console.log(`✅ Parent trouvé: ${criminalParent.name} (ID: ${criminalParent.id})`);

  // Vérifier si "Infractions routières" existe déjà
  const existing = await repo.findOne({ where: { code: 'TRAFFIC_OFFENSES' } });
  if (existing) {
    console.log(`⏩ "Infractions routières" existe déjà (ID: ${existing.id})`);
    await dataSource.destroy();
    return;
  }

  // Créer le sous-type
  const subtype = new ProcedureType();
  subtype.name = 'Infractions routières';
  subtype.code = 'TRAFFIC_OFFENSES';
  subtype.description = 'Contentieux lié aux infractions au code de la route (excès de vitesse, défaut de permis, alcoolémie, accidents)';
  subtype.required_documents = ['procès_verbal', 'permis_conduire', 'carte_grise', 'certificat_médical'];
  subtype.average_duration = 60;
  subtype.specific_jurisdictions = ['Tribunal de Police', 'Tribunal Correctionnel'];
  subtype.is_active = true;
  subtype.is_subtype = true;
  subtype.hierarchy_level = 2;
  subtype.parent_id = criminalParent.id;

  const saved = await repo.save(subtype);
  console.log(`✅ Sous-type créé: ${saved.name} (${saved.code}) — ID: ${saved.id}`);

  await dataSource.destroy();
  console.log('✅ Terminé');
}

addTrafficOffenses().catch((err) => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});

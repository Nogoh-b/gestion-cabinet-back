// location.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import * as fs from 'fs';
import * as path from 'path';

import { Country } from '../country/entities/country.entity';
import { Region } from '../region/entities/region.entity';
import { Division } from '../divivion/entities/divivion.entity';
import { District } from '../district/entities/district.entity';
import { LocationCity } from '../location_city/entities/location_city.entity';

export default class LocationSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const countryRepository = dataSource.getRepository(Country);
    const regionRepository = dataSource.getRepository(Region);
    const divisionRepository = dataSource.getRepository(Division);
    const districtRepository = dataSource.getRepository(District);
    const locationCityRepository = dataSource.getRepository(LocationCity);

    // Lecture du fichier JSON
    const jsonDataPath = path.join(process.cwd(), 'cameroun-geography.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonDataPath, 'utf8'));
    const countryData = jsonData.country;

    // Vérifier si les données existent déjà
    const existingCountry = await countryRepository.findOne({
      where: { code: countryData.code },
      relations: ['regions', 'regions.divisions', 'regions.divisions.districts', 'regions.divisions.districts.location_cities']
    });

    if (existingCountry) {
      console.log('⚠️ Les données géographiques existent déjà. Supprimez-les d\'abord  ou utilisez --refresh.');
      console.log(`   Pays: ${existingCountry.name} (${existingCountry.code})`);
      console.log(`   Nombre de régions: ${existingCountry.regions?.length || 0}`);
      return;
    }

    console.log('🚀 Début du seeding des données géographiques...');

    // 1. Création du pays
    const country = countryRepository.create({
      name: countryData.name,
      code: countryData.code,
      population: countryData.population
    });
    await countryRepository.save(country);
    console.log(`✅ Pays créé: ${country.name}`);

    // 2. Parcours des régions
    for (const regionData of countryData.regions) {
      const region = regionRepository.create({
        name: regionData.name,
        code: regionData.code,
        population: regionData.population,
        country: country
      });
      await regionRepository.save(region);
      console.log(`  ✅ Région créée: ${region.name}`);

      // 3. Parcours des divisions
      for (const divisionData of regionData.divisions) {
        const division = divisionRepository.create({
          name: divisionData.name,
          code: divisionData.code,
          population: divisionData.population,
          status: divisionData.status || 1,
          region: region
        });
        await divisionRepository.save(division);
        console.log(`    ✅ Division créée: ${division.name}`);

        // 4. Parcours des districts
        for (const districtData of divisionData.districts) {
          const district = districtRepository.create({
            name: districtData.name,
            code: districtData.code,
            population: districtData.population,
            division: division
          });
          await districtRepository.save(district);
          console.log(`      ✅ District créé: ${district.name}`);

          // 5. Parcours des location_cities
          if (districtData.location_cities && districtData.location_cities.length > 0) {
            for (const cityData of districtData.location_cities) {
              const city = locationCityRepository.create({
                name: cityData.name,
                code: cityData.code,
                population: cityData.population,
                district: district
              });
              await locationCityRepository.save(city);
            }
            console.log(`        ✅ ${districtData.location_cities.length} villes/quartiers créés pour ${district.name}`);
          }
        }
      }
    }

    console.log('🎉 Seeding des données géographiques terminé avec succès !');
    
    // Affichage du récapitulatif
    const totalRegions = await regionRepository.count();
    const totalDivisions = await divisionRepository.count();
    const totalDistricts = await districtRepository.count();
    const totalCities = await locationCityRepository.count();
    
    console.log('\n📊 Récapitulatif:');
    console.log(`   - Pays: 1`);
    console.log(`   - Régions: ${totalRegions}`);
    console.log(`   - Divisions: ${totalDivisions}`);
    console.log(`   - Districts: ${totalDistricts}`);
    console.log(`   - Villes/Quartiers: ${totalCities}`);
  }
}
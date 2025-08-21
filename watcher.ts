#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import chokidar from 'chokidar';


// Chemin vers vos entités et votre data-source
const ENTITIES_GLOB = 'src/**/*.entity.{ts,js}';
const DATA_SOURCE   = 'src/dataSource.ts';

const watcher = chokidar.watch(ENTITIES_GLOB, {
  ignoreInitial: true,
});

watcher.on('all', (event, path) => {
  console.log(`\n[watcher] ${event} détecté sur ${path}. Génération migration…`);
  // Nom de migration basé sur le timestamp
  const name = `Auto${Date.now()}`;
  // On appelle le CLI TypeORM via npm
  const cmd  = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [
    'run', 'typeorm',
    '--', 'migration:generate',
    '-d', DATA_SOURCE,
    '-n', name,
  ];
  
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('exit', code => {
    if (code === 0) {
      console.log(`[watcher] Migration ${name} générée avec succès.`);
    } else {
      console.error(`[watcher] Échec génération migration (code ${code}).`);
    }
  });
});

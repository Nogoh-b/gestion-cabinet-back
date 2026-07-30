import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackupService } from '../src/modules/backup/backup.service';

async function main(): Promise<void> {
  const [command, name] = process.argv.slice(2);
  if (!['create', 'verify', 'restore'].includes(command)) {
    throw new Error(
      'Usage: backup-maintenance <create|verify|restore> [fichier]',
    );
  }
  if (command !== 'create' && !name) {
    throw new Error('Le nom du fichier chiffré est obligatoire');
  }

  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = context.get(BackupService);
    const result =
      command === 'create'
        ? await service.create({ full: true })
        : command === 'verify'
          ? await service.verify(name)
          : await service.restoreInMaintenance(name);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});

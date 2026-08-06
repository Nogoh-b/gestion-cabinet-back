import 'dotenv/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAGIC = Buffer.from('KABYBK1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(root, 'backups');
const targetDirectory =
  process.env.BACKUP_DIR || join(root, 'backups-private');
const removePlaintext = process.argv.includes('--remove-plaintext');

function encryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY ?? '';
  const key = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY doit contenir 32 octets (hex ou base64)',
    );
  }
  return key;
}

const key = encryptionKey();
await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
const sourceFiles = (await readdir(sourceDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();

for (const name of sourceFiles) {
  const sourcePath = join(sourceDirectory, name);
  const targetPath = join(targetDirectory, `${name}.enc`);
  const plaintext = await readFile(sourcePath);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const encrypted = Buffer.concat([
    MAGIC,
    iv,
    ciphertext,
    cipher.getAuthTag(),
  ]);
  await writeFile(targetPath, encrypted, { flag: 'wx', mode: 0o600 });

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(encrypted.subarray(encrypted.length - TAG_LENGTH));
  const verified = Buffer.concat([
    decipher.update(
      encrypted.subarray(MAGIC.length + IV_LENGTH, -TAG_LENGTH),
    ),
    decipher.final(),
  ]);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  if (digest(verified) !== digest(plaintext)) {
    await unlink(targetPath);
    throw new Error(`Vérification cryptographique en échec pour ${name}`);
  }
  if (removePlaintext) await unlink(sourcePath);
  console.log(`${name} : copie chiffrée vérifiée`);
}

console.log(
  `${sourceFiles.length} sauvegarde(s) convertie(s)${
    removePlaintext ? ', sources en clair retirées' : ''
  }.`,
);

import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { dataSource } from 'src/data-source';
import { assertStrongPassword } from 'src/modules/platform/common/platform-crypto';

/**
 * Crée (ou promeut) un compte Propriétaire de l'espace plateforme.
 *
 * Usage : npm run platform:create-owner
 *   Variables optionnelles (mode non interactif, ex. CI) :
 *   PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_NAME, PLATFORM_OWNER_PASSWORD
 *
 * Aucun identifiant n'est codé en dur. Les comptes suivants s'invitent
 * depuis l'interface (/platform/administrateurs).
 */
function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  if (hidden) {
    // Masque la saisie du mot de passe.
    (rl as any)._writeToOutput = (text: string) => {
      if (text.includes(question)) process.stdout.write(text);
      else process.stdout.write('*');
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    }),
  );
}

async function ask() {
  const email =
    process.env.PLATFORM_OWNER_EMAIL || (await prompt('Email du Propriétaire : '));
  const full_name =
    process.env.PLATFORM_OWNER_NAME || (await prompt('Nom complet : '));
  const password =
    process.env.PLATFORM_OWNER_PASSWORD ||
    (await prompt('Mot de passe (12+ car., maj/min/chiffre/spécial) : ', true));
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email invalide');
  if (full_name.length < 2) throw new Error('Nom requis');
  return { email, full_name, password };
}

async function run() {
  const answers = await ask();
  const error = assertStrongPassword(answers.password);
  if (error) throw new Error(error);

  await dataSource.initialize();
  try {
    const email = answers.email.trim().toLowerCase();
    const hash = await bcrypt.hash(answers.password, 12);
    const existing: Array<{ id: number }> = await dataSource.query(
      'SELECT id FROM platform_admins WHERE LOWER(email) = ? LIMIT 1',
      [email],
    );
    if (existing.length) {
      await dataSource.query(
        `UPDATE platform_admins
            SET full_name = ?, password = ?, role = 'owner', status = 'active',
                failed_attempts = 0, locked_until = NULL,
                token_version = token_version + 1
          WHERE id = ?`,
        [answers.full_name.trim(), hash, existing[0].id],
      );
      console.log(`✅ Compte existant promu Propriétaire : ${email}`);
    } else {
      await dataSource.query(
        `INSERT INTO platform_admins (email, full_name, password, role, status)
         VALUES (?, ?, ?, 'owner', 'active')`,
        [email, answers.full_name.trim(), hash],
      );
      console.log(`✅ Propriétaire créé : ${email}`);
    }
    console.log('   Connexion : <front>/platform/login (code OTP envoyé par email).');
  } finally {
    await dataSource.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Création du Propriétaire en échec :', err?.message ?? err);
    process.exit(1);
  });

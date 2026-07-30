import {
  decryptSmtpConfig,
  encryptSmtpConfig,
} from './smtp-config.crypto';

describe('SMTP configuration encryption', () => {
  const key = 'a'.repeat(64);
  const otherKey = 'b'.repeat(64);

  it('chiffre et dechiffre sans exposer le secret dans enveloppe', () => {
    const encrypted = encryptSmtpConfig({
      host: 'smtp.example.com',
      port: 465,
      pass: 'mot-de-passe-tres-secret',
    }, key);

    expect(encrypted).not.toContain('mot-de-passe-tres-secret');
    expect(decryptSmtpConfig(encrypted, key)).toEqual({
      host: 'smtp.example.com',
      port: 465,
      pass: 'mot-de-passe-tres-secret',
    });
  });

  it('echoue avec une autre cle', () => {
    const encrypted = encryptSmtpConfig({ pass: 'secret' }, key);
    expect(() => decryptSmtpConfig(encrypted, otherKey)).toThrow(
      /impossible a dechiffrer/i,
    );
  });

  it('detecte une enveloppe alteree', () => {
    const encrypted = JSON.parse(
      encryptSmtpConfig({ pass: 'secret' }, key),
    );
    encrypted.ciphertext = `${encrypted.ciphertext.slice(0, -2)}AA`;
    expect(() => decryptSmtpConfig(JSON.stringify(encrypted), key)).toThrow(
      /impossible a dechiffrer/i,
    );
  });
});

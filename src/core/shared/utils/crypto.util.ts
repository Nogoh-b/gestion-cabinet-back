import * as crypto from 'crypto';

export class CryptoUtil {
  static encrypt(data: string, public_key: string): string {
    return crypto.publicEncrypt(public_key, Buffer.from(data)).toString('base64');
  }

  static decrypt(encryptedData: string, private_key: string): string {
    return crypto.privateDecrypt(
      { key: private_key, passphrase: '' },
      Buffer.from(encryptedData, 'base64'),
    ).toString();
  }
}
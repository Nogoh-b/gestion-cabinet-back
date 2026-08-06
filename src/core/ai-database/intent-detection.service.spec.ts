import { describe, it, expect, jest } from '@jest/globals';
import { IntentDetectionService } from './intent-detection.service';

describe('IntentDetectionService local classifier', () => {
  const service = new IntentDetectionService({
    getAllHandlers: jest.fn(() => []),
    generateGlobalWriteSchema: jest.fn(async () => ''),
  } as any);

  it('detects help before write for dossier procedure questions', () => {
    expect(service.classifyLocal('je veux creer un dossier comment faire ?')).toBe('HELP');
  });

  it('detects help for client procedure questions', () => {
    expect(service.classifyLocal('comment creer un client ?')).toBe('HELP');
  });

  it('detects advice requests outside database search', () => {
    expect(service.classifyLocal("que peut tu me conseiller d'ajjouter encore ?")).toBe('ADVICE');
  });

  it('detects recommendation requests as advice', () => {
    expect(service.classifyLocal('quelles suggestions peux-tu me proposer ?')).toBe('ADVICE');
  });

  it('detects obvious write without LLM', () => {
    expect(service.classifyLocal('Crée un nouveau dossier pour Jean')).toBe('WRITE');
  });

  it('detects audience creation on a referenced dossier as write', () => {
    expect(
      service.classifyLocal('#DOS1-202606-0001 ajoute une audience preliminaire pour le lundi 20 juillet a 15 h'),
    ).toBe('WRITE');
  });

  it('detects obvious read without LLM', () => {
    expect(service.classifyLocal('Liste les dossiers ouverts')).toBe('READ');
  });

  it('detects simple chat without LLM', () => {
    expect(service.classifyLocal('Bonjour')).toBe('CHAT');
  });
});

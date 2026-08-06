import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AiModelRouterService } from './ai-model-router.service';

describe('AiModelRouterService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses configurable model names per profile', () => {
    process.env.AI_FAST_MODEL = 'fast-model';
    process.env.AI_QUALITY_MODEL = 'quality-model';
    process.env.AI_STREAM_MODEL = 'stream-model';

    const service = new AiModelRouterService();

    expect(service.getModelName('fast')).toBe('fast-model');
    expect(service.getModelName('quality')).toBe('quality-model');
    expect(service.getModelName('streaming')).toBe('stream-model');
  });

  it('uses DeepSeek for fast and quality profiles, and GLM for streaming by default', () => {
    delete process.env.AI_MODEL;
    delete process.env.AI_FAST_MODEL;
    delete process.env.AI_QUALITY_MODEL;
    delete process.env.AI_STREAM_MODEL;

    const service = new AiModelRouterService();

    expect(service.getModelName('fast')).toBe('deepseek-v4-flash');
    expect(service.getModelName('quality')).toBe('deepseek-v4-pro');
    expect(service.getModelName('streaming')).toBe('GLM-5.2');
  });
});

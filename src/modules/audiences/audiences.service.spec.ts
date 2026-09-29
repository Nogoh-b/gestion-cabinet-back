import { beforeEach, describe, expect, it } from '@jest/globals';
import { AudiencesService } from './audiences.service';

describe('AudiencesService', () => {
  let service: AudiencesService;

  beforeEach(() => {
    service = Object.create(AudiencesService.prototype) as AudiencesService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

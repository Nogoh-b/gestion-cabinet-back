import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import {
  applyDefaultCabinetLogo,
  applyLogoInput,
  deleteLogoFile,
  logoFileToUrl,
} from './cabinet-logo.util';
import type { Cabinet } from './entities/cabinet.entity';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('Cabisoft cabinet branding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (existsSync as jest.Mock).mockReturnValue(false);
  });

  it('assigns an optimized PNG and a public file before the cabinet has an id', () => {
    const cabinet = {} as Cabinet;
    applyDefaultCabinetLogo(cabinet);

    expect(cabinet.logo_mime).toBe('image/png');
    expect(cabinet.logo_file).toBe('cabinets/cabisoft-default.png');
    const png = cabinet.logo!;
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(png.length).toBeLessThan(12_000);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/cabinets[\\/]cabisoft-default\.png$/),
      png,
    );
    expect(logoFileToUrl(cabinet.logo_file)).toMatch(/\/uploads\/cabinets\/cabisoft-default\.png$/);
  });

  it('does not overwrite a supplied custom logo', () => {
    const custom = Buffer.from('custom-logo');
    const cabinet = { logo: custom, logo_mime: 'image/webp' } as Cabinet;
    applyDefaultCabinetLogo(cabinet);
    expect(cabinet.logo).toBe(custom);
    expect(cabinet.logo_mime).toBe('image/webp');
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('reuses the shared default for multiple new cabinets', () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    const first = {} as Cabinet;
    const second = {} as Cabinet;
    applyDefaultCabinetLogo(first);
    applyDefaultCabinetLogo(second);
    expect(first.logo_file).toBe(second.logo_file);
    expect(first.logo).toEqual(second.logo);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('preserves the shared default when one cabinet uploads a custom logo', () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    const cabinet = { id: 42 } as Cabinet;
    applyDefaultCabinetLogo(cabinet);
    applyLogoInput(cabinet, 'data:image/png;base64,Y3VzdG9t');
    expect(cabinet.logo_file).toMatch(/^cabinets\/logo-42-\d+\.png$/);
    expect(cabinet.logo).toEqual(Buffer.from('custom'));
    expect(unlinkSync).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('preserves the shared file when the default logo is removed', () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    const cabinet = {} as Cabinet;
    applyDefaultCabinetLogo(cabinet);
    applyLogoInput(cabinet, null);
    expect(cabinet.logo).toBeNull();
    expect(cabinet.logo_file).toBeNull();
    deleteLogoFile('cabinets\\cabisoft-default.png');
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});

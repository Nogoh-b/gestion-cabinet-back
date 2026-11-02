import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.isFile() && entry.name.endsWith('.controller.ts')
      ? [path]
      : [];
  });
}

describe('Couverture des permissions déclarées', () => {
  it('active PermissionsGuard au niveau de chaque contrôleur qui déclare des permissions', () => {
    const missing = controllerFiles(join(process.cwd(), 'src'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        if (!source.includes('RequirePermissions')) return false;
        const classIndex = source.indexOf('export class');
        if (classIndex < 0) return true;
        const decorators = source.slice(
          Math.max(0, classIndex - 2_000),
          classIndex,
        );
        return !/@UseGuards\s*\([^)]*\bPermissionsGuard\b[^)]*\)/s.test(
          decorators,
        );
      })
      .map((path) => path.replace(process.cwd(), ''));

    expect(missing).toEqual([]);
  });
});

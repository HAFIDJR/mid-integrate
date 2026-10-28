import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the TypeScript project layout.
 *
 * TypeScript only auto-discovers a file named `tsconfig.json`, and tsserver checks a
 * file against the *nearest* one walking up from the file's directory. If the web
 * project (which sets `types: ["vite/client"]`) were the nearest config for server
 * code, editors would report `node:fs/promises` as missing even though the CLI build
 * is fine. These assertions keep server/, tests/ and src/ routed to a project with
 * the right ambient types.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface TsConfig {
  dir: string;
  compilerOptions: Record<string, unknown>;
  include: string[];
  /** Directory the `include` globs are relative to (the config that declared them). */
  includeBase: string;
}

function readConfigFile(file: string, seen = new Set<string>()): TsConfig {
  if (seen.has(file)) throw new Error(`circular extends: ${file}`);
  seen.add(file);
  const dir = path.dirname(file);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    extends?: string;
    compilerOptions?: Record<string, unknown>;
    include?: string[];
  };

  let base: TsConfig | null = null;
  if (raw.extends) {
    const target = path.resolve(dir, raw.extends);
    base = readConfigFile(target.endsWith('.json') ? target : `${target}.json`, seen);
  }

  return {
    dir,
    compilerOptions: { ...(base?.compilerOptions ?? {}), ...(raw.compilerOptions ?? {}) },
    // `include` paths are resolved relative to the config file that declares them.
    include: raw.include ?? base?.include ?? [],
    includeBase: raw.include ? dir : (base?.includeBase ?? dir),
  };
}

function nearestConfigFile(file: string): string {
  let dir = path.dirname(file);
  for (;;) {
    try {
      const candidate = path.join(dir, 'tsconfig.json');
      readFileSync(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`no tsconfig.json above ${file}`);
      dir = parent;
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function covers(config: TsConfig, file: string): boolean {
  const relative = path.relative(config.includeBase, file).split(path.sep).join('/');
  return config.include.some(
    (pattern) => globToRegExp(pattern).test(relative) || relative.startsWith(`${pattern}/`),
  );
}

function projectFor(relativeFile: string) {
  const file = path.join(root, relativeFile);
  const configFile = nearestConfigFile(file);
  const config = readConfigFile(configFile);
  return {
    configFile: path.relative(root, configFile).split(path.sep).join('/'),
    covered: covers(config, file),
    types: (config.compilerOptions.types as string[] | undefined) ?? null,
  };
}

describe('TypeScript project layout', () => {
  it('checks browser code with the Vite types only', () => {
    const project = projectFor('src/App.tsx');
    expect(project.configFile).toBe('tsconfig.json');
    expect(project.covered).toBe(true);
    expect(project.types).toContain('vite/client');
    expect(project.types).not.toContain('node');
  });

  it('checks server code with the Node types', () => {
    const project = projectFor('server/app.ts');
    expect(project.configFile).toBe('server/tsconfig.json');
    expect(project.covered).toBe(true);
    expect(project.types).toContain('node');
  });

  it('checks the test suite with both Node and Vite types', () => {
    const project = projectFor('tests/server/api.test.ts');
    expect(project.configFile).toBe('tests/tsconfig.json');
    expect(project.covered).toBe(true);
    expect(project.types).toContain('node');
    expect(project.types).toContain('vite/client');
  });

  it('checks the Vite config files with the web project', () => {
    for (const file of ['vite.config.ts', 'vitest.config.ts']) {
      const project = projectFor(file);
      expect(project.configFile, file).toBe('tsconfig.json');
      expect(project.covered, file).toBe(true);
    }
  });

  it('references only config files that exist', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const referenced = Object.values(pkg.scripts)
      .join(' ')
      .match(/tsconfig[\w.-]*\.json/g);
    expect(referenced?.length).toBeGreaterThan(0);
    for (const file of new Set(referenced ?? [])) {
      expect(() => readFileSync(path.join(root, file)), file).not.toThrow();
    }
  });
});

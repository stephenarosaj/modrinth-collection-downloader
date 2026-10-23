import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

async function lintSnippet(code: string, relativeFilePath: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const results = await eslint.lintText(code, {
    filePath: path.join(repoRoot, relativeFilePath),
  });
  return results[0]?.messages ?? [];
}

describe('Architectural boundary rules (§5.1)', () => {
  it('allows valid imports across layers', async () => {
    const coreMessages = await lintSnippet(
      "import type { Archive } from '../ports';\nexport type CoreArchive = Archive;\n",
      'src/core/valid.ts',
    );
    expect(coreMessages).toHaveLength(0);

    const uiMessages = await lintSnippet(
      "import { CORE_SCHEMA_VERSION } from '../core';\nexport const v = CORE_SCHEMA_VERSION;\n",
      'src/ui/valid.ts',
    );
    expect(uiMessages).toHaveLength(0);
  });

  it('rejects core importing from adapters, ui, or app (boundaries/element-types)', async () => {
    const messages = await lintSnippet(
      "import type { Archive } from '../adapters';\nexport type Bad = Archive;\n",
      'src/core/bad-adapter-import.ts',
    );
    expect(messages.some((m) => m.ruleId === 'boundaries/element-types')).toBe(true);
  });

  it('rejects core importing react or using fetch/window/document', async () => {
    const reactMessages = await lintSnippet(
      "import { useState } from 'react';\nexport const x = useState;\n",
      'src/core/bad-react.ts',
    );
    expect(reactMessages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);

    const domMessages = await lintSnippet(
      'export const w = window.location.href;\nexport const f = fetch;\n',
      'src/core/bad-globals.ts',
    );
    expect(domMessages.some((m) => m.ruleId === 'no-restricted-globals')).toBe(true);
  });

  it('rejects ui importing from adapters or app (boundaries/element-types)', async () => {
    const adapterMessages = await lintSnippet(
      "import type { Archive } from '../adapters';\nexport type BadUi = Archive;\n",
      'src/ui/bad-adapter-import.tsx',
    );
    expect(adapterMessages.some((m) => m.ruleId === 'boundaries/element-types')).toBe(true);

    const appMessages = await lintSnippet(
      "import { APP_NAME } from '../app/config';\nexport const bad = APP_NAME;\n",
      'src/ui/bad-app-import.tsx',
    );
    expect(appMessages.some((m) => m.ruleId === 'boundaries/element-types')).toBe(true);
  });
});

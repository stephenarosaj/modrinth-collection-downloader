import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateInstanceSchema } from '../../src/core/serialize';
import type { Instance } from '../../src/core/model';
import schemaJson from '../../schema/instance.schema.json';

interface JsonSchemaNode {
  $ref?: string;
  type?: 'object' | 'array' | 'string' | 'integer' | 'boolean' | 'null';
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  oneOf?: readonly JsonSchemaNode[];
  minLength?: number;
  minimum?: number;
  format?: string;
}

const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursive JSON Schema Draft 2020-12 evaluator over `schema/instance.schema.json`.
 */
export function validateAgainstJsonSchema(
  data: unknown,
  rootSchema: typeof schemaJson,
): { valid: boolean; errors: string[] } {
  const defs = rootSchema.$defs as Record<string, JsonSchemaNode>;
  const errors: string[] = [];

  function resolveRef(ref: string): JsonSchemaNode {
    const prefix = '#/$defs/';
    if (!ref.startsWith(prefix)) {
      throw new Error(`Unsupported $ref: ${ref}`);
    }
    const defName = ref.slice(prefix.length);
    const target = defs[defName];
    if (!target) {
      throw new Error(`Unresolved $ref: ${ref}`);
    }
    return target;
  }

  function evaluate(value: unknown, rawNode: JsonSchemaNode, path: string): string[] {
    const node = rawNode.$ref ? resolveRef(rawNode.$ref) : rawNode;
    const nodeErrors: string[] = [];

    if (node.oneOf) {
      let matchCount = 0;
      const branchErrors: string[][] = [];
      for (const branch of node.oneOf) {
        const errs = evaluate(value, branch, path);
        if (errs.length === 0) {
          matchCount += 1;
        } else {
          branchErrors.push(errs);
        }
      }
      if (matchCount !== 1) {
        nodeErrors.push(
          `${path}: failed oneOf (matched ${matchCount} branches; ${branchErrors.map((b) => b.join('; ')).join(' | ')})`,
        );
      }
      return nodeErrors;
    }

    if (node.const !== undefined && value !== node.const) {
      nodeErrors.push(`${path}: expected const ${ JSON.stringify(node.const) }, got ${ JSON.stringify(value) }`);
    }

    if (node.enum && !node.enum.includes(value)) {
      nodeErrors.push(`${path}: value ${ JSON.stringify(value) } not in enum [${node.enum.join(', ')}]`);
    }

    if (node.type) {
      switch (node.type) {
        case 'object': {
          if (!isPlainObject(value)) {
            nodeErrors.push(`${path}: expected object`);
            return nodeErrors;
          }
          if (node.required) {
            for (const reqKey of node.required) {
              if (!(reqKey in value) || value[reqKey] === undefined) {
                nodeErrors.push(`${path}: missing required property "${reqKey}"`);
              }
            }
          }
          const props = node.properties ?? {};
          if (node.additionalProperties === false) {
            for (const key of Object.keys(value)) {
              if (value[key] === undefined && !(node.required ?? []).includes(key)) {
                continue;
              }
              if (!(key in props)) {
                nodeErrors.push(`${path}: unexpected additional property "${key}"`);
              }
            }
          }
          for (const [propKey, propSchema] of Object.entries(props)) {
            if (propKey in value && value[propKey] !== undefined) {
              nodeErrors.push(...evaluate(value[propKey], propSchema, `${path}.${propKey}`));
            }
          }
          break;
        }
        case 'array': {
          if (!Array.isArray(value)) {
            nodeErrors.push(`${path}: expected array`);
            return nodeErrors;
          }
          if (node.items) {
            const itemSchema = node.items;
            value.forEach((item, index) => {
              nodeErrors.push(...evaluate(item, itemSchema, `${path}[${index}]`));
            });
          }
          break;
        }
        case 'string': {
          if (typeof value !== 'string') {
            nodeErrors.push(`${path}: expected string`);
            return nodeErrors;
          }
          if (node.minLength !== undefined && value.length < node.minLength) {
            nodeErrors.push(`${path}: string shorter than minLength ${node.minLength}`);
          }
          if (
            node.format === 'date-time' &&
            (!ISO_DATE_TIME_RE.test(value) || Number.isNaN(Date.parse(value)))
          ) {
            nodeErrors.push(`${path}: invalid date-time format`);
          }
          break;
        }
        case 'integer': {
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            nodeErrors.push(`${path}: expected integer`);
            return nodeErrors;
          }
          if (node.minimum !== undefined && value < node.minimum) {
            nodeErrors.push(`${path}: integer below minimum ${node.minimum}`);
          }
          break;
        }
        case 'boolean': {
          if (typeof value !== 'boolean') {
            nodeErrors.push(`${path}: expected boolean`);
          }
          break;
        }
        case 'null': {
          if (value !== null) {
            nodeErrors.push(`${path}: expected null`);
          }
          break;
        }
      }
    }

    return nodeErrors;
  }

  errors.push(...evaluate(data, rootSchema as unknown as JsonSchemaNode, '$'));
  return { valid: errors.length === 0, errors };
}

function createSampleInstance(): Instance {
  return {
    schemaVersion: 1,
    meta: {
      name: 'Fabric Optimization Pack',
      source: {
        collectionId: 'YV97U1kk',
        url: 'https://modrinth.com/collection/YV97U1kk',
      },
      target: {
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
      },
      createdAt: '2025-02-15T10:30:00.000Z',
    },
    entries: [
      {
        project: {
          id: 'AANobbMI',
          slug: 'sodium',
          title: 'Sodium',
          type: 'mod',
          modrinthUrl: 'https://modrinth.com/project/sodium',
        },
        origin: 'collection',
        environments: {
          client: {
            support: 'required',
            candidates: [
              {
                id: 'ver-sodium-1',
                versionNumber: '0.5.8+mc1.20.1',
                versionType: 'release',
                publishedAt: '2024-02-01T00:00:00.000Z',
                gameVersions: ['1.20.1'],
                platforms: ['fabric', 'quilt'],
                file: {
                  filename: 'sodium-fabric-0.5.8+mc1.20.1.jar',
                  url: 'https://cdn.modrinth.com/data/AANobbMI/versions/ver-sodium-1/sodium.jar',
                  size: 983040,
                  sha1: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
                  sha512: 'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2',
                },
                dependencies: [
                  {
                    projectId: 'P7dR8mSH',
                    versionId: 'ver-fapi-1',
                    type: 'required',
                  },
                ],
              },
            ],
            version: {
              id: 'ver-sodium-1',
              versionNumber: '0.5.8+mc1.20.1',
              versionType: 'release',
              publishedAt: '2024-02-01T00:00:00.000Z',
              gameVersions: ['1.20.1'],
              platforms: ['fabric', 'quilt'],
              file: {
                filename: 'sodium-fabric-0.5.8+mc1.20.1.jar',
                url: 'https://cdn.modrinth.com/data/AANobbMI/versions/ver-sodium-1/sodium.jar',
                size: 983040,
                sha1: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
                sha512: 'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2',
              },
              dependencies: [
                {
                  projectId: 'P7dR8mSH',
                  versionId: 'ver-fapi-1',
                  type: 'required',
                },
              ],
            },
            resolution: 'latest-compatible',
            dependencies: ['P7dR8mSH'],
            requiredBy: [],
            selection: {
              on: true,
              source: 'user',
            },
          },
          server: {
            support: 'unsupported',
            candidates: [],
            version: null,
            resolution: 'none',
            dependencies: [],
            requiredBy: [],
            selection: {
              on: false,
              source: 'none',
            },
          },
        },
      },
    ],
  };
}

describe('serialize, deserialize, and JSON Schema validation (§6.1, §8.2, §10)', () => {
  it('round-trips a valid Instance through serialize and deserialize losslessly', () => {
    const original = createSampleInstance();
    const json = serialize(original);
    const restored = deserialize(json);

    expect(restored).toEqual(original);
    expect(serialize(restored)).toBe(json);
  });

  it('produces deterministic, identical JSON regardless of input property insertion order', () => {
    const a = createSampleInstance();
    const b = {
      entries: a.entries,
      meta: {
        createdAt: a.meta.createdAt,
        target: {
          releasePreference: a.meta.target.releasePreference,
          platform: a.meta.target.platform,
          gameVersion: a.meta.target.gameVersion,
        },
        source: {
          url: a.meta.source.url,
          collectionId: a.meta.source.collectionId,
        },
        name: a.meta.name,
      },
      schemaVersion: 1 as const,
    };

    expect(serialize(b)).toBe(serialize(a));
  });

  it('throws a clear error when deserializing an unknown future schemaVersion (§8.2)', () => {
    const raw = JSON.parse(serialize(createSampleInstance())) as Record<string, unknown>;
    raw.schemaVersion = 2;

    expect(() => deserialize(JSON.stringify(raw))).toThrow(/schemaVersion/i);
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/2/);
  });

  it('throws a clear error on malformed JSON input', () => {
    expect(() => deserialize('{ invalid json')).toThrow(/Invalid JSON/i);
  });

  it('stays synchronized with schema/instance.schema.json definitions and validates full serialized instances against the JSON Schema', () => {
    expect(schemaJson.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schemaJson.properties.schemaVersion.const).toBe(1);
    expect(schemaJson.required).toEqual(['schemaVersion', 'meta', 'entries']);
    expect(schemaJson.$defs.Support.enum).toEqual([
      'required',
      'optional',
      'unsupported',
      'unknown',
    ]);
    expect(schemaJson.$defs.Resolution.enum).toEqual([
      'pinned',
      'latest-compatible',
      'game-version-fallback',
      'user',
      'none',
    ]);

    const baseInstance = createSampleInstance();
    const firstEntry = baseInstance.entries[0]!;
    const baseVersion = firstEntry.environments.client.version!;

    const comprehensiveInstance: Instance = {
      ...baseInstance,
      entries: [
        firstEntry,
        {
          project: {
            id: 'P7dR8mSH',
            slug: 'fabric-api',
            title: 'Fabric API',
            type: 'mod',
            modrinthUrl: 'https://modrinth.com/mod/fabric-api',
          },
          origin: 'dependency',
          environments: {
            client: {
              support: 'optional',
              candidates: [
                {
                  ...baseVersion,
                  id: 'ver-fapi-1',
                  versionNumber: '0.92.0+1.20.1',
                  versionType: 'beta',
                  dependencies: [
                    {
                      projectId: 'indium',
                      type: 'optional',
                    },
                  ],
                },
              ],
              version: {
                ...baseVersion,
                id: 'ver-fapi-1',
                versionNumber: '0.92.0+1.20.1',
                versionType: 'beta',
                dependencies: [
                  {
                    projectId: 'indium',
                    type: 'optional',
                  },
                ],
              },
              resolution: 'pinned',
              dependencies: [],
              requiredBy: ['AANobbMI'],
              selection: {
                on: true,
                source: 'auto',
              },
            },
            server: {
              support: 'unknown',
              candidates: [
                {
                  ...baseVersion,
                  id: 'ver-fapi-fallback',
                  versionType: 'alpha',
                  dependencies: [],
                },
              ],
              version: {
                ...baseVersion,
                id: 'ver-fapi-fallback',
                versionType: 'alpha',
                dependencies: [],
              },
              resolution: 'game-version-fallback',
              dependencies: [],
              requiredBy: [],
              selection: {
                on: true,
                source: 'user',
              },
            },
          },
        },
        {
          project: {
            id: 'shader-pack-1',
            slug: 'complementary',
            title: 'Complementary Shaders',
            type: 'shader',
            modrinthUrl: 'https://modrinth.com/shader/complementary',
          },
          origin: 'collection',
          environments: {
            client: {
              support: 'required',
              candidates: [baseVersion],
              version: baseVersion,
              resolution: 'user',
              dependencies: [],
              requiredBy: [],
              selection: {
                on: false,
                source: 'user',
              },
            },
            server: {
              support: 'unsupported',
              candidates: [],
              version: null,
              resolution: 'none',
              dependencies: [],
              requiredBy: [],
              selection: {
                on: false,
                source: 'none',
              },
            },
          },
        },
      ],
    };

    for (const sample of [baseInstance, comprehensiveInstance]) {
      const parsed: unknown = JSON.parse(serialize(sample));
      expect(validateInstanceSchema(parsed)).toEqual({ valid: true, errors: [] });
      expect(validateAgainstJsonSchema(parsed, schemaJson)).toEqual({ valid: true, errors: [] });
    }
  });

  describe('validateInstanceSchema & deserialize — negative cases', () => {
    it.each<{
      description: string;
      mutate: (draft: Record<string, unknown>) => void;
      expectedErrorSubstring: string;
    }>([
      {
        description: 'rejects derived status field on entry (status is never stored)',
        mutate: (d) => {
          const entries = d.entries as Record<string, unknown>[];
          entries[0]!.status = { kind: 'ok', reasons: [] };
        },
        expectedErrorSubstring: 'unexpected additional property "status"',
      },
      {
        description: 'rejects derived status field on environment state',
        mutate: (d) => {
          const entries = d.entries as { environments: { client: Record<string, unknown> } }[];
          entries[0]!.environments.client.status = { kind: 'ok', reasons: [] };
        },
        expectedErrorSubstring: 'unexpected additional property "status"',
      },
      {
        description: 'rejects invalid releasePreference enum',
        mutate: (d) => {
          (d.meta as { target: Record<string, unknown> }).target.releasePreference = 'beta-only';
        },
        expectedErrorSubstring: '$.meta.target.releasePreference',
      },
      {
        description: 'rejects non-ISO-8601 createdAt timestamp',
        mutate: (d) => {
          (d.meta as Record<string, unknown>).createdAt = 'not-a-date';
        },
        expectedErrorSubstring: '$.meta.createdAt',
      },
      {
        description: 'rejects invalid project.type enum',
        mutate: (d) => {
          const entries = d.entries as { project: Record<string, unknown> }[];
          entries[0]!.project.type = 'unknown-type';
        },
        expectedErrorSubstring: '$.entries[0].project.type',
      },
      {
        description: 'rejects negative file size',
        mutate: (d) => {
          const entries = d.entries as {
            environments: { client: { version: { file: Record<string, unknown> } } };
          }[];
          entries[0]!.environments.client.version.file.size = -5;
        },
        expectedErrorSubstring: '$.entries[0].environments.client.version.file.size',
      },
      {
        description: 'rejects invalid selection.source enum',
        mutate: (d) => {
          const entries = d.entries as {
            environments: { client: { selection: Record<string, unknown> } };
          }[];
          entries[0]!.environments.client.selection.source = 'manual';
        },
        expectedErrorSubstring: '$.entries[0].environments.client.selection.source',
      },
      {
        description: 'rejects missing server environment',
        mutate: (d) => {
          const entries = d.entries as { environments: Record<string, unknown> }[];
          delete entries[0]!.environments.server;
        },
        expectedErrorSubstring: 'missing required property "server"',
      },
    ])('$description', ({ mutate, expectedErrorSubstring }) => {
      const draft = JSON.parse(serialize(createSampleInstance())) as Record<string, unknown>;
      mutate(draft);

      const result = validateInstanceSchema(draft);
      expect(result.valid).toBe(false);
      expect(result.errors.join('\n')).toContain(expectedErrorSubstring);

      const jsonSchemaResult = validateAgainstJsonSchema(draft, schemaJson);
      expect(jsonSchemaResult.valid).toBe(false);
      expect(jsonSchemaResult.errors.join('\n')).toContain(expectedErrorSubstring);

      expect(() => deserialize(JSON.stringify(draft))).toThrow();
    });
  });
});

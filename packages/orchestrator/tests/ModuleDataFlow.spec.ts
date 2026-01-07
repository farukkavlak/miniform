/* eslint-disable camelcase */
// Import plan to spy on it
import { plan } from '@miniform/planner';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Orchestrator } from '../src/index';

// Mock fs and path
vi.mock('node:fs');
vi.mock('node:path');

// Mock StateManager
const readMock = vi.fn().mockResolvedValue({ resources: {}, variables: {}, version: 1 });
// eslint-disable-next-line unicorn/no-useless-undefined
const writeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@miniform/state', () => {
  const StateManager = vi.fn((backend) => ({
    read: readMock,
    write: writeMock,
    backend,
  }));
  const LocalBackend = vi.fn(() => ({}));
  return { StateManager, LocalBackend };
});

// Mock Planner
vi.mock('@miniform/planner', () => ({
  plan: vi.fn(() => []), // Return empty actions function
}));

describe('Orchestrator - Phase 4: Data Flow', () => {
  let orchestrator: Orchestrator;
  let mockProvider: {
    resources: string[];
    validate: Mock;
    create: Mock;
    read: Mock;
    update: Mock;
    delete: Mock;
    getSchema: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      resources: ['test_resource'],
      validate: vi.fn(),
      create: vi.fn().mockResolvedValue('created-id'),
      read: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getSchema: vi.fn().mockReturnValue({}),
    };

    const { StateManager, LocalBackend } = require('@miniform/state');
    const backend = new LocalBackend();
    const stateManager = new StateManager(backend);
    orchestrator = new Orchestrator(stateManager);
    orchestrator.registerProvider(mockProvider);

    // Mock path.resolve
    (path.resolve as Mock).mockImplementation((...args: string[]) => args.join('/'));
    (path.join as Mock).mockImplementation((...args: string[]) => args.join('/'));

    // Ensure plan returns empty array by default
    (plan as Mock).mockReturnValue([]);
  });

  it('should use default variable value in root scope', async () => {
    // Variable defined in root with default
    const config = `
            variable "region" {
                default = "us-east-1"
            }
            resource "test_resource" "res" {
                region = "\${var.region}"
            }
        `;

    // Mock Plan to return action
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'res',
        modulePath: [],
        attributes: { region: { type: 'Reference', value: ['var', 'region'] } },
      },
    ]);

    (fs.existsSync as Mock).mockReturnValue(true);

    await orchestrator.apply(config, '/root');

    expect(writeMock).toHaveBeenCalled();
    const stateArg = writeMock.mock.calls[0][0];

    const resource = stateArg.resources['test_resource.res'];
    expect(resource).toBeDefined();
    // Variables are stored as { value: ..., context: ... } in state if they were passed,
    // but default variables are just values in the simplest case?
    // Let's check what Orchestrator.ts does for root variables.
    expect(resource.attributes.region).toBe('us-east-1');
  });

  it('should pass inputs to child module variables', async () => {
    const rootConfig = `
            module "app" {
                source = "./app"
                env = "production"
            }
        `;

    const appConfig = `
            variable "env" {
                default = "dev"
            }
            resource "test_resource" "server" {
                tags = "\${var.env}"
            }
        `;

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('app/main.mf')) return appConfig;
      if (filePath.includes('root')) return rootConfig;
      return rootConfig;
    });

    // Mock Plan
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'server',
        modulePath: ['app'],
        attributes: { tags: { type: 'Reference', value: ['var', 'env'] } },
      },
    ]);

    await orchestrator.apply(rootConfig, '/root');

    expect(writeMock).toHaveBeenCalled();
    const stateArg = writeMock.mock.calls[0][0];
    const resource = stateArg.resources['module.app.test_resource.server'];

    // Should be "production" (passed input), not "dev" (default)
    expect(resource.attributes.tags).toBe('production');
  });

  it('should handle nested variable scopes correctly', async () => {
    // Root (region=us) -> L2 (region=eu) -> Resource uses var.region
    const rootConfig = `
            module "L2" {
                source = "./L2"
                region = "eu-west-1"
            }
        `;
    const l2Config = `
            variable "region" { default = "us-east-1" }
            resource "test_resource" "child" {
                loc = "\${var.region}"
            }
        `;

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('L2/main.mf')) return l2Config;
      return rootConfig;
    });

    // Mock Plan
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'child',
        modulePath: ['L2'],
        attributes: { loc: { type: 'Reference', value: ['var', 'region'] } },
      },
    ]);

    await orchestrator.apply(rootConfig, '/root');

    const stateArg = writeMock.mock.calls[0][0];
    const resource = stateArg.resources['module.L2.test_resource.child'];

    expect(resource.attributes.loc).toBe('eu-west-1');

    // Verify root variable map in state (should be hierarchical)
    expect(stateArg.variables['module.L2']).toBeDefined();
    // In current implementation, we store raw values in state for variables
    const varEntry = stateArg.variables['module.L2'].region;
    const innerVal = (varEntry as { value: unknown }).value || varEntry;
    expect(innerVal).toBe('eu-west-1');
  });

  it('should resolve module outputs and satisfy parent dependencies', async () => {
    const rootConfig = `
            module "db" {
                source = "./db"
            }
            resource "test_resource" "app" {
                db_id = "\${module.db.id}"
            }
        `;
    const dbConfig = `
            resource "test_resource" "instance" {
                name = "sql-server"
            }
            output "id" {
                value = "\${test_resource.instance.id}"
            }
        `;

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('db/main.mf')) return dbConfig;
      return rootConfig;
    });

    // Mock Plan
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'instance',
        modulePath: ['db'],
        attributes: { name: { type: 'String', value: 'sql-server' } },
      },
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'app',
        modulePath: [],
        attributes: { db_id: { type: 'Reference', value: ['module', 'db', 'id'] } },
      },
    ]);

    // Mock provider behavior to simulate resource ID generation
    mockProvider.create.mockImplementation((type: string, inputs: Record<string, unknown>) => {
      if (inputs.name === 'sql-server') return 'db-123';
      return 'app-456';
    });

    await orchestrator.apply(rootConfig, '/root');

    const stateArg = writeMock.mock.calls[0][0];

    const appResource = stateArg.resources['test_resource.app'];
    expect(appResource).toBeDefined();
    expect(appResource.attributes.db_id).toBe('db-123');
  });
});

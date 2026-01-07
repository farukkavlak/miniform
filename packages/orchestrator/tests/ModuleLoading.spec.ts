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

describe('Orchestrator - Module Loading', () => {
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

    // Ensure plan returns empty array
    (plan as Mock).mockReturnValue([]);
  });

  it('should recursively load modules and flatten resources', async () => {
    const rootConfig = `
            module "vpc" {
                source = "./modules/vpc"
            }
        `;

    const vpcConfig = `
            resource "test_resource" "main" {
                name = "main-vpc"
            }
        `;

    // Mock FS Sync for Module Loading
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.includes('modules/vpc/main.mf')) return vpcConfig;
      return '';
    });

    // Mock Plan to return expected actions
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'main',
        modulePath: ['vpc'],
        attributes: { name: 'main-vpc' }, // minimal attributes
      },
    ]);

    await orchestrator.apply(rootConfig, '/root');

    // Check StateManager write using the exposed mock
    expect(writeMock).toHaveBeenCalled();

    const stateArg = writeMock.mock.calls[0][0];
    const expectedKey = 'module.vpc.test_resource.main';

    expect(stateArg.resources).toHaveProperty(expectedKey);
    expect(stateArg.resources[expectedKey].id).toBe('created-id');
  });

  it('should handle nested modules', async () => {
    const rootConfig = `module "app" { source = "./app" }`;
    const appConfig = `module "db" { source = "./db" }`;
    const dbConfig = `resource "test_resource" "rds" {}`;

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('app/main.mf')) return appConfig;
      if (filePath.endsWith('db/main.mf')) return dbConfig;
      // The orchestrator re-reads the root config for execution, so we need to return it
      return rootConfig;
    });

    // Reset mock calls from previous tests or setup
    writeMock.mockClear();

    // Mock Plan to return expected actions for nested module
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'rds',
        modulePath: ['app', 'db'],
        attributes: {},
      },
    ]);

    await orchestrator.apply(rootConfig, '/root');

    expect(writeMock).toHaveBeenCalled();
    const stateArg = writeMock.mock.calls[0][0];

    console.log('DEBUG ACTUAL KEYS:', Object.keys(stateArg.resources));
    const expectedKey = 'module.app.module.db.test_resource.rds';
    expect(stateArg.resources).toHaveProperty(expectedKey);
    expect(stateArg.resources).toHaveProperty(expectedKey);
  });

  it('should handle deep nesting (5 levels)', async () => {
    // level1 -> level2 -> level3 -> level4 -> level5 (resource)
    const config1 = `module "L2" { source = "./L2" }`;
    const config2 = `module "L3" { source = "./L3" }`;
    const config3 = `module "L4" { source = "./L4" }`;
    const config4 = `module "L5" { source = "./L5" }`;
    const config5 = `resource "test_resource" "deep" {}`;

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('L2/main.mf')) return config2;
      if (filePath.endsWith('L3/main.mf')) return config3;
      if (filePath.endsWith('L4/main.mf')) return config4;
      if (filePath.endsWith('L5/main.mf')) return config5;
      return config1; // Root (L1)
    });

    // Reset mock calls
    writeMock.mockClear();
    // Mock Plan to return expected actions
    (plan as Mock).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'deep',
        modulePath: ['L2', 'L3', 'L4', 'L5'],
        attributes: {},
      },
    ]);

    await orchestrator.apply(config1, '/root'); // Pass root config content

    expect(writeMock).toHaveBeenCalled();
    const stateArg = writeMock.mock.calls[0][0];

    const expectedKey = 'module.L2.module.L3.module.L4.module.L5.test_resource.deep';

    expect(stateArg.resources).toHaveProperty(expectedKey);
  });
});

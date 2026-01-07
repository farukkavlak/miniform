import { plan } from '@miniform/planner';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Orchestrator } from '../src/index';

vi.mock('node:fs');
vi.mock('node:path');

const readMock = vi.fn().mockResolvedValue({ resources: {}, variables: {}, version: 1 });
const writeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@miniform/state', () => ({
  StateManager: vi.fn(() => ({
    read: readMock,
    write: writeMock,
  })),
}));

vi.mock('@miniform/planner', () => ({
  plan: vi.fn(() => []),
}));

describe('Orchestrator - Phase 5: Scoped Data Sources', () => {
  let orchestrator: Orchestrator;
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      resources: ['test_resource', 'aws_ami'],
      validate: vi.fn(),
      create: vi.fn().mockResolvedValue('created-id'),
      read: vi.fn().mockImplementation(async (type, inputs) => {
        if (type === 'aws_ami') return { id: `ami-${inputs.name}` };
        return {};
      }),
      getSchema: vi.fn().mockReturnValue({}),
    };
    orchestrator = new Orchestrator();
    orchestrator.registerProvider(mockProvider);
    (path.resolve as any).mockImplementation((...args: string[]) => args.join('/'));
    (path.join as any).mockImplementation((...args: string[]) => args.join('/'));
  });

  it('should resolve data sources defined in modules', async () => {
    const rootConfig = `
            module "app" {
                source = "./app"
            }
        `;
    const appConfig = `
            data "aws_ami" "ubuntu" {
                name = "focal"
            }
            resource "test_resource" "server" {
                ami = "\${data.aws_ami.ubuntu.id}"
            }
        `;

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath.endsWith('app/main.mf')) return appConfig;
      return rootConfig;
    });

    (plan as any).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'server',
        modulePath: ['app'],
        attributes: { ami: { type: 'Reference', value: ['data', 'aws_ami', 'ubuntu', 'id'] } },
      },
    ]);

    await orchestrator.apply(rootConfig, '/root');

    const stateArg = writeMock.mock.calls[0][0];
    const resource = stateArg.resources['module.app.test_resource.server'];
    expect(resource.attributes.ami).toBe('ami-focal');
  });

  it('should NOT resolve root data source from child module without prefix (Scoping test)', async () => {
    const rootConfig = `
            data "aws_ami" "root_ami" {
                name = "global"
            }
            module "app" {
                source = "./app"
            }
        `;
    const appConfig = `
            resource "test_resource" "server" {
                ami = "\${data.aws_ami.root_ami.id}"
            }
        `;

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockImplementation((f: string) => (f.endsWith('app/main.mf') ? appConfig : rootConfig));

    (plan as any).mockReturnValue([
      {
        type: 'CREATE',
        resourceType: 'test_resource',
        name: 'server',
        modulePath: ['app'],
        attributes: { ami: { type: 'Reference', value: ['data', 'aws_ami', 'root_ami', 'id'] } },
      },
    ]);

    // This should fail because child module shouldn't see root data sources by default in this implementation (strict scoping)
    // Terraform usually allows seeing root variables IF they are passed, but data sources are usually top-level.
    // In Miniform, we've implemented strict module-level scoping for simplicity unless we decide otherwise.

    await expect(orchestrator.apply(rootConfig, '/root')).rejects.toThrow(/Data source "module.app.aws_ami.root_ami" not found/);
  });
});

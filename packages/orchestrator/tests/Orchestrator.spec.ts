import { IProvider, ISchema } from '@miniform/contracts';
import { StateManager } from '@miniform/state';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Orchestrator } from '../src/index';

// Mock Provider for testing
class MockProvider implements IProvider {
  readonly resources = ['mock_resource'];
  private createdResources: Map<string, Record<string, unknown>> = new Map();

  async getSchema(_type: string): Promise<ISchema> {
    return {};
  }

  async validate(_type: string, _inputs: Record<string, unknown>): Promise<void> {
    // Always valid for testing
    console.log('Always valid for testing', _type, _inputs);
  }

  async create(_type: string, inputs: Record<string, unknown>): Promise<string> {
    const id = `mock_${Date.now()}_${Math.random()}`;
    this.createdResources.set(id, inputs);
    return id;
  }

  async update(id: string, _type: string, inputs: Record<string, unknown>): Promise<void> {
    if (!this.createdResources.has(id)) throw new Error(`Resource ${id} not found`);

    this.createdResources.set(id, inputs);
  }

  async delete(id: string): Promise<void> {
    this.createdResources.delete(id);
  }

  getCreatedResources(): Map<string, Record<string, unknown>> {
    return this.createdResources;
  }

  reset(): void {
    this.createdResources.clear();
  }
}

describe('Orchestrator', () => {
  let tmpDir: string;
  let orchestrator: Orchestrator;
  let mockProvider: MockProvider;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestrator-test-'));
    orchestrator = new Orchestrator(tmpDir);
    mockProvider = new MockProvider();
    orchestrator.registerProvider(mockProvider);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Provider Registration', () => {
    it('should register a provider', () => {
      const newOrchestrator = new Orchestrator(tmpDir);
      expect(() => newOrchestrator.registerProvider(mockProvider)).not.toThrow();
    });

    it('should throw error if provider already registered', () => {
      expect(() => orchestrator.registerProvider(mockProvider)).toThrow('already registered');
    });
  });

  describe('CREATE Operations', () => {
    it('should create a new resource', async () => {
      const config = `
        resource "mock_resource" "test" {
          name = "test_value"
        }
      `;

      await orchestrator.apply(config);

      const created = mockProvider.getCreatedResources();
      expect(created.size).toBe(1);

      const [id, inputs] = Array.from(created.entries())[0];
      expect(id).toMatch(/^mock_/);
      expect(inputs).toEqual({ name: 'test_value' });
    });

    it('should create multiple resources', async () => {
      const config = `
        resource "mock_resource" "first" {
          name = "first_value"
        }
        resource "mock_resource" "second" {
          name = "second_value"
        }
      `;

      await orchestrator.apply(config);

      const created = mockProvider.getCreatedResources();
      expect(created.size).toBe(2);
    });

    it('should persist state after creation', async () => {
      const config = `
        resource "mock_resource" "test" {
          name = "test_value"
        }
      `;

      await orchestrator.apply(config);

      // Read state directly
      const stateManager = new StateManager(tmpDir);
      const state = await stateManager.read();

      expect(state.resources['mock_resource.test']).toBeDefined();
      expect(state.resources['mock_resource.test'].resourceType).toBe('mock_resource');
      expect(state.resources['mock_resource.test'].name).toBe('test');
    });

    it('should handle resources with mixed attribute types', async () => {
      const config = `
        resource "mock_resource" "mixed" {
          name = "test"
          count = 42
          enabled = true
        }
      `;

      await orchestrator.apply(config);

      const created = mockProvider.getCreatedResources();
      const [, inputs] = Array.from(created.entries())[0];

      // All values should be extracted from AttributeValue format
      expect(inputs).toEqual({
        name: 'test',
        count: 42,
        enabled: true,
      });
    });
  });

  describe('UPDATE Operations', () => {
    it('should update an existing resource', async () => {
      // First, create a resource
      const createConfig = `
        resource "mock_resource" "test" {
          name = "original_value"
        }
      `;
      await orchestrator.apply(createConfig);

      const originalCreated = mockProvider.getCreatedResources();
      const [originalId] = Array.from(originalCreated.keys());

      // Now update it
      const updateConfig = `
        resource "mock_resource" "test" {
          name = "updated_value"
        }
      `;
      await orchestrator.apply(updateConfig);

      // Should still have only 1 resource (updated, not recreated)
      const updated = mockProvider.getCreatedResources();
      expect(updated.size).toBe(1);
      expect(updated.get(originalId)).toEqual({ name: 'updated_value' });
    });

    it('should not call provider if no changes (NO_OP)', async () => {
      const config = `
        resource "mock_resource" "test" {
          name = "same_value"
        }
      `;

      await orchestrator.apply(config);
      const firstCount = mockProvider.getCreatedResources().size;

      // Apply same config again
      await orchestrator.apply(config);
      const secondCount = mockProvider.getCreatedResources().size;

      // Should not create a new resource
      expect(secondCount).toBe(firstCount);
    });
  });

  describe('DELETE Operations', () => {
    it('should delete a removed resource', async () => {
      // First, create a resource
      const createConfig = `
        resource "mock_resource" "test" {
          name = "value"
        }
      `;
      await orchestrator.apply(createConfig);

      expect(mockProvider.getCreatedResources().size).toBe(1);

      // Now remove it from config
      const deleteConfig = ``;
      await orchestrator.apply(deleteConfig);

      // Should be deleted
      expect(mockProvider.getCreatedResources().size).toBe(0);
    });

    it('should update state after deletion', async () => {
      const createConfig = `
        resource "mock_resource" "test" {
          name = "value"
        }
      `;
      await orchestrator.apply(createConfig);

      const deleteConfig = ``;
      await orchestrator.apply(deleteConfig);

      // Check state
      const stateManager = new StateManager(tmpDir);
      const state = await stateManager.read();

      expect(state.resources['mock_resource.test']).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if no provider registered for resource type', async () => {
      const config = `
        resource "unknown_type" "test" {
          name = "value"
        }
      `;

      await expect(orchestrator.apply(config)).rejects.toThrow('No provider registered');
    });

    it('should throw error for invalid config syntax', async () => {
      const config = `
        resource "mock_resource" {
          invalid syntax here
        }
      `;

      await expect(orchestrator.apply(config)).rejects.toThrow();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed operations (create, update, delete)', async () => {
      // Initial state: create 3 resources
      const initial = `
        resource "mock_resource" "keep" {
          name = "keep_value"
        }
        resource "mock_resource" "update" {
          name = "old_value"
        }
        resource "mock_resource" "delete" {
          name = "delete_value"
        }
      `;
      await orchestrator.apply(initial);
      expect(mockProvider.getCreatedResources().size).toBe(3);

      // New state: keep one, update one, delete one, create one
      const updated = `
        resource "mock_resource" "keep" {
          name = "keep_value"
        }
        resource "mock_resource" "update" {
          name = "new_value"
        }
        resource "mock_resource" "create" {
          name = "create_value"
        }
      `;
      await orchestrator.apply(updated);

      const final = mockProvider.getCreatedResources();

      // Verify state matches config
      const stateManager = new StateManager(tmpDir);
      const state = await stateManager.read();

      // The provider should have exactly 3 resources
      // (keep, update, create) - delete was removed
      expect(final.size).toBe(3);

      expect(state.resources['mock_resource.keep']).toBeDefined();
      expect(state.resources['mock_resource.update']).toBeDefined();
      expect(state.resources['mock_resource.create']).toBeDefined();
      expect(state.resources['mock_resource.delete']).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle UPDATE with multiple attribute changes', async () => {
      // Create resource with multiple attributes
      const createConfig = `
        resource "mock_resource" "multi" {
          name = "original"
          count = 5
          enabled = true
        }
      `;
      await orchestrator.apply(createConfig);

      // Update multiple attributes
      const updateConfig = `
        resource "mock_resource" "multi" {
          name = "updated"
          count = 10
          enabled = false
        }
      `;
      await orchestrator.apply(updateConfig);

      const updated = mockProvider.getCreatedResources();
      expect(updated.size).toBe(1);

      const [, inputs] = Array.from(updated.entries())[0];
      expect(inputs).toEqual({
        name: 'updated',
        count: 10,
        enabled: false,
      });
    });

    it('should handle empty config (no resources)', async () => {
      const config = ``;

      await orchestrator.apply(config);

      const created = mockProvider.getCreatedResources();
      expect(created.size).toBe(0);
    });

    it('should handle resource with no attributes', async () => {
      const config = `
        resource "mock_resource" "empty" {
        }
      `;

      await orchestrator.apply(config);

      const created = mockProvider.getCreatedResources();
      expect(created.size).toBe(1);

      const [, inputs] = Array.from(created.entries())[0];
      expect(inputs).toEqual({});
    });
  });
});

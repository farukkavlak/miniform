
import { Program } from '@miniform/parser';
import { IState } from '@miniform/state';
import { describe, expect, it } from 'vitest';

import { plan, PlanAction, serializePlan, validatePlanFile } from '../src/index';

describe('Planner', () => {
  it('should plan CREATE for new resources', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'test_resource_a',
        attributes: { path: { type: 'String', value: 'x' } },
      },
    ];

    const current: IState = {
      version: 1,
      resources: {},
    };

    const actions = plan(desired, current);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('CREATE');
    expect(actions[0].resourceType).toBe('mock_resource');
    expect(actions[0].name).toBe('test_resource_a');
    expect(actions[0].attributes).toBeDefined();
    expect(actions[0].attributes!.path).toEqual({ type: 'String', value: 'x' });
  });

  it('should plan CREATE for nested module resources', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'nested_resource',
        modulePath: ['app', 'db'],
        attributes: { size: { type: 'String', value: 'large' } },
      },
    ];

    const current: IState = {
      version: 1,
      resources: {},
    };

    const actions = plan(desired, current);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('CREATE');
    expect(actions[0].resourceType).toBe('mock_resource');
    expect(actions[0].name).toBe('nested_resource');
    expect(actions[0].modulePath).toEqual(['app', 'db']);
  });

  it('should plan DELETE for removed resources', () => {
    const desired: Program = [];
    const current: IState = {
      version: 1,
      resources: {
        'mock_resource.test_resource_b': {
          id: 'mock_resource.test_resource_b',
          type: 'Resource',
          resourceType: 'mock_resource',
          name: 'test_resource_b',
          attributes: {},
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('DELETE');
    expect(actions[0].id).toBe('mock_resource.test_resource_b');
  });

  it('should plan UPDATE when attributes change', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'test_resource_c',
        attributes: { path: { type: 'String', value: 'new_path' } },
      },
    ];

    const current: IState = {
      version: 1,
      resources: {
        'mock_resource.test_resource_c': {
          id: 'mock_resource.test_resource_c',
          type: 'Resource',
          resourceType: 'mock_resource',
          name: 'test_resource_c',
          attributes: { path: { type: 'String', value: 'old_path' } },
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('UPDATE');
    expect(actions[0].id).toBe('mock_resource.test_resource_c');
    expect(actions[0].changes).toBeDefined();
    expect(actions[0].changes!.path).toEqual({
      old: { type: 'String', value: 'old_path' },
      new: { type: 'String', value: 'new_path' },
    });
  });

  it('should plan NO_OP when identical', () => {
    const attributes = { path: { type: 'String' as const, value: 'path' } };
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'test_resource_d',
        attributes: attributes,
      },
    ];

    const current: IState = {
      version: 1,
      resources: {
        'mock_resource.test_resource_d': {
          id: 'mock_resource.test_resource_d',
          type: 'Resource',
          resourceType: 'mock_resource',
          name: 'test_resource_d',
          attributes: attributes,
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('NO_OP');
    expect(actions[0].changes).toBeUndefined();
  });

  it('should ignore non-Resource statements in Program', () => {
    // Future-proofing: If we add Variable or Output blocks, they should be ignored
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'test_resource_e',
        attributes: { value: { type: 'String', value: 'test' } },
      },
      // @ts-expect-error - Testing future statement types
      { type: 'Variable', name: 'some_var', default: 'value' },
    ];

    const current: IState = {
      version: 1,
      resources: {},
    };

    const actions = plan(desired, current);
    // Should only plan the Resource, ignore the Variable
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('CREATE');
    expect(actions[0].resourceType).toBe('mock_resource');
  });

  it('should plan DELETE + CREATE when forceNew attribute changes', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'mock_resource',
        name: 'test_resource_f',
        attributes: { path: { type: 'String', value: 'new_path' } },
      },
    ];

    const current: IState = {
      version: 1,
      resources: {
        'mock_resource.test_resource_f': {
          id: 'mock_id_123',
          type: 'Resource',
          resourceType: 'mock_resource',
          name: 'test_resource_f',
          attributes: { path: { type: 'String', value: 'old_path' } },
        },
      },
    };

    const schemas = {
      mock_resource: {
        path: { type: 'string' as const, required: true, forceNew: true },
      },
    };

    const actions = plan(desired, current, schemas);

    // Should have DELETE followed by CREATE
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('DELETE');
    expect(actions[0].id).toBe('mock_id_123');
    expect(actions[1].type).toBe('CREATE');
    expect(actions[1].attributes).toEqual({ path: { type: 'String', value: 'new_path' } });
  });

  describe('Plan Serialization', () => {
    it('should serialize plan correctly', () => {
      const actions: PlanAction[] = [];
      const config = 'resource "test" {}';
      const serialized = serializePlan(actions, config);

      expect(serialized.version).toBe('1.0');
      expect(serialized.actions).toEqual(actions);
      expect(serialized.configHash).toBeDefined();
      expect(serialized.timestamp).toBeDefined();
    });

    it('should validate correct plan file', () => {
      const planFile = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        configHash: 'hash',
        actions: [],
      };

      expect(validatePlanFile(planFile)).toBe(true);
    });

    it('should reject invalid plan file', () => {
      expect(validatePlanFile(null)).toBe(false);
      expect(validatePlanFile({})).toBe(false);
      expect(validatePlanFile({ version: 1 })).toBe(false); // wrong type
    });
  });
});

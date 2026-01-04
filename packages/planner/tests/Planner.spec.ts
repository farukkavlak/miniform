import { Program } from '@miniform/parser';
import { IState } from '@miniform/state';
import { describe, expect, it } from 'vitest';

import { plan } from '../src/index';

describe('Planner', () => {
  it('should plan CREATE for new resources', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'file',
        name: 'new_file',
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
    expect(actions[0].resourceType).toBe('file');
    expect(actions[0].name).toBe('new_file');
    expect(actions[0].attributes).toBeDefined();
    expect(actions[0].attributes!.path).toEqual({ type: 'String', value: 'x' });
  });

  it('should plan DELETE for removed resources', () => {
    const desired: Program = [];
    const current: IState = {
      version: 1,
      resources: {
        'file.old_file': {
          id: 'file.old_file',
          type: 'Resource',
          resourceType: 'file',
          name: 'old_file',
          attributes: {},
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('DELETE');
    expect(actions[0].id).toBe('file.old_file');
  });

  it('should plan UPDATE when attributes change', () => {
    const desired: Program = [
      {
        type: 'Resource',
        resourceType: 'file',
        name: 'my_file',
        attributes: { path: { type: 'String', value: 'new_path' } },
      },
    ];

    const current: IState = {
      version: 1,
      resources: {
        'file.my_file': {
          id: 'file.my_file',
          type: 'Resource',
          resourceType: 'file',
          name: 'my_file',
          attributes: { path: { type: 'String', value: 'old_path' } },
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('UPDATE');
    expect(actions[0].id).toBe('file.my_file');
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
        resourceType: 'file',
        name: 'my_file',
        attributes: attributes,
      },
    ];

    const current: IState = {
      version: 1,
      resources: {
        'file.my_file': {
          id: 'file.my_file',
          type: 'Resource',
          resourceType: 'file',
          name: 'my_file',
          attributes: attributes,
        },
      },
    };

    const actions = plan(desired, current);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('NO_OP');
    expect(actions[0].changes).toBeUndefined();
  });
});

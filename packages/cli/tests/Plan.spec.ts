import { Orchestrator } from '@miniform/orchestrator';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlanCommand } from '../src/commands/plan';

vi.mock('node:fs/promises');
vi.mock('@miniform/orchestrator');
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((m) => m),
    green: vi.fn((m) => m),
    yellow: vi.fn((m) => m),
    red: vi.fn((m) => m),
    bold: vi.fn((m) => m),
  },
}));

describe('CLI: plan command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if main.mini does not exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error: main.mini not found'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should display "No changes" when plan is empty', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('');

    const planMock = vi.fn().mockResolvedValue([]);
    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(planMock).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('No changes. Your infrastructure matches the configuration.');

    consoleSpy.mockRestore();
  });

  it('should display planned actions', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('resource "test" "t" {}');

    const actions = [{ type: 'CREATE', resourceType: 'test', name: 't', attributes: {} }];
    const planMock = vi.fn().mockResolvedValue(actions);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Miniform will perform the following actions:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('+ test.t will be created'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plan: 1 to add, 0 to change, 0 to destroy.'));

    consoleSpy.mockRestore();
  });

  it('should display UPDATE actions with changes', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('resource "test" "t" {}');

    const actions = [
      {
        type: 'UPDATE',
        resourceType: 'test',
        name: 't',
        changes: { path: { old: '/old', new: '/new' } },
      },
    ];
    const planMock = vi.fn().mockResolvedValue(actions);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('~ test.t will be updated'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plan: 0 to add, 1 to change, 0 to destroy.'));

    consoleSpy.mockRestore();
  });

  it('should display DELETE actions', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('');

    const actions = [{ type: 'DELETE', resourceType: 'test', name: 't' }];
    const planMock = vi.fn().mockResolvedValue(actions);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('- test.t will be destroyd'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plan: 0 to add, 0 to change, 1 to destroy.'));

    consoleSpy.mockRestore();
  });

  it('should handle planning errors gracefully', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('invalid config');

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: vi.fn().mockRejectedValue(new Error('Parse error')),
      } as Partial<Orchestrator> as Orchestrator;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning failed:'), 'Parse error');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should handle unknown action types', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('');

    const actions = [{ type: 'UNKNOWN', resourceType: 'test', name: 't' }];
    const planMock = vi.fn().mockResolvedValue(actions);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createPlanCommand().parseAsync(['node', 'miniform', 'plan']);

    // Should still display the action even with unknown type
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

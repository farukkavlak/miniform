import { Orchestrator } from '@miniform/orchestrator';
import inquirer from 'inquirer';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApplyCommand } from '../src/commands/apply';

vi.mock('node:fs/promises');
vi.mock('@miniform/orchestrator');
vi.mock('inquirer');
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((m) => m),
    green: vi.fn((m) => m),
    yellow: vi.fn((m) => m),
    red: vi.fn((m) => m),
    bold: vi.fn((m) => m),
  },
}));

describe('CLI: apply command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should abort if validation fails (no config)', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error: main.mini not found'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should apply changes when confirmed', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(undefined);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as any;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(planMock).toHaveBeenCalled();
    expect(inquirer.prompt).toHaveBeenCalled();
    expect(applyMock).toHaveBeenCalledWith('content');
  });

  it('should skip confirmation with --yes flag', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(undefined);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as any;
    });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply', '--yes']);

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(applyMock).toHaveBeenCalled();
  });

  it('should abort if confirmation declined', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(undefined);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as any;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(applyMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Apply cancelled.');

    consoleSpy.mockRestore();
  });
});

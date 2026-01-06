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

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error: main.mini not found'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should apply changes when confirmed', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([
      { type: 'CREATE', resourceType: 'test', name: 't1' },
      { type: 'UPDATE', resourceType: 'test', name: 't2' },
      { type: 'DELETE', resourceType: 'test', name: 't3' },
    ]);
    const applyMock = vi.fn().mockResolvedValue(void 0);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(planMock).toHaveBeenCalled();
    expect(inquirer.prompt).toHaveBeenCalled();
    expect(applyMock).toHaveBeenCalledWith('content');
  });

  it('should skip confirmation with --yes flag', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(void 0);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply', '--yes']);

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(applyMock).toHaveBeenCalled();
  });

  it('should abort if confirmation declined', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(void 0);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(applyMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Apply cancelled.');

    consoleSpy.mockRestore();
  });

  it('should skip apply when all actions are NO_OP', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'NO_OP', resourceType: 'test', name: 't' }]);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(consoleSpy).toHaveBeenCalledWith('No changes needed.');
    expect(inquirer.prompt).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle apply errors gracefully', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockRejectedValue(new Error('Apply failed'));

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Apply failed:'), 'Apply failed');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should handle unknown action types', async () => {
    vi.mocked(fs.access).mockResolvedValue(void 0);
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const planMock = vi.fn().mockResolvedValue([{ type: 'UNKNOWN', resourceType: 'test', name: 't' }]);
    const applyMock = vi.fn().mockResolvedValue(void 0);

    vi.mocked(Orchestrator).mockImplementation(function () {
      return {
        registerProvider: vi.fn(),
        plan: planMock,
        apply: applyMock,
      } as Partial<Orchestrator> as Orchestrator;
    });

    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await createApplyCommand().parseAsync(['node', 'miniform', 'apply']);

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

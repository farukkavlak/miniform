
import { Orchestrator } from '@miniform/orchestrator';
import inquirer from 'inquirer';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApplyCommand } from '../src/commands/apply';

vi.mock('node:fs/promises');
vi.mock('@miniform/orchestrator');
vi.mock('@miniform/planner', async () => {
  const actual = await vi.importActual('@miniform/planner');
  return {
    ...actual,
    validatePlanFile: vi.fn((data) => {
      return data && data.version && data.actions;
    }),
  };
});
vi.mock('inquirer');
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((m) => m),
    green: vi.fn((m) => m),
    yellow: vi.fn((m) => m),
    red: vi.fn((m) => m),
    cyan: vi.fn((m) => m),
    white: vi.fn((m) => m),
    gray: vi.fn((m) => m),
    bold: vi.fn((m) => m),
  },
}));
vi.mock('node:crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'test-hash'),
    })),
  },
}));

describe('CLI: apply command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Config-based apply', () => {
    it('should abort if main.mini not found', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as never);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('main.mini not found'));
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
        { type: 'NO_OP', resourceType: 'test', name: 't4' },
      ]);
      const applyMock = vi.fn().mockResolvedValue({});

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          plan: planMock,
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });

      await createApplyCommand().parseAsync(['node', 'miniform']);

      expect(planMock).toHaveBeenCalled();
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(applyMock).toHaveBeenCalledWith('content');
    });

    it('should skip confirmation with --yes flag', async () => {
      vi.mocked(fs.access).mockResolvedValue(void 0);
      vi.mocked(fs.readFile).mockResolvedValue('content');

      const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
      const applyMock = vi.fn().mockResolvedValue({});

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          plan: planMock,
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      await createApplyCommand().parseAsync(['node', 'miniform', '--yes']);

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(applyMock).toHaveBeenCalled();
    });

    it('should abort if confirmation declined', async () => {
      vi.mocked(fs.access).mockResolvedValue(void 0);
      vi.mocked(fs.readFile).mockResolvedValue('content');

      const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
      const applyMock = vi.fn().mockResolvedValue({});

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          plan: planMock,
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform']);

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

      await createApplyCommand().parseAsync(['node', 'miniform']);

      expect(consoleSpy).toHaveBeenCalledWith('No changes needed.');
      expect(inquirer.prompt).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should display outputs when returned from apply', async () => {
      vi.mocked(fs.access).mockResolvedValue(void 0);
      vi.mocked(fs.readFile).mockResolvedValue('content');

      const planMock = vi.fn().mockResolvedValue([{ type: 'CREATE', resourceType: 'test', name: 't' }]);
      const applyMock = vi.fn().mockResolvedValue({
        my_output: 'test_value',
        another_output: 42,
      });

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          plan: planMock,
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform']);

      expect(applyMock).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Outputs:'));

      consoleSpy.mockRestore();
    });
  });

  describe('Plan file apply', () => {
    it('should apply from plan file', async () => {
      const planFileContent = JSON.stringify({
        version: '1.0',
        timestamp: '2024-01-01T00:00:00Z',
        configHash: 'test-hash',
        actions: [{ type: 'CREATE', resourceType: 'test', name: 't' }],
      });

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (String(path).includes('plan.json')) return planFileContent;
        return 'config content';
      });

      const applyMock = vi.fn().mockResolvedValue({});

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform', 'plan.json']);

      expect(applyMock).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Applying from saved plan'));

      consoleSpy.mockRestore();
    });

    it('should abort if confirmation declined', async () => {
      const planFileContent = JSON.stringify({
        version: '1.0',
        timestamp: '2024-01-01T00:00:00Z',
        configHash: 'test-hash',
        actions: [{ type: 'CREATE', resourceType: 'test', name: 't' }],
      });

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (String(path).includes('plan.json')) return planFileContent;
        return 'config content';
      });

      const applyMock = vi.fn().mockResolvedValue({});

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform', 'plan.json']);

      expect(applyMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Apply cancelled.');

      consoleSpy.mockRestore();
    });

    it('should display outputs when returned from plan apply', async () => {
      const planFileContent = JSON.stringify({
        version: '1.0',
        timestamp: '2024-01-01T00:00:00Z',
        configHash: 'test-hash',
        actions: [{ type: 'CREATE', resourceType: 'test', name: 't' }],
      });

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (String(path).includes('plan.json')) return planFileContent;
        return 'config content';
      });

      const applyMock = vi.fn().mockResolvedValue({
        plan_output: 'value',
      });

      vi.mocked(Orchestrator).mockImplementation(function () {
        return {
          registerProvider: vi.fn(),
          apply: applyMock,
        } as Partial<Orchestrator> as Orchestrator;
      });

      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform', 'plan.json']);

      expect(applyMock).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Outputs:'));

      consoleSpy.mockRestore();
    });

    it('should reject invalid plan file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ "invalid": true }');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as never);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      await createApplyCommand().parseAsync(['node', 'miniform', 'invalid.json']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid plan file'));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
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

      await createApplyCommand().parseAsync(['node', 'miniform']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Apply failed:'), 'Apply failed');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});

import { StateManager } from '@miniform/state';
import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitCommand } from '../src/commands/init';

vi.mock('node:fs/promises');
vi.mock('@miniform/state');
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((msg) => msg),
    green: vi.fn((msg) => msg),
    red: vi.fn((msg) => msg),
    bold: {
      green: vi.fn((msg) => msg),
    },
  },
}));

describe('CLI: init command', () => {
  const cwd = process.cwd();
  const miniformDir = path.join(cwd, '.miniform');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create .miniform directory and initialize state', async () => {
    // Mock fs.mkdir to succeed
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    // Mock StateManager
    const writeMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(StateManager).mockImplementation(function () {
      return {
        write: writeMock,
        read: vi.fn(),
        lock: vi.fn(),
        unlock: vi.fn(),
      } as any;
    });

    // Execute command action directly (commander action handler)
    await createInitCommand().parseAsync(['node', 'miniform', 'init']);

    expect(fs.mkdir).toHaveBeenCalledWith(miniformDir, { recursive: true });
    expect(StateManager).toHaveBeenCalledWith(cwd);
    expect(writeMock).toHaveBeenCalledWith({ version: 1, resources: {} });
  });

  it('should handle errors gracefully', async () => {
    // Mock fs.mkdir to throw
    const error = new Error('Permission denied');
    vi.mocked(fs.mkdir).mockRejectedValue(error);

    // Mock process.exit to prevent test exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await createInitCommand().parseAsync(['node', 'miniform', 'init']);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize workspace:', 'Permission denied');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

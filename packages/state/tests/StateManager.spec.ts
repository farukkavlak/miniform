import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StateManager } from '../src/StateManager';

describe('StateManager', () => {
  let tmpDir: string;
  let stateManager: StateManager;

  beforeEach(async () => {
    // Create a safe temporary directory for each test
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'miniform-state-test-'));
    stateManager = new StateManager(tmpDir, 'test.state.json');
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return default empty state if file does not exist', async () => {
    const state = await stateManager.read();
    expect(state).toEqual({ version: 1, resources: {} });
  });

  it('should write and read state correctly', async () => {
    const mockState = {
      version: 1,
      resources: {
        res1: {
          type: 'resource',
          resourceType: 'local_file',
          name: 'res1',
          attributes: { filename: 'foo.txt' },
        },
      },
    };

    await stateManager.write(mockState);

    // Verify file exists
    // eslint-disable-next-line unicorn/prefer-json-parse-buffer
    const fileContent = await fs.readFile(path.join(tmpDir, 'test.state.json'), 'utf8');
    expect(JSON.parse(fileContent)).toEqual(mockState);

    // Verify read method
    const readState = await stateManager.read();
    expect(readState).toEqual(mockState);
  });

  it('should throw error for non-ENOENT errors', async () => {
    // Create a directory with the same name as the state file
    // This will cause fs.readFile to throw EISDIR (Is a directory)
    const statePath = path.join(tmpDir, 'test.state.json');
    await fs.mkdir(statePath);

    await expect(stateManager.read()).rejects.toThrow();
  });
});

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
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
    const fileContent = await fs.readFile(path.join(tmpDir, 'test.state.json'), 'utf-8');
    expect(JSON.parse(fileContent)).toEqual(mockState);

    // Verify read method
    const readState = await stateManager.read();
    expect(readState).toEqual(mockState);
  });
});

import { IResource } from '@miniform/contracts';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export interface IState {
  version: number;
  resources: Record<string, IResource>;
}

export class StateManager {
  private filePath: string;

  constructor(workingDir: string = process.cwd(), filename: string = 'miniform.state.json') {
    this.filePath = path.join(workingDir, filename);
  }

  async read(): Promise<IState> {
    try {
      const content = await fs.readFile(this.filePath);
      return JSON.parse(content.toString('utf8')) as IState;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') return { version: 1, resources: {} };
      throw error;
    }
  }

  async write(state: IState): Promise<void> {
    // Create backup if file exists
    try {
      await fs.access(this.filePath);
      await fs.copyFile(this.filePath, `${this.filePath}.bak`);
    } catch {
      // File doesn't exist, no backup needed
    }

    const content = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, content, 'utf8');
  }

  get lockFilePath(): string {
    return `${this.filePath}.lock`;
  }

  async lock(): Promise<void> {
    try {
      // 'wx' flag fails if file exists
      await fs.writeFile(this.lockFilePath, String(Date.now()), { flag: 'wx' });
    } catch (error) {
      if ((error as { code: string }).code === 'EEXIST') throw new Error('State is locked by another process.');
      throw error;
    }
  }

  async unlock(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath);
    } catch (error) {
      if ((error as { code: string }).code !== 'ENOENT') throw error;
      // If lock file doesn't exist, it's already unlocked (idempotent)
    }
  }
}

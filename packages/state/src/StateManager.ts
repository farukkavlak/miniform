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
    const content = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, content, 'utf8');
  }

  // TODO: Implement lock mechanism using a separate .lock file
}

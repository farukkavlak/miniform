import { IResource } from '@miniform/contracts';
import * as fs from 'fs/promises';
import * as path from 'path';

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
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as IState;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Return empty state if file doesn't exist
        return { version: 1, resources: {} };
      }
      throw error;
    }
  }

  async write(state: IState): Promise<void> {
    const content = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, content, 'utf-8');
  }

  // TODO: Implement lock mechanism using a separate .lock file
}

import { IResourceHandler } from '@miniform/contracts';
import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalFileResource implements IResourceHandler {
  async validate(inputs: Record<string, unknown>): Promise<void> {
    if (!inputs.path || typeof inputs.path !== 'string') throw new Error('local_file requires "path" attribute (string)');

    if (!inputs.content || typeof inputs.content !== 'string') throw new Error('local_file requires "content" attribute (string)');
  }

  async create(inputs: Record<string, unknown>): Promise<string> {
    const filePath = inputs.path as string;
    const content = inputs.content as string;

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, content, 'utf8');

    // Return absolute path as ID
    return path.resolve(filePath);
  }

  async update(id: string, inputs: Record<string, unknown>): Promise<void> {
    const content = inputs.content as string;

    // Update file content
    await fs.writeFile(id, content, 'utf8');
  }

  async delete(id: string): Promise<void> {
    // Delete file
    await fs.unlink(id);
  }
}

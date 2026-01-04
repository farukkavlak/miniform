import { IProvider, IResourceHandler } from '@miniform/contracts';

import { LocalFileResource } from './resources/LocalFileResource';

export class LocalProvider implements IProvider {
  readonly resources = ['local_file'];
  private handlers: Map<string, IResourceHandler> = new Map();

  constructor() {
    // Register resource handlers
    this.handlers.set('local_file', new LocalFileResource());
  }

  async validate(type: string, inputs: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Unsupported resource type: ${type}`);
    }

    await handler.validate(inputs);
  }

  async create(type: string, inputs: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Unsupported resource type: ${type}`);
    }

    return await handler.create(inputs);
  }

  async update(id: string, type: string, inputs: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Unsupported resource type: ${type}`);
    }

    await handler.update(id, inputs);
  }

  async delete(id: string): Promise<void> {
    // Assume it's a file for local provider
    // In a real implementation, you might store metadata to know which handler to use
    const handler = this.handlers.get('local_file');
    if (handler) {
      await handler.delete(id);
    }
  }
}

export { LocalFileResource } from './resources/LocalFileResource';

import { IResourceHandler, ISchema } from '@miniform/contracts';
import crypto from 'node:crypto';

export class NullResource implements IResourceHandler {
  async getSchema(): Promise<ISchema> {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validate(_inputs: Record<string, unknown>): Promise<void> {
    // Always valid
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(_inputs: Record<string, unknown>): Promise<string> {
    return crypto.randomUUID();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(_id: string, _inputs: Record<string, unknown>): Promise<void> {
    // No-op
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_id: string): Promise<void> {
    // No-op
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async read(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }
}

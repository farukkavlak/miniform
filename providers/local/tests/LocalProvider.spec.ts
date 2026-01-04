import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalProvider } from '../src/index';

describe('LocalProvider', () => {
  let provider: LocalProvider;
  let tmpDir: string;

  beforeEach(async () => {
    provider = new LocalProvider();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-provider-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Validation', () => {
    it('should validate local_file with path and content', async () => {
      await expect(
        provider.validate('local_file', {
          path: '/tmp/test.txt',
          content: 'Hello',
        })
      ).resolves.not.toThrow();
    });

    it('should throw if path is missing', async () => {
      await expect(
        provider.validate('local_file', {
          content: 'Hello',
        })
      ).rejects.toThrow('requires "path"');
    });

    it('should throw if content is missing', async () => {
      await expect(
        provider.validate('local_file', {
          path: '/tmp/test.txt',
        })
      ).rejects.toThrow('requires "content"');
    });

    it('should throw if path is not a string', async () => {
      await expect(
        provider.validate('local_file', {
          path: 123,
          content: 'Hello',
        })
      ).rejects.toThrow('requires "path"');
    });
  });

  describe('CREATE', () => {
    it('should create a file with content', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const content = 'Hello World';

      const id = await provider.create('local_file', {
        path: filePath,
        content,
      });

      expect(id).toBe(path.resolve(filePath));

      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe(content);
    });

    it('should create parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'nested', 'dir', 'test.txt');
      const content = 'Nested file';

      await provider.create('local_file', {
        path: filePath,
        content,
      });

      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe(content);
    });

    it('should throw for unsupported resource type', async () => {
      await expect(
        provider.create('unknown_type', {
          path: '/tmp/test.txt',
          content: 'Hello',
        })
      ).rejects.toThrow('Unsupported resource type');
    });
  });

  describe('UPDATE', () => {
    it('should update file content', async () => {
      const filePath = path.join(tmpDir, 'test.txt');

      // Create file first
      await fs.writeFile(filePath, 'Original content', 'utf-8');

      // Update
      await provider.update(filePath, 'local_file', {
        path: filePath,
        content: 'Updated content',
      });

      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe('Updated content');
    });

    it('should throw for unsupported resource type', async () => {
      await expect(
        provider.update('/tmp/test.txt', 'unknown_type', {
          content: 'Hello',
        })
      ).rejects.toThrow('Unsupported resource type');
    });
  });

  describe('DELETE', () => {
    it('should delete a file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');

      // Create file first
      await fs.writeFile(filePath, 'Content', 'utf-8');

      // Verify it exists
      await expect(fs.access(filePath)).resolves.not.toThrow();

      // Delete
      await provider.delete(filePath);

      // Verify it's gone
      await expect(fs.access(filePath)).rejects.toThrow();
    });
  });

  describe('Resources', () => {
    it('should expose local_file as supported resource', () => {
      expect(provider.resources).toContain('local_file');
    });
  });
});

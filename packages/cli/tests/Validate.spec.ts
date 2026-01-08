import { LocalProvider } from '@miniform/provider-local';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createValidateCommand } from '../src/commands/validate';

vi.mock('node:fs/promises');
vi.mock('@miniform/provider-local', () => {
  const validateFn = vi.fn();
  const getSchemaFn = vi.fn();
  return {
    LocalProvider: vi.fn(),
  };
});

describe('Validate Command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let validateMock: ReturnType<typeof vi.fn>;
  let getSchemaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.clearAllMocks();

    validateMock = vi.fn().mockResolvedValue(undefined);
    getSchemaMock = vi.fn().mockResolvedValue({ attributes: { path: { type: 'string' }, content: { type: 'string' } } });

    // Use function declaration to support 'new'
    vi.mocked(LocalProvider).mockImplementation(function () {
      return {
        validate: validateMock,
        getSchema: getSchemaMock,
      } as unknown as LocalProvider;
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate correct config successfully', async () => {
    const validConfig = `
resource "local_file" "test" {
  path = "/tmp/test.txt"
  content = "Hello World"
}
`;

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(validConfig);

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/test.mf']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Checking syntax'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax is valid'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validating resource schemas'));
    expect(validateMock).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Checking dependencies'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should detect syntax errors', async () => {
    const invalidConfig = `
resource "local_file" "test" {
  path = "/tmp/test.txt"
  content = 
}
`;

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(invalidConfig);

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/test.mf']);

    const allCalls = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(allCalls).toContain('Syntax error');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should detect schema validation errors', async () => {
    // We don't care about config content for this specific test because we mock the provider error
    const config = `
resource "local_file" "test" {
  path = "/tmp/test.txt"
}
`;

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(config);

    // Make validate throw
    validateMock.mockRejectedValue(new Error('local_file requires "content" attribute'));

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/test.mf']);

    const allCalls = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(allCalls).toContain('Validating resource schemas');
    expect(validateMock).toHaveBeenCalled();
    // Should show error for missing 'content' attribute
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should detect circular dependencies', async () => {
    const circularConfig = `
resource "local_file" "a" {
  path = "/tmp/a.txt"
  content = "\${local_file.b.path}"
}

resource "local_file" "b" {
  path = "/tmp/b.txt"
  content = "\${local_file.a.path}"
}
`;

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(circularConfig);

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/test.mf']);

    // Circular dependency should be detected by graph, but not cause validation to fail
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Checking dependencies'));
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Dependency error'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should handle missing file', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/nonexistent.mf']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should validate multiple resources', async () => {
    const multiResourceConfig = `
resource "local_file" "file1" {
  path = "/tmp/file1.txt"
  content = "Content 1"
}

resource "local_file" "file2" {
  path = "/tmp/file2.txt"
  content = "Content 2"
}
`;

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(multiResourceConfig);

    const command = createValidateCommand();
    await command.parseAsync(['node', 'test', '/tmp/test.mf']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('local_file.file1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('local_file.file2'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
  });
});

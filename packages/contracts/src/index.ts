/** Represents a resource definition from the parser (Code -> AST) */
export interface IResource {
  type: string;
  resourceType: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
}

/** The contract that ALL providers must implement */
export interface IProvider {
  /** Resource types handled by this provider (e.g., ['local_file']) */
  readonly resources: string[];

  create(type: string, inputs: Record<string, unknown>): Promise<string>;
  update(id: string, type: string, inputs: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

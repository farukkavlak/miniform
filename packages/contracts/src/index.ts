/** Represents a resource definition from the parser (Code -> AST) */
export interface IResource {
  type: string;
  resourceType: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
}

export type SchemaType = 'string' | 'number' | 'boolean';

export interface ISchemaDefinition {
  type: SchemaType;
  required?: boolean;
}

export type ISchema = Record<string, ISchemaDefinition>;

/** The contract that ALL providers must implement */
export interface IProvider {
  /** Resource types handled by this provider (e.g., ['local_file']) */
  readonly resources: string[];

  /** Validates inputs against the resource schema. Throws validation error if invalid. */
  validate(type: string, inputs: Record<string, unknown>): Promise<void>;

  create(type: string, inputs: Record<string, unknown>): Promise<string>;
  update(id: string, type: string, inputs: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

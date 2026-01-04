export interface AttributeValue {
  type: 'String' | 'Number' | 'Boolean';
  value: string | number | boolean;
}

export interface ResourceBlock {
  type: 'Resource';
  resourceType: string; // e.g., "local_file"
  name: string; // e.g., "my_file"
  attributes: Record<string, AttributeValue>;
}

export type Statement = ResourceBlock;
export type Program = Statement[];

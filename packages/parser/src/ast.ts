export type AttributeValue = { type: 'String'; value: string } | { type: 'Number'; value: number } | { type: 'Boolean'; value: boolean } | { type: 'Reference'; value: string[] }; // e.g., ["resource_type", "resource_name", "attribute"]

export interface ResourceBlock {
  type: 'Resource';
  resourceType: string; // e.g., "provider_resource"
  name: string; // e.g., "my_file"
  attributes: Record<string, AttributeValue>;
}

export interface VariableBlock {
  type: 'Variable';
  name: string; // e.g., "environment"
  attributes: Record<string, AttributeValue>; // type, default, description
}

export type Statement = ResourceBlock | VariableBlock;
export type Program = Statement[];

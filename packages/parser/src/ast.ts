export type AttributeValue = { type: 'String'; value: string } | { type: 'Number'; value: number } | { type: 'Boolean'; value: boolean } | { type: 'Reference'; value: string[] }; // e.g., ["resource_type", "resource_name", "attribute"]

export interface ResourceBlock {
  type: 'Resource';
  resourceType: string; // e.g., "provider_resource"
  name: string; // e.g., "my_file"
  attributes: Record<string, AttributeValue>;
}

export type Statement = ResourceBlock;
export type Program = Statement[];

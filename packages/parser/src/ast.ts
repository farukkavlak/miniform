export type AttributeValue = { type: 'String'; value: string } | { type: 'Number'; value: number } | { type: 'Boolean'; value: boolean } | { type: 'Reference'; value: string[] }; // e.g., ["aws_s3", "my_bucket", "name"]

export interface ResourceBlock {
  type: 'Resource';
  resourceType: string; // e.g., "local_file"
  name: string; // e.g., "my_file"
  attributes: Record<string, AttributeValue>;
}

export type Statement = ResourceBlock;
export type Program = Statement[];

import { IResource, ISchema } from '@miniform/contracts';
import { AttributeValue, Program, ResourceBlock } from '@miniform/parser';
import { IState } from '@miniform/state';
import crypto from 'node:crypto';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'NO_OP';

export interface PlanAction {
  type: ActionType;
  resourceType: string;
  name: string;
  modulePath?: string[]; // Path of modules leading to this resource
  id?: string;
  attributes?: Record<string, AttributeValue>;
  changes?: Record<string, { old: AttributeValue | undefined; new: AttributeValue | undefined }>;
}

export interface PlanFile {
  version: string;
  timestamp: string;
  config_hash: string;
  actions: PlanAction[];
}

export function serializePlan(actions: PlanAction[], configContent: string): PlanFile {
  const hash = crypto.createHash('sha256').update(configContent).digest('hex');

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    config_hash: hash,
    actions,
  };
}

export function validatePlanFile(planFile: unknown): planFile is PlanFile {
  if (!planFile || typeof planFile !== 'object') return false;

  const pf = planFile as Partial<PlanFile>;
  return typeof pf.version === 'string' && typeof pf.timestamp === 'string' && typeof pf.config_hash === 'string' && Array.isArray(pf.actions);
}

function calculateDiff(
  oldAttrs: Record<string, AttributeValue>,
  newAttrs: Record<string, AttributeValue>
): Record<string, { old: AttributeValue | undefined; new: AttributeValue | undefined }> | null {
  const changes: Record<string, { old: AttributeValue | undefined; new: AttributeValue | undefined }> = {};
  let hasChanges = false;

  const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);

  for (const key of allKeys) {
    const oldValue = oldAttrs[key];
    const newValue = newAttrs[key];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { old: oldValue, new: newValue };
      hasChanges = true;
    }
  }

  return hasChanges ? changes : null;
}

function getResourceKey(resource: ResourceBlock): string {
  const prefix = (resource.modulePath || []).map((m: string) => `module.${m}`).join('.');
  const suffix = `${resource.resourceType}.${resource.name}`;
  return prefix ? `${prefix}.${suffix}` : suffix;
}

function processExistingResource(actions: PlanAction[], resource: ResourceBlock, currentResource: IResource, schemas: Record<string, ISchema>) {
  const changes = calculateDiff(currentResource.attributes as Record<string, AttributeValue>, resource.attributes);

  if (!changes) {
    actions.push({
      type: 'NO_OP',
      resourceType: resource.resourceType,
      name: resource.name,
      modulePath: resource.modulePath,
      id: currentResource.id,
    });
    return;
  }

  const schema = schemas[resource.resourceType] || {};
  const forcesNew = Object.keys(changes).some((attr) => schema[attr]?.forceNew);

  if (forcesNew)
    actions.push(
      {
        type: 'DELETE',
        resourceType: resource.resourceType,
        name: resource.name,
        modulePath: resource.modulePath,
        id: currentResource.id,
      },
      {
        type: 'CREATE',
        resourceType: resource.resourceType,
        name: resource.name,
        modulePath: resource.modulePath,
        attributes: resource.attributes,
      }
    );
  else
    actions.push({
      type: 'UPDATE',
      resourceType: resource.resourceType,
      name: resource.name,
      modulePath: resource.modulePath,
      id: currentResource.id,
      changes,
    });
}

export function plan(desiredState: Program, currentState: IState, schemas: Record<string, ISchema> = {}): PlanAction[] {
  const actions: PlanAction[] = [];
  const currentMap = new Map<string, IResource>(Object.entries(currentState.resources));
  const desiredMap = new Map<string, ResourceBlock>();

  // Map desired resources for easier lookup
  for (const stmt of desiredState)
    if (stmt.type === 'Resource') {
      const key = getResourceKey(stmt);
      desiredMap.set(key, stmt);
    }

  // 1. Check for Create, Update, or Replace
  for (const [key, resource] of desiredMap.entries()) {
    const currentResource = currentMap.get(key);
    if (currentResource) processExistingResource(actions, resource, currentResource, schemas);
    else
      actions.push({
        type: 'CREATE',
        resourceType: resource.resourceType,
        name: resource.name,
        modulePath: resource.modulePath,
        attributes: resource.attributes,
      });
  }

  // 2. Check for Delete (In state but not in desired)
  for (const [key, resource] of currentMap.entries()) {
    // If we already added a DELETE action for this key (due to replacement), skip.
    const alreadyDeleting = actions.some((a) => a.type === 'DELETE' && a.resourceType === resource.resourceType && a.name === resource.name);
    if (!desiredMap.has(key) && !alreadyDeleting)
      actions.push({
        type: 'DELETE',
        resourceType: resource.resourceType,
        name: resource.name,
        modulePath: resource.modulePath,
        id: resource.id,
      });
  }

  return actions;
}

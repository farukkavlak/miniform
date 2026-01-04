import { IResource } from '@miniform/contracts';
import { AttributeValue, Program, ResourceBlock } from '@miniform/parser';
import { IState } from '@miniform/state';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'NO_OP';

export interface PlanAction {
  type: ActionType;
  resourceType: string;
  name: string;
  id?: string;
  attributes?: Record<string, AttributeValue>;
  changes?: Record<string, { old: AttributeValue | undefined; new: AttributeValue | undefined }>;
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

export function plan(desiredState: Program, currentState: IState): PlanAction[] {
  const actions: PlanAction[] = [];
  const currentMap = new Map<string, IResource>(Object.entries(currentState.resources));
  const desiredMap = new Map<string, ResourceBlock>();

  // Map desired resources for easier lookup
  for (const stmt of desiredState)
    if (stmt.type === 'Resource') {
      const key = `${stmt.resourceType}.${stmt.name}`;
      desiredMap.set(key, stmt);
    }

  // 1. Check for Create and Update
  for (const [key, resource] of desiredMap.entries()) {
    const currentResource = currentMap.get(key);

    if (currentResource) {
      // CASE: UPDATE or NO_OP
      const changes = calculateDiff(currentResource.attributes as Record<string, AttributeValue>, resource.attributes);

      if (changes)
        actions.push({
          type: 'UPDATE',
          resourceType: resource.resourceType,
          name: resource.name,
          id: currentResource.id,
          changes,
        });
      else
        actions.push({
          type: 'NO_OP',
          resourceType: resource.resourceType,
          name: resource.name,
          id: currentResource.id,
        });
    } else
      // CASE: CREATE
      actions.push({
        type: 'CREATE',
        resourceType: resource.resourceType,
        name: resource.name,
        attributes: resource.attributes,
      });
  }

  // 2. Check for Delete (In state but not in desired)
  for (const [key, resource] of currentMap.entries())
    if (!desiredMap.has(key))
      actions.push({
        type: 'DELETE',
        resourceType: resource.resourceType,
        name: resource.name,
        id: resource.id,
      });

  return actions;
}

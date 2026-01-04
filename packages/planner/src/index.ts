import { IResource } from '@miniform/contracts';
import { Program, ResourceBlock } from '@miniform/parser';
import { IState } from '@miniform/state';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'NO_OP';

export interface PlanAction {
  type: ActionType;
  resourceType: string;
  name: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

export function plan(desiredState: Program, currentState: IState): PlanAction[] {
  const actions: PlanAction[] = [];
  const currentMap = new Map<string, IResource>(Object.entries(currentState.resources));
  const desiredMap = new Map<string, ResourceBlock>();

  // Map desired resources for easier lookup
  // Key format: "type.name" (e.g., "local_file.my_file")
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
      // Simple comparison for now (JSON stringify)
      const hasChanges = JSON.stringify(resource.attributes) !== JSON.stringify(currentResource.attributes);

      if (hasChanges)
        actions.push({
          type: 'UPDATE',
          resourceType: resource.resourceType,
          name: resource.name,
          // TODO: Detailed changes
        });
      else
        actions.push({
          type: 'NO_OP',
          resourceType: resource.resourceType,
          name: resource.name,
        });
    } else
      // CASE: CREATE
      actions.push({
        type: 'CREATE',
        resourceType: resource.resourceType,
        name: resource.name,
      });
  }

  // 2. Check for Delete (In state but not in desired)
  for (const [key, resource] of currentMap.entries())
    if (!desiredMap.has(key))
      actions.push({
        type: 'DELETE',
        resourceType: resource.resourceType,
        name: resource.name,
      });

  return actions;
}

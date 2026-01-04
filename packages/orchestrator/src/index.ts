import { IProvider } from '@miniform/contracts';
import { Graph } from '@miniform/graph';
import { Lexer, Parser } from '@miniform/parser';
import { plan, PlanAction } from '@miniform/planner';
import { IState, StateManager } from '@miniform/state';

export class Orchestrator {
  private providers: Map<string, IProvider> = new Map();
  private stateManager: StateManager;

  constructor(workingDir?: string) {
    this.stateManager = new StateManager(workingDir);
  }

  /**
   * Register a provider for specific resource types
   */
  registerProvider(provider: IProvider): void {
    for (const resourceType of provider.resources) {
      if (this.providers.has(resourceType)) throw new Error(`Provider for resource type "${resourceType}" already registered`);

      this.providers.set(resourceType, provider);
    }
  }

  /**
   * Execute a configuration file
   */
  async apply(configContent: string): Promise<void> {
    // 1. Parse config
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse();

    // 2. Load current state
    const currentState = await this.stateManager.read();

    // 3. Build dependency graph (no data needed, just topology)
    const graph = new Graph<null>();
    for (const stmt of program)
      if (stmt.type === 'Resource') {
        const key = `${stmt.resourceType}.${stmt.name}`;
        graph.addNode(key, null);
      }

    // 4. Generate execution plan
    const allActions = plan(program, currentState);
    const createUpdateActions = allActions.filter((a) => a.type !== 'DELETE');

    // 5. Execute plan in topological order (only CREATE/UPDATE)
    await this.executePlan(createUpdateActions, graph, currentState);

    // 6. Execute DELETE actions (not in graph since they're not in desired state)
    const deleteActions = allActions.filter((a) => a.type === 'DELETE');
    for (const action of deleteActions) await this.executeAction(action, currentState);

    // 7. Write final state after all operations
    await this.stateManager.write(currentState);
  }

  private async executePlan(actions: PlanAction[], graph: Graph<null>, currentState: IState): Promise<void> {
    const layers = graph.topologicalSort();

    for (const layer of layers)
      // Execute all actions in this layer in parallel
      await Promise.all(
        layer.map(async (resourceKey: string) => {
          const action = actions.find((a) => `${a.resourceType}.${a.name}` === resourceKey);
          if (!action) return;

          await this.executeAction(action, currentState);
        })
      );
  }

  private async executeAction(action: PlanAction, currentState: IState): Promise<void> {
    const provider = this.providers.get(action.resourceType);
    if (!provider) throw new Error(`No provider registered for resource type "${action.resourceType}"`);

    switch (action.type) {
      case 'CREATE': {
        if (!action.attributes) throw new Error('CREATE action missing attributes');

        const inputs = this.convertAttributes(action.attributes);
        await provider.validate(action.resourceType, inputs);

        const id = await provider.create(action.resourceType, inputs);

        currentState.resources[`${action.resourceType}.${action.name}`] = {
          id,
          type: 'Resource',
          resourceType: action.resourceType,
          name: action.name,
          attributes: action.attributes,
        };
        break;
      }

      case 'UPDATE': {
        if (!action.id) throw new Error('UPDATE action missing id');
        if (!action.changes) throw new Error('UPDATE action missing changes');

        const currentResource = currentState.resources[`${action.resourceType}.${action.name}`];
        const newAttributes = { ...currentResource.attributes };

        for (const [key, change] of Object.entries(action.changes)) if (change.new !== undefined) newAttributes[key] = change.new;

        const inputs = this.convertAttributes(newAttributes);
        await provider.validate(action.resourceType, inputs);
        await provider.update(action.id, action.resourceType, inputs);

        currentResource.attributes = newAttributes;
        break;
      }

      case 'DELETE': {
        if (!action.id) throw new Error('DELETE action missing id');

        await provider.delete(action.id);

        delete currentState.resources[`${action.resourceType}.${action.name}`];
        break;
      }

      case 'NO_OP': {
        // Do nothing
        break;
      }

      default: {
        // Should never happen if planner works correctly
        throw new Error(`Unknown action type: ${action.type}`);
      }
    }
  }

  private convertAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes))
      // AttributeValue has { type, value } structure
      result[key] = value && typeof value === 'object' && 'value' in value ? value.value : value;

    return result;
  }
}

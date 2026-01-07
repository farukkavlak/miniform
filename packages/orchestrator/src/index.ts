import { IProvider, ISchema } from '@miniform/contracts';
import { Graph } from '@miniform/graph';
import { Lexer, Parser } from '@miniform/parser';
import { plan, PlanAction } from '@miniform/planner';
import { IState, StateManager } from '@miniform/state';

export class Orchestrator {
  private providers: Map<string, IProvider> = new Map();
  private variables: Map<string, unknown> = new Map();
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

  async getSchema(resourceType: string): Promise<ISchema | undefined> {
    const provider = this.providers.get(resourceType);
    if (!provider) return undefined;

    return provider.getSchema(resourceType);
  }

  /**
   * Process variable declarations from parsed program
   */
  private processVariables(program: ReturnType<Parser['parse']>): void {
    this.variables.clear();
    for (const stmt of program)
      if (stmt.type === 'Variable') {
        const defaultValue = stmt.attributes.default?.value;
        this.variables.set(stmt.name, defaultValue);
      }
  }

  /**
   * Generate an execution plan without applying it
   */
  async plan(configContent: string): Promise<PlanAction[]> {
    // 1. Parse config
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse();

    // 2. Process variables
    this.processVariables(program);

    // 3. Load current state
    const currentState = await this.stateManager.read();

    // 4. Generate execution plan
    // Fetch schemas for all resources in desired state
    const schemas: Record<string, ISchema> = {};
    for (const stmt of program)
      if (stmt.type === 'Resource' && !schemas[stmt.resourceType]) {
        const schema = await this.getSchema(stmt.resourceType);
        if (schema) schemas[stmt.resourceType] = schema;
      }

    return plan(program, currentState, schemas);
  }

  /**
   * Execute a configuration file
   */
  async apply(configContent: string): Promise<void> {
    // 1. Generate plan
    const allActions = await this.plan(configContent);

    // 2. Load current state (needed for graph building and execution)
    const currentState = await this.stateManager.read();

    // 3. Parse config again to build graph (optimized to reuse parse result in future, but keeping simple for now)
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse();

    // 4. Build dependency graph with edges from resource references
    const graph = new Graph<null>();
    for (const stmt of program)
      if (stmt.type === 'Resource') {
        const key = `${stmt.resourceType}.${stmt.name}`;
        graph.addNode(key, null);
      }

    // Add edges for resource references (dependencies)
    for (const stmt of program)
      if (stmt.type === 'Resource') {
        const key = `${stmt.resourceType}.${stmt.name}`;
        for (const attr of Object.values(stmt.attributes))
          if (attr.type === 'Reference' && attr.value[0] !== 'var') {
            // Resource reference: [type, name, attr]
            const depKey = `${attr.value[0]}.${attr.value[1]}`;
            if (graph.hasNode(depKey)) graph.addEdge(depKey, key); // depKey -> key means key depends on depKey
          }
      }

    const createUpdateActions = allActions.filter((a) => a.type !== 'DELETE');

    // 5. Execute plan in topological order (only CREATE/UPDATE)
    await this.executePlan(createUpdateActions, graph, currentState);

    // 6. Execute DELETE actions (not in graph since they're not in desired state)
    const deleteActions = allActions.filter((a) => a.type === 'DELETE');
    for (const action of deleteActions) await this.executeAction(action, currentState);

    // 7. Add variables to state
    currentState.variables = Object.fromEntries(this.variables);

    // 8. Write final state after all operations
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
        await this.executeCreate(action, provider, currentState);
        break;
      }

      case 'UPDATE': {
        await this.executeUpdate(action, provider, currentState);
        break;
      }

      case 'DELETE': {
        await this.executeDelete(action, provider, currentState);
        break;
      }

      case 'NO_OP': {
        // Do nothing
        break;
      }

      default: {
        throw new Error(`Unknown action type: ${action.type}`);
      }
    }
  }

  private async executeCreate(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.attributes) throw new Error('CREATE action missing attributes');

    const inputs = this.convertAttributes(action.attributes, currentState);
    await provider.validate(action.resourceType, inputs);

    const id = await provider.create(action.resourceType, inputs);

    currentState.resources[`${action.resourceType}.${action.name}`] = {
      id,
      type: 'Resource',
      resourceType: action.resourceType,
      name: action.name,
      attributes: action.attributes,
    };
  }

  private async executeUpdate(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.id) throw new Error('UPDATE action missing id');
    if (!action.changes) throw new Error('UPDATE action missing changes');

    const currentResource = currentState.resources[`${action.resourceType}.${action.name}`];
    const newAttributes = { ...currentResource.attributes };

    for (const [key, change] of Object.entries(action.changes)) if (change.new !== undefined) newAttributes[key] = change.new;

    const inputs = this.convertAttributes(newAttributes, currentState);
    await provider.validate(action.resourceType, inputs);
    await provider.update(action.id, action.resourceType, inputs);

    currentResource.attributes = newAttributes;
  }

  private async executeDelete(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.id) throw new Error('DELETE action missing id');

    await provider.delete(action.id, action.resourceType);

    delete currentState.resources[`${action.resourceType}.${action.name}`];
  }

  private convertAttributes(attributes: Record<string, unknown>, state: IState): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes))
      // AttributeValue has { type, value } structure
      if (value && typeof value === 'object' && 'type' in value) {
        const attrValue = value as { type: string; value: unknown };
        if (attrValue.type === 'Reference') result[key] = this.resolveReference(attrValue.value as string[], state);
        else if (attrValue.type === 'String') result[key] = this.interpolateString(attrValue.value as string, state);
        else result[key] = attrValue.value;
      } else result[key] = value;

    return result;
  }

  /**
   * Interpolate ${...} expressions in a string
   */
  private interpolateString(value: string, state: IState): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const path = expr.trim().split('.');
      const resolved = this.resolveReference(path, state);
      return String(resolved ?? '');
    });
  }

  /**
   * Resolve a reference path to its actual value
   */
  private resolveReference(path: string[], state: IState): unknown {
    if (path.length < 2) throw new Error(`Invalid reference path: ${path.join('.')}`);

    // Variable reference: var.name
    if (path[0] === 'var') {
      const varName = path[1];
      if (!this.variables.has(varName)) throw new Error(`Variable "${varName}" is not defined`);
      return this.variables.get(varName);
    }

    // Resource reference: type.name.attribute
    if (path.length < 3) throw new Error(`Resource reference must include attribute: ${path.join('.')}`);

    const resourceKey = `${path[0]}.${path[1]}`;
    const resource = state.resources[resourceKey];
    if (!resource) throw new Error(`Resource "${resourceKey}" not found in state`);

    const attrName = path[2];
    const attrValue = resource.attributes[attrName];
    if (attrValue === undefined) throw new Error(`Attribute "${attrName}" not found on resource "${resourceKey}"`);

    if (attrValue && typeof attrValue === 'object' && 'value' in attrValue) return attrValue.value;
    return attrValue;
  }
}

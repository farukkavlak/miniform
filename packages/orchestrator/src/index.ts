import { IProvider, ISchema } from '@miniform/contracts';
import { AttributeValue, Lexer, Parser, Statement } from '@miniform/parser';
import { plan, PlanAction } from '@miniform/planner';
import { IState, StateManager } from '@miniform/state';

import { Address } from './Address';
import { ActionExecutor } from './components/ActionExecutor';
import { DependencyGraphBuilder } from './components/DependencyGraphBuilder';
import { LoadedModule, ModuleLoader } from './components/ModuleLoader';
import { ReferenceResolver } from './resolvers/ReferenceResolver';
import { ScopeManager } from './scope/ScopeManager';

export class Orchestrator {
  private providers: Map<string, IProvider> = new Map();
  private dataSources: Map<string, Record<string, unknown>> = new Map();
  private stateManager: StateManager;
  private scopeManager: ScopeManager;
  private referenceResolver: ReferenceResolver;
  private moduleLoader: ModuleLoader;
  private actionExecutor: ActionExecutor;
  private dependencyGraphBuilder: DependencyGraphBuilder;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.scopeManager = new ScopeManager();
    this.referenceResolver = new ReferenceResolver(this.scopeManager, this.dataSources);
    this.moduleLoader = new ModuleLoader(this.processVariables.bind(this), this.initializeChildVariables.bind(this), this.getAttributesMap.bind(this));
    this.dependencyGraphBuilder = new DependencyGraphBuilder(this.scopeManager);
    this.actionExecutor = new ActionExecutor(this.providers, this.convertAttributes.bind(this), this.resolveOutputByKey.bind(this));
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
   * Process variable declarations for a specific scope
   */
  private processVariables(program: Statement[], address: Address): void {
    const scope = this.scopeManager.getScope(address);

    for (const stmt of program)
      if (stmt.type === 'Variable') {
        const defaultValue = stmt.attributes.default?.value;
        // Set variable even if no default (will be undefined until set by module inputs)
        if (!this.scopeManager.getVariable(scope, stmt.name)) this.scopeManager.setVariable(scope, stmt.name, { value: defaultValue, context: address });
      }
  }

  private async processDataSources(program: Statement[], state: IState, scopeAddress: Address): Promise<void> {
    const scope = this.scopeManager.getScope(scopeAddress);

    for (const stmt of program)
      if (stmt.type === 'Data') {
        const provider = this.providers.get(stmt.dataSourceType);
        if (!provider) throw new Error(`Provider for data source type "${stmt.dataSourceType}" not registered`);

        // Resolve inputs (attributes)
        const inputs = this.convertAttributes(stmt.attributes, state, scopeAddress);

        // Validate inputs
        await provider.validate(stmt.dataSourceType, inputs);

        // Read data
        const resolvedAttributes = await provider.read(stmt.dataSourceType, inputs);

        // Store in dataSources map with scope prefix
        const dataSourceKey = scope ? `${scope}.${stmt.dataSourceType}.${stmt.name}` : `${stmt.dataSourceType}.${stmt.name}`;
        this.dataSources.set(dataSourceKey, resolvedAttributes);
      }
  }

  /**
   * Generate an execution plan without applying it
   */
  async plan(configContent: string, rootDir: string = process.cwd()): Promise<PlanAction[]> {
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse() || [];

    this.scopeManager.clear();
    this.processVariables(program, new Address([], '', ''));

    const { resources: loadedResources, modules: loadedModules } = await this.moduleLoader.loadModuleTree(rootDir, program);

    const currentState = await this.stateManager.read();

    this.dataSources.clear();
    for (const mod of loadedModules) await this.processDataSources(mod.program, currentState, mod.address);

    const virtualProgram: Statement[] = loadedResources.map((r) => ({
      ...r.block,
      modulePath: r.address.modulePath,
    }));

    const schemas: Record<string, ISchema> = {};
    for (const r of loadedResources)
      if (!schemas[r.block.resourceType]) {
        const schema = await this.getSchema(r.block.resourceType);
        if (schema) schemas[r.block.resourceType] = schema;
      }

    return plan(virtualProgram, currentState, schemas);
  }

  async apply(configContent: string, rootDir: string = process.cwd()): Promise<Record<string, unknown>> {
    const allActions = await this.plan(configContent, rootDir);
    const currentState = await this.stateManager.read();

    this.scopeManager.clear();
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const mainProgram = parser.parse() || [];

    this.processVariables(mainProgram, new Address([], '', ''));

    const { resources: loadedResources, modules: loadedModules } = await this.moduleLoader.loadModuleTree(rootDir, mainProgram);

    this.dataSources.clear();
    for (const mod of loadedModules) await this.processDataSources(mod.program, currentState, mod.address);

    const graph = this.dependencyGraphBuilder.buildExecutionGraph(loadedResources, loadedModules);

    const createUpdateActions = allActions.filter((a) => a.type !== 'DELETE');
    await this.actionExecutor.executeActionsSequentially(createUpdateActions, graph, currentState, loadedModules);

    const deleteActions = allActions.filter((a) => a.type === 'DELETE');
    for (const action of deleteActions) await this.executeAction(action, currentState);

    this.syncStateVariables(currentState);

    await this.stateManager.write(currentState);

    return this.processOutputs(mainProgram, currentState, Address.root('', ''));
  }

  private processOutputs(program: Statement[], state: IState, context: Address): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    const scope = this.scopeManager.getScope(context);

    for (const stmt of program)
      if (stmt.type === 'Output') {
        const resolved = this.resolveValue(stmt.value, state, context);
        outputs[stmt.name] = resolved;
        this.scopeManager.setOutput(scope, stmt.name, resolved);
      }

    return outputs;
  }

  private resolveValue(value: unknown, state: IState, context?: Address): unknown {
    return this.referenceResolver.resolveValue(value, state, context);
  }

  private convertAttributes(attributes: Record<string, unknown>, state: IState, context?: Address): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) result[key] = this.resolveValue(value, state, context);
    return result;
  }

  private resolveOutputByKey(key: string, loadedModules: LoadedModule[], currentState: IState): void {
    const parts = key.split('.outputs.');
    const scope = parts[0];
    const mod = loadedModules.find((m) => this.scopeManager.getScope(m.address) === scope);
    if (mod) this.processOutputs(mod.program, currentState, mod.address);
  }

  private syncStateVariables(currentState: IState): void {
    const varsObj: Record<string, Record<string, unknown>> = {};
    for (const [scope, varMap] of this.scopeManager.getAllVariables().entries()) {
      const simpleVarMap: Record<string, unknown> = {};
      for (const [k, v] of varMap.entries()) simpleVarMap[k] = v.value;
      varsObj[scope] = simpleVarMap;
    }
    currentState.variables = varsObj;
  }

  private async executeAction(action: PlanAction, currentState: IState): Promise<void> {
    const provider = this.providers.get(action.resourceType);
    if (!provider) throw new Error(`No provider registered for resource type "${action.resourceType}"`);

    switch (action.type) {
      case 'CREATE': {
        await this.actionExecutor.executeCreate(action, provider, currentState);
        break;
      }
      case 'UPDATE': {
        await this.actionExecutor.executeUpdate(action, provider, currentState);
        break;
      }
      case 'DELETE': {
        await this.actionExecutor.executeDelete(action, provider, currentState);
        break;
      }
      case 'NO_OP': {
        break;
      }
      default: {
        throw new Error(`Unknown action type: ${(action as any).type}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    }
  }

  private getAttributesMap(attributes: Record<string, AttributeValue> | undefined): Record<string, unknown> {
    const attributesMap: Record<string, unknown> = {};
    if (attributes) Object.assign(attributesMap, attributes);
    return attributesMap;
  }

  private initializeChildVariables(childAddress: Address, attributesMap: Record<string, unknown>, parentAddress: Address): void {
    const childScope = this.scopeManager.getScope(childAddress);

    for (const [key, attr] of Object.entries(attributesMap))
      if (key !== 'source')
        this.scopeManager.setVariable(childScope, key, {
          value: attr,
          context: parentAddress,
        });
  }
}

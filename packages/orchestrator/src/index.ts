import { IProvider, ISchema } from '@miniform/contracts';
import { Graph } from '@miniform/graph';
import { AttributeValue, Lexer, Parser, ResourceBlock, Statement } from '@miniform/parser';
import { plan, PlanAction } from '@miniform/planner';
import { IState, StateManager } from '@miniform/state';
import * as fs from 'node:fs';
import path from 'node:path';

import { Address } from './Address';
import { ReferenceResolver } from './resolvers/ReferenceResolver';
import { ScopeManager } from './scope/ScopeManager';

export interface LoadedResource {
  uniqueId: string; // "module.vpc.aws_subnet.private"
  address: Address;
  block: ResourceBlock;
}

export interface LoadedModule {
  address: Address;
  program: Statement[];
}

interface VariableValue {
  value: unknown;
  context: Address; // Lexical scope where this value is defined
}

export class Orchestrator {
  private providers: Map<string, IProvider> = new Map();
  private dataSources: Map<string, Record<string, unknown>> = new Map();
  private stateManager: StateManager;
  private scopeManager: ScopeManager;
  private referenceResolver: ReferenceResolver;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.scopeManager = new ScopeManager();
    this.referenceResolver = new ReferenceResolver(this.scopeManager, this.dataSources);
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
   * Recursively loads modules and flattens resources
   */
  async loadModuleTree(
    program: Statement[],
    rootDir: string,
    parentAddress: Address,
    moduleAccumulator: LoadedModule[] = []
  ): Promise<{ resources: LoadedResource[]; modules: LoadedModule[] }> {
    const resources: LoadedResource[] = [];

    // Add current module to accumulator
    moduleAccumulator.push({ address: parentAddress, program });

    // Initialize variables map for this scope
    this.processVariables(program, parentAddress);

    for (const stmt of program)
      if (stmt.type === 'Resource') {
        const address = new Address(parentAddress.modulePath, stmt.resourceType, stmt.name);
        resources.push({
          uniqueId: address.toString(),
          address,
          block: stmt,
        });
      } else if (stmt.type === 'Module') {
        const subResources = await this.loadChildModule(stmt, rootDir, parentAddress, moduleAccumulator);
        resources.push(...subResources);
      }

    return { resources, modules: moduleAccumulator };
  }

  /**
   * Generate an execution plan without applying it
   */
  async plan(configContent: string, rootDir: string = process.cwd()): Promise<PlanAction[]> {
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse() || [];

    this.scopeManager.clear();

    const { resources: loadedResources } = await this.loadModuleTree(Array.isArray(program) ? Array.from(program) : [], rootDir, new Address([], '', ''));

    const currentState = await this.stateManager.read();

    // 4. Process Data Sources for all modules
    this.dataSources.clear();
    const { modules: loadedModules } = await this.loadModuleTree(Array.isArray(program) ? Array.from(program) : [], rootDir, new Address([], '', ''));
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
    const safeProgram = Array.isArray(mainProgram) ? Array.from(mainProgram) : [];

    const { resources: loadedResources, modules: loadedModules } = await this.loadModuleTree(safeProgram, rootDir, new Address([], '', ''));

    // Process Data Sources
    this.dataSources.clear();
    for (const mod of loadedModules) await this.processDataSources(mod.program, currentState, mod.address);

    const graph = this.buildExecutionGraph(loadedResources, loadedModules);

    const createUpdateActions = allActions.filter((a) => a.type !== 'DELETE');
    await this.executeActionsSequentially(createUpdateActions, graph, currentState, loadedModules);

    const deleteActions = allActions.filter((a) => a.type === 'DELETE');
    for (const action of deleteActions) await this.executeAction(action, currentState);

    this.syncStateVariables(currentState);

    await this.stateManager.write(currentState);

    return this.processOutputs(safeProgram, currentState, Address.root('', ''));
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

  private resolveValue(value: { type: string; value: unknown } | unknown, state: IState, context?: Address): unknown {
    if (value && typeof value === 'object' && 'type' in value) {
      const typedVal = value as { type: string; value: unknown };
      if (typedVal.type === 'Reference') return this.resolveReference(typedVal.value as string[], state, context);
      if (typedVal.type === 'String') return this.interpolateString(typedVal.value as string, state, context);
      return typedVal.value;
    }
    return value;
  }

  private convertAttributes(attributes: Record<string, unknown>, state: IState, context?: Address): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) result[key] = this.resolveValue(value, state, context);
    return result;
  }

  private addResourceDependencies(stmt: ResourceBlock, graph: Graph<null>, parsedAddress: Address): void {
    const key = parsedAddress.toString();
    for (const attr of Object.values(stmt.attributes)) this.addValueDependencies(attr, graph, key, parsedAddress);
  }

  private addValueDependencies(value: unknown, graph: Graph<null>, dependentKey: string, context: Address): void {
    if (!value || typeof value !== 'object') return;

    const typedValue = value as { type: string; value: unknown };
    if (typedValue.type === 'Reference') this.addReferenceDependencies(typedValue.value as string[], graph, dependentKey, context);
    else if (typedValue.type === 'String') this.addInterpolationDependencies(typedValue.value as string, graph, dependentKey, context);
  }

  private addReferenceDependencies(refParts: string[], graph: Graph<null>, dependentKey: string, context: Address): void {
    if (refParts[0] === 'var') {
      const scope = this.scopeManager.getScope(context);
      const variable = this.scopeManager.getVariable(scope, refParts[1]);
      if (variable) this.addValueDependencies(variable.value, graph, dependentKey, variable.context);
    } else if (refParts[0] === 'module') {
      const moduleName = refParts[1];
      const outputName = refParts[2];
      const currentScope = this.scopeManager.getScope(context);
      const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;

      const depKey = `${childScope}.outputs.${outputName}`;
      if (graph.hasNode(depKey)) graph.addEdge(depKey, dependentKey);
    } else {
      const depAddr = new Address(context.modulePath, refParts[0], refParts[1]);
      const depKey = depAddr.toString();
      if (graph.hasNode(depKey)) graph.addEdge(depKey, dependentKey);
    }
  }

  private addInterpolationDependencies(content: string, graph: Graph<null>, dependentKey: string, context: Address): void {
    const exprs = content.match(/\${([^}]+)}/g) || [];
    for (const expr of exprs) {
      const pathParts = expr.slice(2, -1).trim().split('.');
      this.addReferenceDependencies(pathParts, graph, dependentKey, context);
    }
  }

  private async executeActionsSequentially(actions: PlanAction[], graph: Graph<null>, currentState: IState, loadedModules: LoadedModule[]): Promise<void> {
    const layers = graph.topologicalSort();

    for (const layer of layers)
      await Promise.all(
        layer.map(async (key: string) => {
          if (key.includes('.outputs.')) {
            this.resolveOutputByKey(key, loadedModules, currentState);
            return;
          }

          const action = actions.find((a) => new Address(a.modulePath || [], a.resourceType, a.name).toString() === key);
          if (action) await this.executeAction(action, currentState);
        })
      );
  }

  private buildExecutionGraph(loadedResources: LoadedResource[], loadedModules: LoadedModule[]): Graph<null> {
    const graph = new Graph<null>();
    for (const { uniqueId } of loadedResources) graph.addNode(uniqueId, null);

    for (const mod of loadedModules) {
      const scope = this.scopeManager.getScope(mod.address);
      for (const stmt of mod.program)
        if (stmt.type === 'Output') {
          const outputKey = scope ? `${scope}.outputs.${stmt.name}` : `outputs.${stmt.name}`;
          graph.addNode(outputKey, null);
          this.addValueDependencies(stmt.value, graph, outputKey, mod.address);
        }
    }

    for (const { address, block } of loadedResources) this.addResourceDependencies(block, graph, address);

    return graph;
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
        break;
      }
      default: {
        throw new Error(`Unknown action type: ${action.type}`);
      }
    }
  }

  private async executeCreate(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.attributes) throw new Error('CREATE action missing attributes');

    const contextAddress = new Address(action.modulePath || [], action.resourceType, action.name);
    const inputs = this.convertAttributes(action.attributes, currentState, contextAddress);

    await provider.validate(action.resourceType, inputs);
    const id = await provider.create(action.resourceType, inputs);

    const key = contextAddress.toString();
    const resources = currentState.resources; // Capture reference
    resources[key] = {
      id,
      type: 'Resource',
      resourceType: action.resourceType,
      name: contextAddress.name,
      modulePath: contextAddress.modulePath,
      attributes: inputs,
    };
  }

  private async executeUpdate(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.changes) throw new Error('UPDATE action missing changes');

    const contextAddress = new Address(action.modulePath || [], action.resourceType, action.name);

    const key = contextAddress.toString();
    const currentResource = currentState.resources[key];
    if (!currentResource) throw new Error(`Resource "${key}" not found in state for update`);

    const newAttributes = { ...currentResource.attributes };
    for (const [k, change] of Object.entries(action.changes)) if (change.new !== undefined) newAttributes[k] = change.new;

    const inputs = this.convertAttributes(newAttributes, currentState, contextAddress);

    await provider.validate(action.resourceType, inputs);
    if (!action.id) throw new Error(`UPDATE action for "${key}" missing resource ID`);
    await provider.update(action.id, action.resourceType, inputs);

    currentResource.attributes = inputs;
  }

  private async executeDelete(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.id) throw new Error('DELETE action missing id');

    const contextAddress = new Address(action.modulePath || [], action.resourceType, action.name);

    await provider.delete(action.id, action.resourceType);
    const key = contextAddress.toString();
    delete currentState.resources[key];
  }

  private interpolateString(value: string, state: IState, context?: Address): string {
    return value.replace(/\${([^}]+)}/g, (_: string, expr: string) => {
      const pathParts = expr.trim().split('.');
      const resolved = this.resolveReference(pathParts, state, context);
      return String(resolved ?? '');
    });
  }

  private resolveReference(pathParts: string[], state: IState, context?: Address): unknown {
    if (pathParts.length < 2) throw new Error(`Invalid reference path: ${pathParts.join('.')}`);

    if (pathParts[0] === 'var') return this.resolveVariableReference(pathParts, state, context);
    if (pathParts[0] === 'data') return this.resolveDataSourceReference(pathParts, context);
    if (pathParts[0] === 'module') return this.resolveModuleOutputReference(pathParts, state, context);
    return this.resolveResourceReference(pathParts, state, context);
  }

  private resolveVariableReference(pathParts: string[], state: IState, context?: Address): unknown {
    const varName = pathParts[1];
    const scope = this.scopeManager.getScope(context);

    const variable = this.scopeManager.getVariable(scope, varName);
    if (!variable) throw new Error(`Variable "${varName}" is not defined in scope "${scope}"`);

    return this.resolveValue(variable.value, state, variable.context);
  }

  private resolveModuleOutputReference(pathParts: string[], state: IState, context?: Address): unknown {
    if (pathParts.length < 3) throw new Error(`Module output reference must include output name: ${pathParts.join('.')}`);

    const moduleName = pathParts[1];
    const outputName = pathParts[2];

    const currentScope = this.scopeManager.getScope(context);
    const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;
    const output = this.scopeManager.getOutput(childScope, outputName);

    if (output === undefined) throw new Error(`Output "${outputName}" not found in module "${childScope}"`);

    return output;
  }

  private resolveDataSourceReference(pathParts: string[], context?: Address): unknown {
    if (pathParts.length < 4) throw new Error(`Data source reference must include attribute: ${pathParts.join('.')}`);

    const dataSourceType = pathParts[1];
    const dataSourceName = pathParts[2];
    const attrName = pathParts[3];

    const scope = this.scopeManager.getScope(context);
    const dataSourceKey = scope ? `${scope}.${dataSourceType}.${dataSourceName}` : `${dataSourceType}.${dataSourceName}`;

    const dataAttributes = this.dataSources.get(dataSourceKey);

    if (!dataAttributes) throw new Error(`Data source "${dataSourceKey}" not found (or not resolved yet)`);

    const attrValue = dataAttributes[attrName];

    if (attrValue === undefined) throw new Error(`Attribute "${attrName}" not found on data source "${dataSourceKey}"`);

    return attrValue;
  }

  private resolveResourceReference(pathParts: string[], state: IState, context?: Address): unknown {
    if (pathParts.length < 3) throw new Error(`Resource reference must include attribute: ${pathParts.join('.')}`);

    const address = this.parseResourceAddress(pathParts.slice(0, -1), context);
    const resourceKey = address.toString();
    const resource = state.resources[resourceKey];

    if (!resource) throw new Error(`Invalid resource reference "${pathParts.join('.')}": Resource "${resourceKey}" not found in state`);

    const attributeName = pathParts.at(-1)!;
    return this.getResolvedAttribute(resource, attributeName, pathParts.join('.'));
  }

  private parseResourceAddress(addressParts: string[], context?: Address): Address {
    if (addressParts[0] === 'module') return Address.parse(addressParts.join('.'));
    return new Address(context ? context.modulePath : [], addressParts[0], addressParts[1]);
  }

  private getResolvedAttribute(resource: { id?: string; attributes: Record<string, unknown> }, attributeName: string, fullPath: string): unknown {
    let attrValue: unknown = resource.attributes[attributeName];
    if (attrValue === undefined && attributeName === 'id') attrValue = resource.id;

    if (attrValue === undefined) throw new Error(`Invalid resource reference "${fullPath}": Attribute "${attributeName}" not found on resource`);

    // Handle reference objects stored in state (if any)
    if (attrValue && typeof attrValue === 'object' && 'type' in attrValue && 'value' in attrValue) return (attrValue as { value: unknown }).value;

    return attrValue;
  }

  private async loadChildModule(stmt: Statement, rootDir: string, parentAddress: Address, moduleAccumulator: LoadedModule[]): Promise<LoadedResource[]> {
    if (stmt.type !== 'Module') return [];

    const moduleName = stmt.name;
    const attributesMap = this.getAttributesMap(stmt.attributes);

    const sourceValue = (attributesMap.source as { value: unknown } | undefined)?.value;
    if (typeof sourceValue !== 'string') throw new Error(`Module "${moduleName}" is missing a valid "source" attribute.`);

    const moduleDir = path.resolve(rootDir, sourceValue);
    const moduleProgram = this.parseModuleFile(moduleDir);

    const childAddress = new Address([...parentAddress.modulePath, moduleName], '', '');
    this.initializeChildVariables(childAddress, attributesMap, parentAddress);

    const { resources } = await this.loadModuleTree(moduleProgram, moduleDir, childAddress, moduleAccumulator);
    return resources;
  }

  private getAttributesMap(attributes: Record<string, AttributeValue> | undefined): Record<string, unknown> {
    const attributesMap: Record<string, unknown> = {};
    if (attributes) Object.assign(attributesMap, attributes);
    return attributesMap;
  }

  private parseModuleFile(moduleDir: string): Statement[] {
    const moduleFile = path.join(moduleDir, 'main.mf');
    if (!fs.existsSync(moduleFile)) throw new Error(`Module source not found at: ${moduleFile}`);

    const moduleContent = fs.readFileSync(moduleFile, 'utf8');
    const parser = new Parser(new Lexer(moduleContent).tokenize());
    return parser.parse() || [];
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

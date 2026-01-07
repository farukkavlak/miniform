import { IProvider, ISchema } from '@miniform/contracts';
import { Graph } from '@miniform/graph';
import { Lexer, Parser, ResourceBlock } from '@miniform/parser';
import { plan, PlanAction } from '@miniform/planner';
import { IState, StateManager } from '@miniform/state';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Address } from './Address';

export interface LoadedResource {
  uniqueId: string; // "module.vpc.aws_subnet.private"
  address: Address;
  block: ResourceBlock;
}

export interface LoadedModule {
  address: Address;
  program: any[];
}

interface VariableValue {
  value: unknown;
  context: Address; // Lexical scope where this value is defined
}

export class Orchestrator {
  private providers: Map<string, IProvider> = new Map();
  // Map<ScopeAddressString, Map<VarName, VariableValue>>
  private variables: Map<string, Map<string, VariableValue>> = new Map();
  // Map<ScopeAddressString, Map<OutputName, ResolvedValue>>
  private outputsRegistry: Map<string, Map<string, unknown>> = new Map();
  private dataSources: Map<string, Record<string, unknown>> = new Map();
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
   * Process variable declarations for a specific scope
   */
  private processVariables(program: ReturnType<Parser['parse']>, scopeAddress: Address): void {
    const scope = this.getAddressScope(scopeAddress);
    if (!this.variables.has(scope)) this.variables.set(scope, new Map());
    const scopeVars = this.variables.get(scope)!;

    for (const stmt of program) {
      if (stmt.type === 'Variable') {
        const defaultValue = stmt.attributes.default?.value;
        // Only set default if not already set (e.g. by module inputs)
        if (!scopeVars.has(stmt.name))
          scopeVars.set(stmt.name, {
            value: defaultValue,
            context: scopeAddress, // Defaults are defined in the module's own scope
          });
      }
    }
  }

  private async processDataSources(program: any[], state: IState, scopeAddress: Address): Promise<void> {
    const scope = this.getAddressScope(scopeAddress);

    for (const stmt of program) {
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
  }

  /**
   * Recursively loads modules and flattens resources
   */
  async loadModuleTree(
    program: any[],
    rootDir: string,
    parentAddress: Address,
    moduleAccumulator: LoadedModule[] = []
  ): Promise<{ resources: LoadedResource[]; modules: LoadedModule[] }> {
    const resources: LoadedResource[] = [];

    // Add current module to accumulator
    moduleAccumulator.push({ address: parentAddress, program });

    // Initialize variables map for this scope
    this.processVariables(program, parentAddress);

    for (const stmt of program) {
      if (stmt.type === 'Resource') {
        const address = new Address(parentAddress.modulePath, stmt.resourceType, stmt.name);
        resources.push({
          uniqueId: address.toString(),
          address,
          block: stmt,
        });
      } else if (stmt.type === 'Module') {
        // Handle child module
        const moduleName = stmt.name;
        const rawAttributes = stmt.attributes || [];
        const attributesMap: Record<string, any> = {};

        if (Array.isArray(rawAttributes)) for (const a of rawAttributes) attributesMap[a.name] = a;
        else Object.assign(attributesMap, rawAttributes);

        const sourceAttr = attributesMap['source'];
        const sourceValue = sourceAttr ? sourceAttr.value : undefined;

        if (typeof sourceValue !== 'string') throw new Error(`Module "${moduleName}" is missing a valid "source" attribute.`);

        const sourcePath = sourceValue;
        const moduleDir = path.resolve(rootDir, sourcePath);
        const moduleFile = path.join(moduleDir, 'main.mf');

        if (!fs.existsSync(moduleFile)) throw new Error(`Module source not found at: ${moduleFile}`);

        const moduleContent = fs.readFileSync(moduleFile, 'utf-8');
        const lexer = new Lexer(moduleContent);
        const parser = new Parser(lexer.tokenize());
        const moduleProgram = parser.parse() || [];

        // Prepare child scope
        const childAddress = new Address([...parentAddress.modulePath, moduleName], '', '');
        const childScopeKey = this.getAddressScope(childAddress);

        // Pass inputs to child scope variables
        if (!this.variables.has(childScopeKey)) this.variables.set(childScopeKey, new Map());
        const childVars = this.variables.get(childScopeKey)!;

        // Process module attributes as inputs
        for (const [key, attr] of Object.entries(attributesMap)) {
          if (key === 'source') continue;
          childVars.set(key, {
            value: attr,
            context: parentAddress, // Defined in PARENT scope
          });
        }

        const { resources: subResources } = await this.loadModuleTree(Array.isArray(moduleProgram) ? Array.from(moduleProgram) : [], moduleDir, childAddress, moduleAccumulator);
        resources.push(...subResources);
      }
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

    this.variables.clear();

    const { resources: loadedResources } = await this.loadModuleTree(Array.isArray(program) ? Array.from(program) : [], rootDir, new Address([], '', ''));

    const currentState = await this.stateManager.read();

    // 4. Process Data Sources for all modules
    this.dataSources.clear();
    const { modules: loadedModules } = await this.loadModuleTree(Array.isArray(program) ? Array.from(program) : [], rootDir, new Address([], '', ''));
    for (const mod of loadedModules) {
      await this.processDataSources(mod.program, currentState, mod.address);
    }

    const virtualProgram: any[] = loadedResources.map((r) => ({
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

    this.variables.clear();
    this.outputsRegistry.clear();
    const lexer = new Lexer(configContent);
    const parser = new Parser(lexer.tokenize());
    const mainProgram = parser.parse() || [];
    const safeProgram = Array.isArray(mainProgram) ? Array.from(mainProgram) : [];

    const { resources: loadedResources, modules: loadedModules } = await this.loadModuleTree(safeProgram, rootDir, new Address([], '', ''));

    // Process Data Sources
    this.dataSources.clear();
    for (const mod of loadedModules) {
      await this.processDataSources(mod.program, currentState, mod.address);
    }

    const graph = new Graph<null>();
    for (const { uniqueId } of loadedResources) graph.addNode(uniqueId, null);

    // Add output nodes to the graph
    for (const mod of loadedModules) {
      const scope = this.getAddressScope(mod.address);
      for (const stmt of mod.program)
        if (stmt.type === 'Output') {
          const outputKey = scope ? `${scope}.outputs.${stmt.name}` : `outputs.${stmt.name}`;
          graph.addNode(outputKey, null);

          // Track dependencies for this output (any resource it refers to)
          this.addValueDependencies(stmt.value, graph, outputKey, mod.address);
        }
    }

    // Add edges for resource references
    for (const { address, block } of loadedResources) this.addResourceDependencies(block, graph, address);

    const createUpdateActions = allActions.filter((a) => a.type !== 'DELETE');
    await this.executePlan(createUpdateActions, graph, currentState, loadedModules);

    const deleteActions = allActions.filter((a) => a.type === 'DELETE');
    for (const action of deleteActions) await this.executeAction(action, currentState);

    if (!currentState.variables) currentState.variables = {};
    const varsObj: Record<string, Record<string, unknown>> = {};
    for (const [scope, varMap] of this.variables.entries()) {
      const simpleVarMap: Record<string, unknown> = {};
      for (const [k, v] of varMap.entries()) simpleVarMap[k] = v.value;
      varsObj[scope] = simpleVarMap;
    }
    currentState.variables = varsObj;

    await this.stateManager.write(currentState);

    return this.processOutputs(safeProgram, currentState, Address.root('', ''));
  }

  private processOutputs(program: any[], state: IState, context: Address): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    const scope = this.getAddressScope(context);

    for (const stmt of program) {
      if (stmt.type === 'Output') {
        const resolved = this.resolveValue(stmt.value, state, context);
        outputs[stmt.name] = resolved;

        // Store in registry
        if (!this.outputsRegistry.has(scope)) this.outputsRegistry.set(scope, new Map());
        this.outputsRegistry.get(scope)!.set(stmt.name, resolved);
      }
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

  private addValueDependencies(value: any, graph: Graph<null>, dependentKey: string, context: Address): void {
    if (!value || typeof value !== 'object') return;

    if (value.type === 'Reference') {
      const refParts = value.value as string[];
      if (refParts[0] === 'var') {
        const scope = this.getAddressScope(context);
        const variable = this.variables.get(scope)?.get(refParts[1]);
        if (variable) this.addValueDependencies(variable.value, graph, dependentKey, variable.context);
      } else if (refParts[0] === 'module') {
        const moduleName = refParts[1];
        const outputName = refParts[2];
        const currentScope = this.getAddressScope(context);
        const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;

        const depKey = `${childScope}.outputs.${outputName}`;
        if (graph.hasNode(depKey)) graph.addEdge(depKey, dependentKey);
      } else {
        const depAddr = new Address(context.modulePath, refParts[0], refParts[1]);
        const depKey = depAddr.toString();
        if (graph.hasNode(depKey)) graph.addEdge(depKey, dependentKey);
      }
    } else if (value.type === 'String') {
      const exprs = (value.value as string).match(/\${([^}]+)}/g) || [];
      for (const expr of exprs) {
        const path = expr.slice(2, -1).trim().split('.');
        this.addValueDependencies({ type: 'Reference', value: path }, graph, dependentKey, context);
      }
    }
  }

  private async executePlan(actions: PlanAction[], graph: Graph<null>, currentState: IState, loadedModules: LoadedModule[]): Promise<void> {
    const layers = graph.topologicalSort();

    for (const layer of layers) {
      await Promise.all(
        layer.map(async (key: string) => {
          if (key.includes('.outputs.')) {
            const parts = key.split('.outputs.');
            const scope = parts[0];
            const mod = loadedModules.find((m) => this.getAddressScope(m.address) === scope);
            if (mod) this.processOutputs(mod.program, currentState, mod.address);
            return;
          }

          const action = actions.find((a) => {
            const actionKey = new Address(a.modulePath || [], a.resourceType, a.name).toString();
            return actionKey === key;
          });

          if (!action) return;

          await this.executeAction(action, currentState);
        })
      );
    }
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
      case 'NO_OP':
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeCreate(action: PlanAction, provider: IProvider, currentState: IState): Promise<void> {
    if (!action.attributes) throw new Error('CREATE action missing attributes');

    const contextAddress = new Address(action.modulePath || [], action.resourceType, action.name);

    const inputs = this.convertAttributes(action.attributes, currentState, contextAddress);
    await provider.validate(action.resourceType, inputs);

    const id = await provider.create(action.resourceType, inputs);
    const key = contextAddress.toString();

    currentState.resources[key] = {
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
    for (const [k, change] of Object.entries(action.changes)) {
      if (change.new !== undefined) {
        newAttributes[k] = change.new;
      }
    }

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
      const path = expr.trim().split('.');
      const resolved = this.resolveReference(path, state, context);
      return String(resolved ?? '');
    });
  }

  private resolveReference(path: string[], state: IState, context?: Address): unknown {
    if (path.length < 2) throw new Error(`Invalid reference path: ${path.join('.')}`);

    if (path[0] === 'var') return this.resolveVariableReference(path, state, context);
    if (path[0] === 'data') return this.resolveDataSourceReference(path, context);
    if (path[0] === 'module') return this.resolveModuleOutputReference(path, state, context);
    return this.resolveResourceReference(path, state, context);
  }

  private resolveVariableReference(path: string[], state: IState, context?: Address): unknown {
    const varName = path[1];
    const scope = this.getAddressScope(context);

    const scopeVars = this.variables.get(scope);
    if (!scopeVars || !scopeVars.has(varName)) throw new Error(`Variable "${varName}" is not defined in scope "${scope}"`);

    const variable = scopeVars.get(varName)!;
    return this.resolveValue(variable.value, state, variable.context);
  }

  private resolveModuleOutputReference(path: string[], state: IState, context?: Address): unknown {
    if (path.length < 3) throw new Error(`Module output reference must include output name: ${path.join('.')}`);

    const moduleName = path[1];
    const outputName = path[2];

    const currentScope = this.getAddressScope(context);
    const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;

    const scopeOutputs = this.outputsRegistry.get(childScope);
    if (!scopeOutputs || !scopeOutputs.has(outputName)) throw new Error(`Output "${outputName}" not found in module "${childScope}"`);

    return scopeOutputs.get(outputName);
  }

  private resolveDataSourceReference(path: string[], context?: Address): unknown {
    if (path.length < 4) throw new Error(`Data source reference must include attribute: ${path.join('.')}`);

    const dataSourceType = path[1];
    const dataSourceName = path[2];
    const attrName = path[3];

    const scope = this.getAddressScope(context);
    const dataSourceKey = scope ? `${scope}.${dataSourceType}.${dataSourceName}` : `${dataSourceType}.${dataSourceName}`;

    const dataAttributes = this.dataSources.get(dataSourceKey);

    if (!dataAttributes) throw new Error(`Data source "${dataSourceKey}" not found (or not resolved yet)`);

    const attrValue = dataAttributes[attrName];

    if (attrValue === undefined) throw new Error(`Attribute "${attrName}" not found on data source "${dataSourceKey}"`);

    return attrValue;
  }

  private resolveResourceReference(path: string[], state: IState, context?: Address): unknown {
    if (path.length < 3) throw new Error(`Resource reference must include attribute: ${path.join('.')}`);

    const attributeName = path[path.length - 1];
    const addressParts = path.slice(0, -1);

    try {
      let address: Address;
      if (addressParts[0] === 'module') address = Address.parse(addressParts.join('.'));
      else address = new Address(context ? context.modulePath : [], addressParts[0], addressParts[1]);

      const resourceKey = address.toString();
      const resource = state.resources[resourceKey];
      if (!resource) throw new Error(`Resource "${resourceKey}" not found in state`);

      let attrValue: any = resource.attributes[attributeName];
      if (attrValue === undefined && attributeName === 'id') attrValue = resource.id;

      if (attrValue === undefined) throw new Error(`Attribute "${attributeName}" not found on resource "${resourceKey}"`);

      if (attrValue && typeof attrValue === 'object' && 'type' in attrValue && 'value' in attrValue) return (attrValue as { value: unknown }).value;

      return attrValue;
    } catch (e) {
      throw new Error(`Invalid resource reference "${path.join('.')}": ${(e as Error).message}`);
    }
  }

  private getAddressScope(address?: Address): string {
    if (!address) return '';
    return address.modulePath.map((p) => `module.${p}`).join('.');
  }
}

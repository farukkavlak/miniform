import { Graph } from '@miniform/graph';
import { ResourceBlock } from '@miniform/parser';

import { Address } from '../Address';
import { ScopeManager } from '../scope/ScopeManager';
import { LoadedModule, LoadedResource } from './ModuleLoader';

export class DependencyGraphBuilder {
  constructor(private scopeManager: ScopeManager) { }

  buildExecutionGraph(loadedResources: LoadedResource[], loadedModules: LoadedModule[]): Graph<null> {
    const graph = new Graph<null>();

    // Add all resources as nodes
    for (const { uniqueId } of loadedResources) graph.addNode(uniqueId, null);

    // Add output nodes and their dependencies
    for (const mod of loadedModules) {
      const scope = this.scopeManager.getScope(mod.address);
      for (const stmt of mod.program)
        if (stmt.type === 'Output') {
          const outputKey = scope ? `${scope}.outputs.${stmt.name}` : `outputs.${stmt.name}`;
          graph.addNode(outputKey, null);
          this.addValueDependencies(stmt.value, graph, outputKey, mod.address);
        }
    }

    // Add resource dependencies
    for (const { address, block } of loadedResources) this.addResourceDependencies(block, graph, address);

    return graph;
  }

  private addResourceDependencies(stmt: ResourceBlock, graph: Graph<null>, parsedAddress: Address): void {
    const dependentKey = parsedAddress.toString();
    this.addValueDependencies(stmt.attributes, graph, dependentKey, parsedAddress);
  }

  private addValueDependencies(value: unknown, graph: Graph<null>, dependentKey: string, context: Address): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) this.addValueDependencies(item, graph, dependentKey, context);
      return;
    }

    const obj = value as Record<string, unknown>;
    if (obj.type === 'Reference' && Array.isArray(obj.value)) this.addReferenceDependencies(obj.value as string[], graph, dependentKey, context);
    else if (obj.type === 'Interpolation' && typeof obj.value === 'string') this.addInterpolationDependencies(obj.value, graph, dependentKey, context);
    else for (const v of Object.values(obj)) this.addValueDependencies(v, graph, dependentKey, context);
  }

  private addReferenceDependencies(refParts: string[], graph: Graph<null>, dependentKey: string, context: Address): void {
    const refType = refParts[0];

    if (refType === 'var' || refType === 'data') return;

    if (refType === 'module') {
      const moduleName = refParts[1];
      const outputName = refParts[2];
      const currentScope = this.scopeManager.getScope(context);
      const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;
      const outputKey = `${childScope}.outputs.${outputName}`;
      graph.addEdge(outputKey, dependentKey);
    } else {
      const resourceAddress = this.parseResourceAddress(refParts.slice(0, -1), context);
      const resourceKey = resourceAddress.toString();
      graph.addEdge(resourceKey, dependentKey);
    }
  }

  private addInterpolationDependencies(content: string, graph: Graph<null>, dependentKey: string, context: Address): void {
    const regex = /\${([^}]+)}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const expr = match[1].trim();
      const pathParts = expr.split('.');
      this.addReferenceDependencies(pathParts, graph, dependentKey, context);
    }
  }

  private parseResourceAddress(addressParts: string[], context?: Address): Address {
    if (addressParts[0] === 'module') return Address.parse(addressParts.join('.'));
    return new Address(context ? context.modulePath : [], addressParts[0], addressParts[1]);
  }
}

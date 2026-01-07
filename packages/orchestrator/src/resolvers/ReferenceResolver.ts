import { IState } from '@miniform/state';

import { Address } from '../Address';
import { ScopeManager } from '../scope/ScopeManager';
import { DataSourceResolver } from './DataSourceResolver';
import { IResolver } from './IResolver';
import { ModuleOutputResolver } from './ModuleOutputResolver';
import { ResourceResolver } from './ResourceResolver';
import { VariableResolver } from './VariableResolver';

/**
 * Main reference resolver that delegates to specific resolvers based on reference type.
 * Uses Strategy pattern to handle different reference types (var, data, module, resource).
 */
export class ReferenceResolver {
  private resolvers: Map<string, IResolver> = new Map();

  constructor(scopeManager: ScopeManager, dataSources: Map<string, Record<string, unknown>>) {
    // Register resolvers for each reference type
    this.resolvers.set('var', new VariableResolver(scopeManager, this));
    this.resolvers.set('data', new DataSourceResolver(dataSources, scopeManager));
    this.resolvers.set('module', new ModuleOutputResolver(scopeManager));

    // Resource resolver handles all other types (resource_type.name.attribute)
    this.resolvers.set('_resource', new ResourceResolver(scopeManager));
  }

  /**
   * Resolve a reference path to its value
   */
  resolve(pathParts: string[], state: IState, context?: Address): unknown {
    const refType = pathParts[0];

    // Check if we have a specific resolver for this type
    const resolver = this.resolvers.get(refType);
    if (resolver) return resolver.resolve(pathParts, context || new Address([], '', ''), state);

    // Otherwise, treat as resource reference
    const resourceResolver = this.resolvers.get('_resource')!;
    return resourceResolver.resolve(pathParts, context || new Address([], '', ''), state);
  }

  /**
   * Resolve a value that might be a reference or a literal
   * This is used by VariableResolver to handle nested references
   */
  resolveValue(value: unknown, state: IState, context?: Address): unknown {
    if (!value || typeof value !== 'object') return value;

    const valueObj = value as { type?: string; value?: unknown };
    if (valueObj.type === 'Reference' && Array.isArray(valueObj.value)) return this.resolve(valueObj.value as string[], state, context);

    return value;
  }
}

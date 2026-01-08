import { IState } from '@miniform/state';

import { Address } from '../Address';
import { ScopeManager } from '../scope/ScopeManager';
import { DataSourceResolver } from './DataSourceResolver';
import { IResolver } from './IResolver';
import { ModuleOutputResolver } from './ModuleOutputResolver';
import { ResourceResolver } from './ResourceResolver';
import { VariableResolver } from './VariableResolver';

export class ReferenceResolver {
  private resolvers: Map<string, IResolver> = new Map();

  constructor(scopeManager: ScopeManager, dataSources: Map<string, Record<string, unknown>>) {
    this.resolvers.set('var', new VariableResolver(scopeManager, this));
    this.resolvers.set('data', new DataSourceResolver(dataSources, scopeManager));
    this.resolvers.set('module', new ModuleOutputResolver(scopeManager));
    this.resolvers.set('_resource', new ResourceResolver(scopeManager));
  }

  resolve(pathParts: string[], state: IState, context?: Address): unknown {
    const refType = pathParts[0];
    const resolver = this.resolvers.get(refType);
    if (resolver) return resolver.resolve(pathParts, context || new Address([], '', ''), state);

    const resourceResolver = this.resolvers.get('_resource')!;
    return resourceResolver.resolve(pathParts, context || new Address([], '', ''), state);
  }

  resolveValue(value: unknown, state: IState, context?: Address): unknown {
    if (!value || typeof value !== 'object') return value;

    const valueObj = value as { type?: string; value?: unknown };

    if (valueObj.type === 'Reference' && Array.isArray(valueObj.value)) {
      return this.resolve(valueObj.value as string[], state, context);
    }

    if (valueObj.type === 'String' && typeof valueObj.value === 'string') {
      return this.interpolateString(valueObj.value, state, context);
    }

    if ('type' in valueObj && 'value' in valueObj) {
      return valueObj.value;
    }

    return value;
  }

  interpolateString(value: string, state: IState, context?: Address): string {
    return value.replace(/\${([^}]+)}/g, (_: string, expr: string) => {
      const pathParts = expr.trim().split('.');
      const resolved = this.resolve(pathParts, state, context);
      return String(resolved ?? '');
    });
  }
}

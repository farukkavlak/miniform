import { IState } from '@miniform/state';

import { Address } from '../Address';
import { ScopeManager } from '../scope/ScopeManager';
import { IResolver } from './IResolver';

/**
 * Resolves data source references (data.type.name.attribute)
 */
export class DataSourceResolver implements IResolver {
  constructor(
    private dataSources: Map<string, Record<string, unknown>>,
    private scopeManager: ScopeManager
  ) {}

  resolve(pathParts: string[], context: Address): unknown {
    if (pathParts.length < 4) throw new Error(`Data source reference must include attribute: ${pathParts.join('.')}`);

    const [, dataSourceType, dataSourceName, attrName] = pathParts;
    const scope = this.scopeManager.getScope(context);
    const key = scope ? `${scope}.${dataSourceType}.${dataSourceName}` : `${dataSourceType}.${dataSourceName}`;

    const dataAttributes = this.dataSources.get(key);
    if (!dataAttributes) throw new Error(`Data source "${key}" not found (or not resolved yet)`);

    const attrValue = dataAttributes[attrName];
    if (attrValue === undefined) throw new Error(`Attribute "${attrName}" not found on data source "${key}"`);

    return attrValue;
  }
}

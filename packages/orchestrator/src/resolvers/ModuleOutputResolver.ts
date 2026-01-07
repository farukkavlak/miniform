import { IState } from '@miniform/state';

import { Address } from '../Address';
import { ScopeManager } from '../scope/ScopeManager';
import { IResolver } from './IResolver';

/**
 * Resolves module output references (module.name.output)
 */
export class ModuleOutputResolver implements IResolver {
  constructor(private scopeManager: ScopeManager) {}

  resolve(pathParts: string[], context: Address): unknown {
    if (pathParts.length < 3) throw new Error(`Module output reference must include output name: ${pathParts.join('.')}`);

    const [, moduleName, outputName] = pathParts;
    const currentScope = this.scopeManager.getScope(context);
    const childScope = currentScope ? `${currentScope}.module.${moduleName}` : `module.${moduleName}`;

    const output = this.scopeManager.getOutput(childScope, outputName);
    if (output === undefined) throw new Error(`Output "${outputName}" not found in module "${childScope}"`);

    return output;
  }
}

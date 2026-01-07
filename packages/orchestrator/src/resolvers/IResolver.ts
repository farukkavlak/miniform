import { IState } from '@miniform/state';

import { Address } from '../Address';

/**
 * Interface for reference resolvers.
 * Each resolver handles a specific type of reference (var, data, module, resource).
 */
export interface IResolver {
  resolve(pathParts: string[], context: Address, state: IState): unknown;
}

import { IState } from './StateManager';

/**
 * Interface for state backend implementations.
 * Enables support for different storage backends (local, S3, Azure Blob, etc.)
 */
export interface IStateBackend {
  /**
   * Read the current state
   */
  read(): Promise<IState>;

  /**
   * Write the state
   */
  write(state: IState): Promise<void>;

  /**
   * Acquire a lock to prevent concurrent modifications
   */
  lock(): Promise<void>;

  /**
   * Release the lock
   */
  unlock(): Promise<void>;
}

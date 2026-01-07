import { Address } from '../Address';

export interface VariableValue {
  value: unknown;
  context: Address; // Lexical scope where this value is defined
}

/**
 * Manages variable and output scopes for modules.
 * Provides a centralized way to store and retrieve scoped values.
 */
export class ScopeManager {
  // Map<ScopeAddressString, Map<VarName, VariableValue>>
  private variables: Map<string, Map<string, VariableValue>> = new Map();
  // Map<ScopeAddressString, Map<OutputName, ResolvedValue>>
  private outputs: Map<string, Map<string, unknown>> = new Map();

  /**
   * Get the scope string for an address
   */
  getScope(address?: Address): string {
    if (!address) return '';
    return address.modulePath.map((p) => `module.${p}`).join('.');
  }

  /**
   * Set a variable in a specific scope
   */
  setVariable(scope: string, name: string, value: VariableValue): void {
    if (!this.variables.has(scope)) this.variables.set(scope, new Map());
    this.variables.get(scope)!.set(name, value);
  }

  /**
   * Get a variable from a specific scope
   */
  getVariable(scope: string, name: string): VariableValue | undefined {
    return this.variables.get(scope)?.get(name);
  }

  /**
   * Set an output in a specific scope
   */
  setOutput(scope: string, name: string, value: unknown): void {
    if (!this.outputs.has(scope)) this.outputs.set(scope, new Map());
    this.outputs.get(scope)!.set(name, value);
  }

  /**
   * Get an output from a specific scope
   */
  getOutput(scope: string, name: string): unknown | undefined {
    return this.outputs.get(scope)?.get(name);
  }

  /**
   * Get all variables (for state persistence)
   */
  getAllVariables(): Map<string, Map<string, VariableValue>> {
    return this.variables;
  }

  /**
   * Clear all scopes
   */
  clear(): void {
    this.variables.clear();
    this.outputs.clear();
  }
}

export class Address {
  public readonly modulePath: string[];
  public readonly resourceType: string;
  public readonly name: string;

  constructor(modulePath: string[], resourceType: string, name: string) {
    this.modulePath = modulePath;
    this.resourceType = resourceType;
    this.name = name;
  }

  static root(resourceType: string, name: string): Address {
    return new Address([], resourceType, name);
  }

  static parse(input: string): Address {
    const parts = input.split('.');
    if (parts.length < 2) throw new Error(`Invalid address format: ${input}`);
    const modulePath: string[] = [];
    let i = 0;
    while (i < parts.length) {
      if (parts[i] === 'module') {
        modulePath.push(parts[i + 1]);
        i += 2;
      } else break;
    }
    const resourceType = parts[i];
    const name = parts[i + 1];
    return new Address(modulePath, resourceType, name);
  }

  toString(): string {
    const prefix = this.modulePath.map((m) => `module.${m}`).join('.');
    const suffix = `${this.resourceType}.${this.name}`;
    return prefix ? `${prefix}.${suffix}` : suffix;
  }

  equals(other: Address): boolean { return this.toString() === other.toString(); }

  withParent(moduleName: string): Address {
    return new Address([moduleName, ...this.modulePath], this.resourceType, this.name);
  }
}

import { Type } from './interfaces';
import { LogikNode } from './node';

/** An entry object containing necessary pieces to construct a node */
export class LogikNodeRegistryEntry {
  constructor(public readonly type: string, public readonly cls: Type<LogikNode>, public readonly args: any[]) {}
}

/** A registry object. All nodes must be registered before being able to use inside the graphs */
export class LogikNodeRegistry {
  private readonly nodes: Map<string, LogikNodeRegistryEntry> = new Map<string, LogikNodeRegistryEntry>();

  public register(type: string, cls: Type<LogikNode>, args: any[]): void {
    this.nodes.set(type, new LogikNodeRegistryEntry(type, cls, args));
  }

  public getAll(): LogikNodeRegistryEntry[] {
    return Array.from(this.nodes.values());
  }

  public get(type: string): LogikNodeRegistryEntry | undefined {
    return this.nodes.get(type);
  }

  public getFromInstance(instance: LogikNode): LogikNodeRegistryEntry | null {
    for (const entry of Array.from(this.nodes.values())) {
      if (instance instanceof entry.cls) {
        return entry;
      }
    }

    return null;
  }
}

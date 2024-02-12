import { DirectedGraph } from 'graphology';
import Konva from 'konva';
import { v4 as uuid } from 'uuid';
import { BehaviorSubject, Observable, Subject, filter, from, fromEvent, map, switchMap } from 'rxjs';
import { GetSet } from 'konva/lib/types';

interface Type<T> {
  new (...args: any[]): T;
}

export class LogikEventBus {
  private readonly events$: Subject<any> = new Subject<any>();

  public on(type: string): Observable<any> {
    return this.events$.pipe(filter((event) => event.type === type));
  }

  public emit(type: string, data: any): void {
    this.events$.next({ type, data });
  }
}

class LogikNodeRegistryEntry {
  constructor(public readonly type: string, public readonly cls: Type<LogikNode>, public readonly args: any[]) {}
}

export class LogikNodeRegistry {
  private readonly nodes: Map<string, LogikNodeRegistryEntry> = new Map<string, LogikNodeRegistryEntry>();

  public register(type: string, cls: Type<LogikNode>, args: any[]): void {
    this.nodes.set(type, new LogikNodeRegistryEntry(type, cls, args));
  }

  public get(type: string): LogikNodeRegistryEntry | undefined {
    return this.nodes.get(type);
  }
}

export class LogikConnection {
  public id: string = uuid();

  constructor(public readonly output: LogikSocket, public readonly input: LogikSocket) {}
}

export class LogikSocket {
  public id: string = uuid();

  constructor(public name: string, public parent: LogikNode) {}
}

export abstract class LogikNode {
  public id: string = uuid();
  public properties: Record<string, unknown> = {};
  public readonly inputs: LogikSocket[] = [];
  public readonly outputs: LogikSocket[] = [];

  constructor(public name: string) {}

  public abstract run(): void;
}

export class LogikGraph {
  public id: string = uuid();

  private readonly nodes: Map<string, LogikNode> = new Map<string, LogikNode>();
  private readonly graph: DirectedGraph = new DirectedGraph();

  public readonly onNodeAdded$ = this.bus.on('node-add');

  constructor(private readonly registry: LogikNodeRegistry, private readonly bus: LogikEventBus) {}

  private insertNode(node: LogikNode): void {
    this.nodes.set(node.id, node);

    for (const socket of [...node.inputs, ...node.outputs]) {
      this.graph.addNode(socket.id, socket);
    }

    this.bus.emit('node-add', node);
  }

  public addNode(node: string | LogikNode): void {
    if (node instanceof LogikNode) {
      this.insertNode(node);
    } else {
      const entry = this.registry.get(node);
      if (!entry) throw new Error(`[ERROR]: Node ${node} was not found in registry`);
      const instance = new entry.cls(...entry.args);
      this.insertNode(instance);
    }
  }

  public connectSockets(output: string, input: string): void {
    const outputSocket = this.graph.getNodeAttributes(output) as LogikSocket;
    const inputSocket = this.graph.getNodeAttributes(input) as LogikSocket;

    if (!inputSocket || !outputSocket)
      throw new Error(`[ERROR]: Could not find socket in the graph: ${output} or ${input}`);

    this.graph.addEdge(output, input, new LogikConnection(outputSocket, inputSocket));
  }
}

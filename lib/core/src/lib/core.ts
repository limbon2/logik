import { DirectedGraph } from 'graphology';
import { v4 as uuid } from 'uuid';
import { Observable, Subject, filter } from 'rxjs';

export interface ISerializedLogikNode {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  inputs: string[];
  outputs: string[];
}

export interface ISerializedLogikSocket {
  id: string;
  name: string;
  parentId: string;
}

export interface ISerializedLogikConnection {
  id: string;
  outputId: string;
  inputId: string;
}

export interface ISerializedLogikGraph {
  id: string;
  nodes: Record<string, ISerializedLogikNode>;
  sockets: Record<string, ISerializedLogikSocket>;
  connections: Record<string, ISerializedLogikConnection>;
}

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

  public getFromInstance(instance: LogikNode): LogikNodeRegistryEntry | null {
    for (const entry of Array.from(this.nodes.values())) {
      if (instance instanceof entry.cls) {
        return entry;
      }
    }

    return null;
  }
}

export class LogikConnection {
  public id: string = uuid();

  constructor(public readonly output: LogikSocket, public readonly input: LogikSocket) {}

  public serialize(): ISerializedLogikConnection {
    return {
      id: this.id,
      inputId: this.input.id,
      outputId: this.output.id,
    };
  }
}

export class LogikSocket {
  public id: string = uuid();

  constructor(public name: string, public parent: LogikNode) {}

  public serialize(): ISerializedLogikSocket {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parent.id,
    };
  }
}

export abstract class LogikNode {
  public id: string = uuid();
  public properties: Record<string, unknown> = {};
  public readonly inputs: LogikSocket[] = [];
  public readonly outputs: LogikSocket[] = [];

  constructor(public name: string) {}

  public abstract run(): void;

  public serialize(): ISerializedLogikNode {
    return {
      id: this.id,
      name: this.name,
      properties: this.properties,
      type: '',
      inputs: this.inputs.map((input) => input.id),
      outputs: this.outputs.map((output) => output.id),
    };
  }
}

export class LogikGraph {
  public id: string = uuid();

  private readonly nodes: Map<string, LogikNode> = new Map<string, LogikNode>();
  private readonly graph: DirectedGraph = new DirectedGraph();

  public readonly onNodeAdded$ = this.bus.on('node-add');
  public readonly onSocketConnect$ = this.bus.on('socket-connect');

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

  public connectSockets(output: string, input: string, id?: string): void {
    const outputSocket = this.graph.getNodeAttributes(output) as LogikSocket;
    const inputSocket = this.graph.getNodeAttributes(input) as LogikSocket;

    if (!inputSocket || !outputSocket)
      throw new Error(`[ERROR]: Could not find socket in the graph: ${output} or ${input}`);

    const connection = new LogikConnection(outputSocket, inputSocket);
    if (id) {
      connection.id = id;
    }
    this.graph.addEdge(output, input, connection);
    this.bus.emit('socket-connect', connection);
  }

  public deserialize(data: ISerializedLogikGraph): void {
    this.graph.clear();
    this.graph.clearEdges();
    this.nodes.clear();

    this.id = data.id;

    for (const serializedNode of Object.values(data.nodes)) {
      const node = this.registry.get(serializedNode.type);
      if (!node) throw new Error(`[ERROR]: Could not parse node type ${serializedNode.type}. Node is not in registry`);

      const instance = new node.cls(...node.args);
      instance.id = serializedNode.id;
      instance.name = serializedNode.name;
      instance.properties = serializedNode.properties;

      instance.inputs.splice(0, instance.inputs.length);
      instance.outputs.splice(0, instance.outputs.length);

      for (const inputId of serializedNode.inputs) {
        const serializedInput = data.sockets[inputId];

        const input = new LogikSocket(serializedInput.name, instance);
        input.id = serializedInput.id;
        input.name = serializedInput.name;

        instance.inputs.push(input);
      }

      for (const outputId of serializedNode.outputs) {
        const serializedOutput = data.sockets[outputId];

        const output = new LogikSocket(serializedOutput.name, instance);
        output.id = serializedOutput.id;
        output.name = serializedOutput.name;

        instance.outputs.push(output);
      }

      this.insertNode(instance);
    }

    for (const serializedConnection of Object.values(data.connections)) {
      this.connectSockets(serializedConnection.outputId, serializedConnection.inputId, serializedConnection.id);
    }
  }

  public serialize(): ISerializedLogikGraph {
    const nodes = Array.from(this.nodes.values()).reduce(
      (acc, node) => ({ ...acc, [node.id]: { ...node.serialize(), type: this.registry.getFromInstance(node)?.type } }),
      {}
    );
    const sockets = this.graph
      .nodes()
      .map((node) => this.graph.getNodeAttributes(node) as LogikSocket)
      .reduce((acc, socket) => ({ ...acc, [socket.id]: socket.serialize() }), {});

    const connections = this.graph
      .edges()
      .map((edge) => this.graph.getEdgeAttributes(edge) as LogikConnection)
      .reduce((acc, connection) => ({ ...acc, [connection.id]: connection.serialize() }), {});

    return {
      id: this.id,
      nodes,
      sockets,
      connections,
    };
  }
}

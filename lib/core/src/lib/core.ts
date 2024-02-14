import { DirectedGraph } from 'graphology';
import { v4 as uuid } from 'uuid';
import { Observable, Subject, filter } from 'rxjs';
import { topologicalSort, topologicalGenerations } from 'graphology-dag';
import { isEmpty, uniq } from 'lodash';

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
  type: string;
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

/** Possible types of sockets */
export enum LogikSocketType {
  /** Produce is the type that is used for executing the next nodes in the current chain. Used only on output sockets */
  Produce = 'produce',
  /** Consume event type is used for receiving event from producer and it executes only producer triggers it. Used only on input sockets */
  Consume = 'consume',
  /** Text socket. Contains plain text. Nothing too fancy */
  Text = 'text',
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

export class LogikNodeRegistryEntry {
  constructor(public readonly type: string, public readonly cls: Type<LogikNode>, public readonly args: any[]) {}
}

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

export class LogikConnection {
  public id: string = uuid();

  constructor(public readonly output: LogikSocket, public readonly input: LogikSocket) {
    output.connection = this;
    input.connection = this;
  }

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
  /** The connection of the socket. Assigned during connection initialization therefore cannot be accessed before */
  public connection: LogikConnection;

  constructor(public type: LogikSocketType, public name: string, public parent: LogikNode) {}

  public serialize(): ISerializedLogikSocket {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      parentId: this.parent.uuid,
    };
  }
}

export abstract class LogikNode {
  public uuid: string = uuid();
  public properties: Record<string, unknown> = {};
  public readonly inputs: LogikSocket[] = [];
  public readonly outputs: LogikSocket[] = [];
  public isRoot: boolean = false;

  constructor(public name: string) {}

  /** Get property value at input index */
  protected getInputProperty(index: number, property: string): any {
    const socket = this.inputs[index];
    if (!socket)
      throw new Error(
        `[ERROR]: Failed to get property ${property} of socket with index ${index} on node ${this.name} - ${this.uuid}. Socket was not found in inputs`
      );
    return socket.connection.input.parent.properties[property];
  }

  /** Assign a value to a particular property in an output socket */
  protected setOutputProperty(index: number, property: string, value: any): void {
    const socket = this.outputs[index];
    if (!socket)
      throw new Error(
        `[ERROR]: Failed to assign property ${property} of socket with index ${index} on node ${this.name} - ${this.uuid}. Socket was not found in outputs`
      );
    if (socket.connection) {
      socket.connection.input.parent.properties[property] = value;
    }
  }

  public abstract run(): void;

  public serialize(): ISerializedLogikNode {
    return {
      id: this.uuid,
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
  public readonly onNodeRemoved$ = this.bus.on('node-removed');
  public readonly onSocketConnect$ = this.bus.on('socket-connect');
  public readonly onSocketDisconnect$ = this.bus.on('socket-disconnect');

  constructor(public readonly registry: LogikNodeRegistry, private readonly bus: LogikEventBus) {}

  private insertNode(node: LogikNode): void {
    this.nodes.set(node.uuid, node);

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

  /** Remove a node from the graph by its id */
  public removeNode(nodeId: string): void {
    /** Find possible node connections */
    const edges = this.graph.edges().filter((id) => {
      const connection = this.graph.getEdgeAttributes(id) as LogikConnection;
      return connection.input.parent.uuid === nodeId || connection.output.parent.uuid === nodeId;
    });

    /** If node had any connections then remove the sockets connections first */
    if (edges.length) {
      edges.forEach((edge) => {
        /** Get the connection to pass it to the disconnect event */
        const connection = this.graph.getEdgeAttributes(edge);
        this.graph.dropEdge(edge);
        /** Emit event for the disconnected socket */
        this.bus.emit('socket-disconnect', connection);
      });
    }

    /** Find nodes sockets presented in the graph */
    const sockets: string[] = this.graph.nodes().filter((id) => {
      const socket = this.graph.getNodeAttributes(id) as LogikSocket;
      return socket.parent.uuid === nodeId;
    });
    /** Remove each socket */
    sockets.forEach((socket) => {
      this.graph.dropNode(socket);
    });

    /** Find the node to be removed */
    const node = this.nodes.get(nodeId);
    /** And remove it */
    this.nodes.delete(nodeId);
    /** Emit event about the node that was removed */
    this.bus.emit('node-removed', node);
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

  /** Run the current graph. Execute all nodes */
  public run(): void {
    /** Find the graph root nodes */
    const roots = uniq(
      this.graph
        .nodes()
        .map((socket) => (this.graph.getNodeAttributes(socket) as LogikSocket).parent)
        .filter((node) => node.isRoot)
    );

    /** Make a set of nodes that were parsed */
    const visited = new Set<LogikNode>();

    /** Construct a tree of node executions */
    const makeTree = (item: LogikNode): any => {
      const next = item.outputs
        .filter((output) => output.connection)
        .filter((output) => !visited.has(output.connection.input.parent))
        .map((output) => output.connection.input.parent);
      const dependencies = item.inputs
        .filter((input) => input.connection)
        .filter((output) => !visited.has(output.connection.output.parent))
        .map((input) => input.connection.output.parent);

      visited.add(item);

      return {
        id: item.uuid,
        name: item.name,
        next: next.map((n: any) => makeTree(n)),
        dependencies: dependencies.map((n: any) => makeTree(n)),
      };
    };

    const tree = roots.map(makeTree);

    /** Run each node in correct order */
    const runTree = (t: any[]): void => {
      for (const item of t) {
        /** Find the node */
        const node = this.nodes.get(item.id);

        /** Run its dependencies if any */
        if (item.dependencies) {
          runTree(item.dependencies);
        }
        /** Run the node */
        node?.run();
        /** Run the next one using the same logic */
        runTree(item.next);
      }
    };

    runTree(tree);
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
      instance.uuid = serializedNode.id;
      instance.name = serializedNode.name;
      instance.properties = serializedNode.properties;

      instance.inputs.splice(0, instance.inputs.length);
      instance.outputs.splice(0, instance.outputs.length);

      for (const inputId of serializedNode.inputs) {
        const serializedInput = data.sockets[inputId];

        const type = LogikSocketType[serializedInput.type as keyof typeof LogikSocketType];
        const input = new LogikSocket(type, serializedInput.name, instance);
        input.id = serializedInput.id;
        input.name = serializedInput.name;

        instance.inputs.push(input);
      }

      for (const outputId of serializedNode.outputs) {
        const serializedOutput = data.sockets[outputId];

        const type = LogikSocketType[serializedOutput.type as keyof typeof LogikSocketType];
        const output = new LogikSocket(type, serializedOutput.name, instance);
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
      (acc, node) => ({
        ...acc,
        [node.uuid]: { ...node.serialize(), type: this.registry.getFromInstance(node)?.type },
      }),
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

import { DirectedGraph } from 'graphology';
import { v4 as uuid } from 'uuid';
import { uniq } from 'lodash';
import { LogikSocketType, ISerializedLogikGraph } from './interfaces';
import { LogikEventBus } from './event-bus';
import { LogikNodeRegistry } from './node-registry';
import { LogikConnection } from './connection';
import { LogikSocket } from './socket';
import { LogikNode } from './node';

/** The graph class. Use for holding nodes, validate socket connections and actually running nodes that were added to the graph */
export class LogikGraph {
  public id: string = uuid();

  private readonly nodes: Map<string, LogikNode> = new Map<string, LogikNode>();
  private readonly graph: DirectedGraph = new DirectedGraph();

  public readonly onNodeAdded$ = this.bus.on('node-add');
  public readonly onNodeRemoved$ = this.bus.on('node-removed');
  public readonly onSocketConnect$ = this.bus.on('socket-connect');
  public readonly onSocketDisconnect$ = this.bus.on('socket-disconnect');

  constructor(public readonly registry: LogikNodeRegistry, public readonly bus: LogikEventBus) {}

  private insertNode(node: LogikNode): void {
    this.nodes.set(node.uuid, node);

    for (const socket of [...node.inputs, ...node.outputs]) {
      this.graph.addNode(socket.id, socket);
    }

    this.bus.emit('node-add', node);
  }

  /** Check that socket types are correct before connecting them */
  public isSocketConnectionValid(socket1: LogikSocket, socket2: LogikSocket): boolean {
    if (socket1.type === LogikSocketType.Produce) return socket2.type === LogikSocketType.Consume;
    if (socket1.type === LogikSocketType.Consume) return socket2.type === LogikSocketType.Produce;
    return socket1.type === socket2.type;
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

  /** Create a connection between two sockets */
  public connectSockets(output: string, input: string, id?: string): void {
    /** Find the corresponding sockets in the graph */
    const outputSocket = this.graph.getNodeAttributes(output) as LogikSocket;
    const inputSocket = this.graph.getNodeAttributes(input) as LogikSocket;

    /** If either of sockets was not found. Then there is something wrong with the ids and throw an error */
    if (!inputSocket || !outputSocket)
      throw new Error(`[ERROR]: Could not find socket in the graph: ${output} or ${input}`);

    /** Validate socket connection */
    if (this.isSocketConnectionValid(outputSocket, inputSocket)) {
      let connection: LogikConnection;
      /** Check if we connecting sockets from input to output */
      if (outputSocket.isInput) {
        /** Reverse if it is the case */
        connection = new LogikConnection(inputSocket, outputSocket, this);
      } else {
        connection = new LogikConnection(outputSocket, inputSocket, this);
      }

      /** If we provided an explicit id. Used during deserialization */
      if (id) {
        connection.id = id;
      }
      /** Add the connection to the graph */
      this.graph.addEdge(output, input, connection);
      /** Emit event about sockets being connected */
      this.bus.emit('socket-connect', connection);
    }
  }

  /** Disconnect socket connection */
  public disconnectSockets(connection: LogikConnection): void {
    this.graph.dropDirectedEdge(connection.output.id, connection.input.id);
    connection.output.connections = connection.output.connections.filter((c) => c !== connection);
    connection.input.connections = connection.input.connections.filter((c) => c !== connection);
    this.bus.emit('socket-disconnect', connection);
  }

  /** Run the current graph. Execute all nodes */
  /** @TODO This might not work correctly */
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
        .filter((output) => output.connections.length)
        .flatMap((output) => output.connections)
        .filter((connection) => !visited.has(connection.input.parent))
        .map((connection) => connection.input.parent);
      const dependencies = item.inputs
        .filter((input) => input.connections.length)
        .flatMap((input) => input.connections)
        .filter((connection) => !visited.has(connection.output.parent))
        .map((connection) => connection.output.parent);

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
        const input = new LogikSocket(
          type,
          serializedInput.property,
          serializedInput.name,
          serializedInput.editable,
          serializedInput.multipleConnections,
          instance,
          true
        );
        input.id = serializedInput.id;
        input.name = serializedInput.name;

        instance.inputs.push(input);
      }

      for (const outputId of serializedNode.outputs) {
        const serializedOutput = data.sockets[outputId];

        const type = LogikSocketType[serializedOutput.type as keyof typeof LogikSocketType];
        const output = new LogikSocket(
          type,
          serializedOutput.property,
          serializedOutput.name,
          serializedOutput.editable,
          serializedOutput.multipleConnections,
          instance
        );
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

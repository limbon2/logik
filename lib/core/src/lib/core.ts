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

export class LogikEditorDnDHandler {
  public draggedNode: LogikEditorNode | null = null;
  public draggedLine: LogikEditorSocketLine | null = null;
}

export class LogikEditorSocketLine extends Konva.Line {
  private readonly target$: BehaviorSubject<LogikEditorSocket | null> = new BehaviorSubject<LogikEditorSocket | null>(
    null
  );

  public get target(): LogikEditorSocket | null {
    return this.target$.getValue();
  }
  public set target(value: LogikEditorSocket | null) {
    this.target$.next(value);
    if (value) {
      this.updatePoints();
    }
  }

  constructor(public readonly origin: LogikEditorSocket) {
    super();

    this.strokeWidth(2);
    this.stroke('black');

    this.origin.parent?.on('dragmove', this.updatePoints.bind(this));

    this.target$.subscribe((target) => {
      if (target) {
        target.parent?.on('dragmove', this.updatePoints.bind(this));
      }
    });
  }

  private updatePoints(): void {
    const { x, y } = this.origin.getAbsolutePosition();

    if (this.target) {
      const { x: tx, y: ty } = this.target.getAbsolutePosition();
      this.points([x, y, tx, ty]);
    } else {
      const points = this.points();
      this.points([x, y, points[2], points[3]]);
    }
  }
}

export class LogikEditorSocket extends Konva.Group {
  constructor(public readonly model: LogikSocket, isInput: boolean, dndHandler: LogikEditorDnDHandler) {
    super();

    const shape = new Konva.Circle({ radius: 4, stroke: 'black' });
    const name = new Konva.Text({ y: -5, text: model.name, fill: 'black' });

    if (isInput) {
      name.x(shape.x() + shape.radius() * 2);
      this.add(shape, name);
    } else {
      name.x(shape.x() - shape.radius() * 2 - name.width());
      this.add(name, shape);
    }

    this.on('mousedown', (event) => {
      event.cancelBubble = true;
      const line = new LogikEditorSocketLine(this);
      this.getLayer()?.add(line);
      dndHandler.draggedLine = line;
    });

    this.on('mouseup', () => {
      if (dndHandler.draggedLine && dndHandler.draggedLine.origin !== this) {
        dndHandler.draggedLine.target = this;
      }
    });

    this.on('mouseenter', () => shape.fill('red'));
    this.on('mouseleave', () => shape.fill('white'));
  }
}

export class LogikEditorNodeName extends Konva.Group {
  constructor(public readonly model: LogikNode) {
    super();
    const background = new Konva.Rect({ width: 200, height: 24, fill: '#dd0000', stroke: 'black' });

    const name = new Konva.Text({ x: 100, y: 12, fontSize: 16, text: model.name, fill: 'white' });
    name.offsetX(name.width() / 2);
    name.offsetY(name.height() / 2);

    this.add(background, name);
  }
}

export class LogikEditorNode extends Konva.Group {
  private readonly socketGap: number = 16;

  constructor(public readonly model: LogikNode, dndHandler: LogikEditorDnDHandler) {
    super();
    this.draggable(true);

    const background = new Konva.Rect({ stroke: 'black', x: this.x(), y: this.y(), width: 200 });
    const name = new LogikEditorNodeName(model);
    this.add(background, name);

    const maxIoLength = Math.max(this.model.inputs.length, this.model.outputs.length);
    background.height(40 + this.socketGap * maxIoLength);

    for (let i = 0; i < this.model.outputs.length; i++) {
      const output = this.model.outputs[i];
      const socket = new LogikEditorSocket(output, false, dndHandler);
      socket.x(background.width() - socket.width() / 2 - 16);
      socket.y(24 + 16 + i * this.socketGap);
      this.add(socket);
    }

    for (let i = 0; i < this.model.inputs.length; i++) {
      const input = this.model.inputs[i];
      const socket = new LogikEditorSocket(input, true, dndHandler);
      socket.x(socket.width() / 2 + 16);
      socket.y(24 + 16 + i * this.socketGap);
      this.add(socket);
    }
  }
}

export class LogikEditor {
  private readonly stage: Konva.Stage;
  private readonly layer: Konva.Layer;

  private readonly dndHandler: LogikEditorDnDHandler = new LogikEditorDnDHandler();

  constructor(private readonly graph: LogikGraph, private readonly container: HTMLDivElement) {
    this.stage = new Konva.Stage({ width: container.clientWidth, height: container.clientHeight, container });
    this.layer = new Konva.Layer();

    this.graph.onNodeAdded$.subscribe((event) => {
      const node = new LogikEditorNode(event.data, this.dndHandler);
      this.layer.add(node);
    });

    this.stage.on('mouseup', () => {
      if (this.dndHandler.draggedLine && !this.dndHandler.draggedLine.target) {
        this.dndHandler.draggedLine.destroy();
      }

      if (this.dndHandler.draggedLine && this.dndHandler.draggedLine.target) {
        this.graph.connectSockets(
          this.dndHandler.draggedLine.origin.model.id,
          this.dndHandler.draggedLine.target.model.id
        );
      }

      this.dndHandler.draggedLine = null;
      this.dndHandler.draggedNode = null;
    });

    this.stage.on('mousemove', (event) => {
      const line = this.dndHandler.draggedLine;

      if (line) {
        line.points([
          line.origin.getAbsolutePosition().x,
          line.origin.getAbsolutePosition().y,
          event.evt.x,
          event.evt.y,
        ]);
      }
    });
  }

  public render(): void {
    this.stage.add(this.layer);
  }
}

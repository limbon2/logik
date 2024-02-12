import { LogikSocket, LogikNode, LogikGraph, LogikConnection, ISerializedLogikGraph } from '@logik/core';
import Konva from 'konva';
import { BehaviorSubject } from 'rxjs';

export interface ISerializedLogikEditor {
  nodes: Record<string, { x: number; y: number }>;
  graph: ISerializedLogikGraph;
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

  public updatePoints(): void {
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

    /** TODO: This can be optimized */
    this.graph.onSocketConnect$.subscribe((event: { data: LogikConnection }) => {
      const { data: connection } = event;

      const nodes = this.layer.getChildren((child) => child instanceof LogikEditorNode) as LogikEditorNode[];
      const sockets = nodes.flatMap((node) =>
        node.getChildren().filter((child) => child instanceof LogikEditorSocket)
      ) as LogikEditorSocket[];

      const origin = sockets.find((socket) => socket.model === connection.output);
      const target = sockets.find((socket) => socket.model === connection.input);

      if (!origin || !target)
        throw new Error(
          `[ERROR]: Could not instantiate line between sockets ${connection.output.id} and ${connection.input.id}. Sockets were not found in the editor`
        );

      const line = new LogikEditorSocketLine(origin);
      line.target = target;

      this.layer.add(line);
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

  public deserialize(data: ISerializedLogikEditor): void {
    this.layer.clear();
    this.graph.deserialize(data.graph);

    const children = this.layer.getChildren((child) => child instanceof LogikEditorNode) as LogikEditorNode[];

    const nodes: Record<string, LogikEditorNode> = children.reduce(
      (acc, node) => ({ ...acc, [node.model.id]: node }),
      {}
    );

    for (const [id, position] of Object.entries(data.nodes)) {
      const node = nodes[id];
      node.x(position.x);
      node.y(position.y);
    }

    const lines = this.layer.getChildren((child) => child instanceof LogikEditorSocketLine) as LogikEditorSocketLine[];

    for (const line of lines) {
      line.updatePoints();
    }
  }

  public serialize(): ISerializedLogikEditor {
    const nodes = (this.layer.getChildren((child) => child instanceof LogikEditorNode) as LogikEditorNode[]).reduce(
      (acc, node) => ({ ...acc, [node.model.id]: { x: node.x(), y: node.y() } }),
      {}
    );

    return {
      nodes,
      graph: this.graph.serialize(),
    };
  }
}

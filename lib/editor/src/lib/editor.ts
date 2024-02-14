import { LogikSocket, LogikNode, LogikGraph, LogikConnection, ISerializedLogikGraph } from '@logik/core';
import Konva from 'konva';
import { BehaviorSubject, Observable } from 'rxjs';
import { difference } from 'lodash';
import { LogikEditorContextMenu } from './nodes-context-menu/nodes-context-menu';

export interface ISerializedLogikEditor {
  nodes: Record<string, { x: number; y: number }>;
  graph: ISerializedLogikGraph;
}

export class LogikEditorDnDHandler {
  private _draggedNodes: BehaviorSubject<LogikEditorNode[]> = new BehaviorSubject<LogikEditorNode[]>([]);
  public get draggedNodes(): LogikEditorNode[] {
    return this._draggedNodes.getValue();
  }
  public set draggedNodes(value: LogikEditorNode[]) {
    const previous = difference(this._draggedNodes.getValue(), value);
    previous.forEach((node) => node.isSelected(false));
    value.forEach((node) => node.isSelected(true));
    this._draggedNodes.next(value);
  }
  public draggedNodes$: Observable<LogikEditorNode[]> = this._draggedNodes.asObservable();

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

  private readonly origin$: BehaviorSubject<LogikEditorSocket>;
  public get origin(): LogikEditorSocket {
    return this.origin$.getValue();
  }
  public set origin(value: LogikEditorSocket) {
    this.origin$.next(value);
  }

  constructor(origin: LogikEditorSocket, public readonly connection: LogikConnection | null = null) {
    super();

    this.origin$ = new BehaviorSubject<LogikEditorSocket>(origin);

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

    /** On socket click */
    this.on('mousedown', (event) => {
      /** Prevent upper events from being handled */
      event.cancelBubble = true;
      /** Create a temporary line that follows mouse cursor */
      const line = new LogikEditorSocketLine(this);
      /** Add the line to the parent layer */
      this.getLayer()?.add(line);
      /** Set the line in the dnd handler */
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
    const background = new Konva.Rect({ x: 1, y: 1, width: 200 - 1, height: 24 - 1, fill: '#dd0000' });

    const name = new Konva.Text({ x: 100, y: 12, fontSize: 16, text: model.name, fill: 'white' });
    name.offsetX(name.width() / 2);
    name.offsetY(name.height() / 2);

    this.add(background, name);
  }
}

export class LogikEditorNode extends Konva.Group {
  private readonly socketGap: number = 16;
  private background: Konva.Rect;

  constructor(public readonly model: LogikNode, dndHandler: LogikEditorDnDHandler) {
    super();
    this.draggable(true);

    this.background = new Konva.Rect({ stroke: 'black', x: this.x(), y: this.y(), width: 200 });
    const name = new LogikEditorNodeName(model);
    this.add(this.background, name);

    const maxIoLength = Math.max(this.model.inputs.length, this.model.outputs.length);
    this.background.height(40 + this.socketGap * maxIoLength);

    for (let i = 0; i < this.model.outputs.length; i++) {
      const output = this.model.outputs[i];
      const socket = new LogikEditorSocket(output, false, dndHandler);
      socket.x(this.background.width() - socket.width() / 2 - 16);
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

    this.width(this.background.width());
    this.height(this.background.height());
  }

  public isSelected(value: boolean): void {
    if (value) {
      this.background.stroke('blue');
    } else {
      this.background.stroke('black');
    }
  }
}

export class LogikInvisibleDragGroup extends Konva.Group {
  private readonly background = new Konva.Rect({ stroke: 'green' });

  constructor(private readonly dndHandler: LogikEditorDnDHandler) {
    super();

    this.add(this.background);

    this.dndHandler.draggedNodes$.subscribe((nodes) => {
      if (nodes.length > 1) {
        this.draggable(true);
        this.removeChildren();

        nodes.forEach((node) => node.draggable(false));

        this.add(...nodes);

        const maxX = Math.max(...nodes.map((node) => node.x() + node.width()));
        const maxY = Math.max(...nodes.map((node) => node.y() + node.height()));
        const minX = Math.min(...nodes.map((node) => node.x()));
        const minY = Math.min(...nodes.map((node) => node.y()));

        this.background.x(minX);
        this.background.y(minY);
        this.background.width(-(minX - maxX));
        this.background.height(-(minY - maxY));
      }
    });

    this.on('dragmove', () => {
      this.getLayer()
        ?.getChildren((child) => child instanceof LogikEditorSocketLine)
        .forEach((line) => {
          (line as LogikEditorSocketLine).updatePoints();
        });
    });
  }

  public override removeChildren(): this {
    this.getChildren((child) => child instanceof LogikEditorNode).forEach((node) => {
      const { x, y } = node.getAbsolutePosition();
      node.draggable(true);
      node.x(x);
      node.y(y);
      this.getLayer()?.add(node);
    });
    return this;
  }

  public override destroy(): this {
    this.removeChildren();
    super.destroy();
    return this;
  }

  public clear(): void {
    this.removeChildren();
    this.draggable(false);

    this.background.x(0);
    this.background.y(0);
    this.background.width(0);
    this.background.height(0);

    this.x(0);
    this.y(0);
    this.width(0);
    this.height(0);
  }
}

export class LogikEditor {
  private readonly stage: Konva.Stage;
  private readonly layer: Konva.Layer;

  private readonly dndHandler: LogikEditorDnDHandler = new LogikEditorDnDHandler();

  /** Rectangle which is used to select a group of nodes */
  private groupRect: Konva.Rect | null = null;
  /** An invisible group that is used to drag multiple nodes at the same time */
  private invisibleGroup: LogikInvisibleDragGroup = new LogikInvisibleDragGroup(this.dndHandler);

  constructor(private readonly graph: LogikGraph, private readonly container: HTMLDivElement) {
    this.stage = new Konva.Stage({ width: container.clientWidth, height: container.clientHeight, container });
    this.stage.container().tabIndex = 1;
    this.stage.container().focus();

    this.layer = new Konva.Layer();
    this.layer.add(this.invisibleGroup);

    this.graph.onNodeAdded$.subscribe((event) => {
      const node = new LogikEditorNode(event.data, this.dndHandler);
      this.layer.add(node);
    });

    /** Subscribe to socket disconnection */
    this.graph.onSocketDisconnect$.subscribe((event: { data: LogikConnection }) => {
      /** Find all lines presented in the editor */
      const lines = this.layer.getChildren(
        (child) => child instanceof LogikEditorSocketLine
      ) as LogikEditorSocketLine[];

      for (const line of lines) {
        /** If line has a connection that equals the connection emitted from the event */
        if (line.connection === event.data) {
          /** Remove it */
          line.remove();
        }
      }
    });

    /** Subscribe to node removal */
    this.graph.onNodeRemoved$.subscribe((event: { data: LogikNode }) => {
      /** Find all nodes presented in the editor */
      const nodes = this.layer.getChildren((child) => child instanceof LogikEditorNode) as LogikEditorNode[];
      /** Find a node that is associated with the node from the graph */
      const node = nodes.find((n) => n.model === event.data);
      /** If for some reason node is not present in the editor. Throw an error */
      if (!node) {
        throw new Error(
          `[ERROR]: Failure during node removal. The node ${event.data.uuid} was not found in the editor`
        );
      }
      /** Remove the node */
      node.remove();
    });

    /** @TODO This can be optimized */
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

      const line = new LogikEditorSocketLine(origin, connection);
      line.target = target;

      this.layer.add(line);
    });

    /** Subscribe to context menu click event */
    this.stage.container().addEventListener('contextmenu', (event) => {
      /** Prevent default browser context menu from appearing */
      event.preventDefault();
      event.stopPropagation();
      /** Show our context menu */
      this.showContextMenu(event.x, event.y);
    });

    /** Subscribe to key events happening inside the stages container */
    this.stage.container().addEventListener('keydown', (event) => {
      /** Handle remove buttons click */
      if (event.key === 'Backspace' || event.key === 'Delete') {
        /** Get all selected nodes */
        this.dndHandler.draggedNodes.forEach((node) => {
          /** And remove them from the graph.
           *  The rest happens after onNodeRemoved event and onSocketDisconnect event if the node had any connections
           */
          this.graph.removeNode(node.model.uuid);
        });
      }
    });

    this.stage.on('mousedown', (event) => {
      if (event.evt.button === 2) {
        return;
      }

      if (!(event.target.parent instanceof LogikEditorNode) && event.target.parent !== this.invisibleGroup) {
        this.drawGroupRect(event.evt.x, event.evt.y);
      } else if (
        event.target.parent instanceof LogikEditorNode &&
        !(event.target.parent.parent instanceof LogikInvisibleDragGroup)
      ) {
        this.dndHandler.draggedNodes = [event.target.parent];
      }
    });

    this.stage.on('mouseup', (event) => {
      if (event.evt.button === 2) {
        return;
      }

      if (event.target.parent !== this.invisibleGroup) {
        if (event.target.parent?.parent === this.invisibleGroup) {
          return;
        }

        this.invisibleGroup.clear();
      }

      /** If we drag a line from a socket but we haven't connected it to anything */
      if (this.dndHandler.draggedLine && !this.dndHandler.draggedLine.target) {
        /** Remove the line */
        this.dndHandler.draggedLine.destroy();
        this.dndHandler.draggedLine = null;
      }

      /** If we drag a line from a socket and also has just connected it to other socket*/
      if (this.dndHandler.draggedLine && this.dndHandler.draggedLine.target) {
        /** Connected the sockets in the graph, the rest happens after onSocketConnect emits */
        this.graph.connectSockets(
          this.dndHandler.draggedLine.origin.model.id,
          this.dndHandler.draggedLine.target.model.id
        );
        /**
         * We still destroy the line because there will be a new one created after onSocketConnect event
         * @TODO Maybe we can reuse the line and not create another one?
         */
        this.dndHandler.draggedLine.destroy();
        this.dndHandler.draggedLine = null;
      }

      /** TODO: Sometimes breaks when mouse is outside of browser window */
      if (this.groupRect) {
        const nodes = this.findNodesInsideGroupRect(event.evt.x, event.evt.y);
        this.dndHandler.draggedNodes = nodes;

        this.groupRect?.destroy();
        this.groupRect = null;
      }
    });

    this.stage.on('mousemove', (event) => {
      if (this.groupRect) {
        this.groupRect.width(-(this.groupRect.x() - event.evt.x));
        this.groupRect.height(-(this.groupRect.y() - event.evt.y));
        return;
      }

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

  private findNodesInsideGroupRect(startX: number, startY: number): LogikEditorNode[] {
    const result: LogikEditorNode[] = [];

    if (this.groupRect) {
      const overlaps = (p1: number, l1: number, p2: number, l2: number) => {
        const highestStartPoint = Math.max(p1, p2);
        const lowestEndPoint = Math.min(p1 + l1, p2 + l2);

        return highestStartPoint < lowestEndPoint;
      };

      const nodes = this.layer.getChildren((child) => child instanceof LogikEditorNode) as LogikEditorNode[];

      const invert = this.groupRect.width() < 0 || this.groupRect.height() < 0;

      for (const node of nodes) {
        if (
          overlaps(node.x(), node.width(), invert ? startX : this.groupRect.x(), Math.abs(this.groupRect.width())) &&
          overlaps(node.y(), node.height(), invert ? startY : this.groupRect.y(), Math.abs(this.groupRect.height()))
        ) {
          result.push(node);
        }
      }
    }

    return result;
  }

  private drawGroupRect(startX: number, startY: number): void {
    this.groupRect = new Konva.Rect();
    this.groupRect.stroke('black');
    this.groupRect.strokeWidth(2);
    this.groupRect.x(startX);
    this.groupRect.y(startY);
    this.layer.add(this.groupRect);
  }

  private showContextMenu(x: number, y: number): void {
    const menu = new LogikEditorContextMenu(this.graph.registry, x, y);
    document.body.appendChild(menu);

    menu.onItemSelect$.subscribe((entry) => {
      this.graph.addNode(entry.type);
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
      (acc, node) => ({ ...acc, [node.model.uuid]: node }),
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
      (acc, node) => ({ ...acc, [node.model.uuid]: { x: node.x(), y: node.y() } }),
      {}
    );

    return {
      nodes,
      graph: this.graph.serialize(),
    };
  }
}

import {
  LogikSocket,
  LogikNode,
  LogikGraph,
  LogikConnection,
  ISerializedLogikGraph,
  LogikSocketType,
} from '@logik/core';
import Konva from 'konva';
import { BehaviorSubject, Observable } from 'rxjs';
import { difference } from 'lodash';
import { LogikEditorContextMenu } from './nodes-context-menu/nodes-context-menu';

export interface ISerializedLogikEditor {
  nodes: Record<string, { x: number; y: number }>;
  graph: ISerializedLogikGraph;
}

/** A class for updating visuals of sockets if we cannot create connection between the two  */
export class LogikEditorSocketVisualValidator {
  constructor(
    private readonly graph: LogikGraph,
    private readonly layer: Konva.Layer,
    private readonly dndHandler: LogikEditorDnDHandler
  ) {
    /** Subscribe to changes during line drag between sockets */
    this.dndHandler.draggedLine$.subscribe((line) => {
      /** Get all sockets */
      /** @TODO This must be optimized otherwise this can be a bottleneck on large graphs */
      const sockets = this.layer
        .getChildren((child) => child instanceof LogikEditorNode)
        .flatMap((node) =>
          (node as LogikEditorNode).getChildren((child) => child instanceof LogikEditorSocket)
        ) as LogikEditorSocket[];

      /** If line is present */
      if (line) {
        for (const socket of sockets) {
          /** Check if connection is valid */
          if (!this.graph.isSocketConnectionValid(line.origin.model, socket.model)) {
            socket.isValid = false;
          } else {
            socket.isValid = true;
          }
        }
      } else {
        sockets.forEach((socket) => (socket.isValid = true));
      }
    });
  }
}

/** A handler class for holding and serving draggable object in the editor */
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
  public readonly draggedNodes$: Observable<LogikEditorNode[]> = this._draggedNodes.asObservable();

  private _draggedLine: BehaviorSubject<LogikEditorSocketLine | null> =
    new BehaviorSubject<LogikEditorSocketLine | null>(null);
  public get draggedLine(): LogikEditorSocketLine | null {
    return this._draggedLine.getValue();
  }
  public set draggedLine(value: LogikEditorSocketLine | null) {
    this._draggedLine.next(value);
  }
  public readonly draggedLine$: Observable<LogikEditorSocketLine | null> = this._draggedLine.asObservable();

  public focusedInput: LogikEditorSocketInput | null = null;
}

/** A visual representation of two connected sockets */
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

    this.strokeWidth(2.5);
    this.stroke('black');

    this.origin.parent?.on('dragmove', this.updatePoints.bind(this));

    this.target$.subscribe((target) => {
      if (target) {
        target.parent?.on('dragmove', this.updatePoints.bind(this));
        const input = target.innerGroup.getChildren((child) => child instanceof LogikEditorSocketInput)[0];
        if (input) {
          input.destroy();
        }
      }
    });

    this.on('mouseenter', () => {
      this.stroke('blue');
    });
    this.on('mouseleave', () => {
      this.stroke('black');
    });
    /** Disconnect sockets on middle mouse button click
     * @TODO Find a better way to handle connection removal
     */
    this.on('mousedown', (event) => {
      if (event.evt.button === 1) {
        event.evt.preventDefault();
        event.evt.stopPropagation();
        if (connection) {
          this.target?.createInputIfNeeded();
          connection.graph.disconnectSockets(connection);
        }
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

/** And input class for sockets. Used to modify certain properties of a node while editing graph */
export class LogikEditorSocketInput extends Konva.Group {
  private readonly text = new Konva.Text({ text: 'Text', fontSize: 11 });
  private readonly background = new Konva.Rect({ stroke: 'black', strokeWidth: 1 });

  /** An input element that is used to extract text from */
  private input: HTMLTextAreaElement;

  constructor(private readonly socket: LogikEditorSocket, private readonly dndHandler: LogikEditorDnDHandler) {
    super();

    this.background.height(18);
    this.y(8);

    this.updateSelfWidth();

    this.text.x(4);
    this.text.y(this.background.height() / 2 - this.text.height() / 2);

    this.add(this.background, this.text);

    this.on('mousedown', (event) => {
      event.cancelBubble = true;
      this.dndHandler.focusedInput = this;

      this.initInput();
    });

    this.socket.model.parent.properties[this.socket.model.property] = this.text.text();

    setTimeout(() => {
      const node = this.parent?.parent?.parent as LogikEditorNode;
      if (node) {
        node.updateHeight();
      }
    });
  }

  /** Initialize the input and add it document body in place of parent socket location */
  private initInput(): void {
    this.input = document.createElement('textarea');

    this.input.style.position = 'absolute';
    this.input.style.fontSize = `${11}px`;
    this.input.style.padding = '2px 0px 0px 4px';
    this.input.style.resize = 'none';
    this.input.style.outline = '0';
    this.input.style.border = '0';
    this.input.style.overflowY = 'hidden';
    this.input.style.fontFamily = this.text.fontFamily();

    this.input.value = this.text.text();

    this.updateInputRect();

    this.input.addEventListener('input', (event) => {
      this.text.text((event.target as HTMLTextAreaElement).value);
      this.updateSelfWidth();
      this.updateInputRect();
    });

    this.input.addEventListener('blur', () => {
      this.socket.model.parent.properties[this.socket.model.property] = this.input.value;
      document.body.removeChild(this.input);
    });

    document.body.append(this.input);

    setTimeout(() => {
      this.input.focus();
    });
  }

  /** Update width of the input depending whether parent input is input or output */
  private updateSelfWidth(): void {
    const minWidth = 32;
    const width = this.text.width() + 8;
    this.background.width(width < minWidth ? minWidth : width);
    /** If socket is not input then updating width should happen towards left side */
    if (!this.socket.model.isInput) {
      this.x(this.socket.socketName.x() + this.socket.socketName.width() - this.background.width());
    } else {
      /** Otherwise we don't move x position and stay in place of socket name  */
      this.x(this.socket.socketName.x());
    }
  }

  private updateInputRect(): void {
    this.input.style.left = `${this.getAbsolutePosition().x}px`;
    this.input.style.top = `${this.getAbsolutePosition().y}px`;
    this.input.style.width = `${this.background.width()}px`;
    this.input.style.height = `${this.background.height()}px`;
  }

  public override destroy(): this {
    const node = this.parent?.parent?.parent as LogikEditorNode;
    super.destroy();
    if (node) {
      node.updateHeight();
    }
    return this;
  }
}

/** A socket represented in the editor */
export class LogikEditorSocket extends Konva.Group {
  private _isValid: boolean = true;
  public get isValid(): boolean {
    return this._isValid;
  }
  public set isValid(value: boolean) {
    this._isValid = value;
    if (!value) {
      this.background.fill('gray');
    } else {
      this.background.fill('white');
    }
  }

  public background: Konva.Shape;
  public socketName: Konva.Text;

  public readonly innerGroup: Konva.Group = new Konva.Group();

  constructor(
    public readonly model: LogikSocket,
    isInput: boolean,
    private readonly dndHandler: LogikEditorDnDHandler
  ) {
    super();

    this.setBackground();

    this.socketName = new Konva.Text({ y: -5, text: model.name, fill: 'black' });

    if (isInput) {
      this.socketName.x(this.background.x() + this.background.width());
      this.innerGroup.add(this.background, this.socketName);
    } else {
      this.socketName.x(this.background.x() - this.background.width() - this.socketName.width());
      this.innerGroup.add(this.socketName, this.background);
    }

    this.createInputIfNeeded();
    this.add(this.innerGroup);

    /** On socket click */
    this.background.on('mousedown', (event) => {
      /** Prevent upper events from being handled */
      event.cancelBubble = true;
      /** Create a temporary line that follows mouse cursor */
      const line = new LogikEditorSocketLine(this);
      /** Add the line to the parent layer */
      this.getLayer()?.add(line);
      /** Set the line in the dnd handler */
      dndHandler.draggedLine = line;
    });

    this.background.on('mouseup', () => {
      if (this.dndHandler.draggedLine && this.dndHandler.draggedLine.origin !== this) {
        this.dndHandler.draggedLine.target = this;
      }
    });

    this.background.on('mouseenter', () => {
      if (this.isValid) {
        this.background.fill('red');
      }
    });
    this.background.on('mouseleave', () => {
      if (this.isValid) {
        this.background.fill('white');
      }
    });
  }

  public createInputIfNeeded(): void {
    if (this.model.editable) {
      switch (this.model.type) {
        case LogikSocketType.Text: {
          this.innerGroup.add(new LogikEditorSocketInput(this, this.dndHandler));
          break;
        }

        default: {
          break;
        }
      }
    }
  }

  private setBackground(): void {
    switch (this.model.type) {
      case LogikSocketType.Produce:
      case LogikSocketType.Consume: {
        this.background = new Konva.RegularPolygon({ sides: 3, stroke: 'black', radius: 6, rotation: 90 });
        break;
      }

      default: {
        this.background = new Konva.Circle({ radius: 4, stroke: 'black', fill: 'white' });
      }
    }
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

  private readonly inputs: LogikEditorSocket[] = [];
  private readonly outputs: LogikEditorSocket[] = [];

  constructor(public readonly model: LogikNode, dndHandler: LogikEditorDnDHandler) {
    super();
    this.draggable(true);

    this.background = new Konva.Rect({ stroke: 'black', x: this.x(), y: this.y(), width: 200 });
    const name = new LogikEditorNodeName(model);
    this.add(this.background, name);

    for (let i = 0; i < this.model.outputs.length; i++) {
      const output = this.model.outputs[i];
      const socket = new LogikEditorSocket(output, false, dndHandler);
      socket.x(this.background.width() - socket.width() / 2 - 16);
      socket.y(24 + 16 + i * this.socketGap);
      this.add(socket);
      this.outputs.push(socket);
    }

    for (let i = 0; i < this.model.inputs.length; i++) {
      const input = this.model.inputs[i];
      const socket = new LogikEditorSocket(input, true, dndHandler);
      socket.x(socket.width() / 2 + 16);
      socket.y(24 + 16 + i * this.socketGap);
      this.add(socket);
      this.inputs.push(socket);
    }

    this.updateHeight();

    this.on('mousedown', () => {
      this.startDrag();
    });
  }

  public isSelected(value: boolean): void {
    if (value) {
      this.background.stroke('blue');
    } else {
      this.background.stroke('black');
    }
  }

  public updateHeight(): void {
    const inputsHeight = this.inputs.reduce((prev, curr) => prev + curr.getClientRect().height, 0);
    const outputsHeight = this.outputs.reduce((prev, curr) => prev + curr.getClientRect().height, 0);
    const totalSocketsHeight = Math.max(inputsHeight, outputsHeight);
    this.background.height(40 + totalSocketsHeight + 4);

    this.width(this.background.width());
    this.height(this.background.height());
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
  private readonly visualValidator: LogikEditorSocketVisualValidator;

  /** Rectangle which is used to select a group of nodes */
  private groupRect: Konva.Line | null = null;
  /** An invisible group that is used to drag multiple nodes at the same time */
  private invisibleGroup: LogikInvisibleDragGroup = new LogikInvisibleDragGroup(this.dndHandler);

  private mouseX: number = 0;
  private mouseY: number = 0;

  constructor(private readonly graph: LogikGraph, private readonly container: HTMLDivElement) {
    Konva.dragButtons = [1];

    this.stage = new Konva.Stage({
      width: container.clientWidth,
      height: container.clientHeight,
      container,
      draggable: true,
    });
    this.stage.container().tabIndex = 1;
    this.stage.container().focus();

    this.layer = new Konva.Layer();
    this.layer.add(this.invisibleGroup);

    this.visualValidator = new LogikEditorSocketVisualValidator(this.graph, this.layer, this.dndHandler);

    this.graph.onNodeAdded$.subscribe((event) => {
      const node = new LogikEditorNode(event.data, this.dndHandler);
      node.x(this.mouseX);
      node.y(this.mouseY);
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
      if (event.evt.button === 2 || event.evt.button === 1) {
        return;
      }

      if (!(event.target.parent instanceof LogikEditorNode) && event.target.parent !== this.invisibleGroup) {
        this.drawGroupRect();
      } else if (
        event.target.parent instanceof LogikEditorNode &&
        !(event.target.parent.parent instanceof LogikInvisibleDragGroup)
      ) {
        this.dndHandler.draggedNodes = [event.target.parent];
      }
    });

    this.stage.on('mouseup', (event) => {
      if (event.evt.button === 2 || event.evt.button === 1) {
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
        const nodes = this.findNodesInsideGroupRect(this.mouseX, this.mouseY);
        this.dndHandler.draggedNodes = nodes;

        this.groupRect?.destroy();
        this.groupRect = null;
      }
    });

    this.stage.on('mousemove', () => {
      const position = this.stage.getRelativePointerPosition();
      if (position) {
        this.mouseX = position.x;
        this.mouseY = position.y;
      }

      if (this.groupRect) {
        const points = this.groupRect.points();
        const [x, y] = points;
        points[2] = this.mouseX;
        points[3] = y;
        points[4] = this.mouseX;
        points[5] = this.mouseY;
        points[6] = x;
        points[7] = this.mouseY;
        points[8] = x;
        points[9] = y;
        this.groupRect.points(points);
        return;
      }

      const line = this.dndHandler.draggedLine;

      if (line) {
        const scale = this.stage.scaleX();
        const position = line.origin.getAbsolutePosition();
        line.points([
          (position.x - this.stage.x()) / scale,
          (position.y - this.stage.y()) / scale,
          this.mouseX,
          this.mouseY,
        ]);
      }
    });

    const scaleBy = 1.05;
    this.stage.on('wheel', (e) => {
      // stop default scrolling
      e.evt.preventDefault();

      const oldScale = this.stage.scaleX();
      const pointer = this.stage.getPointerPosition();

      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale,
      };

      // how to scale? Zoom in? Or zoom out?
      let direction = e.evt.deltaY > 0 ? 1 : -1;

      // when we zoom on trackpad, e.evt.ctrlKey is true
      // in that case lets revert direction
      if (e.evt.ctrlKey) {
        direction = -direction;
      }

      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

      this.stage.scale({ x: newScale, y: newScale });

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      this.stage.position(newPos);
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

  private drawGroupRect(): void {
    this.groupRect = new Konva.Line({ points: [this.mouseX, this.mouseY] });
    this.groupRect.stroke('black');
    this.groupRect.strokeWidth(2);
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

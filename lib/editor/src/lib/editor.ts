import { LogikNode, LogikGraph, LogikConnection, ISerializedLogikGraph } from '@logik/core';
import Konva from 'konva';
import { LogikEditorContextMenu } from './nodes-context-menu/nodes-context-menu';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSocket } from './editor-socket';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocketLine } from './editor-socket-line';
import { LogikEditorSocketVisualValidator } from './editor-visual-validator';
import { LogikInvisibleDragGroup } from './editor-invisible-drag-group';

export interface ISerializedLogikEditor {
  nodes: Record<string, { x: number; y: number }>;
  graph: ISerializedLogikGraph;
}

/** The main editor component */
export class LogikEditor {
  private stage: Konva.Stage;
  private layer: Konva.Layer;

  private readonly selectionHandler: LogikEditorSelectionHandler = new LogikEditorSelectionHandler();
  private visualValidator: LogikEditorSocketVisualValidator;

  /** Rectangle which is used to select a group of nodes */
  private groupRect: Konva.Line | null = null;
  /** An invisible group that is used to drag multiple nodes at the same time */
  private invisibleGroup: LogikInvisibleDragGroup = new LogikInvisibleDragGroup(this.selectionHandler);

  private mouseX: number = 0;
  private mouseY: number = 0;

  constructor(private readonly graph: LogikGraph, private readonly container: HTMLDivElement) {
    this.initEditor();

    this.subscribeToNodeAddEvent();
    this.subscribeToNodeRemovalEvent();
    this.subscribeToSocketConnectEvent();
    this.subscribeToSocketDisconnectEvent();
    this.subscribeToContextMenuEvent();
    this.subscribeToContainerKeyEvent();
    this.subscribeToMouseDownEvent();
    this.subscribeToMouseUpEvent();
    this.subscribeToMouseMoveEvent();
    this.subscribeToWheelEvent();
  }

  /** Init the editor. Set state, layer and other required properties */
  private initEditor(): void {
    /** By default we can pan the stage using only middle mouse button */
    Konva.dragButtons = [1];

    this.stage = new Konva.Stage({
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      container: this.container,
      draggable: true,
    });
    this.stage.container().tabIndex = 1;
    this.stage.container().focus();

    this.layer = new Konva.Layer();
    this.layer.add(this.invisibleGroup);

    this.visualValidator = new LogikEditorSocketVisualValidator(this.graph, this.layer, this.selectionHandler);
  }

  private subscribeToNodeAddEvent(): void {
    this.graph.onNodeAdded$.subscribe((event) => {
      const node = new LogikEditorNode(event.data, this.selectionHandler);
      node.x(this.mouseX);
      node.y(this.mouseY);
      this.layer.add(node);
    });
  }

  /** Subscribe to socket disconnection */
  private subscribeToSocketDisconnectEvent(): void {
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
  }

  /** Subscribe to node removal */
  private subscribeToNodeRemovalEvent(): void {
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
  }

  /** @TODO This can be optimized */
  private subscribeToSocketConnectEvent(): void {
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
  }

  /** Subscribe to context menu click event */
  private subscribeToContextMenuEvent(): void {
    this.stage.container().addEventListener('contextmenu', (event) => {
      /** Prevent default browser context menu from appearing */
      event.preventDefault();
      event.stopPropagation();
      /** Show our context menu */
      this.showContextMenu(event.x, event.y);
    });
  }

  /** Subscribe to key events happening inside the stages container */
  private subscribeToContainerKeyEvent(): void {
    this.stage.container().addEventListener('keydown', (event) => {
      /** Handle remove buttons click */
      if (event.key === 'Backspace' || event.key === 'Delete') {
        /** Get all selected nodes */
        this.selectionHandler.selectedNodes.forEach((node) => {
          /** And remove them from the graph.
           *  The rest happens after onNodeRemoved event and onSocketDisconnect event if the node had any connections
           */
          this.graph.removeNode(node.model.uuid);
        });
      }
    });
  }

  private subscribeToMouseDownEvent(): void {
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
        this.selectionHandler.selectedNodes = [event.target.parent];
      }
    });
  }

  /** Subscribe to mouse up events */
  private subscribeToMouseUpEvent(): void {
    this.stage.on('mouseup', (event) => {
      /** Don't do anything if it was right or middle mouse button */
      if (event.evt.button === 2 || event.evt.button === 1) {
        return;
      }

      /** If the object we clicked before was the group containing nodes */
      if (event.target.parent !== this.invisibleGroup) {
        /** If the object parent we clicked is the invisible group then we do anything. It means that we clicked on LogikEditorNode that is currently being selected */
        if (event.target.parent?.parent === this.invisibleGroup) {
          return;
        }
        /** Otherwise just clear the group */
        this.invisibleGroup.clear();
      }

      /** If we drag a line from a socket but we haven't connected it to anything */
      if (this.selectionHandler.selectedLine && !this.selectionHandler.selectedLine.target) {
        /** Remove the line */
        this.selectionHandler.selectedLine.destroy();
        this.selectionHandler.selectedLine = null;
      }

      /** If we drag a line from a socket and also has just connected it to other socket*/
      if (this.selectionHandler.selectedLine && this.selectionHandler.selectedLine.target) {
        /** Connected the sockets in the graph, the rest happens after onSocketConnect emits */
        this.graph.connectSockets(
          this.selectionHandler.selectedLine.origin.model.id,
          this.selectionHandler.selectedLine.target.model.id
        );
        /**
         * We still destroy the line because there will be a new one created after onSocketConnect event
         * @TODO Maybe we can reuse the line and not create another one?
         */
        this.selectionHandler.selectedLine.destroy();
        this.selectionHandler.selectedLine = null;
      }

      /** @TODO Sometimes breaks when mouse is outside of browser window */
      if (this.groupRect) {
        const nodes = this.findNodesInsideGroupRect(this.mouseX, this.mouseY);
        this.selectionHandler.selectedNodes = nodes;

        this.groupRect?.destroy();
        this.groupRect = null;
      }
    });
  }

  private subscribeToWheelEvent(): void {
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

  /** Subscribes to mouse move event. Assigns mouse location, updates group rect, draws line from sockets etc */
  private subscribeToMouseMoveEvent(): void {
    this.stage.on('mousemove', () => {
      /** Get mouse location in the stage.
       * We use relative pointer position because of the zoom in/out functionality that native events do not take into consideration */
      const position = this.stage.getRelativePointerPosition();
      if (position) {
        /** Assign the mouse location */
        this.mouseX = position.x;
        this.mouseY = position.y;
      }

      /** Update group rect locations to create a square object coming from start mouse location towards new mouse location */
      if (this.groupRect) {
        const points = this.groupRect.points();
        const [x, y] = points; // x, y are already defined when we first initialized the rect element.
        points[2] = this.mouseX; // top right x
        points[3] = y; // top right y
        points[4] = this.mouseX; // bottom right x
        points[5] = this.mouseY; // bottom right y
        points[6] = x; // bottom left x
        points[7] = this.mouseY; // bottom left y
        points[8] = x; // top left x
        points[9] = y; // top left y
        /** We basically drew a rectangle using 8 points */
        this.groupRect.points(points);
        return;
      }

      /** Get a line being drawn from a socket */
      const line = this.selectionHandler.selectedLine;
      /** If the line is present */
      if (line) {
        /** Get the current scale */
        const scale = this.stage.scaleX();
        /** Get actual line origin socket location */
        const position = line.origin.getAbsolutePosition();
        /** Update the line target location towards mouse location taking the current zoom into consideration */
        line.points([
          (position.x - this.stage.x()) / scale,
          (position.y - this.stage.y()) / scale,
          this.mouseX,
          this.mouseY,
        ]);
      }
    });
  }

  /** Get a list of nodes that are inside the current group rectangle being drawn */
  private findNodesInsideGroupRect(startX: number, startY: number): LogikEditorNode[] {
    const result: LogikEditorNode[] = [];

    if (this.groupRect) {
      /** @TODO Check if there are already ways to do it in the Konva lib */
      const overlaps = (p1: number, l1: number, p2: number, l2: number): boolean => {
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
    this.layer.destroyChildren();
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

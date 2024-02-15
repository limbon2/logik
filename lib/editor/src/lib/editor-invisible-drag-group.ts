import Konva from 'konva';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocketLine } from './editor-socket-line';

export class LogikInvisibleDragGroup extends Konva.Group {
  private readonly background = new Konva.Rect({ stroke: 'green' });

  constructor(private readonly selectionHandler: LogikEditorSelectionHandler) {
    super();

    this.add(this.background);

    this.selectionHandler.selectedNodes$.subscribe((nodes) => {
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

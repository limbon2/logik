import Konva from 'konva';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocket } from './editor-socket';

/** And input class for sockets. Used to modify certain properties of a node while editing graph */
export class LogikEditorSocketInput extends Konva.Group {
  private readonly text = new Konva.Text({ text: 'Text', fontSize: 10 });
  private readonly background = new Konva.Rect({ stroke: 'black', strokeWidth: 1 });
  private readonly canvas: HTMLCanvasElement = document.createElement('canvas');

  /** An input element that is used to extract text from */
  private input: HTMLTextAreaElement;
  /** Max input width that can be fit inside a node */
  private maxWidth: number = 0;

  constructor(
    private readonly socket: LogikEditorSocket,
    private readonly selectionHandler: LogikEditorSelectionHandler
  ) {
    super();

    this.text.lineHeight(1.2);

    this.y(8);

    this.updateSelfRect();

    this.text.x(4);
    this.text.y(this.background.height() / 2 - this.text.height() / 2);

    this.add(this.background, this.text);

    /** Create the input element on mouse click */
    this.on('mousedown', (event) => {
      event.cancelBubble = true;
      this.selectionHandler.focusedInput = this;
      this.initInput();
    });

    /** Set initial value to the socket node */
    this.setSocketProperty();

    setTimeout(() => {
      const node = socket.parent as LogikEditorNode;
      this.maxWidth = node.background.width();
    });
  }

  /** Update value of the socket */
  private setSocketProperty(): void {
    const value = this.socket.model.value;

    if (value && typeof value === 'string') {
      this.text.text(value);
    }

    this.socket.model.value = this.text.text();
  }

  /** Initialize the input and add it document body in place of parent socket location */
  private initInput(): void {
    this.input = document.createElement('textarea');

    /** Assign default textarea values to make it look seamless to the Konva.Text */
    this.input.style.position = 'absolute';
    this.input.style.fontSize = `${10}px`;
    /** This is pretty much the value that we see in the Konva.Text node */
    this.input.style.padding = '3px 0px 0px 4px';
    this.input.style.resize = 'none';
    this.input.style.outline = '0';
    this.input.style.border = '0';
    this.input.style.overflowY = 'hidden';
    this.input.style.fontFamily = this.text.fontFamily();
    this.input.style.maxWidth = `${this.maxWidth}px`;
    this.input.style.lineHeight = `${12}px`;
    this.input.style.outline = '1px solid blue';

    this.input.value = this.text.text();

    this.updateSelfRect();
    this.updateInputRect();

    this.input.addEventListener('input', (event) => {
      this.text.text((event.target as HTMLTextAreaElement).value);
      this.updateSelfRect();
      this.updateInputRect();
    });

    this.input.addEventListener('blur', () => {
      this.socket.model.value = this.text.text();
      document.body.removeChild(this.input);
    });

    document.body.append(this.input);

    setTimeout(() => {
      this.input.focus();
    });
  }

  /** Update width of the input depending whether parent input is input or output
   * @TODO It has visual bug in terms of font size when zooming in/out making text to be larger/smaller in the input
   * @TODO Add max height constraint because a lorem ipsum 5 paragraph example completely broke the parent node
   */
  private updateSelfRect(): void {
    /** Offset that we apply to make sure that width/height does't touch borders */
    const offset = 6;
    /** The minimum width of the input area */
    const minWidth = 32;
    /** The maximum width of the input area */
    const maxWidth = this.maxWidth - this.socket.socketName.width() - offset;

    /** We use canvas context to measure text because it allow us to measure the text independently from the actual width.
     * Therefore there won't be locks because of the min/max width constraints
     * */
    const ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.font = `${this.text.fontSize()}px ${this.text.fontFamily()}`;
    const metrics = ctx.measureText(this.text.text());
    const width = metrics.width;

    this.text.width(width < minWidth ? minWidth : width > maxWidth ? maxWidth : width);

    this.background.width(this.text.width() + offset);
    this.background.height(this.text.height() + offset);

    if (this.socket.parent) {
      (this.socket.parent as LogikEditorNode).updateHeight();
    }

    /** If socket is not input then updating width should happen towards left side */
    if (!this.socket.isInput) {
      this.x(this.socket.socketName.x() + this.socket.socketName.width() - this.background.width());
    } else {
      /** Otherwise we don't move x position and stay in place of socket name  */
      this.x(this.socket.socketName.x());
    }
  }

  /** Update the input width/height and position  */
  private updateInputRect(): void {
    const { x, y } = this.getClientRect();
    const { width, height } = this.background.getClientRect();
    this.input.style.left = `${x}px`;
    this.input.style.top = `${y}px`;
    this.input.style.width = `${width}px`;
    this.input.style.height = `${height}px`;
  }

  /** Destroy the node and update the height of the parent node after */
  public override destroy(): this {
    const node = this.parent?.parent?.parent as LogikEditorNode;
    super.destroy();
    if (node) {
      node.updateHeight();
    }
    return this;
  }
}

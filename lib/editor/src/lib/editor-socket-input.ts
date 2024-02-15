import Konva from 'konva';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocket } from './editor-socket';

/** And input class for sockets. Used to modify certain properties of a node while editing graph */
export class LogikEditorSocketInput extends Konva.Group {
  private readonly text = new Konva.Text({ text: 'Text', fontSize: 11 });
  private readonly background = new Konva.Rect({ stroke: 'black', strokeWidth: 1 });

  /** An input element that is used to extract text from */
  private input: HTMLTextAreaElement;

  constructor(
    private readonly socket: LogikEditorSocket,
    private readonly selectionHandler: LogikEditorSelectionHandler
  ) {
    super();

    this.background.height(18);
    this.y(8);

    this.updateSelfWidth();

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

    /** Update node height on init */
    setTimeout(() => {
      const node = this.parent?.parent?.parent as LogikEditorNode;
      if (node) {
        node.updateHeight();
      }
    });
  }

  /** Update value of the socket */
  private setSocketProperty(): void {
    this.socket.model.parent.properties[this.socket.model.property] = this.text.text();
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

  /** Update the input width/height and position */
  private updateInputRect(): void {
    this.input.style.left = `${this.getAbsolutePosition().x}px`;
    this.input.style.top = `${this.getAbsolutePosition().y}px`;
    this.input.style.width = `${this.background.width()}px`;
    this.input.style.height = `${this.background.height()}px`;
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

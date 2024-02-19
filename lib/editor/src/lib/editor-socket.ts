import { LogikSocket, LogikSocketType } from '@logik/core';
import Konva from 'konva';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocketLine } from './editor-socket-line';
import { LogikEditorSocketInput } from './editor-socket-input';

/** A socket represented in the editor */
export class LogikEditorSocket extends Konva.Group {
  private _isValid: boolean = true;
  /** A flag representing whether the socket is valid or not. Used for updating background color depending on its value */
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

  /** An inner group containing socket name, shape and inputs */
  public readonly innerGroup: Konva.Group = new Konva.Group();

  constructor(
    public readonly model: LogikSocket,
    public readonly isInput: boolean,
    private readonly selectionHandler: LogikEditorSelectionHandler
  ) {
    super();

    this.setBackground();

    this.socketName = new Konva.Text({ y: -5, text: model.name, fill: 'black' });

    /** Update socket name location depending on whether it is an input or not */
    if (isInput) {
      /** If it is an input then place the socket shape first then the name  */
      this.socketName.x(this.background.x() + this.background.width());
      this.innerGroup.add(this.background, this.socketName);
    } else {
      /** Otherwise place the name first and the shape after  */
      this.socketName.x(this.background.x() - this.background.width() - this.socketName.width());
      this.innerGroup.add(this.socketName, this.background);
    }

    this.createInputIfNeeded();
    this.add(this.innerGroup);

    /** Subscribe to socket down event to create a line coming from this socket */
    this.background.on('mousedown', (event) => {
      /** Prevent upper events from being handled */
      event.cancelBubble = true;
      /** Create a temporary line that follows mouse cursor */
      const line = new LogikEditorSocketLine(this);
      /** Add the line to the parent layer */
      this.getLayer()?.add(line);
      /** Set the line in the selection handler */
      selectionHandler.selectedLine = line;
    });

    /** Subscribe to mouse up event to connect the line to other socket */
    this.background.on('mouseup', () => {
      if (this.selectionHandler.selectedLine && this.selectionHandler.selectedLine.origin !== this) {
        this.selectionHandler.selectedLine.target = this;
      }
    });

    /** Subscribe to hover events to change the color if this socket is valid */
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

  /** Create an input element of the socket depending of its type */
  public createInputIfNeeded(): void {
    if (this.model.editable) {
      switch (this.model.type) {
        case LogikSocketType.Text: {
          this.innerGroup.add(new LogikEditorSocketInput(this, this.selectionHandler));
          break;
        }

        default: {
          break;
        }
      }
    }
  }

  /** Define a shape of the node depending on its type */
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

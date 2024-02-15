import Konva from 'konva';
import { LogikNode } from '@logik/core';
import { LogikEditorSocket } from './editor-socket';
import { LogikEditorSelectionHandler } from './editor-selection-handler';

/** Editor node element */
export class LogikEditorNodeName extends Konva.Group {
  constructor(public readonly model: LogikNode) {
    super();
    const x = 1;
    const y = 1;
    const background = new Konva.Rect({ x, y, width: 200 - x, height: 24 - y, fill: '#dd0000' });

    const name = new Konva.Text({ x: 100, y: 12 + y, fontSize: 16, text: model.name, fill: 'white' });
    name.offsetX(name.width() / 2);
    name.offsetY(name.height() / 2);

    this.add(background, name);
  }
}

/** The visual representation of the node present in the editor */
export class LogikEditorNode extends Konva.Group {
  private readonly socketGap: number = 16;
  private background: Konva.Rect;

  private readonly inputs: LogikEditorSocket[] = [];
  private readonly outputs: LogikEditorSocket[] = [];

  constructor(public readonly model: LogikNode, private readonly selectionHandler: LogikEditorSelectionHandler) {
    super();
    this.draggable(true);

    this.background = new Konva.Rect({ stroke: 'black', x: this.x(), y: this.y(), width: 200 });
    const name = new LogikEditorNodeName(model);
    this.add(this.background, name);
    this.width(this.background.width());

    this.setInputsOutputs();
    this.updateHeight();

    this.on('mousedown', () => {
      this.startDrag();
    });
  }

  /** Construct input/output sockets for the node */
  private setInputsOutputs(): void {
    for (let i = 0; i < this.model.outputs.length; i++) {
      const output = this.model.outputs[i];

      const socket = new LogikEditorSocket(output, false, this.selectionHandler);

      /** If socket is an output then place it to the right side of the node */
      const padding = 16;
      const x = this.background.width() - socket.width() / 2 - padding;
      socket.x(x);
      socket.y(24 + 16 + i * this.socketGap);

      this.add(socket);
      this.outputs.push(socket);
    }

    /** If socket is an input then place it to the left side of the node */
    for (let i = 0; i < this.model.inputs.length; i++) {
      const input = this.model.inputs[i];
      const socket = new LogikEditorSocket(input, true, this.selectionHandler);
      socket.x(socket.width() / 2 + 16);
      socket.y(24 + 16 + i * this.socketGap);
      this.add(socket);
      this.inputs.push(socket);
    }
  }

  /** Update node outline if it is selected */
  public isSelected(value: boolean): void {
    if (value) {
      this.background.stroke('blue');
    } else {
      this.background.stroke('black');
    }
  }

  /** Update the height of the node. Because it is a dynamic value depending on sockets and its input elements */
  public updateHeight(): void {
    const inputsHeight = this.inputs.reduce((prev, curr) => prev + curr.getClientRect().height, 0);
    const outputsHeight = this.outputs.reduce((prev, curr) => prev + curr.getClientRect().height, 0);
    const totalSocketsHeight = Math.max(inputsHeight, outputsHeight);
    this.background.height(40 + totalSocketsHeight + 4);
    this.height(this.background.height());
  }
}

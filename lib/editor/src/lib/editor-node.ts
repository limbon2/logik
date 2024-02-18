/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Konva from 'konva';
import { LogikNode } from '@logik/core';
import { LogikEditorSocket } from './editor-socket';
import { LogikEditorSelectionHandler } from './editor-selection-handler';

/** Editor node element */
export class LogikEditorNodeName extends Konva.Group {
  constructor(public readonly model: LogikNode) {
    super();
    const background = new Konva.Rect({ y: 0, width: 200, height: 24, fill: '#dd0000' });

    const name = new Konva.Text({ x: 100, y: 12, fontSize: 16, text: model.name, fill: 'white' });
    name.offsetX(name.width() / 2);
    name.offsetY(name.height() / 2);

    this.height(background.height());

    this.add(background, name);
  }
}

/** The visual representation of the node present in the editor */
export class LogikEditorNode extends Konva.Group {
  private readonly socketGap: number = 4;
  private background: Konva.Rect;
  private nodeName: LogikEditorNodeName;

  private readonly inputs: LogikEditorSocket[] = [];
  private readonly outputs: LogikEditorSocket[] = [];

  constructor(public readonly model: LogikNode, private readonly selectionHandler: LogikEditorSelectionHandler) {
    super();
    this.draggable(true);

    this.background = new Konva.Rect({ stroke: 'black', x: this.x(), y: this.y(), width: 200 });
    this.nodeName = new LogikEditorNodeName(model);
    this.add(this.nodeName, this.background);

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

      this.add(socket);
      this.outputs.push(socket);
    }

    for (let i = 0; i < this.model.inputs.length; i++) {
      const input = this.model.inputs[i];
      const socket = new LogikEditorSocket(input, true, this.selectionHandler);
      this.add(socket);
      this.inputs.push(socket);
    }

    this.updateSocketsPosition();
  }

  /**
   * Update socket locations.
   * Used mainly to update the node height after a socket connection since it may remove socket input fields
   */
  private updateSocketsPosition(): void {
    const padding = 16;
    const nodeNameHeight = this.nodeName.getClientRect({ relativeTo: this.getStage()! }).height;

    let inputY = nodeNameHeight + padding;
    for (const socket of this.inputs) {
      /** Output sockets are place to the left of the node */
      const x = socket.width() / 2 + padding;
      socket.x(x);
      socket.y(inputY);
      inputY += socket.getClientRect({ relativeTo: this.getStage()! }).height + this.socketGap;
    }

    let outputY = nodeNameHeight + padding;
    for (const socket of this.outputs) {
      /** Output sockets are place to the right of the node */
      const x = this.background.width() - socket.width() / 2 - padding;
      socket.x(x);
      socket.y(outputY);
      outputY += socket.getClientRect({ relativeTo: this.getStage()! }).height + this.socketGap;
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
    /** Update socket position before calculating new height */
    this.updateSocketsPosition();

    const nameHeight = this.nodeName.getClientRect({ relativeTo: this.getStage()! }).height;

    /** Find overall height of sockets in inputs and outputs */
    const inputSocketHeight = this.inputs.reduce(
      (curr, input) => curr + input.getClientRect({ relativeTo: this.getStage()! }).height + this.socketGap,
      0
    );
    const outputSocketHeight = this.outputs.reduce(
      (curr, output) => curr + output.getClientRect({ relativeTo: this.getStage()! }).height + this.socketGap,
      0
    );

    /** Get the highest height to determine the whole height of the node */
    const socketHeight = Math.max(inputSocketHeight, outputSocketHeight);

    this.background.height(nameHeight + 16 + socketHeight);
    this.height(this.background.height());
  }
}

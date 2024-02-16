import { LogikSocketType, ISerializedLogikNode } from './interfaces';
import { LogikSocket } from './socket';
import { v4 as uuid } from 'uuid';

/** A basic object of the graph. A node contains all required business logic that is going to be executed */
export abstract class LogikNode {
  public uuid: string = uuid();
  public properties: Record<string, unknown> = {};
  public isRoot: boolean = false;

  public readonly inputs: LogikSocket[] = [];
  public readonly outputs: LogikSocket[] = [];

  constructor(public name: string) {}

  public addInput(type: LogikSocketType, property: string, name: string, editable?: boolean): void {
    this.inputs.push(new LogikSocket(type, property, name, editable, this, true));
  }

  public addOutput(type: LogikSocketType, property: string, name: string, editable?: boolean): void {
    this.outputs.push(new LogikSocket(type, property, name, editable, this));
  }

  /** Get property value at input index */
  protected getInputProperty(index: number): any {
    const socket = this.inputs[index];
    if (!socket)
      throw new Error(
        `[ERROR]: Failed to get property of socket with index ${index} on node ${this.name} - ${this.uuid}. Socket was not found in inputs`
      );
    return socket.parent.properties[socket.property];
  }

  /** Assign a value to a particular property in an output socket */
  protected setOutputProperty(index: number, value: any): void {
    const socket = this.outputs[index];
    if (!socket)
      throw new Error(
        `[ERROR]: Failed to assign property of socket with index ${index} on node ${this.name} - ${this.uuid}. Socket was not found in outputs`
      );
    if (socket.connection) {
      socket.connection.input.parent.properties[socket.property] = value;
    }
  }

  public abstract run(): void;

  public serialize(): ISerializedLogikNode {
    return {
      id: this.uuid,
      name: this.name,
      properties: this.properties,
      type: '',
      inputs: this.inputs.map((input) => input.id),
      outputs: this.outputs.map((output) => output.id),
    };
  }
}

import { LogikConnection } from './connection';
import { LogikSocketType, ISerializedLogikSocket } from './interfaces';
import { v4 as uuid } from 'uuid';
import { LogikNode } from './node';

/** A socket that holds properties of the node */
export class LogikSocket {
  public id: string = uuid();
  /** The connection of the socket. Assigned during connection initialization therefore cannot be accessed before */
  public connections: LogikConnection[] = [];

  private _value: any;
  /** Value of the socket. Can be any arbitrary value */
  public get value(): any {
    return this._value;
  }
  public set value(v: any) {
    this._value = v;
    this.parent.properties[this.property] = v;
  }

  constructor(
    public type: LogikSocketType,
    public property: string,
    public name: string,
    public editable: boolean = true,
    public multipleConnections = false,
    public parent: LogikNode,
    public readonly isInput?: boolean
  ) {
    this._value = this.parent.properties[this.property];
  }

  public serialize(): ISerializedLogikSocket {
    const type = this.type.charAt(0).toUpperCase() + this.type.slice(1, this.type.length);

    return {
      id: this.id,
      property: this.property,
      name: this.name,
      type,
      parentId: this.parent.uuid,
      editable: this.editable,
      multipleConnections: this.multipleConnections,
      isInput: this.isInput ?? false,
    };
  }
}

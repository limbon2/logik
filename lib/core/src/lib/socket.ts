import { LogikConnection } from './connection';
import { LogikSocketType, ISerializedLogikSocket } from './interfaces';
import { v4 as uuid } from 'uuid';
import { LogikNode } from './node';

/** A socket that holds properties of the node */
export class LogikSocket {
  public id: string = uuid();
  /** The connection of the socket. Assigned during connection initialization therefore cannot be accessed before */
  public connection: LogikConnection | null = null;

  constructor(
    public type: LogikSocketType,
    public property: string,
    public name: string,
    public editable: boolean = true,
    public parent: LogikNode,
    public readonly isInput?: boolean
  ) {}

  public serialize(): ISerializedLogikSocket {
    return {
      id: this.id,
      property: this.property,
      name: this.name,
      type: this.type,
      parentId: this.parent.uuid,
      editable: this.editable,
      isInput: this.isInput ?? false,
    };
  }
}

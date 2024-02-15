import { LogikGraph } from './graph';
import { ISerializedLogikConnection } from './interfaces';
import { v4 as uuid } from 'uuid';
import { LogikSocket } from './socket';

/** An object holding references for the sockets that were connected */
export class LogikConnection {
  public id: string = uuid();

  constructor(
    public readonly output: LogikSocket,
    public readonly input: LogikSocket,
    public readonly graph: LogikGraph
  ) {
    output.connection = this;
    input.connection = this;
  }

  public serialize(): ISerializedLogikConnection {
    return {
      id: this.id,
      inputId: this.input.id,
      outputId: this.output.id,
    };
  }
}

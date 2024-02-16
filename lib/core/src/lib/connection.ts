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
    if (output.multipleConnections) {
      output.connections.push(this);
    } else {
      for (const connection of output.connections) {
        this.graph.bus.emit('socket-disconnect', connection);
      }
      output.connections = [this];
    }

    if (input.multipleConnections) {
      input.connections.push(this);
    } else {
      for (const connection of input.connections) {
        this.graph.bus.emit('socket-disconnect', connection);
      }
      input.connections = [this];
    }
  }

  public serialize(): ISerializedLogikConnection {
    return {
      id: this.id,
      inputId: this.input.id,
      outputId: this.output.id,
    };
  }
}

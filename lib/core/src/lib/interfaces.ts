export interface ISerializedLogikNode {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  inputs: string[];
  outputs: string[];
}

export interface ISerializedLogikSocket {
  id: string;
  name: string;
  type: string;
  parentId: string;
  property: string;
  editable: boolean;
  isInput?: boolean;
}

export interface ISerializedLogikConnection {
  id: string;
  outputId: string;
  inputId: string;
}

export interface ISerializedLogikGraph {
  id: string;
  nodes: Record<string, ISerializedLogikNode>;
  sockets: Record<string, ISerializedLogikSocket>;
  connections: Record<string, ISerializedLogikConnection>;
}

export interface Type<T> {
  new (...args: any[]): T;
}

/** Possible types of sockets */
export enum LogikSocketType {
  /** Produce is the type that is used for executing the next nodes in the current chain. Used only on output sockets */
  Produce = 'produce',
  /** Consume event type is used for receiving event from producer and it executes only producer triggers it. Used only on input sockets */
  Consume = 'consume',
  /** Text socket. Contains plain text. Nothing too fancy */
  Text = 'text',
}

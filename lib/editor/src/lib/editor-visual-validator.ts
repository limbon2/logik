import { LogikGraph } from '@logik/core';
import Konva from 'konva';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSelectionHandler } from './editor-selection-handler';
import { LogikEditorSocket } from './editor-socket';

/** A class for updating visuals of sockets if we cannot create connection between the two  */
export class LogikEditorSocketVisualValidator {
  constructor(
    private readonly graph: LogikGraph,
    private readonly layer: Konva.Layer,
    private readonly selectionHandler: LogikEditorSelectionHandler
  ) {
    /** Subscribe to changes during line drag between sockets */
    this.selectionHandler.selectedLine$.subscribe((line) => {
      /** Get all sockets */
      /** @TODO This must be optimized otherwise this may become a bottleneck on large graphs */
      const sockets = this.layer
        .getChildren((child) => child instanceof LogikEditorNode)
        .flatMap((node) =>
          (node as LogikEditorNode).getChildren((child) => child instanceof LogikEditorSocket)
        ) as LogikEditorSocket[];

      /** If line is present */
      if (line) {
        for (const socket of sockets) {
          /** Check if connection is valid and update the value for the socket */
          if (!this.graph.isSocketConnectionValid(line.origin.model, socket.model)) {
            socket.isValid = false;
          } else {
            socket.isValid = true;
          }
        }
      } else {
        sockets.forEach((socket) => (socket.isValid = true));
      }
    });
  }
}

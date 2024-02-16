import { LogikConnection } from '@logik/core';
import Konva from 'konva';
import { BehaviorSubject } from 'rxjs';
import { LogikEditorSocket } from './editor-socket';
import { LogikEditorSocketInput } from './editor-socket-input';
import { LogikEditorNode } from './editor-node';

/** A visual representation of two connected sockets */
export class LogikEditorSocketLine extends Konva.Line {
  /** Target socket the line is going to be or already connected to */
  private readonly target$: BehaviorSubject<LogikEditorSocket | null> = new BehaviorSubject<LogikEditorSocket | null>(
    null
  );
  public get target(): LogikEditorSocket | null {
    return this.target$.getValue();
  }
  public set target(value: LogikEditorSocket | null) {
    this.target$.next(value);
    if (value) {
      this.updatePoints();
    }
  }

  /** The origin socket the line was dragged from */
  private readonly origin$: BehaviorSubject<LogikEditorSocket>;
  public get origin(): LogikEditorSocket {
    return this.origin$.getValue();
  }
  public set origin(value: LogikEditorSocket) {
    this.origin$.next(value);
  }

  constructor(origin: LogikEditorSocket, public readonly connection: LogikConnection | null = null) {
    super();

    this.origin$ = new BehaviorSubject<LogikEditorSocket>(origin);

    this.strokeWidth(2.5);
    this.stroke('black');

    /** Subscribe to origin node drag move to update the line points */
    this.origin.parent?.on('dragmove', this.updatePoints.bind(this));
    /** Subscribe to target change */
    this.target$.subscribe((target) => {
      /** If target socket is present */
      if (target) {
        /** Subscribe to target node drag similar to the origin socket subscription */
        target.parent?.on('dragmove', this.updatePoints.bind(this));
        /** Find if the socket has any inputs */
        const input = target.innerGroup.getChildren((child) => child instanceof LogikEditorSocketInput)[0];
        /** Destroy the input because the source of the target socket value comes from another node thus making this input redundant */
        if (input) {
          input.destroy();
        }
      }
    });

    /** Subscribe to socket hover to change its color */
    this.on('mouseenter', () => this.stroke('blue'));
    this.on('mouseleave', () => this.stroke('black'));

    /** Disconnect sockets on middle mouse button click
     *  @TODO Find a better way to handle connection removal
     */
    this.on('mousedown', (event) => {
      if (event.evt.button === 1) {
        event.evt.preventDefault();
        event.evt.stopPropagation();
        /** If the socket had any connections */
        if (connection) {
          /** Then recreate its inputs if any is required */
          this.target?.createInputIfNeeded();
          /** Update height of the node because socket inputs could have been recreated */
          (this.target?.parent as LogikEditorNode).updateHeight();
          /** Disconnect sockets */
          connection.graph.disconnectSockets(connection);
        }
      }
    });
  }

  /** Update the line position and direction */
  public updatePoints(): void {
    /** Get origin socket location in the editor */
    const { x, y } = this.origin.getAbsolutePosition();

    /** If we have any target socket connected */
    if (this.target) {
      /** Update direction towards new location of the target */
      const { x: tx, y: ty } = this.target.getAbsolutePosition();
      this.points([x, y, tx, ty]);
    } else {
      const points = this.points();
      /** Set direction towards new provided points. Currently comes from the editor mouse move event */
      this.points([x, y, points[2], points[3]]);
    }
  }
}

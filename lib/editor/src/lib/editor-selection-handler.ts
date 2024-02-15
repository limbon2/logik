import { difference } from 'lodash';
import { BehaviorSubject, Observable } from 'rxjs';
import { LogikEditorNode } from './editor-node';
import { LogikEditorSocketLine } from './editor-socket-line';
import { LogikEditorSocketInput } from './editor-socket-input';

/** A handler class for holding and serving selectable objects in the editor */
export class LogikEditorSelectionHandler {
  /** A list of  */
  private _selectedNodes: BehaviorSubject<LogikEditorNode[]> = new BehaviorSubject<LogikEditorNode[]>([]);
  public get selectedNodes(): LogikEditorNode[] {
    return this._selectedNodes.getValue();
  }
  public set selectedNodes(value: LogikEditorNode[]) {
    const previous = difference(this._selectedNodes.getValue(), value);
    previous.forEach((node) => node.isSelected(false));
    value.forEach((node) => node.isSelected(true));
    this._selectedNodes.next(value);
  }
  public readonly selectedNodes$: Observable<LogikEditorNode[]> = this._selectedNodes.asObservable();

  private _selectedLine: BehaviorSubject<LogikEditorSocketLine | null> =
    new BehaviorSubject<LogikEditorSocketLine | null>(null);
  public get selectedLine(): LogikEditorSocketLine | null {
    return this._selectedLine.getValue();
  }
  public set selectedLine(value: LogikEditorSocketLine | null) {
    this._selectedLine.next(value);
  }
  public readonly selectedLine$: Observable<LogikEditorSocketLine | null> = this._selectedLine.asObservable();

  public focusedInput: LogikEditorSocketInput | null = null;
}

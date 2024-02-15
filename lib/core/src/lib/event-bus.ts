import { Subject, Observable, filter } from 'rxjs';

/** An event bus used for distant communication between entities of the graphs */
export class LogikEventBus {
  private readonly events$: Subject<any> = new Subject<any>();

  public on(type: string): Observable<any> {
    return this.events$.pipe(filter((event) => event.type === type));
  }

  public emit(type: string, data: any): void {
    this.events$.next({ type, data });
  }
}

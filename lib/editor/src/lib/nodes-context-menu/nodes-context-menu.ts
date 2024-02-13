import './nodes-context-menu.css';

import { LogikNodeRegistry, LogikNodeRegistryEntry } from '@logik/core';
import { Subject } from 'rxjs';

/** Nodes list element */
export class LogikEditorContextMenu extends HTMLElement {
  /** Event after a node was selected from the list */
  public readonly onItemSelect$: Subject<LogikNodeRegistryEntry> = new Subject<LogikNodeRegistryEntry>();

  constructor(private readonly registry: LogikNodeRegistry, x: number, y: number) {
    super();

    /** Set absolute position to show the menu in the place where mouse was clicked */
    this.style.position = 'absolute';
    this.style.top = `${y}px`;
    this.style.left = `${x}px`;

    /** Set class for the element */
    this.classList.add('logik-context-menu');

    /** Bind event on outside click to remove the element from the DOM */
    this.remove = this.remove.bind(this);
    window.addEventListener('mousedown', this.remove);
  }

  /** Entry point of the element. Construct the list of nodes */
  public connectedCallback(): void {
    /** Get all registered nodes */
    const entries = this.registry.getAll();
    for (const entry of entries) {
      /** Create an element that represents the node */
      const element = document.createElement('div');
      element.classList.add('logik-context-menu__node');
      element.textContent = entry.type;

      /** Subscribe to the element click and fire after click event */
      element.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        this.onItemSelect$.next(entry);
        this.remove();
      });

      /** Append the element to the list */
      this.appendChild(element);
    }
  }

  /** Disconnection point. Remove the mousedown handler from the window */
  public disconnectedCallback(): void {
    window.removeEventListener('mousedown', this.remove);
  }
}

/** Register the context menu custom element */
customElements.define('logik-context-menu', LogikEditorContextMenu);

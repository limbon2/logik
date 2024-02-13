import './app.element.css';

import { LogikEventBus, LogikGraph, LogikNode, LogikNodeRegistry, LogikSocket } from '@logik/core';
import { LogikEditor } from '@logik/editor';

class TestNode extends LogikNode {
  constructor() {
    super('Test');

    this.inputs.push(new LogikSocket('In 1', this), new LogikSocket('In 2', this));
    this.outputs.push(new LogikSocket('Out 1', this), new LogikSocket('Out 2', this), new LogikSocket('Out 3', this));
  }

  public run(): void {
    console.log(this);
  }
}

const registry = new LogikNodeRegistry();
registry.register('test', TestNode, []);

const bus = new LogikEventBus();

const graph = new LogikGraph(registry, bus);

const container = document.querySelector('#root') as HTMLDivElement;

const editor = new LogikEditor(graph, container);
editor.render();

import './app.element.css';

import { LogikEventBus, LogikGraph, LogikNode, LogikNodeRegistry, LogikSocketType } from '@logik/core';
import { LogikEditor } from '@logik/editor';

class BeginNode extends LogikNode {
  constructor() {
    super('Begin');
    this.isRoot = true;

    this.addOutput('', LogikSocketType.Produce);
  }

  public override run(): void {
    //
  }
}

class LogNode extends LogikNode {
  constructor() {
    super('Log');

    this.addInput('', LogikSocketType.Consume);
    this.addInput('Value', LogikSocketType.Text);

    this.addOutput('', LogikSocketType.Produce);
  }

  public override run(): void {
    console.log(this.properties['value']);
  }
}

class MakeTextNode extends LogikNode {
  constructor() {
    super('Make Text');

    this.addOutput('Value', LogikSocketType.Text);
  }

  public override run(): void {
    this.setOutputProperty(0, 'value', 'Hello, World!');
  }
}

class ToUpperCaseNode extends LogikNode {
  constructor() {
    super('To Upper Case');
    this.addInput('Input', LogikSocketType.Text);
    this.addOutput('Output', LogikSocketType.Text);
  }

  public override run(): void {
    const text = this.getInputProperty(0, 'value');
    this.setOutputProperty(0, 'value', text.toUpperCase());
  }
}

const button = document.createElement('button');
button.textContent = 'Run';
document.body.appendChild(button);

button.addEventListener('click', () => {
  graph.run();
});

const registry = new LogikNodeRegistry();
registry.register('Begin', BeginNode, []);
registry.register('Log', LogNode, []);
registry.register('Make Text', MakeTextNode, []);
registry.register('To Upper Case', ToUpperCaseNode, []);

const bus = new LogikEventBus();

const graph = new LogikGraph(registry, bus);

const container = document.querySelector('#root') as HTMLDivElement;

const editor = new LogikEditor(graph, container);
editor.render();

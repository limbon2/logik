import './app.element.css';

import { LogikEventBus, LogikGraph, LogikNode, LogikNodeRegistry, LogikSocketType } from '@logik/core';
import { LogikEditor } from '@logik/editor';

class BeginNode extends LogikNode {
  constructor() {
    super('Begin');
    this.isRoot = true;

    this.addOutput(LogikSocketType.Produce, '', null);
  }

  public override run(): void {
    //
  }
}

class LogNode extends LogikNode {
  constructor() {
    super('Log');

    this.addInput(LogikSocketType.Consume, null, '');
    this.addInput(LogikSocketType.Text, 'value', 'Value');

    this.addOutput(LogikSocketType.Produce, null, '');
  }

  public override run(): void {
    const value = this.getInputProperty(1);
    console.log(value);
  }
}

class MakeTextNode extends LogikNode {
  constructor() {
    super('Make Text');

    this.addOutput(LogikSocketType.Text, 'value', 'Value');
  }

  public override run(): void {
    this.setOutputProperty(0, this.properties['value']);
  }
}

class ToUpperCaseNode extends LogikNode {
  constructor() {
    super('To Upper Case');
    this.addInput(LogikSocketType.Text, 'value', 'Input', false);
    this.addOutput(LogikSocketType.Text, 'value', 'Output', false);
  }

  public override run(): void {
    const text = this.getInputProperty(0);
    this.setOutputProperty(0, text.toUpperCase());
  }
}

const runButton = document.createElement('button');
runButton.textContent = 'Run';
document.body.appendChild(runButton);
runButton.addEventListener('click', () => {
  graph.run();
});

const serializeButton = document.createElement('button');
serializeButton.textContent = 'Save';
document.body.appendChild(serializeButton);
serializeButton.addEventListener('click', () => {
  editor.deserialize(editor.serialize());
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

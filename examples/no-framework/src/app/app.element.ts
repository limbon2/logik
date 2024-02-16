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

    this.addOutput(LogikSocketType.Text, 'value', 'Value', true);
  }

  public override run(): void {
    const value = this.outputs[0].value;
    this.setOutputProperty(0, value);
  }
}

class ToUpperCaseNode extends LogikNode {
  constructor() {
    super('To Upper Case');
    this.addInput(LogikSocketType.Text, 'value', 'Input', false, false);
    this.addOutput(LogikSocketType.Text, 'value', 'Output', false, false);
  }

  public override run(): void {
    const text = this.getInputProperty(0);
    this.setOutputProperty(0, text.toUpperCase());
  }
}

class CreateElementNode extends LogikNode {
  constructor() {
    super('Create element');
    this.addInput(LogikSocketType.Consume, '', '', false);
    this.addInput(LogikSocketType.Text, 'type', 'Type');
    this.addInput(LogikSocketType.Text, 'content', 'Content');

    this.addOutput(LogikSocketType.Produce, '', '', false);
    this.addOutput(LogikSocketType.Text, 'element', 'Element', true, false);
  }

  public override run(): void {
    const type = this.getInputProperty(1);
    console.log('running create element', type);
    const content = this.getInputProperty(2);
    const element = document.createElement(type);
    element.textContent = content;
    document.body.appendChild(element);
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
registry.register('Create element', CreateElementNode, []);

const bus = new LogikEventBus();

const graph = new LogikGraph(registry, bus);

const container = document.querySelector('#root') as HTMLDivElement;

const editor = new LogikEditor(graph, container);
editor.render();

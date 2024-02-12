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

const obj = {
  nodes: {
    '7fecaefb-603d-4968-8d2a-ff6f044dd880': {
      x: 507,
      y: 0,
    },
    'd75e291b-b58a-42e0-ae82-5d31ba8c86bc': {
      x: 99,
      y: 400,
    },
  },
  graph: {
    id: '3680612c-7792-453a-a727-69ad9520845b',
    nodes: {
      '7fecaefb-603d-4968-8d2a-ff6f044dd880': {
        id: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
        name: 'Test',
        properties: {},
        type: 'test',
        inputs: ['5052b915-16cd-4f4d-a9c9-692dacfb1b63', 'd74df1cf-0dd9-4b02-bc16-12884f5b48e6'],
        outputs: [
          '11302f21-0c6b-4e82-86fe-06941c054242',
          'ef9f298f-349c-4edb-93e0-af60a1e9256d',
          '45c1582e-5996-4893-8f13-636850a38add',
        ],
      },
      'd75e291b-b58a-42e0-ae82-5d31ba8c86bc': {
        id: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
        name: 'Test',
        properties: {},
        type: 'test',
        inputs: ['8bff4feb-cb1a-4929-b9a1-a0328382671c', 'ba45a081-2f17-4f27-862f-859002b99910'],
        outputs: [
          'c95d7812-e510-43a1-ab4c-d445030f4f3c',
          '87c82c9b-cad9-40f1-bf7f-15b5ff8c5b4c',
          '1127953b-b9e0-4afc-ba90-4d4d1640aba4',
        ],
      },
    },
    sockets: {
      '5052b915-16cd-4f4d-a9c9-692dacfb1b63': {
        id: '5052b915-16cd-4f4d-a9c9-692dacfb1b63',
        name: 'In 1',
        parentId: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
      },
      'd74df1cf-0dd9-4b02-bc16-12884f5b48e6': {
        id: 'd74df1cf-0dd9-4b02-bc16-12884f5b48e6',
        name: 'In 2',
        parentId: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
      },
      '11302f21-0c6b-4e82-86fe-06941c054242': {
        id: '11302f21-0c6b-4e82-86fe-06941c054242',
        name: 'Out 1',
        parentId: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
      },
      'ef9f298f-349c-4edb-93e0-af60a1e9256d': {
        id: 'ef9f298f-349c-4edb-93e0-af60a1e9256d',
        name: 'Out 2',
        parentId: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
      },
      '45c1582e-5996-4893-8f13-636850a38add': {
        id: '45c1582e-5996-4893-8f13-636850a38add',
        name: 'Out 3',
        parentId: '7fecaefb-603d-4968-8d2a-ff6f044dd880',
      },
      '8bff4feb-cb1a-4929-b9a1-a0328382671c': {
        id: '8bff4feb-cb1a-4929-b9a1-a0328382671c',
        name: 'In 1',
        parentId: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
      },
      'ba45a081-2f17-4f27-862f-859002b99910': {
        id: 'ba45a081-2f17-4f27-862f-859002b99910',
        name: 'In 2',
        parentId: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
      },
      'c95d7812-e510-43a1-ab4c-d445030f4f3c': {
        id: 'c95d7812-e510-43a1-ab4c-d445030f4f3c',
        name: 'Out 1',
        parentId: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
      },
      '87c82c9b-cad9-40f1-bf7f-15b5ff8c5b4c': {
        id: '87c82c9b-cad9-40f1-bf7f-15b5ff8c5b4c',
        name: 'Out 2',
        parentId: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
      },
      '1127953b-b9e0-4afc-ba90-4d4d1640aba4': {
        id: '1127953b-b9e0-4afc-ba90-4d4d1640aba4',
        name: 'Out 3',
        parentId: 'd75e291b-b58a-42e0-ae82-5d31ba8c86bc',
      },
    },
    connections: {
      '5ea36548-bb06-4634-80de-eaf4abfdc3a4': {
        id: '5ea36548-bb06-4634-80de-eaf4abfdc3a4',
        inputId: '5052b915-16cd-4f4d-a9c9-692dacfb1b63',
        outputId: 'c95d7812-e510-43a1-ab4c-d445030f4f3c',
      },
    },
  },
};

editor.deserialize(obj);

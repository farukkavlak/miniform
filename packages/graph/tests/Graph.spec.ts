import { describe, expect, it } from 'vitest';

import { Graph } from '../src/Graph';

describe('Graph', () => {
  it('should add nodes', () => {
    const graph = new Graph<string>();
    graph.addNode('A', 'Data A');
    expect(graph.getNode('A')).toBe('Data A');
  });

  it('should throw when adding duplicate node', () => {
    const graph = new Graph<string>();
    graph.addNode('A', 'val');
    expect(() => graph.addNode('A', 'val2')).toThrow(/exists/);
  });

  it('should sort nodes topologically (simple)', () => {
    // A -> B (A comes before B)
    const graph = new Graph<string>();
    graph.addNode('A', 'val');
    graph.addNode('B', 'val');
    graph.addEdge('A', 'B');

    const sorted = graph.topologicalSort();
    expect(sorted).toEqual(['A', 'B']);
  });

  it('should sort nodes topologically (complex)', () => {
    // A -> B, A -> C, B -> D, C -> D
    // Expect: A, then B/C, then D.
    const graph = new Graph<string>();
    graph.addNode('A', 'val');
    graph.addNode('B', 'val');
    graph.addNode('C', 'val');
    graph.addNode('D', 'val');

    graph.addEdge('A', 'B');
    graph.addEdge('A', 'C');
    graph.addEdge('B', 'D');
    graph.addEdge('C', 'D');

    const sorted = graph.topologicalSort();
    // A must be first
    expect(sorted[0]).toBe('A');
    // D must be last
    expect(sorted[3]).toBe('D');
    // B and C are in middle
    expect(sorted.slice(1, 3)).toContain('B');
    expect(sorted.slice(1, 3)).toContain('C');
  });

  it('should detect cycles', () => {
    // A -> B -> A
    const graph = new Graph<string>();
    graph.addNode('A', 'val');
    graph.addNode('B', 'val');
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'A');

    expect(() => graph.topologicalSort()).toThrow(/Cycle/);
  });

  it('should throw when adding edge from non-existent node', () => {
    const graph = new Graph<string>();
    graph.addNode('B', 'val');
    expect(() => graph.addEdge('A', 'B')).toThrow(/node a does not exist/i);
  });

  it('should throw when adding edge to non-existent node', () => {
    const graph = new Graph<string>();
    graph.addNode('A', 'val');
    expect(() => graph.addEdge('A', 'Z')).toThrow(/node z does not exist/i);
  });
});

export class Graph<T> {
  private nodes: Map<string, T> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();

  addNode(id: string, data: T): void {
    if (this.nodes.has(id)) throw new Error(`Node ${id} already exists`);
    this.nodes.set(id, data);
    this.adjacencyList.set(id, new Set());
  }

  addEdge(from: string, to: string): void {
    if (!this.nodes.has(from)) throw new Error(`Node ${from} does not exist`);
    if (!this.nodes.has(to)) throw new Error(`Node ${to} does not exist`);

    this.adjacencyList.get(from)!.add(to);
  }

  getNode(id: string): T | undefined {
    return this.nodes.get(id);
  }

  /**
   * Returns nodes in topological order (dependency order).
   * Throws error if cycle is detected.
   */
  topologicalSort(): string[] {
    const inDegree = this.calculateInDegrees();
    const result: string[] = [];
    const queue: string[] = [];

    for (const [node, degree] of inDegree.entries()) if (degree === 0) queue.push(node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = this.adjacencyList.get(current)!;
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (result.length !== this.nodes.size) throw new Error('Dependency Cycle Detected');

    return result;
  }

  private calculateInDegrees(): Map<string, number> {
    const inDegree: Map<string, number> = new Map();

    for (const node of this.nodes.keys()) inDegree.set(node, 0);

    for (const neighbors of this.adjacencyList.values()) for (const neighbor of neighbors) inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);

    return inDegree;
  }
}

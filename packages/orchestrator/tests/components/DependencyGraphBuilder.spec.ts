import { Graph } from '@miniform/graph';
import { Address } from '../../src/Address';
import { DependencyGraphBuilder } from '../../src/components/DependencyGraphBuilder';
import { ScopeManager } from '../../src/scope/ScopeManager';
import { describe, expect, it } from 'vitest';

describe('DependencyGraphBuilder', () => {
    const scopeManager = new ScopeManager();
    const builder = new DependencyGraphBuilder(scopeManager);
    const context = new Address([], 'resource', 'main');

    it('should add dependencies from array attributes', () => {
        // Access private method via casting
        const graph = new Graph<null>();
        graph.addNode('resource.main', null);
        graph.addNode('resource.dep', null); // Add dependency node

        // We need to cast builder to any to access private methods for unit testing specific logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (builder as any).addValueDependencies(
            ['param', { type: 'Reference', value: ['data', 'aws_ami', 'ubuntu', 'id'] }],
            graph,
            'resource.main',
            context
        );

        // Should NOT add edge for 'param' (string)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (builder as any).addValueDependencies(
            [{ type: 'Reference', value: ['resource', 'dep', 'id'] }],
            graph,
            'resource.main',
            context
        );

        // Check if edge exists: resource.dep -> resource.main
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adj = (graph as any).adjacencyList;
        expect(adj.get('resource.dep').has('resource.main')).toBe(true);
    });

    it('should add dependencies from module output references', () => {
        const graph = new Graph<null>();
        graph.addNode('resource.main', null);
        graph.addNode('module.vpc.outputs.subnet_id', null); // Add output node

        // ref: module.vpc.subnet_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (builder as any).addReferenceDependencies(
            ['module', 'vpc', 'subnet_id'],
            graph,
            'resource.main',
            context
        );

        // Expect edge: module.vpc.outputs.subnet_id -> resource.main
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adj = (graph as any).adjacencyList;
        expect(adj.get('module.vpc.outputs.subnet_id').has('resource.main')).toBe(true);
    });

    it('should add dependencies from string interpolation', () => {
        const graph = new Graph<null>();
        graph.addNode('resource.main', null);
        graph.addNode('resource.db', null); // Add interpolation dependency node

        // val: "${resource.db.endpoint}"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (builder as any).addInterpolationDependencies(
            'Server at ${resource.db.endpoint} is ready',
            graph,
            'resource.main',
            context
        );

        // Expect edge: resource.db -> resource.main
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adj = (graph as any).adjacencyList;
        expect(adj.get('resource.db').has('resource.main')).toBe(true);
    });
});

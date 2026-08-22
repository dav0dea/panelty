import { describe, it, expect } from 'vitest';
import {
	findPanel,
	findParent,
	countPanels,
	collectPanels,
	firstPanelId,
	normalize,
	resizeFractions,
	MIN_FRACTION,
	MIN_PANEL_PX,
	type LayoutNode,
	type SplitNode,
	type StackNode
} from './model';

/**
 * What is left of the model once the manager owns the tree: the render vocabulary, the queries
 * every component reads it with, and the one piece of geometry a client must own — the pixel floor
 * a splitter drag is clamped to, which only the renderer can measure — plus the NORMALISATION every
 * planner's output goes through, which is here because both ends need the same answer. Placing a
 * node is the HOST's: `memoryHost` plans it over a tree in memory, and `memoryHost.test.ts` drives
 * the whole of it through the panel system.
 */

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function tree(): SplitNode {
	return {
		kind: 'split',
		id: 'split-1',
		direction: 'row',
		sizes: [0.5, 0.5],
		children: [
			{ kind: 'panel', id: 'panel-a', panelType: 'node-editor' },
			{
				kind: 'split',
				id: 'split-2',
				direction: 'column',
				sizes: [0.5, 0.5],
				children: [
					{ kind: 'panel', id: 'panel-b', panelType: 'console' },
					{ kind: 'panel', id: 'panel-c', panelType: 'viewer' }
				]
			}
		]
	};
}

describe('queries', () => {
	it('finds a panel at any depth, and misses cleanly', () => {
		expect(findPanel(tree(), 'panel-c')?.panelType).toBe('viewer');
		expect(findPanel(tree(), 'nope')).toBeNull();
	});

	it('collects and counts panels in document order', () => {
		expect(collectPanels(tree()).map((p) => p.id)).toEqual(['panel-a', 'panel-b', 'panel-c']);
		expect(countPanels(tree())).toBe(3);
		expect(firstPanelId(tree())).toBe('panel-a');
	});

	it('names a node’s parent split and its index — the sibling test a drag-join runs', () => {
		const p = findParent(tree(), 'panel-c');
		expect(p?.parent.id).toBe('split-2');
		expect(p?.index).toBe(1);
		const leaf: LayoutNode = { kind: 'panel', id: 'lone', panelType: 'empty' };
		expect(findParent(leaf, 'lone'), 'a root has no parent').toBeNull();
	});
});

/**
 * The rules that keep a tree drawable. They are asserted here, on shapes rather than through a
 * gesture, because every planner's output goes through them and a rule half-applied is the whole
 * of what makes a layout library feel broken.
 */
describe('normalize', () => {
	const P = (id: string, t = 'x'): LayoutNode => ({ kind: 'panel', id, panelType: t });
	const S = (id: string, kids: LayoutNode[], sizes?: number[], dir: 'row' | 'column' = 'row'): SplitNode => ({
		kind: 'split',
		id,
		direction: dir,
		children: kids,
		sizes: sizes ?? kids.map(() => 1 / kids.length)
	});
	const T = (id: string, kids: LayoutNode[]): StackNode => ({ kind: 'stack', id, children: kids });
	const shape = (n: LayoutNode | null): string => {
		if (!n) return '∅';
		if (n.kind === 'panel') return n.id;
		const kids = n.children.map(shape).join(' ');
		return n.kind === 'stack' ? `tabs[${kids}]` : `${n.direction === 'row' ? 'row' : 'col'}[${kids}]`;
	};

	it('replaces a container of one BY its child', () => {
		expect(shape(normalize(S('s', [P('a')])))).toBe('a');
		expect(shape(normalize(T('t', [P('a')])))).toBe('a');
	});

	it('…except the root, which stays a stack so the strip it draws cannot vanish', () => {
		expect(shape(normalize(T('root', [P('a')]), true))).toBe('tabs[a]');
		expect(shape(normalize(T('root', [S('s', [P('a')])]), true))).toBe('tabs[a]');
	});

	it('removes a container with nothing left in it', () => {
		expect(shape(normalize(S('s', [])))).toBe('∅');
		expect(shape(normalize(S('s', [P('a'), S('gone', [])])))).toBe('a');
	});

	it('folds a split into its parent along the same axis, and keeps the shares honest', () => {
		const n = normalize(S('outer', [P('a'), S('inner', [P('b'), P('c')], [0.25, 0.75])], [0.6, 0.4]));
		expect(shape(n)).toBe('row[a b c]');
		const sizes = n?.kind === 'split' ? n.sizes : [];
		expect(sizes[0]).toBeCloseTo(0.6, 6);
		expect(sizes[1], 'the inner shares take their parent’s slot').toBeCloseTo(0.1, 6);
		expect(sizes[2]).toBeCloseTo(0.3, 6);
		expect(sum(sizes)).toBeCloseTo(1, 6);
	});

	it('leaves a split of the OTHER axis where it is', () => {
		expect(shape(normalize(S('outer', [P('a'), S('inner', [P('b'), P('c')], undefined, 'column')]))))
			.toBe('row[a col[b c]]');
	});

	it('leaves a group INSIDE a page alone — folding it up would scatter its members', () => {
		expect(shape(normalize(T('root', [P('a'), T('group', [P('b'), P('c')])]), true)))
			.toBe('tabs[a tabs[b c]]');
	});

	it('always leaves a split’s shares summing to 1', () => {
		const n = normalize(S('s', [P('a'), P('b')], [4, 1]));
		const sizes = n?.kind === 'split' ? n.sizes : [];
		expect(sizes[0]).toBeCloseTo(0.8, 6);
		expect(sum(sizes)).toBeCloseTo(1, 6);
	});
});

describe('resizeFractions', () => {
	it('moves the boundary between two children', () => {
		const next = resizeFractions([0.5, 0.5], 0, 0.2);
		expect(next[0]).toBeCloseTo(0.7, 6);
		expect(next[1]).toBeCloseTo(0.3, 6);
		expect(sum(next)).toBeCloseTo(1, 6);
	});

	it('leaves the shares alone when the divider is not there', () => {
		expect(resizeFractions([0.5, 0.5], 1, 0.2)).toEqual([0.5, 0.5]);
		expect(resizeFractions([0.5, 0.5], -1, 0.2)).toEqual([0.5, 0.5]);
	});

	it('clamps a child to MIN_FRACTION instead of collapsing it', () => {
		const next = resizeFractions([0.5, 0.5], 0, 0.9); // would push child 1 negative
		expect(next[1]).toBeCloseTo(MIN_FRACTION, 6);
		expect(next[0]).toBeCloseTo(1 - MIN_FRACTION, 6);
	});

	it('touches only the pair either side of the divider', () => {
		const next = resizeFractions([0.4, 0.4, 0.2], 0, 0.1);
		expect(next[2], 'a third child keeps its slice').toBeCloseTo(0.2, 6);
		expect(sum(next)).toBeCloseTo(1, 6);
	});

	/* A fraction floor is not a floor: 5% of a 390px phone is a 19.5px panel, and 5% of a
	   4K window is 192px — the same rule producing an unusable sliver at one size and a generous
	   minimum at another. The split's measured px is what makes the floor mean something. This is a
	   desktop fix too: a narrow desktop window collapses a panel exactly the same way. It stays on
	   the CLIENT because the manager cannot know it — it plans in fractions and never sees a pixel. */
	describe('the pixel floor', () => {
		it('floors a child at MIN_PANEL_PX of the split it lives in', () => {
			const next = resizeFractions([0.5, 0.5], 0, 0.9, 800);
			expect(next[1] * 800, 'not 5% of 800 = 40px').toBeCloseTo(MIN_PANEL_PX, 6);
			expect(sum(next)).toBeCloseTo(1, 6);
		});

		it('still allows every size above the floor', () => {
			expect(resizeFractions([0.5, 0.5], 0, 0.2, 800)[0]).toBeCloseTo(0.7, 6);
		});

		it('never floors past an even split, so a tiny container stays draggable-to-centre', () => {
			// Below 2 × MIN_PANEL_PX the floor cannot be honoured on both sides; capping it at half
			// the pair's share keeps the arithmetic sane (and the sizes positive) instead of
			// producing a negative neighbour.
			const next = resizeFractions([0.5, 0.5], 0, 0.9, 200);
			expect(next[0]).toBeCloseTo(0.5, 6);
			expect(next[1]).toBeCloseTo(0.5, 6);
		});

		it('falls back to the fraction floor when the container size is unknown', () => {
			expect(resizeFractions([0.5, 0.5], 0, 0.9)[1]).toBeCloseTo(MIN_FRACTION, 6);
		});
	});
});

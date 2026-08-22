/**
 * The package, driven standalone.
 *
 * A host that turns each gesture into a network command tests the APP behind it, and tests this
 * contract poorly: a port only proves itself against a second implementation. `memoryHost` is that
 * second one, and this drives it. No socket, no server, no app — the host owns the tree, the store
 * raises gestures at it, and what comes back is asserted as an arrangement rather than a payload.
 *
 * One scenario, in the order a person actually works: open a workspace, split it, give the halves
 * content, resize the seam, tab one onto the other, switch between them, tear one out onto the page
 * strip, and close it.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { memoryHost } from './memoryHost';
import { workspace } from './workspace.svelte';
import { collectPanels, findNode, type LayoutNode, type StackNode } from './model';

/** The arrangement as a shape worth reading in a diff: `type` leaves, `row[…]`/`col[…]`/`tabs[…]`. */
function shape(node: LayoutNode): string {
	if (node.kind === 'panel') return node.panelType;
	const kids = node.children.map(shape).join(' ');
	if (node.kind === 'stack') return `tabs[${kids}]`;
	return `${node.direction === 'row' ? 'row' : 'col'}[${kids}]`;
}
const drawn = (): string => shape(workspace().root);
const panels = (): string[] => collectPanels(workspace().root).map((p) => p.id);
/** The id of the first node of `kind` in document order — the split or group a step just made. */
function idOf(kind: 'split' | 'stack', node: LayoutNode = workspace().root): string {
	if (node.kind === 'panel') return '';
	if (node.kind === kind) return node.id;
	for (const c of node.children) {
		const found = idOf(kind, c);
		if (found) return found;
	}
	return '';
}

/** Settle the store's promise chain: every gesture is raised through an async host. */
const settle = async (): Promise<void> => {
	for (let i = 0; i < 6; i++) await Promise.resolve();
};

function boot(root?: StackNode) {
	const ws = workspace();
	ws.syncFromDoc(null);
	// Constructing the host is what hands its tree over — it pushes, the way every other host does.
	ws.configureHost(memoryHost({ root, defaultPanelType: 'editor', emptyPanelType: 'empty' }));
	return ws;
}

beforeEach(() => {
	workspace().syncFromDoc(null);
});

describe('a workspace with nothing behind it but memory', () => {
	it('draws what the host holds, before a single gesture', async () => {
		const ws = boot();
		await settle();
		expect(drawn()).toBe('tabs[editor]');
		expect(ws.activePanelId, 'and the focus is somewhere real').toBe(panels()[0]);
	});

	it('carries one person through a working session, and the tree follows', async () => {
		const ws = boot();
		await settle();
		const [first] = panels();

		// Split it, and the fresh half is EMPTY — content is a choice, not an inheritance.
		ws.split(first, 'row');
		await settle();
		expect(drawn()).toBe('tabs[row[editor empty]]');
		const born = panels()[1];
		expect(ws.activePanelId, 'the focus follows the panel that was just born').toBe(born);

		// Give it content through the same door a panel's own menu uses.
		ws.setType(born, 'console');
		await settle();
		expect(drawn()).toBe('tabs[row[editor console]]');

		// A seam drag: drawn locally per pointermove, committed once on pointer-up.
		const split = idOf('split');
		ws.resize(split, 0, 0.2, 800);
		ws.commitResize(split);
		await settle();
		const after = findNode(workspace().root, split);
		expect(after?.kind === 'split' && after.sizes[0], 'the seam moved and stayed').toBeCloseTo(0.7, 2);

		// Drop the console on the editor's own header: the two become a GROUP, and the split that
		// held them is left with one child and promotes it.
		ws.dragging = { node: born };
		ws.dropOn({ stack: first, index: 1 });
		await settle();
		expect(drawn(), 'a group inside the page, not two pages').toBe('tabs[tabs[editor console]]');
		expect(ws.activePanelId).toBe(born);

		// Switching between the group's members is NAVIGATION: the tree does not move.
		const group = idOf('stack', workspace().root.children[0]);
		expect(ws.showing(group)).toBe(born);
		ws.show(group, first);
		expect(ws.showing(group), 'and the pick is this client’s alone').toBe(first);
		expect(drawn()).toBe('tabs[tabs[editor console]]');

		// Tear the editor out onto the page strip — the same move, landing on the ROOT stack.
		ws.dragging = { node: first };
		ws.dropOn({ stack: workspace().root.id, index: 0 });
		await settle();
		expect(drawn(), 'the group of one promoted its survivor').toBe('tabs[editor console]');
		expect(ws.page, 'and the client follows what it carried').toBe(first);

		// Closing one of two closes it; the workspace keeps the other, and the strip moves to the
		// NEIGHBOUR before the delta lands rather than falling back to its first.
		ws.show(workspace().root.id, born);
		ws.close(born);
		expect(ws.page, 'off the page being closed at once').toBe(first);
		await settle();
		expect(drawn()).toBe('tabs[editor]');
	});

	it('refuses what it cannot do, and says so rather than half-doing it', async () => {
		const ws = boot();
		await settle();
		const [only] = panels();

		// The last panel there is has nowhere to go.
		ws.close(only);
		await settle();
		expect(drawn(), 'the workspace is never empty').toBe('tabs[editor]');

		// A panel dropped onto itself is not a move.
		ws.dragging = { node: only };
		ws.dropOn({ beside: only, direction: 'row', placeBefore: false });
		await settle();
		expect(drawn()).toBe('tabs[editor]');
		expect(ws.dragging, 'and the drag is spent either way').toBeNull();

		// Nor is one dropped INTO its own descendant, which would make a cycle.
		ws.split(only, 'row');
		await settle();
		const split = idOf('split');
		ws.dragging = { node: split };
		ws.dropOn({ beside: only, direction: 'column', placeBefore: false });
		await settle();
		expect(drawn(), 'a subtree cannot land inside itself').toBe('tabs[row[editor empty]]');
	});

	it('adopts a tree it is handed, and keeps minting past its ids', async () => {
		// The other way a consumer starts: with an arrangement it already has. Its ids are the ones
		// every viewpoint is keyed by, so they stand — and the host counts past them rather than
		// minting a second `panel-2` that resolves to the wrong panel.
		boot({
			kind: 'stack',
			id: 'stack-1',
			children: [{ kind: 'panel', id: 'panel-2', panelType: 'editor' }]
		});
		await settle();
		expect(drawn()).toBe('tabs[editor]');

		workspace().split('panel-2', 'column');
		await settle();
		const ids = panels();
		expect(ids[0]).toBe('panel-2');
		expect(ids[1], 'the new panel is not a name the tree already used').not.toBe('panel-2');
		expect(findNode(workspace().root, ids[1])).not.toBeNull();
	});
});

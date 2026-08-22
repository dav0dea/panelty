/**
 * A [`LayoutHost`] that owns the arrangement itself, in memory.
 *
 * The package holds no tree: it draws what it is handed and raises every gesture through a host.
 * That is the right shape when something else already owns the arrangement — a server, a document,
 * an undo stack — and it is a wall in front of anyone who just wants panels. This is the other end:
 * a host with nowhere to persist to, which plans each gesture over a plain tree and pushes the
 * result straight back in.
 *
 * It is also what proves the port. Every method here is written against `LayoutHost` and nothing
 * else, so a gesture the panel system cannot express through the contract has nowhere to go.
 *
 * What it deliberately does NOT do is undo: an inverse belongs to whoever owns the history, and a
 * host with no history has no honest one to offer. A consumer that wants it implements the same
 * contract over its own command log.
 */
import type { AddAt, Landing, LayoutHost } from './host';
import {
	countPanels,
	findNode,
	findParent,
	normalize,
	type Direction,
	type LayoutNode,
	type StackNode
} from './model';
import { workspace } from './workspace.svelte';

/** The panel type a fresh tab starts with, and the one a split births. Both are the CONSUMER's
 *  vocabulary — these are the neutral spellings, overridable per call and per host. */
export interface MemoryHostOptions {
	root?: StackNode;
	defaultPanelType?: string;
	emptyPanelType?: string;
	/** Where the plan goes once it is made. Defaults to the panel system's own store. */
	push?: (root: StackNode) => void;
}

export function memoryHost(opts: MemoryHostOptions = {}): LayoutHost {
	const empty = opts.emptyPanelType ?? 'empty';
	const fresh = opts.defaultPanelType ?? empty;
	const push = opts.push ?? ((r: StackNode) => workspace().syncFromDoc(r));

	// One counter for every id this host mints, never reused: a viewpoint, a subscription and an
	// undo entry are all keyed by id, so a recycled one is a stale reference that resolves.
	let seq = 0;
	const mint = (kind: string): string => `${kind}-${++seq}`;

	let root: StackNode = opts.root ? structuredClone(opts.root) : stack([panel(fresh)]);
	if (opts.root) seq = highestSeq(root);
	// Handed over at once. The panel system has no `getLayout` to pull with — the arrangement arrives
	// as a push, because for every other host it arrives as one (a delta, a snapshot, a message) and
	// a pull would make every render re-read whatever is behind it.
	commit();

	function panel(panelType: string): LayoutNode {
		return { kind: 'panel', id: mint('panel'), panelType };
	}

	function stack(children: LayoutNode[]): StackNode {
		return { kind: 'stack', id: mint('stack'), children };
	}

	/** Apply the shared rules and hand the result over. The ROOT survives them by definition. */
	function commit(): true {
		const next = normalize(root, true);
		root = (next?.kind === 'stack' ? next : stack(next ? [next] : [panel(fresh)])) as StackNode;
		push(structuredClone(root));
		return true;
	}

	/** Swap the node with id `id` for `next`, wherever it sits. The root is never swapped: it is a
	 * stack for the tree's whole life. */
	function replace(id: string, next: LayoutNode): boolean {
		const at = findParent(root, id);
		if (!at) return false;
		at.parent.children[at.index] = next;
		return true;
	}

	/**
	 * Lift `id` out of the tree, closing up behind it. Returns the subtree, or null when it holds
	 * the last panel there is — the one thing that has nowhere to go.
	 */
	function take(id: string): LayoutNode | null {
		const node = findNode(root, id);
		const at = findParent(root, id);
		if (!node || !at) return null;
		if (countPanels(node) >= countPanels(root)) return null;
		at.parent.children.splice(at.index, 1);
		if (at.parent.kind === 'split') at.parent.sizes.splice(at.index, 1);
		return node;
	}

	/** The stack `id` names, WRAPPING it when it is not one — dropping on a lone panel's header
	 * makes a group of the two, and dropping on a stack's header joins the group already there. */
	function asStack(id: string): StackNode | null {
		const node = findNode(root, id);
		if (!node) return null;
		if (node.kind === 'stack') return node;
		const wrapper = stack([node]);
		return replace(id, wrapper) ? wrapper : null;
	}

	/** Put `node` beside `target`, splitting along `direction`; `share` is the newcomer's. */
	function insertBeside(
		node: LayoutNode,
		target: string,
		direction: Direction,
		before: boolean,
		share: number
	): boolean {
		const at = findParent(root, target);
		if (at && at.parent.kind === 'split' && at.parent.direction === direction) {
			const host = at.parent;
			const i = at.index + (before ? 0 : 1);
			host.children.splice(i, 0, node);
			host.sizes.splice(i, 0, share);
			return true;
		}
		const existing = findNode(root, target);
		if (!existing) return false;
		const split: LayoutNode = {
			kind: 'split',
			id: mint('split'),
			direction,
			children: before ? [node, existing] : [existing, node],
			sizes: before ? [share, 1 - share] : [1 - share, share]
		};
		return replace(target, split);
	}

	function place(node: LayoutNode, at: string, opts: AddAt): boolean {
		if (opts.direction) {
			return insertBeside(node, at, opts.direction, opts.placeBefore ?? false, opts.ratio ?? 0.5);
		}
		const host = asStack(at);
		if (!host) return false;
		const i = opts.index ?? host.children.length;
		host.children.splice(Math.max(0, Math.min(i, host.children.length)), 0, node);
		return true;
	}

	return {
		async addPanel(at, opts) {
			const born = panel(opts?.panelType ?? (opts?.direction ? empty : fresh));
			if (!place(born, at, opts ?? {})) return null;
			commit();
			return born.id;
		},

		async removePanel(node) {
			return take(node) === null ? false : commit();
		},

		async resizeSplit(split, fractions) {
			const node = findNode(root, split);
			if (node?.kind !== 'split' || node.children.length !== fractions.length) return false;
			node.sizes = [...fractions];
			return commit();
		},

		async setPanel(target, patch) {
			const node = findNode(root, target);
			if (node?.kind !== 'panel') return false;
			// A new TYPE clears the old type's state: the two are one thing, and a stale bag under a
			// panel that no longer reads it is a value nothing can ever remove.
			if (patch.type !== undefined && patch.type !== node.panelType) {
				node.panelType = patch.type;
				node.state = undefined;
			}
			if (patch.state) node.state = { ...(node.state as object), ...patch.state };
			return commit();
		},

		async movePanel(subtree, to: Landing) {
			const target = 'beside' in to ? to.beside : to.stack;
			const source = findNode(root, subtree);
			// Onto itself, or into its own descendant — the second would make a cycle.
			if (!source || subtree === target || findNode(source, target)) return false;
			// Lifted FIRST, as any split-aware planner must: closing up behind the source can promote
			// a sibling into the very slot the newcomer is about to share.
			const moved = take(subtree);
			if (!moved) return false;
			const landing =
				'beside' in to
					? { direction: to.direction, placeBefore: to.placeBefore, ratio: 0.5 }
					: { index: to.index };
			if (!place(moved, target, landing)) return false;
			return commit();
		}
	};

	/** Continue a handed-over tree's numbering rather than colliding with it. */
	function highestSeq(from: LayoutNode): number {
		let top = 0;
		for (const id of ids(from)) {
			const n = Number(id.split('-').pop());
			if (Number.isFinite(n)) top = Math.max(top, n);
		}
		return top;
	}

	function ids(node: LayoutNode): string[] {
		return node.kind === 'panel' ? [node.id] : [node.id, ...node.children.flatMap(ids)];
	}
}

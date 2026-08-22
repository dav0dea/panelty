/**
 * The seam between the panel system and whatever owns the arrangement.
 *
 * The panel system holds no tree. It draws the one it is handed (`syncFromDoc`), recognises the
 * gestures over it, and raises each one HERE — as an intent, not as a write. Whoever implements
 * this owns persistence, concurrency and undo — a networked implementation turns each call into one
 * command on the wire; [`memoryHost`] plans it over a tree in memory.
 *
 * ONE contract, because there is one kind of thing: a workspace tab is a child of the root stack,
 * so adding a tab and tabbing a panel onto another panel are the same op with a different target.
 *
 * Every write answers whether it LANDED. A refusal is ordinary — closing the last panel, a peer
 * having already taken what this gesture names — and the panel system uses the answer to decide
 * where to move the focus, never to retry. An op that MINTS answers an id instead, because the
 * caller has no other handle on what it made; a move never does, because the caller named the
 * subtree and the next tree it is handed says where the subtree went.
 */
import type { Direction } from './model';

/** Where a moved subtree LANDS: beside an existing node, splitting it along `direction` — or as a
 * tab inside a stack, at `index` in its strip. The second is the drop-onto-a-header gesture, and
 * the root stack's strip is what makes it also the drop-onto-the-tab-bar one. */
export type Landing =
	| { beside: string; direction: Direction; placeBefore: boolean }
	| { stack: string; index: number };

/** How a fresh panel is placed: splitting `at`, or joining the stack `at` names. */
export interface AddAt {
	/** Split the target along this axis. Absent = tab it into the stack the target names. */
	direction?: Direction;
	placeBefore?: boolean;
	/** The newcomer's share of the split it creates. */
	ratio?: number;
	/** Position in the stack's strip. Only read when `direction` is absent. */
	index?: number;
	/** What the new panel starts as. Absent = the host's default. */
	panelType?: string;
}

export interface LayoutHost {
	/** Add a panel beside `at`, or as a tab in it, and answer its id — the caller's next act is to
	 * give it content, which needs an id it cannot otherwise know. */
	addPanel(at: string, opts?: AddAt): Promise<string | null>;
	removePanel(node: string): Promise<boolean>;
	/** Every child's share at once, in child order — what a resize drag commits on pointer-up. */
	resizeSplit(split: string, fractions: number[]): Promise<boolean>;
	/** A panel's type and/or its opaque state. `state` MERGES key by key, so a caller sends only
	 * what changed. `label` names the step a host with an undo history records. */
	setPanel(
		panel: string,
		patch: { type?: string; state?: Record<string, unknown> },
		label?: string
	): Promise<boolean>;
	/** Move a subtree to `to`. One op, so a drag is one undo step. */
	movePanel(subtree: string, to: Landing): Promise<boolean>;
}

/** The arrangement a host holds, as the panel system draws it: ONE tree, whose root is a stack.
 * Pushed in rather than pulled — an arrangement arrives as a delta, a snapshot or a message, so the
 * push is what already exists and a pull would make every render re-read whatever is behind it. */
export type LayoutIn = (root: import('./model').StackNode) => void;

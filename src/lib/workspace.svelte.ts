/**
 * Reactive workspace store — the browser's REPLICA of the manager's panel arrangement.
 *
 * The arrangement is a doc root the manager owns, and it is ONE tree whose root is a stack. This
 * store is handed that tree (`syncFromDoc`) and draws it; it never edits a node. Every gesture —
 * split, close, resize, move, tab — goes out as a layout COMMAND, so the manager owns persistence,
 * the broadcast to peers, and the undo step, exactly as it does for the graph. There is no second
 * write authority.
 *
 * What stays here is the VIEWPOINT: which child each stack is showing, which panel is focused or
 * maximized, and each editor's sub-patch depth. Those belong to this client alone — pushing them
 * into the doc would drag a peer's phone out of the sub-patch it is three levels into, and would
 * dirty a patch for looking around. They persist through `set_viewpoint`, which the manager stores
 * and rides into the `.gfi` without ever converging or dirtying it. Persistence and dirtiness are
 * separate axes.
 */
import {
	childrenOf,
	collectPanels,
	findNode,
	findParent,
	findPanel,
	firstPanelId,
	firstPanelIn,
	resizeFractions,
	type Direction,
	type LayoutNode,
	type StackNode
} from './model';
import { asStateObject } from './panelState';
import type { AddAt, Landing, LayoutHost } from './host';

/** A drag in progress: always a SUBTREE, whatever header or chip started it. */
export interface DragRef {
	node: string;
}

/**
 * Why a panel write happened — the axis that decides whether the patch now differs from the file on
 * disk. Since the cutover it is not a classification the manager has to be told: it is WHICH OP the
 * write becomes, so the taxonomy holds by construction.
 *
 * - `'authored'` — the user edited the arrangement (a viewer kind, a bound slot). It becomes an
 *   `edit_panel` command: undoable, converged to every peer, and it dirties.
 * - `'navigation'` — the user only changed what they are LOOKING at (entering a sub-patch). It
 *   becomes viewpoint: stored for this client, never converged, never dirtying.
 *
 * The routing follows the WRITE, never the device — phone and desktop share this one rule.
 */
export type LayoutIntent = 'navigation' | 'authored';

/** What `set_viewpoint` stores for this client, and what a reload gets back. */
export interface Viewpoint {
	/** Per stack id, the child it is showing. The root stack's entry is the workspace tab. */
	showing?: Record<string, string>;
	panel?: string;
	paths?: Record<string, string>;
}

/** A split's children's shares — the baseline a resize drag adjusts. */
function fractionsOf(root: LayoutNode | null, split: string): number[] {
	const n = root ? findNode(root, split) : null;
	return n?.kind === 'split' ? n.sizes : [];
}

/** What the panel system draws before anything has been pushed in. A panel TYPE is the consumer's
 * vocabulary, so the useful version of this is the consumer's too — see `configureHost`. What is
 * here is a shell to draw rather than a tree to invent. */
const UNSYNCED: StackNode = {
	kind: 'stack',
	id: 'stack-1',
	children: [{ kind: 'panel', id: 'panel-1', panelType: '' }]
};

/** What the panel system talks to before a consumer has installed a host: everything draws, every
 * gesture is refused. A `null` host would make each call site a guard instead. */
const REFUSING: LayoutHost = {
	addPanel: async () => null,
	removePanel: async () => false,
	resizeSplit: async () => false,
	setPanel: async () => false,
	movePanel: async () => false
};

class WorkspaceStore {
	/** The manager's arrangement, mirrored from the doc root. Read-only: a write is a command. */
	private _root = $state<StackNode | null>(null);
	/** The shares a splitter drag is currently drawing, before it commits. A resize is one
	 * continuous gesture, so the override lives here for its duration and lands as ONE
	 * `resize_split` on pointer-up — never a command per pointermove. */
	private _drag = $state<{ split: string; sizes: number[] } | null>(null);
	/** The shares a commit put on the wire, held until the delta answering it lands. It keeps the
	 * drawn shares from snapping back in the frame between the reply and the doc arriving (the reply
	 * is sent first), and it is what the NEXT commit's "nothing changed" check compares against — the
	 * replica is still a commit behind, so a drag returning the split to its pre-commit shares would
	 * otherwise read as a no-op and be dropped. */
	private _sent: { split: string; sizes: number[] } | null = null;
	/** Whether the pointer is still on the seam. A delta landing mid-gesture — the previous commit's
	 * own, or a peer's — must not retire the override the finger is drawing with. */
	private _dragLive = false;
	/** Viewpoint: per stack id, the child it is showing. A stack with no entry shows its first. */
	private _showing = $state<Record<string, string>>({});
	/** Viewpoint: per panel id, the sub-patch path that editor is inside. Held OUT of the panel's
	 * shared state bag — that separation is what keeps peer isolation and navigation-must-not-dirty
	 * true by construction rather than by classification. */
	private _paths = $state<Record<string, string>>({});
	/** A panel this client has asked to GO TO, and the slot the subtree carrying it sat in when it
	 * asked — `null` for a panel the gesture MINTS, which is drawn nowhere yet. The pair is what
	 * makes the wait exact in both orderings: the op's answer and the delta carrying its work race,
	 * so neither "it is drawn" nor "a delta arrived" is the condition on its own, and a PEER's delta
	 * arriving in between does not spend the wait. */
	private _follow: { panel: string; subtree: string; was: string | null } | null = null;
	/** Last-focused panel id — keyboard shortcuts scope to this. */
	activePanelId = $state<string | null>(null);
	/** Viewpoint: the maximized node, PER PAGE — a page being a child of the root stack. A page
	 * keeps its own: maximizing on one tab and looking at another must not undo it, and coming back
	 * must find it as it was left. Session-scoped on purpose: deliberately not in `viewpoint()`, so
	 * it reaches neither a peer nor the `.gfi`. */
	private _max = $state<Record<string, string>>({});
	/** Drawn until the first push, and again across a generation boundary — see [`UNSYNCED`]. */
	private _unsynced = $state<StackNode>(UNSYNCED);
	/** The subtree currently being dragged. While set, panels show edge drop zones and every stack
	 * header accepts the drop. */
	dragging = $state<DragRef | null>(null);
	/** Bumped whenever the viewpoint changes, so the shell can persist it debounced. */
	viewpointEpoch = $state(0);
	/** Whoever owns the arrangement. Every gesture below is raised through it and nothing here
	 * writes a tree — see `./host`. Until one is installed the panel system draws and refuses,
	 * which is what a consumer that has not wired itself up should see. */
	private _host: LayoutHost = REFUSING;

	/** Wire the panel system up: the host every gesture is raised through, and — optionally — what
	 * to draw until the first push. The consumer's placeholder is the useful one because a panel
	 * TYPE is its vocabulary: hand over the ids and type it mints FIRST, and the pre-sync frame and
	 * the synced one draw the same thing rather than re-keying under the user. */
	configureHost(host: LayoutHost, unsynced?: StackNode): void {
		this._host = host;
		if (unsynced) this._unsynced = unsynced;
	}

	/** The tree as DRAWN: the manager's, with this client's two overlays — the in-flight resize a
	 * finger is still describing, and each editor's sub-patch depth. Both are viewpoint, so neither
	 * is in the manager's copy and neither survives a rebuild from it. */
	private _drawn = $derived.by(() => {
		const paths = this._paths;
		const drag = this._drag;
		const overlay = (n: LayoutNode): LayoutNode => {
			if (n.kind === 'panel') {
				const path = paths[n.id];
				return path === undefined
					? n
					: { ...n, state: { ...asStateObject(n.state), subpatchPath: path } };
			}
			if (n.kind === 'stack') return { ...n, children: n.children.map(overlay) };
			const sizes =
				drag?.split === n.id && drag.sizes.length === n.children.length ? drag.sizes : n.sizes;
			return { ...n, sizes, children: n.children.map(overlay) };
		};
		return overlay(this._root ?? this._unsynced) as StackNode;
	});

	/** The arrangement the panel system renders. Derived, not held — the manager's copy is the state. */
	get root(): StackNode {
		return this._drawn;
	}

	/** The child a stack is showing: this client's pick, or its first. */
	showing(stack: string): string {
		const node = findNode(this._drawn, stack);
		const kids = childrenOf(node ?? this._drawn);
		const picked = this._showing[stack];
		return kids.some((c) => c.id === picked) ? picked : (kids[0]?.id ?? '');
	}

	/** The root stack's shown child — the workspace "page" every per-page viewpoint is keyed by. */
	get page(): string {
		return this.showing(this._drawn.id);
	}

	/** The subtree the workspace area draws: the page, and under a maximize the node it names. */
	get pageRoot(): LayoutNode | null {
		const max = this.maximizedId;
		const node = max ? findNode(this._drawn, max) : null;
		return node ?? findNode(this._drawn, this.page);
	}

	/** The maximized node on the page in front, or null when that page is showing its layout. */
	get maximizedId(): string | null {
		const page = this.page;
		return (page ? this._max[page] : undefined) ?? null;
	}

	// --- the replica ---------------------------------------------------------

	/** Adopt the arrangement the manager mirrored, and prune any viewpoint it invalidated — a panel
	 * WE focused that a peer just closed, a stack that went with it. This is also where an in-flight
	 * resize override retires: the split's own shares moved, so the drawn tree is the manager's
	 * again. */
	syncFromDoc(root: StackNode | null): void {
		const prev = this._root;
		this._root = root;

		const s = this._sent;
		if (s) {
			const before = fractionsOf(prev, s.split);
			const after = fractionsOf(root, s.split);
			if (before.length !== after.length || before.some((v, i) => v !== after[i])) {
				this._sent = null;
				if (!this._dragLive) this._drag = null;
			}
		}
		this._resolveFollow();
		// An EMPTY arrangement is a generation boundary, never a settled tree — the reset that hands
		// one over is followed by the manager's real document, and a replica before its first pull
		// holds one too. Pruning against it invalidates every id there is, the viewpoint the
		// snapshot just restored included.
		if (!root || root.children.length === 0) return;
		const live = (id: string): boolean => !!findNode(root, id);
		for (const [stack, child] of Object.entries(this._showing)) {
			if (!live(stack) || !live(child)) delete this._showing[stack];
		}
		if (!this.activePanelId || !findPanel(root, this.activePanelId)) {
			this.activePanelId = firstPanelId(findNode(root, this.page) ?? root);
		}
		for (const [page, node] of Object.entries(this._max)) {
			if (!live(page) || !live(node)) delete this._max[page];
		}
		for (const id of Object.keys(this._paths)) {
			if (!live(id)) delete this._paths[id];
		}
	}

	/** Restore the viewpoint this client last stored (it rides the `.gfi` and the snapshot, but is
	 * never converged). Ids that no longer exist are simply not adopted. */
	restoreViewpoint(vp: unknown): void {
		const v = vp as Viewpoint | null;
		if (!v || typeof v !== 'object') return;
		if (v.showing && typeof v.showing === 'object') this._showing = { ...v.showing };
		if (typeof v.panel === 'string') this.activePanelId = v.panel;
		if (v.paths && typeof v.paths === 'object') this._paths = { ...v.paths };
	}

	/** What `set_viewpoint` stores. Plain JSON: the shell pushes it debounced. */
	viewpoint(): Viewpoint {
		return {
			showing: $state.snapshot(this._showing),
			panel: this.activePanelId ?? undefined,
			paths: $state.snapshot(this._paths)
		};
	}

	private _viewpointChanged(): void {
		this.viewpointEpoch += 1;
	}

	// --- gestures ------------------------------------------------------------

	/** Focus `panelId` — a panel the replica already draws. */
	private _focus(panelId: string): void {
		this.activePanelId = panelId;
		this._viewpointChanged();
	}

	/** Bring `panel` into view wherever it sits: every stack above it shows the child on its path. */
	private _reveal(panel: string): void {
		const root = this._root;
		if (!root) return;
		let at: string = panel;
		for (;;) {
			const up = findParent(root, at);
			if (!up) break;
			if (up.parent.kind === 'stack') this._showing[up.parent.id] = at;
			at = up.parent.id;
		}
	}

	/** Go to `panel` once the replica draws `subtree` somewhere other than `was`. Every stack on the
	 * way opens onto it and the focus lands there. Where every op that mints or moves a panel puts
	 * its answer. */
	private _followTo(panel: string, subtree: string, was: string | null): void {
		this._follow = { panel, subtree, was };
		// Tried at once as well as on every sync: the delta can beat the answer, and then there is no
		// later sync to wait for.
		this._resolveFollow();
	}

	private _resolveFollow(): void {
		const f = this._follow;
		const root = this._root;
		if (!f || !root || !findNode(root, f.panel)) return;
		if (f.was !== null && this._slotOf(f.subtree) === f.was) return;
		this._follow = null;
		this._reveal(f.panel);
		this._focus(f.panel);
	}

	/** Where a subtree sits, as one comparable word: its parent and its index in it. A move changes
	 * one or the other, which is how a follow tells this gesture's delta from a peer's. */
	private _slotOf(id: string): string {
		const root = this._root;
		const up = root ? findParent(root, id) : null;
		return up ? `${up.parent.id}#${up.index}` : '';
	}

	/** The root stack's child that `id` sits under — the "page" it is on. */
	private _pageOf(id: string): string | null {
		const root = this._root;
		if (!root) return null;
		return root.children.find((c) => c.id === id || !!findNode(c, id))?.id ?? null;
	}

	// --- layout mutations ----------------------------------------------------

	/** Split a node. The new panel is `empty` — the user picks its content from the empty panel's
	 * buttons rather than inheriting the source's type. `fraction` is the new panel's share. */
	split(nodeId: string, direction: Direction, placeBefore = false, fraction = 0.5): void {
		this.add(nodeId, { direction, placeBefore, ratio: fraction });
	}

	/** Add a panel: beside `at` with a direction, or as a tab in it without one. */
	add(at: string, opts: AddAt = {}): void {
		void this._host.addPanel(at, opts).then((fresh) => {
			// A minted panel is drawn nowhere yet, so being drawn at all IS the change to wait for.
			if (fresh !== null) this._followTo(fresh, fresh, null);
		});
	}

	close(nodeId: string): void {
		this._retreatFrom(nodeId);
		void this._host.removePanel(nodeId);
	}

	/** Move off `nodeId` before its close lands: a stack showing what is about to go shows its
	 * NEIGHBOUR, not its first. Viewpoint, so it happens now rather than waiting for the delta —
	 * without it the fallback silently rewrote the gesture. */
	private _retreatFrom(nodeId: string): void {
		const root = this._root;
		const up = root ? findParent(root, nodeId) : null;
		if (!up || up.parent.kind !== 'stack' || this.showing(up.parent.id) !== nodeId) return;
		const rest = up.parent.children.filter((c) => c.id !== nodeId);
		const neighbour = rest[Math.min(up.index, rest.length - 1)];
		if (neighbour) this.show(up.parent.id, neighbour.id);
	}

	/** A splitter drag fires this per pointermove. It draws locally — `containerPx` is the split's
	 * measured size along its axis, the denominator of the pixel floor — and nothing leaves
	 * the client until `commitResize`. */
	resize(splitId: string, dividerIndex: number, delta: number, containerPx = 0): void {
		const base = this._drag?.split === splitId ? this._drag.sizes : fractionsOf(this._root, splitId);
		if (base.length === 0) return;
		this._dragLive = true;
		this._drag = { split: splitId, sizes: resizeFractions(base, dividerIndex, delta, containerPx) };
	}

	/** Pointer-up: the shares the drag drew become ONE command, and therefore one ctrl-Z. */
	commitResize(splitId: string): void {
		const d = this._drag;
		// The pointer is up either way. `_sent` outlives the drop: it is still the last thing this
		// client put on the wire for that split, and therefore still the honest baseline.
		this._dragLive = false;
		const drop = (): void => {
			this._drag = null;
		};
		if (!d || d.split !== splitId) {
			drop();
			return;
		}
		// What was last SENT for this split, falling back to the replica. Comparing against the
		// replica alone would drop a second drag that returns the split to its pre-commit shares,
		// because the replica is still showing exactly those.
		const before =
			this._sent?.split === splitId ? this._sent.sizes : fractionsOf(this._root, splitId);
		const same = before.length === d.sizes.length && before.every((s, i) => s === d.sizes[i]);
		if (same) {
			drop();
			return;
		}
		this._sent = { split: splitId, sizes: d.sizes };
		void this._host.resizeSplit(splitId, d.sizes).then((ok) => {
			// A refusal never landed, so it is not a baseline either.
			if (!ok) {
				this._sent = null;
				drop();
			}
		});
	}

	setType(panelId: string, panelType: string): void {
		void this._host.setPanel(panelId, { type: panelType });
	}

	/**
	 * Write a panel's opaque state. `intent` routes it, and that routing IS the dirty taxonomy:
	 * `'navigation'` (the sub-patch path) stays viewpoint and never leaves as a layout op, while an
	 * authored write becomes `edit_panel` — one command, one undo step, converged to peers.
	 * `label` names that step so the undo button reads like the click.
	 */
	setPanelState(
		panelId: string,
		state: unknown,
		intent: LayoutIntent = 'authored',
		label = 'Change panel'
	): void {
		const bag = asStateObject(state);
		if (intent === 'navigation') {
			const path = bag.subpatchPath;
			if (typeof path === 'string') this._paths[panelId] = path;
			else delete this._paths[panelId];
			this._viewpointChanged();
			return;
		}
		// The sub-patch path is viewpoint and must not ride a shared write.
		const { subpatchPath: _drop, ...shared } = bag;
		void this._host.setPanel(panelId, { state: shared }, label);
	}

	setActive(panelId: string): void {
		if (this.activePanelId === panelId) return;
		this.activePanelId = panelId;
		this._viewpointChanged();
	}

	/* The three panel-state edits below each name ONLY the key they change: `edit_panel` merges,
	 * so reading the bag back first would buy nothing and cost the class the merge exists to kill —
	 * a second write inside the first's round trip replacing a bag it never saw the first land in. */

	/** Bind a node to a linkable panel — a node dragged onto it, or one picked from the bar's
	 * dropdown (`panels/NodeSelect`). Both doors land here, so they cannot behave differently.
	 *
	 * The slot goes with it: a Viewer/Metadata panel reads `state.slot` off the node it is bound to,
	 * and the two names have nothing to do with each other across a rebind. Clearing it in the SAME
	 * merged write settles the panel in one op (one undo step) on the slot each panel already falls
	 * back to — its node's first output — instead of persisting a slot name the new node has never
	 * had. */
	linkNodeToPanel(panelId: string, nodeUid: string): void {
		this.setPanelState(panelId, { node: nodeUid, slot: null }, 'authored', 'Bind node to panel');
	}

	/** Release a linkable panel's bound node — the ✕ in NodeLinkedPanel's bar and ConsolePanel's
	 * filter chip. An explicit null is how a merged write clears a key. */
	unlinkNodeFromPanel(panelId: string): void {
		this.setPanelState(panelId, { node: null }, 'authored', 'Unbind node from panel');
	}

	/** Pick the output slot a Viewer / Metadata panel reads from its bound node. */
	setPanelSlot(panelId: string, slot: string): void {
		this.setPanelState(panelId, { slot }, 'authored', 'Select slot');
	}

	/** Maximize a NODE — a lone panel, or a whole tab group by its stack. */
	toggleMaximize(nodeId: string): void {
		const page = this._pageOf(nodeId);
		if (!page) return;
		if (this._max[page] === nodeId) delete this._max[page];
		else this._max[page] = nodeId;
		this._viewpointChanged();
	}

	/** End the maximize on the page in front, so a panel this client is about to show is visible.
	 * The one caller is the shell answering an agent's close (`editor/TopBar`), which has to bring a
	 * specific panel to the front and cannot do that under a maximized neighbour. */
	exitMaximize(): void {
		const page = this.page;
		if (page && this._max[page] !== undefined) {
			delete this._max[page];
			this._viewpointChanged();
		}
	}

	// --- stacks --------------------------------------------------------------

	/**
	 * Show `child` in `stack`. NAVIGATION: it changes which arrangement is in front, not what any
	 * panel holds — the same "looking elsewhere" as entering a sub-patch. Creating, moving or
	 * closing a tab is still authoring; only the selection is a look.
	 */
	show(stack: string, child: string): void {
		if (this._showing[stack] === child) return;
		const node = findNode(this._drawn, stack);
		if (!node || !childrenOf(node).some((c) => c.id === child)) return;
		this._showing[stack] = child;
		const target = findNode(this._drawn, child);
		if (target) this._focus(firstPanelIn(target));
	}

	/** The subtree a drag names. Null when the drag's source has gone. */
	private _subtreeOf(d: DragRef): string | null {
		return this._root && findNode(this._root, d.node) ? d.node : null;
	}

	/** Drop what is being dragged at `to` — beside a node, or as a tab in a stack. ONE op either
	 * way, so a drag is one undo step. The drag is spent whatever happens: a gesture that goes
	 * nowhere must not leave the pointer armed. */
	dropOn(to: Landing): void {
		const d = this.dragging;
		this.dragging = null;
		if (!d) return;
		const subtree = this._subtreeOf(d);
		const target = 'beside' in to ? to.beside : to.stack;
		if (!subtree || subtree === target) return;
		// Both read HERE, before the op goes out: the panel the user is carrying, and the page it is
		// leaving — which is what a follow has to see it get past.
		const node = this._root ? findNode(this._root, subtree) : null;
		const moved = node ? firstPanelIn(node) : '';
		const was = this._slotOf(subtree);
		void this._host.movePanel(subtree, to).then((ok) => {
			if (ok && moved) this._followTo(moved, subtree, was);
		});
	}

	/** Every panel currently bound to `uid`, for the agent façade and the e2e. */
	panelsBoundTo(uid: string): string[] {
		return collectPanels(this._drawn)
			.filter((p) => asStateObject(p.state).node === uid)
			.map((p) => p.id);
	}
}

let _store: WorkspaceStore | null = null;
export function workspace(): WorkspaceStore {
	if (!_store) _store = new WorkspaceStore();
	return _store;
}

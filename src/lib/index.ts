/**
 * panelty — a panel workspace for Svelte.
 *
 * ONE tree, whose root is a stack. A stack shows one child at a time and draws the rest as tabs, so
 * a workspace tab is a child of the root stack and there is no second kind of thing: tabbing a
 * panel onto another panel's header and dropping one on the app's tab bar are the same move.
 *
 * `<Panels>` draws the page the root stack is showing. `<Tabs>` draws the root stack's own header,
 * for a consumer that wants it hoisted into an app bar; it is the same header every group draws.
 *
 * The package holds no tree and writes nothing. It draws the arrangement it is handed, recognises
 * the gestures over it, and raises each one through a [`LayoutHost`] — so whoever implements that
 * owns persistence, concurrency and undo. The panels themselves are the consumer's too:
 * `registerPanel` takes a component and an id, and nothing in here knows what any of them draw.
 *
 * Styling is a namespaced custom-property contract — import `panelty/tokens.css` for the look it
 * ships with, then override `--panelty-*` to wear your own. See that file.
 */

// --- the workspace ------------------------------------------------------------------------------
export { default as Panels } from './WorkspaceView.svelte';
export { default as Tabs } from './WorkspaceTabs.svelte';
export { workspace, type DragRef, type LayoutIntent, type Viewpoint } from './workspace.svelte';

// --- the host: every gesture leaves through here -------------------------------------------------
export type { LayoutHost, AddAt, Landing, LayoutIn } from './host';
// …and one that needs nothing behind it, for a workspace with no persistence to answer to.
export { memoryHost, type MemoryHostOptions } from './memoryHost';

// --- the arrangement, as a consumer hands it over and reads it back ------------------------------
export {
	MIN_FRACTION,
	MIN_PANEL_PX,
	childrenOf,
	collectPanels,
	countPanels,
	findNode,
	findPanel,
	findParent,
	firstPanelId,
	firstPanelIn,
	isBranch,
	normalize,
	resizeFractions,
	stackOf,
	type BranchNode,
	type Direction,
	type LayoutNode,
	type PanelNode,
	type SplitNode,
	type StackNode
} from './model';
export { arrayToPath, asStateObject, linkedNodeName, pathToArray } from './panelState';

// --- the panel registry: the moddability seam ----------------------------------------------------
export {
	getPanelType,
	listPanelTypes,
	registerPanel,
	resolvePanelType,
	type PanelProps,
	type PanelType
} from './registry';

// --- the chrome ----------------------------------------------------------------------------------
// Exported because a consumer's panel CONTENT sits inside this chrome: a button in a panel toolbar
// that is not the same button as the one in the panel header reads as a foreign control two pixels
// away from a native one.
export { default as ContextMenu } from './ContextMenu.svelte';
export type { MenuItem } from './menu';
export {
	Button,
	IconButton,
	Icon,
	CHROME_ICONS,
	registerIcons,
	iconGeometry,
	type ButtonVariant,
	type ButtonSize,
	type ButtonDensity,
	type ChromeIconName
} from './ui';

// --- the leaf layer, exported for the same reason the chrome is ----------------------------------
export {
	portal,
	beginDrag,
	clampToViewport,
	overlayViewport,
	MARGIN,
	createLongPress,
	createWidthCache,
	planOverflow,
	HOLD_MS,
	MOVE_TOLERANCE_PX,
	type OverflowItem
} from './gesture';

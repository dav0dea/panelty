# panelty

A panel workspace for Svelte 5.

Split a panel, drag one onto another's edge, drop one on another's header to tab them together, drag
the seam between two. What panelty does not do is decide what any of that MEANS: it holds no tree
and writes nothing. It draws the arrangement you hand it, recognises the gesture over it, and raises
the gesture at a host you implement — so persistence, concurrency and undo are yours.

```svelte
<script lang="ts">
	import { Tabs, Panels, workspace, memoryHost, registerPanel } from 'panelty';
	import 'panelty/tokens.css';

	registerPanel({ id: 'notes', title: 'Notes', component: Notes });
	workspace().configureHost(memoryHost({ defaultPanelType: 'notes' }));
</script>

<Tabs />
<Panels />
```

## One tree

The arrangement is one tree whose root is a **stack**. A stack gives its whole slot to ONE child and
draws the rest as tabs; a **split** divides its slot between N children along an axis; a **panel** is
a leaf. A workspace tab is a child of the root stack and nothing else — so dropping a panel on
another panel's header and dropping one on the app's tab bar are the same move, with a different
stack named.

`<Panels>` draws the page the root stack is showing. `<Tabs>` draws the root stack's own header, for
an app that wants it hoisted into its title bar; it is the same header every group draws.

Which child a stack shows is the VIEWER's, not the arrangement's — it never reaches the host, so two
clients on one document look at different tabs.

## The host

One contract, because there is one kind of thing. Every method answers whether the write LANDED — a
refusal is ordinary (closing the last panel, a peer having taken what the gesture names) and the
panel system uses the answer to decide where to put the focus, never to retry.

`memoryHost()` is one that keeps the tree in memory and hands it straight back. It is the whole of
the contract implemented over a plain tree — useful on its own, and the thing that proves the port
is complete.

## The panels

Yours. `registerPanel({ id, title, icon, component })` takes any component honouring `PanelProps`;
nothing in here knows what one draws. A panel gets its id, its persisted state bag, and a
`setState` that routes back through your host.

## Styling

Every rule reads `var(--panelty-x, var(--panelty-x-default))`. Import `tokens.css` for the look it
ships with, then set `--panelty-*` to wear your own — on `:root`, on a subtree, or on one instance.
See `src/lib/ui/tokens.css`: it is the contract, and it documents itself.

Icons work the same way: the chrome vendors the ten glyphs it draws, and `registerIcons(table)`
hands over yours for the panel types and menu rows you name.

MIT.

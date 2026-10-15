# Code Spider

Code Spider shows the functions that call the function under your cursor, and the functions it calls, as a graph of boxes in VS Code.

## What it does

Put your cursor in a function and open a graph. The function is in the middle. Each box shows a function's name. The box in the middle also shows the start of its code (it is open); every other box starts closed, with just its name. The functions it calls are in the column to its left, in the order the calls appear in the code. The functions that call it are on the right.

It works on TypeScript and JavaScript files (`.ts`, `.tsx`, `.js` and `.jsx`). The project needs a `tsconfig.json` in the file's folder or in a folder above it, up to the top of the repository.

In the graph you can:

- Click a box's name to jump to that function in the editor. The box opens to show the start of its code, and any boxes below it move down to make room. Click the name again to close the box.
- Click a line of code in an open box to jump to that line in the editor.
- Click the small arrow at the right end of a box's top bar to open or close the box without jumping. Closing a box leaves the other boxes where they are; press `Tidy` to line them up again. Boxes that have no code of their own, such as code from outside your project, have no arrow and do not open.
- Double-click a function's box to show the functions around it. Double-click it again to hide them. This does not work on the box in the middle, or on boxes that are not functions, such as a file's top-level code or code from outside your project.
- Drag a box. It stays where you put it.
- Use the buttons above the graph:
  - `Back` goes to the previous graph. The last 20 are kept.
  - `Tidy` lines up the boxes again. Boxes you dragged stay where they are. It also removes the empty space left by boxes you closed.
  - `Refresh` reads the code again. A dot appears on it when a file has been saved since the graph was drawn.
  - `Stepped` and `Curved` change how the lines are drawn.
  - `Uncommitted` and `PR` choose which functions are coloured as added or changed. `Uncommitted` colours what you have not committed yet. `PR` colours everything that is new or changed since your branch left the main branch, whether it is committed or not. If there is no main branch, `PR` shows the uncommitted changes instead and says so once.
  - `Tests` chooses what to do with test code. `Show` draws its functions faded, with dashed lines. `Hide` takes them off the graph, with any box that is only reached through them; the number on `Hide` is how many boxes it hides, and the function you started from is never hidden. Boxes that come back with `Show` are drawn afresh, not where they were. A file counts as test code when its name contains `.test.` or `.spec.`, or when it sits in a folder called `test`, `tests` or `__tests__`.
  - `Spacing` changes how far apart the boxes are. Boxes you dragged stay where they are.

## Open a graph

Put your cursor in a function in a TypeScript or JavaScript file, then do one of these:

- Press `Shift+Alt+2` (`Shift+Option+2` on a Mac).
- Right-click in the editor and choose "Show in Code Spider".
- Open the command palette (`Ctrl+Shift+P`, or `Cmd+Shift+P` on a Mac) and choose "Code Spider: Show Graph".

## What you need

VS Code 1.140 or newer. Nothing else is needed to run it. You do not need Node.js on the computer that runs it.

## Build the file

You do this on the computer that has the code. You need Node.js 22 or newer and pnpm 11.

From the top folder of the repository:

1. Run `pnpm install`.
2. Run `pnpm package`.

This makes one file in the top folder of the repository. Its name comes from the version in `packages/extension/package.json`, for example `code-spider-vscode-0.1.0.vsix`. Files from earlier versions stay in that folder. Use the one with the highest version number.

## Install

1. Copy the `.vsix` file to the computer where you want to use Code Spider.
2. In VS Code, open the command palette and choose "Extensions: Install from VSIX...". Pick the file.
3. Reload VS Code if it asks.

If the `code` command works in your terminal, you can also install with `code --install-extension <the file>`.

## Update

Build a new file, then install it the same way as before, over the old one. Reload VS Code if it asks.

## Uninstall

1. Open the Extensions view (`Ctrl+Shift+X`, or `Cmd+Shift+X` on a Mac).
2. Click Code Spider.
3. Click Uninstall.

If the `code` command works in your terminal, you can also uninstall with `code --uninstall-extension code-spider.code-spider-vscode`.

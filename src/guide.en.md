# TizuMark User Guide

> A fast, elegant Markdown editor — from basics to mastery

[TOC]

---

## Getting Started

### Interface Overview

TizuMark's interface has the following areas:

| Area | Position | Purpose |
|------|----------|---------|
| **Top Toolbar** | Top | File / Help menus, view toggle (preview/edit), reload, theme, window controls; sidebar toggled by a left-edge floating handle |
| **Format Toolbar** | Below the top bar | Common formatting buttons and dropdown groups, collapsible |
| **Sidebar** | Left | File tree (top) & outline (bottom), drag the divider to resize |
| **Editor** | Center | CodeMirror with Markdown syntax highlighting and auto-closing brackets / quotes; breadcrumb navigation on top |
| **Preview** | Right | Live-rendered Markdown with scroll sync |
| **Status Bar** | Bottom | Word counts / line count / cursor position |

### Basic Operations

| Action | Method | Shortcut |
|--------|--------|----------|
| New File | `File → New` | <kbd>Ctrl</kbd> + <kbd>N</kbd> |
| Open File | `File → Open` (batch supported) | <kbd>Ctrl</kbd> + <kbd>O</kbd> |
| Open Folder | `File → Open Folder` | — |
| Save File | `File → Save` | <kbd>Ctrl</kbd> + <kbd>S</kbd> |
| Save As | `File → Save As` | — |
| Reload | `File → Reload` (discard changes, re-read from disk) | — |
| Recent Files | `File → Open Recent Files` | — |
| Recent Workspaces | `File → Open Recent Workspaces` | — |
| Keyboard Shortcuts | `File → Keyboard Shortcuts` | — |
| Settings | `File → Settings` | — |
| CLI Open | `tizumark.exe document.md` | — |
| Close Tab | Click × on tab or right-click | <kbd>Ctrl</kbd> + <kbd>W</kbd> |

> **Drag and drop** `.md` files directly into the window — supports multiple files. `File → Open Recent Files` quickly reopens previously edited documents, and `File → Open Recent Workspaces` returns to a previously opened folder workspace.

---

## Editor Features

### View Modes

TizuMark picks the most suitable view automatically based on file type — no manual configuration needed:

- **Markdown (`.md` and 6 other extensions)**: supports **Preview Mode** (full-screen rendering, ideal for reading and presenting) and **Edit Mode** (write on the left, rendered output on the right). In Edit Mode, click **◄** (left) to collapse the editor or **►** (right) to collapse the preview so the other side fills the screen; drag the middle divider to adjust the split ratio.
- **Plain text / code (`.txt` and other non-Markdown text)**: opens automatically in a **plain editor view** — editor only, no preview pane, and no collapse / expand buttons (there is nothing to render).
- **Images**: opens automatically in a **read-only preview view** — shows the image itself and cannot be switched to editing.

> Clicking "Preview" for plain text, or "Edit" for an image, shows a notice that the file type doesn't support that mode.

The two tabs in the center toolbar toggle the view; <kbd>Ctrl</kbd> + <kbd>\\</kbd> does too — it can be pressed for any file, but only Markdown actually switches; plain text and images show an unsupported notice. In Edit Mode:

| Action | Method |
|--------|--------|
| Collapse editor | Click left <kbd>◄</kbd> button |
| Collapse preview | Click right <kbd>►</kbd> button |
| Resize panes | Drag the middle divider |

### Sidebar: Files & Outline

Click the floating handle centered on the left window edge to show or hide the sidebar. It is split into a **Files** panel (top) and an **Outline** panel (bottom); drag the divider between them to resize, and either panel can be collapsed.

**Files panel** (shown after opening a directory with `File → Open Folder`):

- The header shows the workspace path, a **sort** control (Name / Modified / Created, with a button to toggle ascending / descending) and "Close Folder".
- A "Expand / collapse all folders" button sits in the panel header.
- Click a file to open it in a tab; the tree watches the folder for external additions/removals and refreshes automatically.
- **Right-click menu**: New File (<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd>) / New Folder (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>) / Cut / Copy / Paste / Rename (<kbd>F2</kbd>) / Copy Path / Open Containing Folder / Delete (<kbd>Delete</kbd>).
- By default only supported formats are listed; enable `Settings → Behavior → Show All Files` to list every file in the directory.

**Outline panel**:

- Automatically shows the document heading structure (H1–H6), indented by level. **Click any heading** — the preview jumps and centers on it. The outline updates in real time as you edit.
- The header's **level filter** dropdown limits the outline to a given depth (All / H1–H6); the "Expand / collapse all" button toggles everything at once.

### Editor Breadcrumb

The top of the editor shows a `filename › current heading…` path that tracks the cursor in real time. Click any level to jump; when the path is long it scrolls horizontally.

### Multi-Tab Editing

| Action | Method |
|--------|--------|
| New Tab | Click <kbd>+</kbd> on tab bar or <kbd>Ctrl</kbd> + <kbd>N</kbd> |
| Switch Tab | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> |
| Drag to Reorder | Drag a tab to rearrange its position |
| Close Tab | Click × or <kbd>Ctrl</kbd> + <kbd>W</kbd> |
| Right-Click Menu | Close / Close Others / Close All / Copy File Path / Open Containing Folder |
| Double-Click | On empty tab bar space to create new tab |

When tabs no longer fit, scroll arrows appear at both ends of the tab bar for horizontal scrolling.

Unsaved tabs show a `*` indicator.

**Session Restore**: When you reopen TizuMark after closing it, your previous tabs, folder workspace, and expanded directories are automatically restored (enable "Close All Tabs on Quit" in Settings to always start blank instead).

### Find & Replace

Four entries, each with a distinct role. **The first two search within the document** (editor and preview respectively), the **last two are cross-file and quick-open**:

**Editor Find & Replace** (<kbd>Ctrl</kbd> + <kbd>F</kbd>): search the document source, with replacement in the same panel.

| Feature | Description |
|---------|-------------|
| Basic Find | Enter keyword, navigate between matches, see match count |
| Replace | Enter replacement, click Replace or Replace All |
| Case Sensitive | Match exact letter casing |
| Regex | JavaScript-compatible regular expressions |
| Wrap Around | Continue from the top after reaching the end of the document |

**Preview Find** (<kbd>Ctrl</kbd> + <kbd>F</kbd> in preview mode): search and highlight within the rendered content.

**Cross-file Search** (<kbd>Ctrl</kbd> + <kbd>H</kbd>): search across all open tabs or a specified directory, with regex and case-sensitive options. Results are grouped by file, showing line/column numbers and a context snippet; click any hit to jump there, highlighted in both the editor and preview. Ideal for quickly locating content in large project docs.

**File Search** (<kbd>Ctrl</kbd> + <kbd>P</kbd>): jump by file name or path within the workspace (VS Code–style Quick Open). Type to filter instantly; matches `.md` / `.markdown` / `.txt` files in the workspace — <kbd>↑</kbd>/<kbd>↓</kbd> to select, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> or click outside to close. Newly created files appear in the list as soon as the window regains focus.

### Context Menus

Several right-click menus for efficient workflow:

- **Editor**: Cut / Copy / Paste / Structure Insert / Text Format / Lists / Links & Media / Find & Replace / Select All
- **Preview**: Copy / Select All / Copy as HTML / Find in Preview
- **Tab**: Close / Close Others / Close All / Copy File Path / Open Containing Folder
- **File tree**: see "Sidebar → Files panel" above

### External File Change Prompt

When an open file is modified by another program outside TizuMark, a banner appears at the top offering **Reload** / **Ignore** / **Reload All** / **Ignore All**, so you never accidentally overwrite your changes.

### Large Document Protection

When a document exceeds ~**5000 lines** or ~**4 million characters**, the preview automatically switches to sliding-window mode, rendering only the region around where you are reading (a ~1200-line window) instead of the whole document — so files of tens of thousands of lines still open smoothly. A notice banner appears at the top of the editor; click "Don't remind again" to mute it for the session, or "Close" to dismiss.

### Status Bar

The status bar at the bottom shows the current **raw word count**, **preview word count**, **line count**, and the cursor's **line, column** position, updated live as you edit.

---

## Keyboard Shortcuts

> The table below shows the **default key bindings**. Every entry is customizable in **`File → Keyboard Shortcuts`** (modify, clear, or restore). Built-in **Default / VSCode / Typora / Sublime Text** presets can be switched instantly, taking effect immediately without a restart.

### Files & View

| Shortcut | Action | Shortcut | Action |
|----------|--------|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>N</kbd> | New File | <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close Tab |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open File | <kbd>Ctrl</kbd> + <kbd>\\</kbd> | Toggle View (Edit / Preview) |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save File | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> | Toggle Theme (Light / Dark) |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | File Search (by name / path) | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Export PDF |

### Find & Tabs

| Shortcut | Action | Shortcut | Action |
|----------|--------|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Find & Replace | <kbd>Ctrl</kbd> + <kbd>H</kbd> | Cross-file Search |
| <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Next Tab | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> | Previous Tab |

### Editing & Formatting (applies to the selection)

| Shortcut | Action | Shortcut | Action |
|----------|--------|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Bold | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>\`</kbd> | Inline Code |
| <kbd>Ctrl</kbd> + <kbd>I</kbd> | Italic | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> | Code Block |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Insert Link | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Q</kbd> | Blockquote |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>5</kbd> | Strikethrough | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> | Insert Image |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> | Math Block | <kbd>Alt</kbd> + <kbd>↑</kbd> | Move Line / Selection Up |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Insert Line Below | <kbd>Alt</kbd> + <kbd>↓</kbd> | Move Line / Selection Down |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | Insert Line Above | | |

### Headings

| Shortcut | Action |
|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>1</kbd> ~ <kbd>Ctrl</kbd> + <kbd>6</kbd> | Insert H1 ~ H6 |

### Undo & Redo

| Shortcut | Action |
|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> (or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>) | Redo |

### In-document Navigation & Selection

| Shortcut | Action | Shortcut | Action |
|----------|--------|----------|--------|
| <kbd>Ctrl</kbd> + <kbd>Home</kbd> | Go to document start | <kbd>Shift</kbd> + <kbd>Ctrl</kbd> + <kbd>Home</kbd> | Select from cursor to start |
| <kbd>Ctrl</kbd> + <kbd>End</kbd> | Go to document end | <kbd>Shift</kbd> + <kbd>Ctrl</kbd> + <kbd>End</kbd> | Select from cursor to end |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> | Move cursor by word left | <kbd>Shift</kbd> + <kbd>Ctrl</kbd> + <kbd>←</kbd> | Extend selection by word left |
| <kbd>Ctrl</kbd> + <kbd>→</kbd> | Move cursor by word right | <kbd>Shift</kbd> + <kbd>Ctrl</kbd> + <kbd>→</kbd> | Extend selection by word right |

### Font Size Zoom

| Shortcut | Action |
|----------|--------|
| <kbd>Ctrl</kbd> + Mouse Wheel (editor or preview) | Temporarily zoom font size; auto-saved after ~3s idle |

> **Actions with no default binding** (assign your own in `File → Keyboard Shortcuts`): Save As, Toggle Sidebar, Insert Table, Insert Table Row / Column, Bullet List, Ordered List, Task List, Horizontal Rule, Highlight, Superscript, Subscript, Mermaid Diagram, Table of Contents, the five callout types, and Hide to Tray. They all have UI entry points — they simply ship without a key combination so they never clash with your habits.

---

## Format Toolbar

The toolbar below the top bar provides quick formatting buttons (collapsible via the arrow on the right):

**Direct buttons**: Bold, Italic, Strikethrough, Link, Image, Horizontal Rule, Highlight, Superscript, Subscript.

**Dropdown groups** (hover to expand):

- **Structure**: Inline Code, Code Block, Table, Blockquote, Math Block, Mermaid Chart, PlantUML Diagram, D2 Diagram, TikZ Drawing, Function Plot, Mind Map, Numbered Equation, Physical Quantity (siunitx), TOC
- **Lists**: Unordered, Ordered, Task List
- **Headings**: H1 – H6
- **Callouts**: Note / Tip / Warning / Caution / Important, plus Admonition and Collapsible Admonition

---

## Insert Features in Detail

### Slash Commands ("/")

Type "/" in the editor to open a quick-insert list; use the arrow keys to pick and press Enter to insert common blocks (headings, code blocks, tables, callouts, formulas, Mermaid, TOC, and more) — no syntax to memorize.

- **Open**: type `/` at the start of a line, or after a space (including a space mid-line); keep typing to filter live (e.g. `/table`, `/toc`, `/callout`).
- **Select**: <kbd>↑</kbd> / <kbd>↓</kbd> to move, <kbd>Enter</kbd> to insert, <kbd>Esc</kbd> to close.
- **Customize**: in `File → Settings → Quick Insert → Manage Quick Insert…` you can drag to reorder items and uncheck to hide the ones you don't use.

### Structure

| Element | Inserts |
|---------|---------|
| Headings H1–H6 | `#` through `######` prefixed headings |
| Code Block | ` ``` ` wrapped block (syntax highlighting for JavaScript / Python / Rust / HTML / CSS / YAML / Shell, etc.) |
| Table | 3×3 starter template |
| Blockquote | `>` prefixed quote paragraph |
| Callout | Note / Tip / Warning / Caution / Important boxes |
| Admonition | `!!! note "Title"` block; Collapsible Admonition inserts `??? warning "Click to expand"` |
| Math Block | `$$` wrapped display formula (KaTeX) |
| Numbered Equation | Formula block with `\label{}`, can be numbered per section (see the "Equation Section Numbering" setting) |
| Physical Quantity (siunitx) | `$\SI{...}{...}$` physical-quantity template |
| Mermaid Chart | Flowchart / sequence-diagram template |
| PlantUML / D2 Diagram | PlantUML / D2 syntax templates (converted to Mermaid for rendering) |
| TikZ Drawing | Common TikZ subset template |
| Function Plot | `plot sin(x)`-style function-plot template |
| Mind Map | ` ```markmap ` indented-outline template |
| Horizontal Rule | `---` divider |
| TOC | `[TOC]` marker — auto-generates table of contents |

> Inline math uses `$...$`, display math uses `$$...$$`. Formulas with `&` are auto-escaped.

> **Chemistry (KaTeX mhchem extension)**: write formulas and reactions with `$\ce{...}$`, and physical units with `$\pu{...}$` — e.g. `$\ce{2H2 + O2 -> 2H2O}$`, `$\ce{H2SO4}$`, `$\pu{123 kJ//mol}$`. Reaction arrows, subscripts, isotopes and ion charges (`$\ce{SO4^2-}$`) all work; for multi-line reactions use a `$$` display block with `\\` line breaks.
>
> **Units (built-in siunitx subset)**: `$\si{...}$` for a unit and `$\SI{value}{unit}$` for a quantity — e.g. `$\SI{1.2e-3}{m s^-1}$`, `$\si{kJ//mol}$`. Spaces and `.` between units render as a thin space (`$\si{kg m}$` → kg m), so write them meaningfully: `kJ//mol` means "per" (→ kJ/mol), `kg*m` multiplies (→ kg·m), while `m/s` is kept as-is. Common unit macros (`\kilogram`, `\metre`, `\celsius`, `\percent`, …) also work.

### Diagrams & Visualization

Fenced code blocks render diagrams — no plugins needed, fully offline, theme-aware, click to zoom:

| Fence | Engine | Content |
|-------|--------|---------|
| ```` ```mermaid ```` | Mermaid | Flowchart / sequence / gantt / class / state / pie / **mindmap** |
| ```` ```plantuml ```` | PlantUML → Mermaid | Sequence / use case / component / class / state / activity / gantt (`uml` / `puml` / `pu` aliases); unsupported branches (`fork` / `split` / `repeat`) keep the source and show a hint |
| ```` ```d2 ```` | D2 → Mermaid | D2 node/edge syntax plus common attributes such as `shape` / `style` |
| ```` ```echarts ```` | ECharts | ECharts option JSON (optional top-level `tizuHeight` for canvas height, default 360) |
| ```` ```wavedrom ```` | WaveDrom | WaveDrom source JSON (`signal` / `assign` / `reg`; `wave` is an alias) |
| ```` ```dot ```` | Graphviz | DOT graph source with automatic layout (`graphviz` / `gv` aliases; put `// engine: neato` on the first line to switch layout engine). Non-ASCII node names are auto-quoted, so `来料 -> 检验` just works |
| ```` ```tikz ```` | TikZ | Common `\draw` / `\fill` / `\node` subset (`pgf` / `tikzpicture` aliases); unsupported path syntax such as `arc` / `.. controls` / `grid` keeps the source and shows a hint |
| ```` ```plot ```` | gnuplot | Function plots, e.g. `plot sin(x)`, with `set xlabel` / `set grid` (`gnuplot` is an alias) |
| ```` ```markmap ```` | Markmap | Indented Markdown outline → mind map |

> Long-image / PDF / DOCX export converts these diagrams to images automatically.
> Invalid syntax is never silently blank: the failure reason plus the original source are shown in place.

### Text Formatting

| Format | Syntax | Result |
|--------|--------|--------|
| Bold | `**text**` | **bold text** |
| Italic | `*text*` | *italic text* |
| Strikethrough | `~~text~~` | ~~strikethrough~~ |
| Inline Code | `` `code` `` | `code snippet` |
| Highlight | `==text==` | ==highlighted text== |
| Superscript | `<sup>2</sup>` | x² |
| Subscript | `<sub>2</sub>` | x₂ |

> Highlight (`==text==`) is a TizuMark extension; turn it off in `Settings → Behavior → Extended Syntax Highlight`, after which `==text==` is shown as plain text.

### Lists

- Unordered — `- ` prefix
- Ordered — `1. ` prefix
- Task List — `- [ ] ` prefix (checkable in preview)

### Links & Media

- Link — `[text](URL)`, shortcut <kbd>Ctrl</kbd> + <kbd>K</kbd>
- Image — `![alt](image-url)`

### Callout Blocks

GitHub-style callout blocks for highlighting important information:

```markdown
> [!NOTE]
> This is a general note.

> [!TIP]
> This is a helpful tip or suggestion.

> [!WARNING]
> This is a warning that needs attention.

> [!CAUTION]
> This is a caution about potential risks.

> [!IMPORTANT]
> This is critical information.
```

### Admonition Blocks (extension)

Besides GitHub-style callouts, MkDocs / Python-Markdown–style admonitions are supported:

```markdown
!!! note "Custom title"
    Content here, with **full Markdown** and nesting supported.

??? warning "Click to expand"
    Collapsed by default; click the title to expand.

???+ tip "Expanded by default"
    Collapsible, but open by default.
```

- `!!!` is always expanded, `???` is collapsed by default, and `???+` is collapsible but open by default; the title may be omitted (type default) or custom.
- Types include `note` / `abstract` / `info` / `tip` / `important` / `success` / `question` / `warning` / `caution` / `failure` and more; several share a color as aliases (e.g. `caution` / `attention` equal `warning`).
- The `::: note` … `:::` container form also works.

---

## Full Syntax Reference

[Open the Demo file for all syntax examples →](demo.md)

---

## Image Management

TizuMark offers comprehensive image support with multiple insertion methods and auto-dedup.

### Insert an Image

| Method | Action | Description |
|--------|--------|-------------|
| Paste | <kbd>Ctrl</kbd> + <kbd>V</kbd> | Paste an image from the clipboard (screenshot, copied image, etc.) into the editor; it is saved and inserted per the storage setting below |
| Insert Dialog | Image button on the format toolbar, or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> | Choose a local file, or enter a network image URL |
| Context Menu | Right-click in the editor → Insert Image | Same as above |

> **Dropping** an image file into the window **opens** it as a read-only preview tab — it does **not** insert it into the document you are editing. To insert, use paste or the insert dialog above.

### Auto Deduplication

Images with identical content are stored only once. TizuMark uses **MD5 hash** for content comparison:

- On paste or insert, the file's MD5 is computed automatically
- If the image already exists, the existing file is reused
- Same filename with different content will not conflict

### Image Storage Mode

Configured at `File → Settings → Behavior → Image Storage Mode`:

- **Copy to assets/ (recommended)**: Images saved as separate files; the md file stays lightweight and version-friendly
- **Base64 Embed**: Images encoded into the md file; single-file sharing, but size grows significantly (~1.4× original)

### Image Storage Path

Configured at `File → Settings → Behavior → Image Asset Path`:

- **Relative** (default): Relative to the current Markdown file's directory
- **Absolute**: Uses a fixed directory (e.g. `D:\assets`)

A dynamic hint below the setting shows the actual reference path for confirmation.

### Auto Width & Height

Images are inserted with original dimensions automatically:

```html
<img src="assets/abc123.png" width="800" height="600" alt="example">
```

You can edit or remove `width`/`height` directly in the source:

- Change to a percentage: `width="100%"`
- Remove entirely: the editor renders at original dimensions

> With "Base64 Embed", the inserted form is `![alt](data:image/png;base64,...)` and no width/height is attached.

### Image Viewer

Click any image in the preview to open a dedicated viewer: **drag** to pan, **scroll to zoom anchored at the cursor** (move the pointer over the detail you want, then scroll), and **double-click** to reset to fit. No need to leave TizuMark to inspect an image closely.

---

## Update Check

> **Auto-update is disabled in this branch.** The Help menu does not show "Check for Updates", and the app never contacts the network to check for versions on startup — it runs fully offline. To upgrade, download the new installer manually and install over the current version.

---

## Export

### Export HTML

`File → Export HTML` generates a standalone HTML file:

- Full CSS styling included
- Tables, code blocks, math formulas, and Mermaid charts preserved
- Ready to open in any browser

### Export Image

Export a high-resolution PNG (fixed 800px width, auto height, dark-theme styling supported). **The feature is still in the code but has been hidden from the File menu**, because very large documents may consume a lot of memory; use HTML / PDF export instead when needed.

### Export PDF

`File → Export PDF` (shortcut <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>) uses the system print dialog:

- After a confirmation prompt, the browser's native print function is used
- In the print dialog you can choose "Save as PDF" and adjust page orientation/margins
- Mermaid charts are re-rendered for crisp output; math formulas reuse the already-rendered KaTeX output, with its stylesheet inlined

### Export DOCX

`File → Export DOCX` generates a standard `.docx` document (native Word 2007+ format, opens and edits directly in Word/WPS):

- A **confirmation dialog** appears first (page size / orientation / margins are fixed to A4 / portrait / normal; adjust other page settings in Word's "Layout → Page Setup" after export), then export begins
- Converted from the preview into **true OOXML**, styled to match the preview (heading hierarchy & rules, body line-height, lists, table borders, blockquotes, gray code-block background, alert colors, bold/italic, links, images)
- Headings map to real Word **heading styles** (visible in the Navigation pane); formulas are converted to Word-editable **OMML** (MathML→OMML)
- Images are inlined as embedded resources (no separate folder needed) and auto-scaled to fit the page width, so they are never clipped or cut off
- Mermaid diagrams are first rendered to an image and then embedded, auto-scaled to the page width, so Word does not need to parse SVG and wide diagrams are never cut off
- Known limitations: alert border-radius/shadows and task-list checkboxes (CSS not supported by Word) are simplified; very long code lines may extend past the page boundary

---

## Personalization

All options are available in `File → Settings`, grouped into collapsible sections:

### Basic

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Language | 中文 / English | 中文 | Switch the entire UI language |
| Theme Mode | Light / Dark / Follow System | Light | Light/dark background, or match OS |
| Color Scheme | Base / Sunset / Forest / Nord / Dusk | Base | Overall UI color style |

> Click the sun/moon icon in the toolbar to quickly toggle between Light and Dark.

### Editor

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Tab Size | 2 / 4 / 8 | 4 | Spaces per Tab |
| Line Wrap | On / Off | On | Wrap long lines |
| Line Numbers | On / Off | On | Gutter line numbers |

### Preview

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Line Height | 1.4 / 1.6 / 1.7 / 1.8 / 2.0 | 1.7 | Preview line spacing |
| Max Width | Unlimited / 800 / 1000 / 1200px | Unlimited | Max content width |
| Code Line Numbers | On / Off | Off | Show line numbers in code blocks |
| Code Wrap | On / Off | Off | Wrap long lines in code blocks |
| Code Block Scrollbar | On / Off | On | Show a scrollbar when a code block is too long (off expands the height instead) |
| Custom Page Background | On / Off + color picker | Off (#f8f7f4) | Use a custom background for the editor and preview; text auto-inverts based on brightness |

### Behavior

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Default View | Preview / Edit | Preview | Startup view mode (Markdown only; plain text is always editor view, images always preview view) |
| Scroll Sync | On / Off | On | Sync preview scroll with editor |
| Soft Line Break (Enter = newline) | On / Off | On | When on, a single Enter creates a line break; when off, CommonMark standard applies (Enter = space) |
| Extended Syntax Highlight | On / Off | On | When on, `==text==` renders as a yellow highlight; when off it is shown as plain text |
| Equation Section Numbering | On / Off | Off | When on, `\label` formulas are numbered per section (e.g. (2.1)), restarting in each section; off numbers them continuously |
| Close Behavior | Ask / Quit / Minimize to Tray | Ask | What happens when closing the last window. Minimize to tray lets you bring the window back via the tray icon |
| Close All Tabs on Quit | On / Off | Off | When on, no tab session is saved on quit and the next launch starts blank; unsaved documents still prompt as usual |
| Show Tray Icon | On / Off | On | Show an icon in the system tray to bring the window back at any time; when off, closing the window quits the app directly |
| Show All Files | On / Off | Off | When off, the file tree lists only supported formats (Markdown 7 / Images 20 / Plain text & code 145); when on, every file in the directory is listed |
| Image Storage Mode | Copy to assets / Base64 Embed | Copy to assets | See Image Management |
| Image Asset Path | Relative / Absolute | Relative | See Image Management |

### Custom Fonts

In `File → Settings → Custom Fonts`:

- Click "Add Font…" to import a local font file (`.ttf` / `.otf` / `.woff` / `.woff2`) for repeated use
- Imported fonts appear in the "Editor Font", "Preview Font" and "Code Font" dropdowns, assignable separately
- Each font field has a preview sample below it to compare results
- The same section also holds the size / weight controls:

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| UI Font Size | 11–18px | 13px | Chrome UI size (sidebar / toolbar / dialogs / menus / tabs / status bar) |
| Editor Font Size | 8–36px | 14px | Editor body text size |
| Editor Font Weight | 100–900 | 400 | Editor body text weight |
| Preview Font Size | 8–36px | 16px | Preview body text size |
| Preview Font Weight | 100–900 | 400 | Preview body text weight |

### Quick Insert

In `File → Settings → Quick Insert → Manage Quick Insert…` you can drag to reorder the "/" command list and uncheck to hide items.

---

## FAQ

### How to restore default settings?

Click "Restore Default" in `File → Settings` or `File → Keyboard Shortcuts`.

### Supported file formats?

Three categories, each opened differently:

| Category | How it opens | Formats |
|----------|--------------|---------|
| **Markdown** | Rendered preview, switchable between Edit / Preview | `.md` `.markdown` `.mdown` `.mkd` `.mkdn` `.mdwn` `.markdn` |
| **Images** | Read-only preview, not editable | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp` `.svg` `.tif` `.tiff` `.ico` `.avif` `.heic` and more (20 total) |
| **Plain text / code** | Plain editor (no preview pane), no Markdown rendering | `.txt` `.log` `.json` `.yaml` `.toml` `.csv` `.html` `.css` `.js` `.ts` `.jsx` `.py` `.rs` `.go` `.java` `.c` `.cpp` `.sh` `.sql` `.xml` `.tex` `.ipynb` and 145 in total |

Extensions outside this allowlist show an "Unsupported format" message and are not opened (enable "Show All Files" in Settings to still list them in the tree).

### How to customize shortcuts?

`File → Keyboard Shortcuts`, click "Modify" and press new combination. Click "Clear" to remove, "Restore Default" to reset.

### Why is there no "Check for Updates" in the Help menu?

Auto-update is disabled in this branch — the app runs fully offline and never checks for versions. Download a new installer manually to upgrade.

### Math formulas not rendering?

Check syntax: inline `$...$`, display `$$...$$` (on its own line). Formulas with `&`, `<`, `>` are auto-escaped. An unclosed `$` or an invalid LaTeX command prevents rendering.

### Images missing in export?

Ensure image accessibility. Use relative paths for local files, check network for remote images.

### How to manage a whole folder of files?

`File → Open Folder` opens a directory; the sidebar "Files" panel shows a tree view. Click to open files, and it auto-refreshes on external changes.

### How to contact us?

- **QQ Group: 1035294939** (Chinese community)
- Bug reports, feature requests, tips & discussion

---

<p align="center">
  <b>TizuMark — Write at the speed of thought</b>
</p>

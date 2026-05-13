# 🎓 Study Player
> A premium desktop media player environment tailored specifically for intensive software engineering courses, featuring integrated coding sandboxes and persistent progress caching.

Study Player bridges the gap between watching video tutorials and applying concepts. By combining a dedicated, hardware-optimized video player with a fully embedded Monaco IDE, a real-time terminal, timestamped notebooks, and an offline local database, you can code, note, and watch all within one immersive dashboard.

---

## ✨ Key Premium Features

*   **💻 Embedded VS-Code Like Sandbox**: Full-featured multi-tab Monaco Editor directly side-by-side with your course material. Run Python, Node.js, or shell scripts instantly in your environment with absolute path outputs.
*   **🎥 Custom Range-Request Streaming**: Built-in support for high-performance custom protocols. Stream massive offline 4K/1080p tutorials (`.mp4`, `.mkv`, `.webm`) with near-instant buffer seek times and persisted playback rate controls.
*   **📊 Offline Intelligence (SQLite DB)**: Auto-saves course progression, video completion badges, resume timestamps, timestamped markdown notebooks, and bookmark flags directly into a lightweight `better-sqlite3` database.
*   **🛠️ Fully Dynamic Dockable Layout**: Smooth split-screen panes (Sidebar, Overview, IDE Workspace, Console Logs) that collapse instantly. Highly responsive drag handles to tailor the ratio of video to IDE content.
*   **🌍 Hybrid Mode Core Engine**: Switches context dynamically. Runs with full File-System/API integration in `Native` desktop mode, or switches to a high-fidelity web-mocked `Simulation` mode for browser-based sandbox environments.

---

## ⌨️ Pro Keyboard Shortcuts

Achieve high workflow speeds with system-wide navigation keys:

### 🎬 Video Playback (Works when not typing code)
*   **`Space`** — Toggle Play / Pause
*   **`← Arrow Left`** — Rewind 5 seconds
*   **`→ Arrow Right`** — Fast forward 5 seconds
*   **`↑ Arrow Up`** — Volume up
*   **`↓ Arrow Down`** — Volume down

### 📐 App Layout Windows (Toggle Anywhere)
*   **`Ctrl + B`** — Toggle Sidebar Navigation (Course Curriculum / Notes)
*   **`Ctrl + E`** — Toggle Editor Sandbox IDE
*   **`Ctrl + J`** — Toggle Console / Terminal Output logs
*   **`Ctrl + I`** — Toggle Reference Material Window
*   **`Ctrl + S`** — Save currently active Code File manually
*   **`Escape`** — Instant Focus Mode (collapses all sidebars for fullscreen video)

---

## 🏗️ Technical Stack

*   **Core Frame**: `Electron API` shell wrappers
*   **Frontend Layer**: `React.js 18` (Vite)
*   **Embedded IDE**: `Monaco Editor` (`@monaco-editor/react`)
*   **Local Storage Engine**: `SQLite 3` via `better-sqlite3` native bindings
*   **Graphic & Icons**: `lucide-react`
*   **Target Bundle System**: `electron-builder` (Optimized with low-memory configurations)

---

## 🚀 Installation & Launch

Study Player is fully packaged for Linux operating systems. 

### 1. Native System Installation (.deb)
For full system desktop integration (recommended):
```bash
sudo dpkg -i release/study-player_1.0.0_amd64.deb
```

### 2. Portable, Zero-Dependency Package (.tar.gz)
If you lack administrator access or prefer to keep system libraries pristine:
```bash
tar -xvf release/study-player-1.0.0.tar.gz
cd study-player-1.0.0
./study-player
```

### 3. AppImage Runner
Ready to run out of the box, provided standard `libfuse2` packages are available:
```bash
./release/Study\ Player-1.0.0.AppImage --no-sandbox
```

---

## 🛠️ Developer Instructions

To boot or build this application from your source repository:

### Setup Dependencies
Install the Node.js environment and compile SQLite native packages:
```bash
npm install
```

### Boot Developer Runtime
Concurrently boots the Vite dev-server and loads it into hot-reloaded Electron shell:
```bash
npm run electron:dev
```

### Bundle Clean Optimised Release
Generate fully compressed, hardware-optimized installer releases inside `/release`:
```bash
npm run dist
```
*(Includes Vite minifications, disabled sourcemaps, and Chromium low-end-memory optimization flags).*

---
Developed by **Deepuz World**. Made with ❤️ for programmers.

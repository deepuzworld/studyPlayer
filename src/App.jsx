import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
const Editor = lazy(() => import('@monaco-editor/react'));
import { 
  Book,
  BookOpen, 
  Bookmark, 
  FileText, 
  PlayCircle, 
  Play, 
  Pause,
  SkipForward, 
  SkipBack, 
  RotateCcw,
  RotateCw,
  Volume2, 
  Maximize, 
  Maximize2,
  Settings, 
  Search, 
  Moon, 
  Sun,
  Terminal, 
  Layout, 
  ChevronDown, 
  ChevronRight,
  Trophy,
  CheckCircle2,
  Lock,
  X,
  Square,
  Minus,
  Menu,
  LayoutDashboard,
  Code2,
  FolderOpen,
  Loader2,
  Trash2,
  ExternalLink,
  Cpu,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Clock,
  Home,
  Wifi,
  Tv,
  MoreVertical,
  LayoutPanelTop,
  ChevronLeft,
  Layers
} from 'lucide-react';
import './App.css';

// High Fidelity Simulation Fallback API
const simulationApi = {
  selectFolder: async () => ({
    courseId: 1,
    path: "/simulation/JavaScript_Fundamentals",
    structure: {
      "02. JavaScript Fundamentals – Part 1": [
        { name: "01. Section Intro.mp4", path: "/sim/1/1.mp4" },
        { name: "02. Hello World!.mp4", path: "/sim/1/2.mp4" },
        { name: "03. Values and Variables.mp4", path: "/sim/1/3.mp4" }
      ]
    }
  }),
  scanLastCourse: async () => ({
    courseId: 1,
    path: "/simulation/JavaScript_Fundamentals",
    structure: {
      "02. JavaScript Fundamentals – Part 1": [
        { name: "01. Section Intro.mp4", path: "/sim/1/1.mp4" },
        { name: "02. Hello World!.mp4", path: "/sim/1/2.mp4" },
        { name: "03. Values and Variables.mp4", path: "/sim/1/3.mp4" }
      ]
    }
  }),
  getVideoState: async () => ({ last_position_ms: 12000, duration_ms: 596000, is_completed: 0 }),
  updateProgress: async () => {},
  getCourseStats: async () => ({ total_videos: 3, completed_videos: 1 }),
  runCode: async (code, filename, dirPath) => {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ success: true, output: "Executed simulated script perfectly.\n> Hello from Sandbox!" }), 600);
    });
  },
  saveCode: async (code, filename, dirPath) => ({ success: true, path: '/simulation/' + filename }),
  getVideoSrc: () => "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  getNote: async () => '',
  saveNote: async () => true,
  getBookmarks: async () => [],
  addBookmark: async () => ({ id: Date.now() }),
  deleteBookmark: async () => true,
  getRecentWorkspaces: async () => [],
  getSetting: async (key) => localStorage.getItem(`set_${key}`) || null,
  setSetting: async (key, val) => { localStorage.setItem(`set_${key}`, val); return true; },
  loadCourseByPath: async (p) => ({
    courseId: Date.now(),
    path: p,
    structure: {
      "Restored Course Module": [
        { name: "Lesson 01.mp4", path: p + "/1.mp4" }
      ]
    }
  }),
  minimizeWindow: () => console.log("Sim minimize triggered"),
  maximizeWindow: () => console.log("Sim maximize triggered"),
  closeWindow: () => console.log("Sim close triggered"),
  getCourseProgress: async () => ({}),
  savePlayback: async (data) => {
    localStorage.setItem(`playback_${data.path}`, JSON.stringify({
      currentTime: data.currentTime,
      duration: data.duration,
      lastWatched: Date.now(),
      completed: data.completed || (data.duration > 0 && (data.currentTime / data.duration > 0.95))
    }));
    return true;
  },
  getPlayback: async (path) => {
    try {
      const saved = localStorage.getItem(`playback_${path}`);
      return saved ? JSON.parse(saved) : null;
    } catch(e) {
      return null;
    }
  },
  onForceSavePlayback: (cb) => {
    // Provide a mocked trigger if needed
    window.forceSavePlaybackSim = cb;
  }
};

const isNativeApp = !!window.electronAPI;

function App() {
  // App Mode States
  const [appMode, setAppMode] = useState(isNativeApp ? 'Native' : 'Simulation');
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard', 'player', 'settings'
  const [theme, setTheme] = useState('dark');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPipActive, setIsPipActive] = useState(false);
  const [activeDbTab, setActiveDbTab] = useState('home'); // 'home', 'recent', 'courses', 'streams', 'notes'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const api = appMode === 'Native' ? (window.electronAPI || simulationApi) : simulationApi;

  // Core dynamic course states
  const [courseData, setCourseData] = useState(null);
  const [stats, setStats] = useState({ total_videos: 0, completed_videos: 0 });
  const [videoCompletionMap, setVideoCompletionMap] = useState({}); // Cache for quick curriculum locking lookups
  const [activeVideo, setActiveVideo] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState({});
  const [recentWorkspaces, setRecentWorkspaces] = useState([]);
  const [notesTree, setNotesTree] = useState({}); // Multi-course hierarchical tree mapping for Dashboard notebook view
  const [expandedNotes, setExpandedNotes] = useState({}); // Toggle map for accordion UI expansions

  // Layout state
  const [showSidebar, setShowSidebar] = useState(true);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showRefPane, setShowRefPane] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('contents');

  // Video state
  const [videoNote, setVideoNote] = useState('');
  const [noteVideoPath, setNoteVideoPath] = useState(''); // Tracks active video context for CURRENT editor session
  const [isNoteDirty, setIsNoteDirty] = useState(false); // Blocks auto-load until user manually saves notes
  const [pendingNoteVideo, setPendingNoteVideo] = useState(null); // Stashes next video note target
  const [bookmarks, setBookmarks] = useState([]);
  const [newBmText, setNewBmText] = useState('');
  const noteSaveTimeout = useRef(null);
  const videoRef = useRef(null);
  const lastProgressUpdateRef = useRef(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playbackSaveTimeout = useRef(null);

  // Multi-File Editor States
  const [openFiles, setOpenFiles] = useState([
    { name: 'Untitled-1', content: '// Write code here\nconsole.log("Hello Workspace!");\n', isDirty: true, isUntitled: true }
  ]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Hotkey ref for Monaco to avoid stale state closures
  const handleSaveCodeRef = useRef();

  // Console logging states
  const [termTab, setTermTab] = useState('output');
  const [outputLogs, setOutputLogs] = useState([]);
  const [terminalHistory, setTerminalHistory] = useState([{ type: 'sys', text: 'StudyFlux Terminal ready.' }]);
  const [consoleLogs, setConsoleLogs] = useState([{ type: 'info', text: 'Ready.' }]);
  const [termInputVal, setTermInputVal] = useState('');

  // Layout states
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [rightPaneWidth, setRightPaneWidth] = useState(420);
  const [mainSplit, setMainSplit] = useState(60);
  const [rightSplit, setRightSplit] = useState(60);
  const [contextMenu, setContextMenu] = useState(null);

  // Initialize theme from SQLite preference
  useEffect(() => {
    api.getSetting('theme').then(saved => {
      if (saved) setTheme(saved);
      else {
        const local = localStorage.getItem('app-theme');
        if (local) setTheme(local);
      }
    }).catch(() => {});
  }, [appMode]);

  // Apply visual theme to body wrapper & persist
  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light');
    localStorage.setItem('app-theme', theme);
    api.setSetting('theme', theme).catch(() => {});
  }, [theme]);

  // Fetch Recents when mounting or mode change
  useEffect(() => {
    refreshRecentWorkspaces();
  }, [viewMode, appMode]);

  const refreshRecentWorkspaces = async () => {
    try {
      const res = await api.getRecentWorkspaces();
      if (res) setRecentWorkspaces(res);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshNotesTree = async () => {
    try {
      const res = await api.getAllNotesTree();
      if (res) setNotesTree(res);
    } catch (e) {
      console.error(e);
    }
  };

  // Load dynamic notes tree when navigating into Notes tab
  useEffect(() => {
    if (activeDbTab === 'notes' && viewMode === 'dashboard') {
      refreshNotesTree();
    }
  }, [activeDbTab, viewMode, appMode]);

  // Video tracking states (Optimized with Notes persistence lock)
  useEffect(() => {
    if (activeVideo) {
      // Bookmarks transition instantly
      api.getBookmarks(activeVideo.path).then(res => setBookmarks(res || []));
      
      // Enforce persistence guarantee: If current note is dirty, lock context and stash target!
      if (isNoteDirty) {
        setPendingNoteVideo(activeVideo);
      } else {
        setNoteVideoPath(activeVideo.path);
        setPendingNoteVideo(null);
        api.getNote(activeVideo.path).then(res => setVideoNote(res || ''));
      }
    }
  }, [activeVideo, appMode]);

  // Load dynamic stats & curriculum progression status maps
  useEffect(() => {
    if (courseData?.courseId) {
      api.getCourseStats(courseData.courseId).then(setStats);
      api.getCourseProgress(courseData.courseId).then(res => setVideoCompletionMap(res || {}));
    }
  }, [courseData, activeVideo, appMode]);

  // Robust Video Track Loading & Auto-playback handling
  useEffect(() => {
    const video = videoRef.current;
    if (!activeVideo || !video) return;

    const isNetwork = activeVideo.path.startsWith('http://') || activeVideo.path.startsWith('https://');
    const src = isNetwork ? activeVideo.path : api.getVideoSrc(activeVideo.path);
    
    // Avoid setting same src repeatedly to prevent resets
    if (video.src !== src) {
      video.src = src;
      video.load();
    }

    const savedTime = (activeVideo.last_position_ms || 0) / 1000;
    video.playbackRate = playbackRate;

    console.log("RESTORING:", savedTime);

    const restorePlayback = () => {
      console.log("VIDEO READY");
      if (savedTime > 5 && savedTime < video.duration) {
        video.currentTime = savedTime;
      }
      video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", restorePlayback);

    if (video.readyState >= 1) {
      restorePlayback();
    }

    // PiP state listeners to enable adaptive container layouts
    const onEnter = () => setIsPipActive(true);
    const onLeave = () => setIsPipActive(false);

    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);

    return () => {
      video.removeEventListener("loadedmetadata", restorePlayback);
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [activeVideo, appMode]);

  // Dynamic Hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode === 'dashboard') return;

      // Check for Ctrl+S explicitly in workspace to save code
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        if (showWorkspace) {
          e.preventDefault();
          if (handleSaveCodeRef.current) handleSaveCodeRef.current();
          return;
        }
      }

      const target = e.target.tagName;
      if (target === 'TEXTAREA' || target === 'INPUT' || e.target.isContentEditable) return;

      // Video Controls Shortcuts
      if (e.code === 'Space') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play().catch(() => {});
          else videoRef.current.pause();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1);
      }

      // UI toggling
      if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setShowSidebar(p => !p); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setShowWorkspace(p => !p); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'j') { e.preventDefault(); setShowTerminal(p => !p); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setShowRefPane(p => !p); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSidebar(false); setShowWorkspace(false); setShowRefPane(false); setShowTerminal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // Open course folder workflow
  const handleOpenFolder = async () => {
    const res = await api.selectFolder();
    if (res) loadCourseState(res);
  };

  // Resume last course workflow
  const handleResumeLastCourse = async () => {
    const res = await api.scanLastCourse();
    if (res) {
      loadCourseState(res);
    } else {
      // Fallback to folder selection if no prior history
      handleOpenFolder();
    }
  };

  // Start network URL stream
  const handleStartStream = () => {
    const url = window.prompt("Enter Network Stream URL (e.g., HLS, MP4 endpoint):", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
    if (!url) return;
    
    const mockVid = {
      name: "Network Stream Link",
      path: url
    };
    selectVideo(mockVid);
  };

  const handleResetDefaults = async () => {
    if (window.confirm("Restore app layout splits, playback rate, and dark visual appearance to system defaults?")) {
      setTheme('dark');
      setMainSplit(60);
      setPlaybackRate(1);
      setRightSplit(60);
      localStorage.setItem('app-theme', 'dark');
      await api.setSetting('theme', 'dark').catch(() => {});
      window.alert("Preferences restored to system defaults successfully!");
    }
  };

  const handleLoadCoursePath = async (dirPath, targetVideoPath = null) => {
    try {
      const res = await api.loadCourseByPath(dirPath);
      if (res) loadCourseState(res, targetVideoPath);
    } catch(err) {
      console.error("Could not load recent course", err);
    }
  };

  const loadCourseState = (data, targetVideoPath = null) => {
    setCourseData(data);
    setViewMode('player');
    setShowSidebar(true); // Open sidebar so modules are immediately accessible
    if (targetVideoPath) {
      setSidebarTab('notes'); // If jumping from notes dashboard, focus Notes tab
    }
    
    if (data.structure) {
      const keys = Object.keys(data.structure);
      if (keys.length > 0) {
        // Combine Deep-Linking AND Historical Auto-Resume queries to fix course resets
        const activeSearchPath = targetVideoPath || data.lastWatchedVideoPath;
        
        if (activeSearchPath) {
          let matchedVid = null;
          let targetMod = keys[0];
          
          for (const modKey of keys) {
            const match = data.structure[modKey].find(v => v.path.normalize() === activeSearchPath.normalize());
            if (match) {
              matchedVid = match;
              targetMod = modKey;
              break;
            }
          }
          
          if (matchedVid) {
            // Auto-expand containing module folder and select video track
            setIsCollapsed({ [targetMod]: true });
            selectVideo(matchedVid);
            return; 
          }
        }
        
        // Absolute Fallback: Autoplay absolute first lesson
        setIsCollapsed({ [keys[0]]: true });
        const firstV = data.structure[keys[0]][0];
        if (firstV) selectVideo(firstV);
      }
    }
  };

  // Instant programmatic progress saver & mapper synchronization
  const saveCurrentProgressInstantly = (forceCompleted = false) => {
    if (!activeVideo || !videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    
    // CRITICAL DESTRUCTIVE OVERWRITE PROTECTION:
    // Prevent HTML5 dynamic loading race conditions from committing 0ms state over active DB benchmarks.
    if (cur === 0 && activeVideo.last_position_ms > 0 && !forceCompleted) {
      return;
    }
    
    if (dur > 0) {
      const isComp = forceCompleted || (cur / dur > 0.95);
      api.updateProgress(activeVideo.path, Math.floor(cur * 1000), Math.floor(dur * 1000), isComp);
      
      // Save checkpoint to persistent playback session table immediately
      if (api.savePlayback) {
        console.log("SAVING:", cur);
        try {
          const res = api.savePlayback({
            path: activeVideo.path,
            currentTime: cur,
            duration: dur,
            completed: isComp
          });
          if (res && res.catch) res.catch(() => {});
        } catch (e) {}
      }
      
      // Ensure local map state tracks compound progress seamlessly
      setVideoCompletionMap(prev => ({
        ...prev,
        [activeVideo.path]: {
          is_completed: isComp ? 1 : (prev[activeVideo.path]?.is_completed || 0),
          duration_ms: Math.floor(dur * 1000)
        }
      }));
    }
  };

  // Absolute persistence guarantee triggered when clicking custom X close control
  const handleAppExit = async () => {
    if (activeVideo && videoRef.current) {
      const cur = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 0;
      if (dur > 0) {
        const isComp = (cur / dur > 0.95);
        await api.updateProgress(activeVideo.path, Math.floor(cur * 1000), Math.floor(dur * 1000), isComp);
        if (api.savePlayback) {
          console.log("SAVING:", cur);
          try {
            const res = api.savePlayback({
              path: activeVideo.path,
              currentTime: cur,
              duration: dur,
              completed: isComp
            });
            if (res && res.catch) await res.catch(() => {});
          } catch (e) {}
        }
      }
    }
    api.closeWindow?.();
  };

  // Listen for force-save-playback event from Electron Main Process on app close/quit
  useEffect(() => {
    if (api.onForceSavePlayback) {
      api.onForceSavePlayback(() => {
        saveCurrentProgressInstantly();
      });
    }
  }, [activeVideo]);

  // Combined robust saving strategy: persist every 5 seconds to guarantee persistence against crashes
  useEffect(() => {
    const video = videoRef.current;
    if (!activeVideo || !video || !api.savePlayback) return;

    const interval = setInterval(() => {
      console.log("SAVING:", video.currentTime);
      try {
        const res = api.savePlayback({
          path: activeVideo.path,
          currentTime: video.currentTime,
          duration: video.duration || 0,
          completed: video.duration > 0 && (video.currentTime / video.duration > 0.95)
        });
        if (res && res.catch) res.catch(() => {});
      } catch (e) {}
    }, 5000);

    return () => clearInterval(interval);
  }, [activeVideo]);

  // Auto-persists current playback frame when component is destroyed or switches tracks
  useEffect(() => {
    return () => {
      if (activeVideo) {
        saveCurrentProgressInstantly();
      }
    };
  }, [activeVideo]);

  const selectVideo = async (video) => {
    // Network streams skip SQLite lookups
    const isNetwork = video.path.startsWith('http://') || video.path.startsWith('https://');
    const state = isNetwork ? { last_position_ms: 0, duration_ms: 0 } : await api.getVideoState(video.path);
    
    // Check persistent playback history session table
    const savedPlayback = isNetwork || !api.getPlayback ? null : await api.getPlayback(video.path).catch(() => null);
    
    let targetResumeTimeMs = state?.last_position_ms || 0;
    if (savedPlayback && savedPlayback.currentTime > 5) {
      targetResumeTimeMs = Math.floor(savedPlayback.currentTime * 1000);
    } else if (targetResumeTimeMs < 5000) {
      targetResumeTimeMs = 0;
    }
    
    setActiveVideo({ ...video, ...state, last_position_ms: targetResumeTimeMs });
    setViewMode('player');

    // AUTO-COLLAPSE REQUIREMENT: maximizes video immediately
    setShowSidebar(false);
    setShowWorkspace(false);
    setShowRefPane(false);
    setShowTerminal(false);
  };

  // Helper to flatten structural course tree to flat array of lessons
  const getFlatVideos = () => {
    if (!courseData?.structure) return [];
    const flat = [];
    for (const moduleName in courseData.structure) {
      flat.push(...courseData.structure[moduleName]);
    }
    return flat;
  };

  const advanceToNextVideoTrack = () => {
    if (!activeVideo) return;
    const flat = getFlatVideos();
    const idx = flat.findIndex(v => v.path.normalize() === activeVideo.path.normalize());
    if (idx !== -1 && idx < flat.length - 1) {
      selectVideo(flat[idx + 1]);
    }
  };

  const handleSeekForward10 = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
    }
  };

  const handleSeekBackward10 = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const currentIdx = rates.indexOf(playbackRate);
    const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  };

  // Debounced Save System implementation
  const scheduleSave = (time, dur) => {
    if (playbackSaveTimeout.current) clearTimeout(playbackSaveTimeout.current);
    playbackSaveTimeout.current = setTimeout(() => {
      if (api.savePlayback && activeVideo) {
        console.log("SAVING:", time);
        try {
          const res = api.savePlayback({
            path: activeVideo.path,
            currentTime: time,
            duration: dur,
            completed: time / dur > 0.95
          });
          if (res && res.catch) res.catch(() => {});
        } catch (e) {}
      }
    }, 5000);
  };

  // Video progress engine
  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Debounced tracking via scheduleSave to prevent excessive disk writes
    if (dur > 0 && activeVideo) {
      scheduleSave(cur, dur);
    }

    const curSec = Math.floor(cur);
    if (curSec % 3 === 0 && curSec !== lastProgressUpdateRef.current && activeVideo && dur > 0) {
      lastProgressUpdateRef.current = curSec;
      saveCurrentProgressInstantly();
      
      const comp = cur / dur > 0.95;
      if (comp && activeVideo.is_completed === 0) {
        setActiveVideo(prev => ({ ...prev, is_completed: 1 }));
      }
    }
  };

  // Code Playground Multi-file tabs
  const handleCodeChange = (val) => {
    const updated = [...openFiles];
    updated[activeFileIdx].content = val;
    updated[activeFileIdx].isDirty = true;
    setOpenFiles(updated);
  };

  const handleAddNewFile = () => {
    const nextNum = openFiles.length + 1;
    const name = `Untitled-${nextNum}`;
    
    const newF = { 
      name, 
      content: `// Workspace: ${name}\nconsole.log("Execution testing context ready...");\n`, 
      isDirty: true,
      isUntitled: true
    };
    
    setOpenFiles([...openFiles, newF]);
    setActiveFileIdx(openFiles.length); // Select new tab immediately
  };

  const handleCloseFile = (e, idx) => {
    e.stopPropagation();
    if (openFiles.length === 1) return; // Keep at least one
    const filtered = openFiles.filter((_, i) => i !== idx);
    setOpenFiles(filtered);
    setActiveFileIdx(prev => Math.max(0, prev - 1));
  };

  const handleSaveCode = async (forcePrompt = false) => {
    const activeF = openFiles[activeFileIdx];
    let currentName = activeF.name;
    let currentDir = courseData?.path || null;
    
    // Pop OS save dialog if file is 'Untitled' or explicit 'Save As' requested
    if (activeF.isUntitled || forcePrompt) {
      const dialogRes = await api.showSaveDialog(currentName);
      if (dialogRes.canceled || !dialogRes.filePath) return { success: false };
      
      const fullPath = dialogRes.filePath;
      // Safe extract basename and directory
      const parts = fullPath.split(/[/\\]/);
      const fileName = parts[parts.length - 1];
      const parentFolder = fullPath.substring(0, fullPath.lastIndexOf(fileName) - 1);
      
      const updated = [...openFiles];
      updated[activeFileIdx].name = fileName;
      updated[activeFileIdx].isUntitled = false;
      updated[activeFileIdx].realPath = fullPath;
      setOpenFiles(updated);
      
      currentName = fileName;
      currentDir = parentFolder;
    }
    
    const res = await api.saveCode(activeF.content, currentName, currentDir);
    if (res.success) {
      const updated = [...openFiles];
      updated[activeFileIdx].isDirty = false;
      setOpenFiles(updated);
      
      const logs = [...outputLogs];
      logs.push({ type: 'sys', text: `✓ Saved file: ${currentName}` });
      setOutputLogs(logs.slice(-30));
      return { success: true };
    } else {
      const logs = [...outputLogs];
      logs.push({ type: 'err', text: `✗ Save Failed: ${res.error || 'Unknown error'}` });
      setOutputLogs(logs.slice(-30));
      return { success: false };
    }
  };

  // Keep handleSaveCode current for the editor binding
  useEffect(() => {
    handleSaveCodeRef.current = handleSaveCode;
  });

  function handleEditorDidMount(editor, monaco) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (handleSaveCodeRef.current) handleSaveCodeRef.current();
    });
  }

  const handleExecuteCode = async () => {
    const activeF = openFiles[activeFileIdx];
    
    // Force save prompt for untitled files BEFORE running to ensure extensions exist!
    if (activeF.isUntitled) {
      const saveOk = await handleSaveCode();
      if (!saveOk || !saveOk.success) return; // Cancelled by user
    }
    
    setIsRunning(true);
    setShowWorkspace(true);
    setShowTerminal(true);
    setTermTab('output');

    // Read re-rendered file properties (in case it was just named)
    const reloadedF = openFiles[activeFileIdx];
    const dirPath = courseData?.path || null;
    const res = await api.runCode(reloadedF.content, reloadedF.name, dirPath);
    
    // Execution auto-saves, clear dirtiness
    const updated = [...openFiles];
    updated[activeFileIdx].isDirty = false;
    setOpenFiles(updated);
    
    const logs = [...outputLogs];
    logs.push({ type: 'cmd', text: `Executing [ ${reloadedF.name} ]...` });
    if (res.output) logs.push({ type: 'out', text: res.output });
    if (res.error) logs.push({ type: 'err', text: res.error });
    setOutputLogs(logs.slice(-30));
    setIsRunning(false);
  };

  // Notes and Bookmarks (Optimized with Persistence state-machine locks)
  const handleNoteChange = (val) => {
    setVideoNote(val);
    setIsNoteDirty(true); // Trigger dirty lock immediately on keystroke
    
    // Note target must fall back to currentNoteVideoPath to prevent overwrites during locks
    const targetPath = noteVideoPath || activeVideo?.path;
    if (targetPath) {
      if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current);
      noteSaveTimeout.current = setTimeout(async () => {
        await api.saveNote(targetPath, val);
        setIsNoteDirty(false); // Reset dirty flag upon successful flush!
      }, 750);
    }
  };

  const handleExplicitSaveNote = async () => {
    const targetPath = noteVideoPath || activeVideo?.path;
    if (!targetPath) return;
    
    if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current);
    await api.saveNote(targetPath, videoNote);
    setIsNoteDirty(false);
    
    // If there is a pending video stashed due to locking, transition it instantly!
    const nextVideo = pendingNoteVideo || activeVideo;
    if (nextVideo && nextVideo.path !== targetPath) {
      setNoteVideoPath(nextVideo.path);
      setPendingNoteVideo(null);
      const freshText = await api.getNote(nextVideo.path);
      setVideoNote(freshText || '');
    }
  };

  const handleAddBookmark = async () => {
    if (!activeVideo || !videoRef.current) return;
    const currentMs = Math.floor(videoRef.current.currentTime * 1000);
    const note = newBmText.trim() || `Timestamp ${formatTime(currentMs / 1000)}`;
    const res = await api.addBookmark(activeVideo.path, currentMs, note);
    if (res) {
      const list = await api.getBookmarks(activeVideo.path);
      setBookmarks(list || []);
      setNewBmText('');
    }
  };

  const handleDeleteBookmark = async (e, id) => {
    e.stopPropagation();
    await api.deleteBookmark(id, activeVideo.path);
    const list = await api.getBookmarks(activeVideo.path);
    setBookmarks(list || []);
  };

  // Context Menu layout
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Shell Emulator input
  const handleTerminalKeyDown = async (e) => {
    if (e.key === 'Enter') {
      const input = termInputVal.trim();
      if (!input) return;
      const hist = [...terminalHistory, { type: 'cmd', text: `$ ${input}` }];
      setTermInputVal('');
      
      if (appMode === 'Native') {
        const res = await api.runCode(input, 'term.sh');
        const updated = [...hist];
        if (res.output) updated.push({ type: 'out', text: res.output });
        if (res.error) updated.push({ type: 'err', text: res.error });
        setTerminalHistory(updated);
      } else {
        setTerminalHistory([...hist, { type: 'out', text: `Simulated command executed successfully.` }]);
      }
    }
  };

  // Mouse Resize Drag handles
  const startResizing = (mouseDownEvent, type) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startY = mouseDownEvent.clientY;
    const currentSidebar = sidebarWidth;
    const currentRight = rightPaneWidth;
    const currentMain = mainSplit;
    const currentRightSplit = rightSplit;
    const body = document.querySelector('.app-body');
    const mainS = document.querySelector('.main-stage');
    const workspace = document.querySelector('.workspace-pane');
    const stageH = mainS ? mainS.getBoundingClientRect().height : 600;
    const workH = workspace ? workspace.getBoundingClientRect().height : 600;

    const onMouseMove = (e) => {
      if (type === 'sidebar') setSidebarWidth(Math.max(220, Math.min(450, currentSidebar + (e.clientX - startX))));
      else if (type === 'rightPane') setRightPaneWidth(Math.max(300, Math.min(600, currentRight + (startX - e.clientX))));
      else if (type === 'mainSplit') setMainSplit(Math.max(20, Math.min(80, currentMain + ((e.clientY - startY) / stageH) * 100)));
      else if (type === 'rightSplit') setRightSplit(Math.max(20, Math.min(80, currentRightSplit + ((e.clientY - startY) / workH) * 100)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const formatTime = (t) => {
    if (isNaN(t)) return "00:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct = stats.total_videos > 0 ? Math.round((stats.completed_videos / stats.total_videos) * 100) : 0;

  return (
    <div className="app-container">
      {/* Container for Main App Workspace */}

      <div className="app-main-wrapper">
        {/* HEADER */}
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {viewMode === 'player' ? (
              <>
                <button className="header-icon-btn back-dashboard" onClick={() => setViewMode('dashboard')} title="Back to Dashboard">
                  <ChevronLeft size={18} />
                </button>
                <div className="app-logo" style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <img src="/thumb.png" alt="StudyFlux Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '5px' }} />
                </div>
                <h1 style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '0.5px' }}>StudyFlux</h1>
              </>
            ) : (
              <>
                {activeDbTab !== 'home' && (
                  <button className="header-icon-btn" onClick={() => setActiveDbTab('home')} title="Back to Home" style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', marginRight: '8px' }}>
                    <ChevronLeft size={18} />
                  </button>
                )}
                <div className="app-logo" style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <img src="/thumb.png" alt="StudyFlux Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '6px' }} />
                </div>
                <h1 style={{ fontSize: '0.95rem', fontWeight: '700', letterSpacing: '0.5px', margin: 0, cursor: 'pointer', color: 'var(--text-main)' }} onClick={() => setActiveDbTab('home')}>StudyFlux</h1>
              </>
            )}
          </div>

          <div className="search-box centered-search">
            <Search size={13} color="var(--text-dim)" />
            <input type="text" placeholder="Search courses, lessons, notes..." style={{ flex: 1, fontSize: '0.75rem' }} />
            <div className="shortcut-kbd">⌘ K</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="mode-switcher mini">
              <button className={`mode-btn ${appMode === 'Native' ? 'active' : ''}`} onClick={() => setAppMode('Native')} disabled={!isNativeApp}>Native</button>
              <button className={`mode-btn ${appMode === 'Simulation' ? 'active' : ''}`} onClick={() => setAppMode('Simulation')}>Sim</button>
            </div>
            <div className="header-utils">
              <button className="header-icon-btn theme-toggle" onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')} title="Toggle Color Theme" style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex' }}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="header-icon-btn" onClick={() => setViewMode('settings')} title="Open Settings Preferences" style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex' }}>
                <Settings size={16} />
              </button>
              <div className="window-controls">
                <Minus size={13} onClick={() => api.minimizeWindow?.()} />
                <Square size={10} onClick={() => api.maximizeWindow?.()} />
                <X size={13} onClick={handleAppExit} />
              </div>
            </div>
          </div>
        </header>

        {/* APP BODY */}
        <main className="app-body">
          
          {/* ------------------------------------------
             VIEW 1: FUNCTIONAL DASHBOARD WORKSPACE
             ------------------------------------------ */}
          {viewMode === 'dashboard' && (
            <div className="dashboard-viewport" style={{ border: 'none', borderRadius: 0 }}>
              <section className="dashboard-content">
              {activeDbTab === 'home' && (
                <>
                  <div className="welcome-header">
                    <h1>Start Your Learning Workspace</h1>
                    <p>Open a course folder, connect a stream, or create a new session.</p>
                  </div>

                  <div className="quick-actions-grid">
                    <div className="action-card purple" onClick={handleOpenFolder}>
                      <div className="card-icon"><FolderOpen size={28} /></div>
                      <h3>Open Course Folder</h3>
                      <p>Scan local directories</p>
                    </div>
                    <div className="action-card blue" onClick={() => { setActiveDbTab('streams'); handleStartStream(); }}>
                      <div className="card-icon"><Wifi size={28} /></div>
                      <h3>Start Stream</h3>
                      <p>Connect network URL</p>
                    </div>
                    <div className="action-card green" onClick={handleResumeLastCourse}>
                      <div className="card-icon"><Tv size={28} /></div>
                      <h3>Open Workspace</h3>
                      <p>Restore session State</p>
                    </div>
                    <div className="action-card neon" onClick={() => { setActiveDbTab('notes'); }}>
                      <div className="card-icon"><FileText size={28} /></div>
                      <h3>Note Session</h3>
                      <p>Manage compiled memos</p>
                    </div>
                  </div>

                  <div className="recent-workspaces-section">
                    <div className="recent-header"><Clock size={15} /> Recent Workspaces</div>
                    
                    {recentWorkspaces.length === 0 ? null : (
                      <div className="recent-grid">
                        {recentWorkspaces.map((ws, index) => {
                          const iconColors = ['yel', 'blu', 'grn', 'purp'];
                          const colClass = iconColors[index % iconColors.length];
                          return (
                            <div key={ws.id} className="recent-card" onClick={() => handleLoadCoursePath(ws.path)}>
                              <div className="card-top">
                                <FolderOpen size={20} className={`folder-icon ${colClass}`} />
                                <MoreVertical size={14} />
                              </div>
                              <h4>{ws.name}</h4>
                              <span className="card-path">{ws.path}</span>
                              <span className="card-opened">{ws.total_videos || 0} videos scanned</span>
                              <div className="card-progress-bar">
                                <div className="pb-bg"><div className="pb-fill" style={{ width: `${ws.progress}%` }}></div></div>
                                <span className="pb-pct">{ws.progress}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeDbTab === 'recent' && (
                <div className="recent-workspaces-section" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div className="recent-header" style={{ fontSize: '1.2rem', marginBottom: '24px', gap: '10px' }}><Clock size={20} /> Workspace History</div>
                  {recentWorkspaces.length === 0 ? null : (
                    <div className="recent-grid">
                      {recentWorkspaces.map((ws, index) => {
                        const iconColors = ['yel', 'blu', 'grn', 'purp'];
                        const colClass = iconColors[index % iconColors.length];
                        return (
                          <div key={ws.id} className="recent-card" onClick={() => handleLoadCoursePath(ws.path)}>
                            <div className="card-top"><FolderOpen size={20} className={`folder-icon ${colClass}`} /><MoreVertical size={14} /></div>
                            <h4>{ws.name}</h4>
                            <span className="card-path">{ws.path}</span>
                            <div className="card-progress-bar"><div className="pb-bg"><div className="pb-fill" style={{ width: `${ws.progress}%` }}></div></div></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeDbTab === 'courses' && (
                <div className="recent-workspaces-section" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div className="recent-header" style={{ fontSize: '1.2rem', marginBottom: '24px', gap: '10px' }}><Book size={20} /> All Indexed Course Curriculum</div>
                  {recentWorkspaces.length === 0 ? null : (
                    <div className="recent-grid">
                      {recentWorkspaces.map((ws, index) => (
                        <div key={ws.id} className="recent-card" onClick={() => handleLoadCoursePath(ws.path)}>
                          <div className="card-top"><FolderOpen size={20} className="folder-icon blu" /><MoreVertical size={14} /></div>
                          <h4>{ws.name}</h4>
                          <span className="card-opened">{ws.total_videos || 0} videos tracked</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeDbTab === 'streams' && (
                <div className="streams-view" style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--bg-dashboard-card)', border: '1px solid var(--border-color)', padding: '40px', borderRadius: '12px', textAlign: 'center', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                    <Wifi size={48} style={{ color: 'var(--accent-color)' }}/>
                    <h2 style={{ color: 'var(--text-main)' }}>Live Network Streaming</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.5' }}>Load any online course endpoint directly. Supports raw MP4 distributions, web streams, and live media protocol URLs.</p>
                    <button className="action-btn run" style={{ padding: '12px 28px', borderRadius: '6px', marginTop: '8px' }} onClick={handleStartStream}>Connect Online Stream</button>
                  </div>
                </div>
              )}

              {activeDbTab === 'notes' && (
                <div className="recent-workspaces-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: '680px', margin: '0 auto', width: '100%' }}>
                  <div className="recent-header" style={{ fontSize: '1.2rem', marginBottom: '24px', gap: '10px' }}><FileText size={20} /> Note Session Tree</div>
                  
                  {Object.keys(notesTree).length === 0 ? (
                    <div className="empty-state" style={{ background: 'var(--bg-dashboard-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '40px' }}>
                      <FileText size={36} style={{ opacity: 0.3, marginBottom: '12px' }}/>
                      <span style={{ color: 'var(--text-secondary)' }}>No indexed notes files discovered. Start writing timestamped logs in an active workspace session to populate!</span>
                    </div>
                  ) : (
                    <div className="notes-tree-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
                      {Object.keys(notesTree).map(courseName => {
                        const notes = notesTree[courseName];
                        const isCourseExpanded = expandedNotes[courseName];
                        
                        // Group notes nested in this course by their containing subfolders (modules)!
                        const groups = {};
                        for (const n of notes) {
                          const rel = n.videoPath.replace(n.coursePath, '');
                          const parts = rel.split(/[/\\]/).filter(Boolean);
                          const modName = parts.length > 1 ? parts[parts.length - 2] : 'Root Content';
                          
                          if (!groups[modName]) groups[modName] = [];
                          groups[modName].push(n);
                        }
                        
                        return (
                          <div key={courseName} className="course-note-node" style={{ background: 'var(--bg-dashboard-card)', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div 
                              className="course-note-header" 
                              onClick={() => setExpandedNotes(prev => ({ ...prev, [courseName]: !prev[courseName] }))}
                              style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.2s', userSelect: 'none' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                            >
                              <FolderOpen size={20} style={{ color: '#e1b12c' }} />
                              <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{courseName}</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>{notes.length} Recorded Node{notes.length > 1 ? 's' : ''}</span>
                              {isCourseExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                            
                            {isCourseExpanded && (
                              <div className="course-note-body" style={{ padding: '0px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                                {Object.keys(groups).map(modName => (
                                  <div key={modName} className="module-note-subnode" style={{ borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '16px', marginLeft: '8px' }}>
                                    <div style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Layers size={12} /> {modName}
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {groups[modName].map((n, idx) => (
                                        <div 
                                          key={idx} 
                                          onClick={() => handleLoadCoursePath(n.coursePath, n.videoPath)}
                                          style={{ 
                                            background: 'var(--bg-main)', 
                                            border: '1px solid var(--border-color)', 
                                            borderRadius: '6px', 
                                            padding: '12px 16px', 
                                            cursor: 'pointer', 
                                            transition: 'all 0.2s ease' 
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateX(4px)';
                                            e.currentTarget.style.borderColor = 'var(--accent-hover)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateX(0)';
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.background = 'var(--bg-main)';
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 500, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                              <PlayCircle size={14} style={{ color: 'var(--accent-color)' }} /> {n.videoName}
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--accent-color)', fontWeight: 600, opacity: 0.8 }}>
                                              LOAD <ExternalLink size={10} />
                                            </span>
                                          </div>
                                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontStyle: 'italic', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', opacity: 0.8 }}>
                                            "{n.snippet}"
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </section>
          </div>
        )}

        {/* ------------------------------------------
           VIEW 2: PLAYER & DOCKABLE PANELS WORKSPACE
           ------------------------------------------ */}
        {viewMode === 'player' && (
          <>
            {/* Sidebar Container (Conditional) */}
            {showSidebar && (
              <>
                <aside className="sidebar" style={{ width: `${sidebarWidth}px`, flexShrink: 0 }}>
                  <div className="glass-panel sidebar-main-container">
                    
                    <div className="tabs-header sidebar-unified-tabs">
                      <button className={`tab-btn ${sidebarTab === 'contents' ? 'active' : ''}`} onClick={() => setSidebarTab('contents')}>
                        <BookOpen size={14} /> Contents
                      </button>
                      <button className={`tab-btn ${sidebarTab === 'bookmarks' ? 'active' : ''}`} onClick={() => setSidebarTab('bookmarks')}>
                        <Bookmark size={14} /> Bookmarks
                      </button>
                      <button className={`tab-btn ${sidebarTab === 'notes' ? 'active' : ''}`} onClick={() => setSidebarTab('notes')}>
                        <FileText size={14} /> Notes
                      </button>
                    </div>

                    <div className="sidebar-active-content scroll-pane">
                      {sidebarTab === 'contents' && (
                        !courseData ? <div className="empty-state">Course scanning...</div> : (() => {
                          const flatList = getFlatVideos();
                          return Object.entries(courseData.structure).map(([modName, videos]) => (
                            <div key={modName} className="module-item">
                              <div className="section-header" onClick={() => setIsCollapsed(p => ({ ...p, [modName]: !p[modName] }))}>
                                {isCollapsed[modName] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span className="truncate">{modName}</span>
                              </div>
                              {isCollapsed[modName] && (
                                <div className="video-list">
                                  {videos.map((v) => {
                                    const isActive = activeVideo?.path?.normalize() === v.path.normalize();
                                    const flatIdx = flatList.findIndex(x => x.path.normalize() === v.path.normalize());
                                    
                                    // State from structured mapping
                                    const progressObj = videoCompletionMap[v.path];
                                    const prevProgressObj = flatIdx > 0 ? videoCompletionMap[flatList[flatIdx - 1].path] : null;
                                    
                                    const isUnlocked = flatIdx === 0 || !!prevProgressObj?.is_completed;
                                    const isCompleted = !!progressObj?.is_completed;
                                    
                                    // Extract duration from cache if available
                                    const durationMs = progressObj?.duration_ms || 0;
                                    const formattedDuration = durationMs > 0 ? formatTime(durationMs / 1000) : "00:00";
                                    
                                    // Block media streaming completely if simulation selected
                                    const isSimModeBlocked = appMode === 'Simulation';
                                    const itemClickable = isUnlocked && !isSimModeBlocked;
                                    
                                    return (
                                      <div 
                                        className={`video-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${(!itemClickable) ? 'locked' : ''}`} 
                                        key={v.path} 
                                        onClick={() => itemClickable && selectVideo(v)}
                                        title={isSimModeBlocked ? "Videos unavailable in Simulation mode" : !isUnlocked ? "Finish previous lessons to unlock" : ""}
                                      >
                                        {isSimModeBlocked || !isUnlocked ? (
                                          <Lock size={13} style={{ opacity: 0.7 }} />
                                        ) : isCompleted ? (
                                          <CheckCircle2 size={13} style={{ color: '#2ecc71' }} />
                                        ) : (
                                          <PlayCircle size={13} />
                                        )}
                                        <span className="truncate flex-1">{v.name}</span>
                                        <span className="vid-time-badge" style={{ marginLeft: 'auto', opacity: 0.8, paddingLeft: '10px' }}>
                                          {formattedDuration}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ));
                        })()
                      )}

                      {sidebarTab === 'bookmarks' && (
                        <div className="bookmarks-panel">
                          {activeVideo ? (
                            <>
                              <div className="add-bookmark-header"><span className="panel-caption">Drop Mark</span></div>
                              <div className="bookmark-composer">
                                <input type="text" placeholder="Add notes here..." value={newBmText} onChange={e => setNewBmText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddBookmark()}/>
                                <button className="add-bm-btn" onClick={handleAddBookmark}><Plus size={13} /> Add</button>
                              </div>
                              <div className="bookmarks-history-list">
                                {bookmarks.length === 0 ? <div className="empty-notes-msg">No marks.</div> : (
                                  bookmarks.map((bm) => (
                                    <div key={bm.id} className="bm-history-item" onClick={() => { if (videoRef.current) videoRef.current.currentTime = bm.timestamp_ms / 1000; }}>
                                      <div className="bm-item-top">
                                        <span className="bm-stamp"><Clock size={11} /> {formatTime(bm.timestamp_ms / 1000)}</span>
                                        <button className="bm-del-btn" onClick={(e) => handleDeleteBookmark(e, bm.id)}><X size={12} /></button>
                                      </div>
                                      <div className="bm-text">{bm.note}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          ) : <div className="empty-state">Ready.</div>}
                        </div>
                      )}

                      {sidebarTab === 'notes' && (
                        <div className="notes-panel">
                          {activeVideo ? (
                            <>
                              <div className="notes-meta-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="panel-caption">Notebook</span>
                                {pendingNoteVideo ? (
                                  <button 
                                    onClick={handleExplicitSaveNote} 
                                    className="action-btn run" 
                                    title="Click to Save your current notes and switch to next video session!"
                                    style={{ 
                                      padding: '2px 8px', 
                                      fontSize: '0.7rem', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      borderRadius: '4px',
                                      background: 'var(--accent-color)', 
                                      boxShadow: '0 0 8px var(--accent-color)',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Bookmark size={12} fill="currentColor"/> Save Notes
                                  </button>
                                ) : (
                                  <span className="autosave-indicator">Live Auto-saving</span>
                                )}
                              </div>
                              <div className="notes-video-title truncate" style={{ opacity: pendingNoteVideo ? 0.75 : 1 }}>
                                {pendingNoteVideo ? `Writing for: ${noteVideoPath.split(/[/\\]/).pop()}` : activeVideo.name}
                              </div>
                              <textarea className="notes-textarea" placeholder="Insights..." value={videoNote} onChange={(e) => handleNoteChange(e.target.value)} />
                            </>
                          ) : <div className="empty-state">Write.</div>}
                        </div>
                      )}
                    </div>

                    <div className="sidebar-bottom-card">
                      <div className="completion-row">
                        <div className="completion-info"><h3>{stats.completed_videos} / {stats.total_videos} Videos</h3><p>{progressPct}% Completed</p></div>
                        <div className={`trophy-circle ${progressPct >= 100 ? 'active' : ''}`}><Trophy size={24} /></div>
                      </div>
                      <div className="progress-bar-bg-full"><div className="progress-bar-fill-full" style={{ width: `${progressPct}%` }}></div></div>
                    </div>
                  </div>
                </aside>
                <div className="resizer resizer-h" onMouseDown={(e) => startResizing(e, 'sidebar')}></div>
              </>
            )}

            {/* Main Player Stage */}
            <section className="main-stage" style={{ flex: 1 }}>
              <div className="glass-panel player-wrapper" style={{ height: showRefPane ? `${mainSplit}%` : '100%' }} onContextMenu={handleContextMenu}>
                <div className="panel-header compact">
                  <span className="truncate text-dim flex-1 ml-2">{activeVideo ? activeVideo.name : 'Focused Stage Ready'}</span>
                </div>
                <div className="player-container">
                  <video 
                    ref={videoRef} 
                    onTimeUpdate={onTimeUpdate} 
                    onPlay={() => setIsPlaying(true)} 
                    onPause={() => { 
                      setIsPlaying(false); 
                      saveCurrentProgressInstantly(); 
                    }}
                    onEnded={() => {
                      saveCurrentProgressInstantly(true); // Force completed immediately
                      setTimeout(() => {
                        advanceToNextVideoTrack(); // Load next track instantly after 500ms grace period
                      }, 500);
                    }}
                    disableRemotePlayback
                    onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} 
                    onDoubleClick={() => {
                      if (videoRef.current) {
                        if (document.fullscreenElement) {
                          document.exitFullscreen().catch(() => {});
                        } else {
                          videoRef.current.requestFullscreen().catch(() => {});
                        }
                      }
                    }}
                  />
                  {isPipActive && activeVideo && (
                    <div className="pip-active-overlay" style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: 'var(--bg-main)', zIndex: 30, padding: '20px',
                      display: 'flex', flexDirection: 'column', gap: '12px',
                      backgroundImage: 'radial-gradient(circle at top right, rgba(108, 92, 231, 0.15), transparent)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-hover)', fontWeight: 600, fontSize: '0.8rem' }}>
                          <Tv size={15} /> <span>PiP Mode: Active Section Workspace</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {pendingNoteVideo && (
                            <button 
                              className="action-btn run" 
                              onClick={handleExplicitSaveNote} 
                              style={{ 
                                padding: '2px 10px', 
                                fontSize: '0.7rem', 
                                borderRadius: '4px', 
                                background: 'var(--accent-color)', 
                                boxShadow: '0 0 8px var(--accent-color)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              <Bookmark size={11} fill="currentColor"/> Save Workspace Notes
                            </button>
                          )}
                          <button className="action-btn run" style={{ padding: '2px 10px', fontSize: '0.7rem', borderRadius: '4px' }} onClick={() => document.exitPictureInPicture().catch(() => {})}>Return Video</button>
                        </div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
                          {pendingNoteVideo ? `Writing Session: ${noteVideoPath.split(/[/\\]/).pop()}` : activeVideo.name}
                        </h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', margin: '0 0 4px 0' }}>
                          {pendingNoteVideo ? "⚠️ Switch to next session's notes is blocked until you save." : "Visual feed is floating. You can type comprehensive lesson memos in this container space:"}
                        </p>
                        <textarea 
                          className="notes-textarea"
                          placeholder="Write quick markdown insights or paste code outputs here..."
                          style={{ flex: 1, fontSize: '0.78rem', background: 'var(--bg-dashboard-card)', border: '1px solid var(--border-color)' }}
                          value={videoNote}
                          onChange={(e) => handleNoteChange(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  {!activeVideo && (
                    <div className="player-placeholder"><PlayCircle size={40} className="pulse-icon" /><span>Press Sidebar or Footer triggers to load content.</span></div>
                  )}
                  {activeVideo && (
                    <div className="video-controls-overlay">
                      <div className="video-timeline" onClick={(e) => {
                        const r = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.getBoundingClientRect().width;
                        if (videoRef.current) videoRef.current.currentTime = videoRef.current.duration * r;
                      }}>
                        <div className="timeline-filled" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}><div className="timeline-handle"></div></div>
                      </div>
                      <div className="control-row">
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>
                            {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                          </button>
                          
                          <button title="Rewind 10s" onClick={handleSeekBackward10} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer', opacity: 0.85 }}>
                            <RotateCcw size={16} />
                          </button>
                          
                          <button title="Fast-Forward 10s" onClick={handleSeekForward10} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer', opacity: 0.85 }}>
                            <RotateCw size={16} />
                          </button>

                          <span className="timestamp" style={{ marginLeft: '4px', fontSize: '0.75rem', opacity: 0.9, letterSpacing: '0.2px' }}>
                            {formatTime(currentTime)} / {formatTime(duration)}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <button title="Mute Toggle" onClick={() => { if(videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>
                            <Volume2 size={16} />
                          </button>

                          <button 
                            onClick={cyclePlaybackRate}
                            title="Playback Speed"
                            style={{ 
                              background: 'rgba(255,255,255,0.1)', 
                              border: 'none', 
                              color: 'var(--text-main)', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem', 
                              padding: '3px 8px', 
                              cursor: 'pointer', 
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                          >
                            {playbackRate.toFixed(1)}x
                          </button>

                          <button 
                            title="Floating PiP Mode" 
                            onClick={() => {
                              if (document.pictureInPictureElement) {
                                document.exitPictureInPicture().catch(console.error);
                              } else {
                                videoRef.current?.requestPictureInPicture().catch(console.error);
                              }
                            }} 
                            style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer' }}
                          >
                            <Tv size={16} />
                          </button>

                          <button title="Video Settings" onClick={() => alert("Codec: H.264 / AVC1\nHardware Acceleration: Enabled")} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>
                            <Settings size={16} />
                          </button>

                          <button title="Fullscreen" onClick={() => videoRef.current?.requestFullscreen()} style={{ background: 'none', border: 'none', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>
                            <Maximize size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lesson Overview */}
              {showRefPane && (
                <>
                  <div className="resizer resizer-v" onMouseDown={(e) => startResizing(e, 'mainSplit')}></div>
                  <div className="glass-panel stage-info-view" style={{ flex: 1, height: `${100 - mainSplit}%` }}>
                    <div className="panel-header"><span>Reference Material</span></div>
                    <div className="stage-content">
                      {activeVideo ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <h3 style={{ color: 'var(--accent-hover)', fontSize: '0.95rem' }}>{activeVideo.name}</h3>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Context linked. Write code in IDE relative to this lesson.</p>
                        </div>
                      ) : <div className="empty-state">Waiting...</div>}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Right Workspace Pane (Conditional) */}
            {showWorkspace && (
              <>
                <div className="resizer resizer-h" onMouseDown={(e) => startResizing(e, 'rightPane')}></div>
                <section className="workspace-pane" style={{ width: `${rightPaneWidth}px`, flexShrink: 0 }}>
                  
                  {/* MONACO MULTI-FILE IDE */}
                  <div className="glass-panel editor-panel" style={{ height: showTerminal ? `${rightSplit}%` : '100%' }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      
                      {/* LHS: Dynamically render Open File Tabs (Fulfills "remove python" & replaces with File tabs) */}
                      <div className="editor-header-tabs" style={{ display: 'flex', gap: '4px', overflowX: 'auto', maxWidth: '70%' }}>
                        {openFiles.map((f, idx) => (
                          <div key={idx} className={`editor-tab-pill ${activeFileIdx === idx ? 'active' : ''}`} onClick={() => setActiveFileIdx(idx)}>
                            <span className="tab-name truncate" style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {f.name}
                              {f.isDirty && <span className="dirty-dot" title="Unsaved changes"></span>}
                            </span>
                            {openFiles.length > 1 && (
                              <button className="close-tab-x" onClick={(e) => handleCloseFile(e, idx)}><X size={10} /></button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* RHS: Stylized "Add File" and "Run" (Fulfills "add file button on rhs") */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="header-util-btn action-add-file" onClick={handleAddNewFile} title="Create New File Tab">
                          <Plus size={12} /> Add
                        </button>
                        <button onClick={handleExecuteCode} disabled={isRunning} className="action-btn run">
                          {isRunning ? <Loader2 className="animate-spin" size={11} /> : <Play size={11} fill="currentColor" />} Run
                        </button>
                      </div>
                    </div>

                    <div className="editor-area">
                      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Initializing Core IDE...</div>}>
                        <Editor 
                          height="100%" 
                          language={openFiles[activeFileIdx].name.endsWith('.py') ? 'python' : 'javascript'} 
                          theme={theme === 'light' ? 'vs' : 'vs-dark'} 
                          value={openFiles[activeFileIdx].content} 
                          onChange={handleCodeChange} 
                          onMount={handleEditorDidMount}
                          options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }} 
                        />
                      </Suspense>
                    </div>
                  </div>

                  {/* Console logs */}
                  {showTerminal && (
                    <>
                      <div className="resizer resizer-v" onMouseDown={(e) => startResizing(e, 'rightSplit')}></div>
                      <div className="glass-panel terminal-container" style={{ flex: 1, height: `${100 - rightSplit}%` }}>
                        <div className="terminal-header-tabs">
                          <div style={{ display: 'flex', flex: 1 }}>
                            <button className={`terminal-tab ${termTab === 'output' ? 'active' : ''}`} onClick={() => setTermTab('output')}>Output</button>
                            <button className={`terminal-tab ${termTab === 'terminal' ? 'active' : ''}`} onClick={() => setTermTab('terminal')}>Terminal</button>
                            <button className={`terminal-tab ${termTab === 'console' ? 'active' : ''}`} onClick={() => setTermTab('console')}>Console</button>
                          </div>
                          <div className="terminal-actions">
                            <button onClick={() => { if (termTab === 'output') setOutputLogs([]); }}><Trash2 size={13} /></button>
                            <button><ExternalLink size={13} /></button><button><Maximize2 size={13} /></button>
                          </div>
                        </div>
                        <div className="terminal-content-body">
                          {termTab === 'output' && (
                            <div className="tab-scroller log-list">
                              {outputLogs.length === 0 ? <div className="log-placeholder">Ready.</div> : outputLogs.map((log, i) => <div key={i} className={`log-entry type-${log.type}`}>{log.text}</div>)}
                            </div>
                          )}
                          {termTab === 'terminal' && (
                            <div className="tab-scroller shell-terminal">
                              <div className="shell-history">{terminalHistory.map((h, i) => <div key={i} className={`shell-line ${h.type}`}>{h.text}</div>)}</div>
                              <div className="shell-input-row"><span className="prompt">$</span><input type="text" value={termInputVal} onChange={e => setTermInputVal(e.target.value)} onKeyDown={handleTerminalKeyDown} placeholder="Exec..." /></div>
                            </div>
                          )}
                          {termTab === 'console' && (
                            <div className="tab-scroller log-list console-log">
                              <div className="log-entry console-info">[{new Date().toLocaleTimeString()}] Terminal initialized. Ready.</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {/* ------------------------------------------
           VIEW 3: GORGEOUS SYSTEM SETTINGS
           ------------------------------------------ */}
        {viewMode === 'settings' && (
          <div className="dashboard-viewport settings-viewport" style={{ display: 'flex', flex: 1, flexDirection: 'column', padding: '40px', gap: '24px', overflowY: 'auto' }}>
            <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="header-icon-btn back-dashboard" onClick={() => setViewMode('dashboard')} title="Back to Dashboard" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
                  <ChevronLeft size={18} />
                </button>
                <h2 style={{ fontSize: '1.4rem', fontWeight: '600', color: 'var(--text-main)' }}>Application Preferences</h2>
              </div>
            </div>

            <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', maxWidth: '1000px' }}>
              <div className="settings-card" style={{ background: 'var(--bg-dashboard-card)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--accent-hover)' }}>Appearance Mode</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>Switch between standard Dark and Crisp Light skins. These map directly into Monaco code themes.</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="action-btn" style={{ flex: 1, background: theme === 'dark' ? 'var(--accent-color)' : 'var(--bg-hover)', color: theme === 'dark' ? '#fff' : 'inherit', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '6px' }} onClick={() => setTheme('dark')}>Slate Dark</button>
                  <button className="action-btn" style={{ flex: 1, background: theme === 'light' ? 'var(--accent-color)' : 'var(--bg-hover)', color: theme === 'light' ? '#fff' : 'inherit', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '6px' }} onClick={() => setTheme('light')}>Crisp Light</button>
                </div>
              </div>

              <div className="settings-card" style={{ background: 'var(--bg-dashboard-card)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--accent-hover)' }}>Default Video Ratio</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>Initialize visual splits. Slide ratio allows optimizing reading vs playback stage scaling.</p>
                <input type="range" min="20" max="80" value={mainSplit} onChange={e => setMainSplit(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-color)', height: '6px', borderRadius: '3px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '12px' }}>
                  <span>Scale Player (60:40)</span>
                  <span>{Math.round(mainSplit)}% Height</span>
                </div>
              </div>
              
              <div className="settings-card" style={{ background: 'var(--bg-dashboard-card)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--accent-hover)' }}>Local Settings DB</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>Synchronize SQLite file markers, wipe local preferences, or force active database schema check.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button className="action-btn" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)', width: '100%', padding: '10px', border: '1px solid var(--accent-color)', borderRadius: '6px' }} onClick={() => { refreshRecentWorkspaces(); window.alert("SQLite environment cache synchronized successfully!"); }}>
                    Synchronize SQLite Local Records
                  </button>
                  <button className="action-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', width: '100%', padding: '10px', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px' }} onClick={() => { localStorage.clear(); window.alert("Cleared temporary session localStorages."); }}>
                    Purge Session Memory
                  </button>
                  <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }}></div>
                  <button className="action-btn" style={{ background: 'var(--bg-hover)', color: 'var(--text-main)', width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} onClick={handleResetDefaults}>
                    Restore Layout Defaults
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* CUSTOM CONTEXT MENU */}
      {contextMenu && (
        <div className="custom-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="menu-header">Configuration Menu</div>
          <button className="menu-item" onClick={() => setShowSidebar(!showSidebar)}>{showSidebar ? '✓ Hide Sidebar' : 'Show Sidebar'} <span className="shortcut">Ctrl+B</span></button>
          <button className="menu-item" onClick={() => setShowRefPane(!showRefPane)}>{showRefPane ? '✓ Hide Reference' : 'Show Reference'} <span className="shortcut">Ctrl+I</span></button>
          <button className="menu-item" onClick={() => setShowWorkspace(!showWorkspace)}>{showWorkspace ? '✓ Hide IDE Editor' : 'Show IDE Editor'} <span className="shortcut">Ctrl+E</span></button>
          <button className="menu-item" onClick={() => setShowTerminal(!showTerminal)}>{showTerminal ? '✓ Hide Terminal' : 'Show Terminal'} <span className="shortcut">Ctrl+J</span></button>
          <div className="menu-divider"></div>
          <button className="menu-item danger" onClick={() => { setShowSidebar(false); setShowWorkspace(false); setShowRefPane(false); setShowTerminal(false); }}>Maximize Video Focus <span className="shortcut">Esc</span></button>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bottom-bar">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="status-indicator"><div className="status-dot green"></div><span style={{ fontSize: '0.72rem', color: '#bbb' }}>Ready</span></div>
          {viewMode === 'player' && (
            <>
              <div className="footer-divider"></div><span className="text-dim" style={{ fontSize: '0.7rem' }}>Sandbox V8</span>
              <div className="footer-divider"></div><div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#bbb' }}><FolderOpen size={12} /> Workspace: {courseData ? courseData.path.split(/[\\\/]/).pop() : 'Scanning'}</div>
            </>
          )}
        </div>

        {viewMode === 'player' ? (
          <div className="footer-actions-dock">
            <button className={`footer-dock-btn ${showSidebar ? 'active' : ''}`} onClick={() => setShowSidebar(!showSidebar)}><PanelLeftClose size={15} /> Sidebar</button>
            <button className={`footer-dock-btn ${showRefPane ? 'active' : ''}`} onClick={() => setShowRefPane(!showRefPane)}><LayoutPanelTop size={15} /> Overview</button>
            <button className={`footer-dock-btn ${showWorkspace ? 'active' : ''}`} onClick={() => setShowWorkspace(!showWorkspace)}><Code2 size={15} /> Editor</button>
            <button className={`footer-dock-btn ${showTerminal ? 'active' : ''}`} onClick={() => setShowTerminal(!showTerminal)}><Terminal size={15} /> Console</button>
          </div>
        ) : (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Dashboard Environment Ready. Click recent item or folder to enter Workspace.</div>
        )}
      </footer>
      </div>
    </div>
  );
}

export default App;

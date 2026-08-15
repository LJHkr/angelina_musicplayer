"use client";

import { type CSSProperties, ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  url: string;
  size: number;
  lastModified: number;
  filePath?: string;
};

type DesktopFileDescriptor = {
  name: string;
  url: string;
  size: number;
  lastModified: number;
  filePath?: string;
};

type PersistedTrack = Pick<Track, "id" | "title" | "artist" | "size" | "lastModified"> & {
  filePath: string;
};

type SavedLibrary = {
  tracks: Track[];
  currentTrackId: string | null;
  missingCount: number;
};

type InkTuneDesktopApi = {
  chooseAudioFiles: () => Promise<DesktopFileDescriptor[]>;
  describeDroppedFile: (file: File) => Promise<DesktopFileDescriptor | null>;
  loadLibrary: () => Promise<SavedLibrary>;
  saveLibrary: (memory: { tracks: PersistedTrack[]; currentTrackId: string | null }) => Promise<boolean>;
  toggleAlwaysOnTop: () => Promise<boolean>;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
};

declare global {
  interface Window {
    inkTuneDesktop?: InkTuneDesktopApi;
  }
}

const BAR_COUNT = 17;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function trackDetails(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const chunks = base.split(/\s+-\s+/);
  if (chunks.length > 1) {
    return { artist: chunks[0], title: chunks.slice(1).join(" - ") };
  }
  return { title: base || "未命名曲目", artist: "本地收藏" };
}

export default function Player() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.78);
  const [muted, setMuted] = useState(false);
  const [loopMode, setLoopMode] = useState<0 | 1 | 2>(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("选一首本地音乐，让纸上的线条跳起来");
  const [isDesktop, setIsDesktop] = useState(false);
  const [uiScale, setUiScale] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frequencyRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const autoplayNextRef = useRef(false);
  const libraryReadyRef = useRef(false);

  const currentTrack = tracks[currentIndex] ?? null;
  const hasTrack = Boolean(currentTrack);

  const title = currentTrack?.title ?? "轻重力";
  const artist = currentTrack?.artist ?? "Angelina · Rhodes Island";

  useEffect(() => {
    if (!window.inkTuneDesktop) return;

    const updateScale = () => {
      const widthScale = (window.innerWidth - 24) / 476;
      const heightScale = (window.innerHeight - 24) / 830;
      setUiScale(Math.max(0.62, Math.min(1.38, widthScale, heightScale)));
    };

    const firstFrame = window.requestAnimationFrame(() => {
      setIsDesktop(true);
      updateScale();
    });
    window.addEventListener("resize", updateScale);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  useEffect(() => {
    const desktopApi = window.inkTuneDesktop;
    if (!desktopApi) return;

    let cancelled = false;
    void desktopApi.loadLibrary().then((memory) => {
      if (cancelled) return;
      libraryReadyRef.current = true;
      setTracks(memory.tracks);
      const restoredIndex = memory.currentTrackId
        ? memory.tracks.findIndex((track) => track.id === memory.currentTrackId)
        : 0;
      setCurrentIndex(restoredIndex >= 0 ? restoredIndex : 0);

      if (memory.tracks.length > 0) {
        const missingHint = memory.missingCount > 0 ? `，另有 ${memory.missingCount} 首文件已移动或删除` : "";
        setNotice(`已恢复 ${memory.tracks.length} 首本地音乐${missingHint}`);
      } else if (memory.missingCount > 0) {
        setNotice(`之前的 ${memory.missingCount} 首音乐已移动或删除，请重新选择`);
      }
    }).catch(() => {
      if (cancelled) return;
      libraryReadyRef.current = true;
      setNotice("曲库记忆读取失败，本次仍可正常添加音乐");
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const desktopApi = window.inkTuneDesktop;
    if (!desktopApi || !libraryReadyRef.current) return;

    const persistentTracks: PersistedTrack[] = tracks.flatMap((track) => track.filePath ? [{
      id: track.id,
      title: track.title,
      artist: track.artist,
      filePath: track.filePath,
      size: track.size,
      lastModified: track.lastModified,
    }] : []);
    const currentTrackId = tracks[currentIndex]?.id ?? null;

    void desktopApi.saveLibrary({ tracks: persistentTracks, currentTrackId }).catch(() => {
      setNotice("曲库记忆保存失败，请检查应用数据目录权限");
    });
  }, [currentIndex, tracks]);

  const appendSources = useCallback((sources: DesktopFileDescriptor[]) => {
    if (!sources.length) {
      setNotice("没有识别到可读取的音频文件");
      return;
    }

    const incoming: Track[] = sources.map((source) => ({
      id: `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`,
      url: source.url,
      size: source.size,
      lastModified: source.lastModified,
      filePath: source.filePath,
      ...trackDetails(source.name),
    }));

    setTracks((previous) => [...previous, ...incoming]);
    setNotice(`已收进 ${incoming.length} 首音乐，关闭后也会记住`);
    setLibraryOpen(true);
  }, []);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("audio/") || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(file.name),
    );

    if (!files.length) {
      setNotice("没有识别到音频文件，试试 MP3、WAV 或 FLAC");
      return;
    }

    const desktopApi = window.inkTuneDesktop;
    if (desktopApi) {
      try {
        const descriptors = (await Promise.all(files.map((file) => desktopApi.describeDroppedFile(file))))
          .filter((item): item is DesktopFileDescriptor => Boolean(item));
        appendSources(descriptors);
      } catch {
        setNotice("无法读取拖入文件的本地路径，请改用选择本地音乐按钮");
      }
      return;
    }

    const descriptors = files.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return { name: file.name, url, size: file.size, lastModified: file.lastModified };
    });
    appendSources(descriptors);
  }, [appendSources]);

  const chooseLocalMusic = useCallback(async () => {
    const desktopApi = window.inkTuneDesktop;
    if (!desktopApi) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const descriptors = await desktopApi.chooseAudioFiles();
      if (descriptors.length) appendSources(descriptors);
    } catch {
      setNotice("打开本地文件选择器失败，请重新尝试");
    }
  }, [appendSources]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      audioContextRef.current?.close();
    };
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      frequencyRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  const startPlaying = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      void chooseLocalMusic();
      return;
    }

    try {
      await ensureAudioGraph();
      await audio.play();
      setNotice("节拍已点亮");
    } catch {
      setNotice("这个文件暂时无法播放");
    }
  }, [chooseLocalMusic, currentTrack, ensureAudioGraph]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      void chooseLocalMusic();
      return;
    }
    if (audio.paused) void startPlaying();
    else audio.pause();
  }, [chooseLocalMusic, currentTrack, startPlaying]);

  const changeTrack = useCallback((nextIndex: number, autoplay = true) => {
    if (!tracks.length) return;
    const normalized = (nextIndex + tracks.length) % tracks.length;
    if (normalized === currentIndex) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (autoplay) void startPlaying();
      return;
    }
    autoplayNextRef.current = autoplay;
    setCurrentIndex(normalized);
    setCurrentTime(0);
    if (autoplay) setPlaying(true);
  }, [currentIndex, startPlaying, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = currentTrack.url;
    audio.load();
    if (autoplayNextRef.current) {
      autoplayNextRef.current = false;
      const timer = window.setTimeout(() => void startPlaying(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [currentTrack, startPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [muted, volume]);

  useEffect(() => {
    let animationFrame = 0;
    const tick = () => {
      const analyser = analyserRef.current;
      const data = frequencyRef.current;
      let bass = 0;

      if (playing && analyser && data) {
        analyser.getByteFrequencyData(data);
        for (let index = 0; index < BAR_COUNT; index += 1) {
          const sampleIndex = Math.min(data.length - 1, Math.floor(index * data.length / (BAR_COUNT * 2.3)));
          const value = data[sampleIndex] ?? 0;
          const shaped = 10 + Math.pow(value / 255, 1.38) * 60;
          if (index < 5) bass += value;
          barRefs.current[index]?.style.setProperty("height", `${shaped}px`);
        }
        bass /= 5;
      } else {
        const now = performance.now() / 520;
        for (let index = 0; index < BAR_COUNT; index += 1) {
          const idle = 10 + (Math.sin(now + index * 0.74) + 1) * 4.5;
          barRefs.current[index]?.style.setProperty("height", `${idle}px`);
        }
      }

      const energy = bass / 255;
      const beat = playing ? 1 + energy * 0.09 : 1;
      const rhythmEnergy = Math.max(0, Math.min(1, (energy - 0.1) / 0.9));
      const swayResponse = Math.pow(rhythmEnergy, 1.55);
      const sway = playing ? Math.sin(performance.now() / 175) * swayResponse * 9 : 0;
      const lift = playing ? -energy * 5.5 : 0;
      const glow = playing ? 0.08 + energy * 0.48 : 0.08;
      playerRef.current?.style.setProperty("--beat", beat.toFixed(4));
      playerRef.current?.style.setProperty("--sway", sway.toFixed(3) + "deg");
      playerRef.current?.style.setProperty("--lift", lift.toFixed(3) + "px");
      playerRef.current?.style.setProperty("--glow", glow.toFixed(3));
      animationFrame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(animationFrame);
  }, [playing]);

  const onEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loopMode === 2) {
      audio.currentTime = 0;
      void startPlaying();
    } else if (currentIndex < tracks.length - 1 || loopMode === 1) {
      changeTrack(currentIndex + 1);
    } else {
      setPlaying(false);
      setNotice("这本小曲册已经听完了");
    }
  }, [changeTrack, currentIndex, loopMode, startPlaying, tracks.length]);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const next = await window.inkTuneDesktop?.toggleAlwaysOnTop();
      if (typeof next === "boolean") setAlwaysOnTop(next);
    } catch {
      setNotice("置顶设置失败，请重新打开播放器再试");
    }
  }, []);

  const toggleLiked = () => {
    if (!currentTrack) return;
    setLiked((previous) => {
      const next = new Set(previous);
      if (next.has(currentTrack.id)) next.delete(currentTrack.id);
      else next.add(currentTrack.id);
      return next;
    });
  };

  const loopLabel = useMemo(() => ["循环关闭", "列表循环", "单曲循环"][loopMode], [loopMode]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === "ArrowRight" && audioRef.current) {
        audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 5);
      }
      if (event.code === "ArrowLeft" && audioRef.current) {
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duration, togglePlay]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    void addFiles(event.dataTransfer.files);
  };

  return (
    <main
      className={[
        "page-shell",
        dragActive ? "is-dragging" : "",
        isDesktop ? "desktop-shell" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--ui-scale": uiScale } as CSSProperties}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={onDrop}
    >
      <div
        className="player-stage"
        style={isDesktop ? { width: 476 * uiScale, height: 830 * uiScale } : undefined}
      >
        <section ref={playerRef} className="player-card" aria-label="手绘音乐播放器">
        <header className={isDesktop ? "topbar window-drag-region" : "topbar"}>
          <div>
            <p className="eyebrow">NOW SPINNING</p>
            <h1>InkTune<span className="title-dot">·</span></h1>
          </div>
          <div className="top-actions window-no-drag">
            {isDesktop && (
              <div className="window-controls" aria-label="窗口控制">
                <button
                  type="button"
                  className={`window-pin ${alwaysOnTop ? "active" : ""}`}
                  onClick={() => void toggleAlwaysOnTop()}
                  aria-label={alwaysOnTop ? "取消保持置顶" : "保持窗口置顶"}
                  aria-pressed={alwaysOnTop}
                  title={alwaysOnTop ? "取消置顶" : "保持置顶"}
                >
                  ⇧
                </button>
                <button type="button" onClick={() => window.inkTuneDesktop?.minimize()} aria-label="最小化窗口" title="最小化">—</button>
                <button type="button" className="window-maximize" onClick={() => window.inkTuneDesktop?.toggleMaximize()} aria-label="最大化或还原窗口" title="最大化或还原">□</button>
                <button type="button" className="window-close" onClick={() => window.inkTuneDesktop?.close()} aria-label="关闭窗口" title="关闭">×</button>
              </div>
            )}
            <label className="volume-control" title="音量">
              <button type="button" className="sound-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "打开声音" : "静音"}>
                {muted || volume === 0 ? "♩" : "♫"}
              </button>
              <input aria-label="音量" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} />
            </label>
            <button type="button" className="sketch-button menu-button" onClick={() => setLibraryOpen((value) => !value)} aria-label="打开曲库" aria-expanded={libraryOpen}>
              <span /><span /><span />
            </button>
          </div>
        </header>

        <div className="cover-wrap">
          <div className="cover-pulse">
            {/* The same relative asset path works in both the website preview and packaged desktop app. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="./angelina-album.png" alt="明日方舟安洁莉娜手绘封面" draggable={false} />
          </div>
          <span className="cover-tape tape-one" />
          <span className="cover-tape tape-two" />
          <div className="floating-note note-one">♪</div>
          <div className="floating-note note-two">♫</div>
          <span className={`status-sticker ${playing ? "live" : ""}`}>{playing ? "LIVE" : "LOCAL"}</span>
        </div>

        <div className="song-row">
          <div className="song-copy">
            <p className="song-title" title={title}>{title}</p>
            <p className="artist">{artist}</p>
          </div>
          <button type="button" className={`heart-button ${currentTrack && liked.has(currentTrack.id) ? "liked" : ""}`} onClick={toggleLiked} disabled={!currentTrack} aria-label="收藏歌曲">
            {currentTrack && liked.has(currentTrack.id) ? "♥" : "♡"}
          </button>
        </div>

        <div className={`visualizer ${playing ? "is-playing" : ""}`} aria-label="实时音频可视化">
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <i key={index} ref={(node) => { barRefs.current[index] = node; }} />
          ))}
        </div>

        <div className="progress-area">
          <input
            className="progress-range"
            aria-label="播放进度"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(currentTime, duration || 0)}
            disabled={!hasTrack}
            style={{ "--progress": duration ? `${(currentTime / duration) * 100}%` : "0%" } as CSSProperties}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = value;
              setCurrentTime(value);
            }}
          />
          <div className="time-row"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>

        <div className="controls">
          <button type="button" className={`sketch-button small-control loop-control mode-${loopMode}`} onClick={() => setLoopMode((value) => ((value + 1) % 3) as 0 | 1 | 2)} aria-label={loopLabel} title={loopLabel}>
            ↻{loopMode === 2 && <sup>1</sup>}
          </button>
          <button type="button" className="sketch-button small-control" onClick={() => changeTrack(currentIndex - 1, playing)} disabled={!hasTrack} aria-label="上一首">
            ◀<span className="skip-mark" />
          </button>
          <button type="button" className={`play-button ${playing ? "is-playing" : ""}`} onClick={togglePlay} aria-label={playing ? "暂停" : "播放"}>
            {playing ? <span className="pause-glyph">II</span> : "▶"}
          </button>
          <button type="button" className="sketch-button small-control" onClick={() => changeTrack(currentIndex + 1, playing)} disabled={!hasTrack} aria-label="下一首">
            ▶<span className="skip-mark right" />
          </button>
          <button type="button" className={`sketch-button small-control queue-button ${libraryOpen ? "active" : ""}`} onClick={() => setLibraryOpen((value) => !value)} aria-label="播放列表">≡</button>
        </div>

        <button type="button" className="local-pill" onClick={() => void chooseLocalMusic()}>+ 选择本地音乐</button>
        <input ref={fileInputRef} className="file-input" type="file" accept="audio/*,.flac,.m4a,.aac,.ogg,.opus" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ""; }} />
        <p className="hint">{notice}</p>

        <aside className={`library-drawer ${libraryOpen ? "open" : ""}`} aria-hidden={!libraryOpen}>
          <div className="drawer-handle" />
          <div className="library-heading">
            <div>
              <p className="eyebrow">YOUR POCKET MIXTAPE</p>
              <h2>本地曲库 <span>{tracks.length}</span></h2>
            </div>
            <button type="button" onClick={() => setLibraryOpen(false)} aria-label="关闭曲库">×</button>
          </div>
          {tracks.length ? (
            <div className="track-list">
              {tracks.map((track, index) => (
                <button type="button" key={track.id} className={index === currentIndex ? "current" : ""} onClick={() => { changeTrack(index); setLibraryOpen(false); }}>
                  <span className="track-number">{index === currentIndex && playing ? "♫" : String(index + 1).padStart(2, "0")}</span>
                  <span className="track-meta"><strong>{track.title}</strong><small>{track.artist}</small></span>
                  <span className="track-size">{(track.size / 1024 / 1024).toFixed(1)} MB</span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="empty-library" onClick={() => void chooseLocalMusic()}>
              <span>♫</span>
              把音乐拖到这里
              <small>或点击选择文件</small>
            </button>
          )}
        </aside>

        {/* This element plays music only, so a captions track is not applicable. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onEnded={onEnded}
          onError={() => currentTrack && setNotice("音频加载失败，文件可能已被移动、删除或格式不受支持")}
        />
        </section>
      </div>

      <div className="drop-curtain" aria-hidden="true">
        <span>♫</span>
        <strong>松手即收藏</strong>
        <small>你的音乐不会离开这台设备</small>
      </div>
    </main>
  );
}

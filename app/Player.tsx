"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  file: File;
  url: string;
};

const BAR_COUNT = 17;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function trackDetails(file: File) {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
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

  const currentTrack = tracks[currentIndex] ?? null;
  const hasTrack = Boolean(currentTrack);

  const title = currentTrack?.title ?? "桃色余韵";
  const artist = currentTrack?.artist ?? "Orange Daydreams";

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("audio/") || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(file.name),
    );

    if (!files.length) {
      setNotice("没有识别到音频文件，试试 MP3、WAV 或 FLAC");
      return;
    }

    const incoming = files.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return { id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file, url, ...trackDetails(file) };
    });

    setTracks((previous) => {
      if (previous.length === 0) setCurrentIndex(0);
      return [...previous, ...incoming];
    });
    setNotice(`已收进 ${incoming.length} 首音乐`);
    setLibraryOpen(true);
  }, []);

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
      fileInputRef.current?.click();
      return;
    }

    try {
      await ensureAudioGraph();
      await audio.play();
      setNotice("节拍已点亮");
    } catch {
      setNotice("这个文件暂时无法播放");
    }
  }, [currentTrack, ensureAudioGraph]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      fileInputRef.current?.click();
      return;
    }
    if (audio.paused) void startPlaying();
    else audio.pause();
  }, [currentTrack, startPlaying]);

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

      const beat = playing ? 1 + (bass / 255) * 0.022 : 1;
      const glow = playing ? 0.08 + (bass / 255) * 0.34 : 0.08;
      playerRef.current?.style.setProperty("--beat", beat.toFixed(4));
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
    addFiles(event.dataTransfer.files);
  };

  return (
    <main
      className={`page-shell ${dragActive ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={onDrop}
    >
      <section ref={playerRef} className="player-card" aria-label="手绘音乐播放器">
        <header className="topbar">
          <div>
            <p className="eyebrow">NOW SPINNING</p>
            <h1>InkTune<span className="title-dot">·</span></h1>
          </div>
          <div className="top-actions">
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
            <Image src="/fox-album.png" alt="戴着耳机的狐耳少女手绘封面" width={1024} height={1024} priority />
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
            style={{ "--progress": duration ? `${(currentTime / duration) * 100}%` : "0%" } as React.CSSProperties}
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

        <button type="button" className="local-pill" onClick={() => fileInputRef.current?.click()}>+ 选择本地音乐</button>
        <input ref={fileInputRef} className="file-input" type="file" accept="audio/*,.flac,.m4a,.aac,.ogg,.opus" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
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
                  <span className="track-size">{(track.file.size / 1024 / 1024).toFixed(1)} MB</span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="empty-library" onClick={() => fileInputRef.current?.click()}>
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
          onError={() => currentTrack && setNotice("音频加载失败，可以换个格式试试")}
        />
      </section>

      <div className="drop-curtain" aria-hidden="true">
        <span>♫</span>
        <strong>松手即收藏</strong>
        <small>你的音乐不会离开这台设备</small>
      </div>
    </main>
  );
}

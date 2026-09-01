import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleHelp,
  Film,
  FolderOpen,
  Gauge,
  HardDrive,
  ImagePlus,
  Layers3,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  Pause,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetRenderDownloadQueryKey,
  getGetRenderHealthQueryKey,
  getGetRenderQueryKey,
  getGetSourceQueryKey,
  getListSourcesQueryKey,
  useCancelRender,
  useCreateRender,
  useCreateSource,
  useGetRender,
  useGetRenderDownload,
  useGetRenderHealth,
  useGetSource,
  useListSources,
  type RenderInput,
  type SourceImage,
} from '@workspace/api-client-react';
import { calculateTimeline } from '@workspace/contactreel-core';

type LocalImage = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
};

type Format = RenderInput['format'];
type Quality = RenderInput['quality'];
type Sequence = RenderInput['sequence'];

const formatOptions: { value: Format; label: string; shape: string }[] = [
  { value: '9:16', label: 'PORTRAIT', shape: '9 / 16' },
  { value: '1:1', label: 'SQUARE', shape: '1 / 1' },
  { value: '16:9', label: 'LANDSCAPE', shape: '16 / 9' },
];

const qualityOptions: { value: Quality; label: string; detail: string }[] = [
  { value: 'draft', label: 'DRAFT', detail: 'fast preview' },
  { value: 'high', label: 'HIGH', detail: 'balanced' },
  { value: 'maximum', label: 'MAXIMUM', detail: 'final master' },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 120);
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function HealthStrip() {
  const health = useGetRenderHealth({
    query: { queryKey: getGetRenderHealthQueryKey(), refetchInterval: 10000 },
  });
  const value = health.data;
  const healthy = value?.status === 'ok';
  const unavailable = health.isError;

  return (
    <div className="flex items-center gap-3 text-[10px] mono" data-testid="status-render-health">
      <span className={`status-dot ${unavailable ? 'error' : healthy ? 'ok' : 'warn'}`} />
      <span className="uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
        {health.isLoading ? 'CHECKING RENDER NODE' : unavailable ? 'RENDER NODE OFFLINE' : healthy ? 'RENDER NODE READY' : 'RENDER NODE DEGRADED'}
      </span>
      {value && (
        <span className="hidden text-[hsl(var(--muted-foreground))] sm:inline">
          Q{value.queueDepth.toString().padStart(2, '0')} / FFMPEG {value.ffmpeg ? 'ON' : 'OFF'}
        </span>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-8 w-8 items-center justify-center border border-[hsl(var(--primary)/.7)] bg-[hsl(var(--primary)/.08)]">
        <span className="absolute h-3 w-3 border border-[hsl(var(--primary))]" />
        <span className="absolute h-1.5 w-1.5 bg-[hsl(var(--accent))]" />
      </div>
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.04em]">contact<span className="text-[hsl(var(--primary))]">reel</span></div>
        <div className="eyebrow mt-0.5">render console / 01</div>
      </div>
    </div>
  );
}

function LocalUpload({
  localImages,
  sourceName,
  setSourceName,
  onFiles,
  onRemove,
  onCreate,
  isCreating,
}: {
  localImages: LocalImage[];
  sourceName: string;
  setSourceName: (value: string) => void;
  onFiles: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="console-card p-3" data-testid="section-local-upload">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="eyebrow text-[hsl(var(--primary))]">new source</div>
          <h2 className="mt-1 text-sm font-semibold tracking-[-0.02em]">Load a photo roll</h2>
        </div>
        <ImagePlus size={16} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <button
        type="button"
        className="group flex w-full flex-col items-center justify-center border border-dashed border-[hsl(var(--border))] bg-[hsl(28_11%_8%)] px-3 py-6 text-center transition-colors hover:border-[hsl(var(--primary)/.7)] hover:bg-[hsl(var(--primary)/.04)]"
        onClick={() => fileRef.current?.click()}
        data-testid="button-open-photo-picker"
      >
        <Upload size={17} className="mb-2 text-[hsl(var(--primary))] transition-transform group-hover:-translate-y-0.5" />
        <span className="mono text-[11px] text-[hsl(var(--foreground))]">DROP FRAMES OR BROWSE</span>
        <span className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">JPEG, PNG, WEBP / up to 100 images</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => onFiles(event.target.files)}
        data-testid="input-photo-files"
      />
      {localImages.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {localImages.map((image) => (
              <div key={image.id} className="group relative source-thumb" data-testid={`thumb-local-${image.id}`}>
                <img src={image.url} alt={image.file.name} />
                <button
                  type="button"
                  aria-label={`Remove ${image.file.name}`}
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center bg-[hsl(30_11%_7%/.9)] text-[hsl(var(--foreground))] group-hover:flex"
                  onClick={() => onRemove(image.id)}
                  data-testid={`button-remove-local-${image.id}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            <label className="field-label" htmlFor="source-name">source label</label>
            <input id="source-name" className="console-input" value={sourceName} onChange={(event) => setSourceName(event.target.value)} maxLength={120} placeholder="e.g. launch-stills-01" data-testid="input-source-name" />
            <button type="button" className="console-button primary w-full" onClick={onCreate} disabled={!sourceName.trim() || isCreating} data-testid="button-create-source">
              {isCreating ? <Loader2 size={14} className="animate-spin" /> : <LockKeyhole size={14} />}
              {isCreating ? 'UPLOADING SOURCE' : `LOCK ${localImages.length} FRAMES`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SourceRail({
  sources,
  isLoading,
  isError,
  selectedId,
  onSelect,
  onRetry,
}: {
  sources: any[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="console-card overflow-hidden" data-testid="section-source-library">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-3">
        <div>
          <div className="eyebrow">source library</div>
          <h2 className="mt-1 text-sm font-semibold">Photo rolls</h2>
        </div>
        <FolderOpen size={15} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div className="p-2">
        {isLoading && (
          <div className="space-y-2 p-1" data-testid="loading-sources">
            {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse bg-[hsl(var(--muted))]" />)}
          </div>
        )}
        {isError && (
          <div className="p-3 text-center" data-testid="error-sources">
            <AlertTriangle size={16} className="mx-auto mb-2 text-[hsl(var(--accent))]" />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Source index unavailable.</p>
            <button type="button" onClick={onRetry} className="console-button mt-3 w-full" data-testid="button-retry-sources"><RefreshCw size={12} /> RETRY INDEX</button>
          </div>
        )}
        {!isLoading && !isError && sources.length === 0 && (
          <div className="p-4 text-center" data-testid="empty-sources">
            <Layers3 size={17} className="mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
            <p className="mono text-[10px] text-[hsl(var(--muted-foreground))]">NO LOCKED SOURCES</p>
            <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Upload a roll to begin.</p>
          </div>
        )}
        <div className="space-y-1">
          {sources.map((source) => (
            <button
              type="button"
              key={source.id}
              className={`flex w-full items-center gap-3 border px-2 py-2 text-left transition-colors ${selectedId === source.id ? 'border-[hsl(var(--primary)/.55)] bg-[hsl(var(--primary)/.08)]' : 'border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/.6)]'}`}
              onClick={() => onSelect(source.id)}
              data-testid={`button-select-source-${source.id}`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[hsl(var(--border))] bg-[hsl(28_11%_8%)] text-[hsl(var(--primary))]"><Film size={14} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium">{source.name}</div>
                <div className="mono mt-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">{source.imageCount.toString().padStart(2, '0')} FRAMES · {new Date(source.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              </div>
              {selectedId === source.id ? <ChevronRight size={14} className="text-[hsl(var(--primary))]" /> : <MoreHorizontal size={14} className="text-[hsl(var(--muted-foreground))]" />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewStage({
  images,
  currentIndex,
  onIndex,
  format,
  sequence,
  seed,
  duration,
  photoDuration,
}: {
  images: SourceImage[];
  currentIndex: number;
  onIndex: (index: number) => void;
  format: Format;
  sequence: Sequence;
  seed: number | null;
  duration: number;
  photoDuration: number;
}) {
  const current = images[currentIndex];
  const aspect = format === '9:16' ? '9 / 16' : format === '1:1' ? '1 / 1' : '16 / 9';
  const totalFrames = Math.max(1, Math.ceil(duration / photoDuration));
  return (
    <section className="console-card flex min-h-[460px] flex-col overflow-hidden" data-testid="section-preview-stage">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="status-dot ok" />
          <span className="eyebrow text-[hsl(var(--foreground))]">live preview</span>
        </div>
        <div className="flex items-center gap-3 mono text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>{sequence === 'random' ? 'SHUFFLED' : 'IN ORDER'}</span>
          <span className="text-[hsl(var(--border))]">/</span>
          <span>{seed === null ? 'NO SEED' : `SEED ${seed}`}</span>
        </div>
      </div>
      <div className="scanline flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_45%,hsl(28_18%_17%),hsl(28_11%_8%)_68%)] p-7">
        {current ? (
          <div className="relative h-full max-h-[370px] w-full max-w-[500px]">
            <div className="mx-auto h-full max-h-[370px] w-fit overflow-hidden border border-[hsl(var(--primary)/.35)] bg-[hsl(28_11%_8%)] p-1 shadow-[0_16px_40px_hsl(30_20%_2%/.45)]" style={{ aspectRatio: aspect }}>
              <img src={current.previewUrl} alt={current.name} className="h-full w-full object-cover" data-testid="img-preview-current" />
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 mono text-[10px] text-[hsl(var(--muted-foreground))]">{current.name}</div>
          </div>
        ) : (
          <div className="max-w-[220px] text-center" data-testid="empty-preview">
            <ImagePlus size={23} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <div className="mono text-[11px] text-[hsl(var(--muted-foreground))]">PREVIEW STANDBY</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">Choose a source roll or upload a new one to inspect the locked sequence.</p>
          </div>
        )}
      </div>
      <div className="border-t border-[hsl(var(--border))] px-3 py-3">
        <div className="mb-2 flex items-center justify-between mono text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>FRAME {images.length ? `${(currentIndex + 1).toString().padStart(2, '0')} / ${images.length.toString().padStart(2, '0')}` : '-- / --'}</span>
          <span>{totalFrames} CUTS · {formatTime(duration)} TOTAL</span>
        </div>
        <input type="range" min={0} max={Math.max(0, images.length - 1)} value={currentIndex} onChange={(event) => onIndex(Number(event.target.value))} className="w-full accent-[hsl(var(--primary))]" disabled={!images.length} data-testid="input-preview-frame" />
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className="console-button" onClick={() => onIndex(Math.max(0, currentIndex - 1))} disabled={!images.length || currentIndex === 0} data-testid="button-previous-frame"><ChevronRight size={13} className="rotate-180" /> PREV</button>
          <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><Pause size={12} /><span className="mono text-[10px]">SCRUB MODE</span></div>
          <button type="button" className="console-button" onClick={() => onIndex(Math.min(images.length - 1, currentIndex + 1))} disabled={!images.length || currentIndex === images.length - 1} data-testid="button-next-frame">NEXT <ChevronRight size={13} /></button>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  values,
  setValues,
  sourceId,
  frameCount,
  onRender,
  isRendering,
}: {
  values: RenderInput;
  setValues: (next: RenderInput) => void;
  sourceId: string;
  frameCount: number;
  onRender: () => void;
  isRendering: boolean;
}) {
  const estimatedCuts = Math.max(1, Math.ceil(values.duration / values.photoDuration));
  const patch = (next: Partial<RenderInput>) => setValues({ ...values, ...next });
  return (
    <section className="console-card" data-testid="section-render-settings">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-3">
        <div><div className="eyebrow">render recipe</div><h2 className="mt-1 text-sm font-semibold">Output settings</h2></div>
        <SlidersHorizontal size={15} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div className="space-y-4 p-3">
        <div>
          <label className="field-label">canvas</label>
          <div className="grid grid-cols-3 gap-1" data-testid="control-format">
            {formatOptions.map((item) => (
              <button type="button" key={item.value} className={`flex flex-col items-center gap-1 border py-2 ${values.format === item.value ? 'border-[hsl(var(--primary)/.7)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} onClick={() => patch({ format: item.value })} data-testid={`button-format-${item.value.replace(':', '-')}`}>
                <span className="border border-current" style={{ width: item.value === '9:16' ? 9 : item.value === '1:1' ? 15 : 22, height: item.value === '9:16' ? 16 : item.value === '1:1' ? 15 : 12 }} />
                <span className="mono text-[9px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="field-label" htmlFor="duration">total duration</label><div className="relative"><input id="duration" type="number" min={0.5} max={1200} step={0.5} className="console-input pr-12" value={values.duration} onChange={(event) => patch({ duration: Number(event.target.value) })} data-testid="input-duration" /><span className="pointer-events-none absolute right-2 top-2.5 mono text-[10px] text-[hsl(var(--muted-foreground))]">SEC</span></div></div>
          <div><label className="field-label" htmlFor="photo-duration">hold / frame</label><div className="relative"><input id="photo-duration" type="number" min={0.03} max={10} step={0.01} className="console-input pr-12" value={values.photoDuration} onChange={(event) => patch({ photoDuration: Number(event.target.value) })} data-testid="input-photo-duration" /><span className="pointer-events-none absolute right-2 top-2.5 mono text-[10px] text-[hsl(var(--muted-foreground))]">SEC</span></div></div>
        </div>
        <div>
          <label className="field-label">sequence lock</label>
          <div className="grid grid-cols-2 segmented">
            <button type="button" className={`segment flex items-center justify-center gap-1.5 ${values.sequence === 'sequential' ? 'active' : ''}`} onClick={() => patch({ sequence: 'sequential', seed: null })} data-testid="button-sequence-sequential"><ChevronRight size={12} /> SEQUENTIAL</button>
            <button type="button" className={`segment flex items-center justify-center gap-1.5 ${values.sequence === 'random' ? 'active' : ''}`} onClick={() => patch({ sequence: 'random', seed: values.seed ?? Math.floor(Math.random() * 2147483647) })} data-testid="button-sequence-random"><Shuffle size={12} /> RANDOM</button>
          </div>
          <div className="mt-2 flex items-center justify-between mono text-[10px] text-[hsl(var(--muted-foreground))]"><span>DETERMINISTIC SEED</span><span className="text-[hsl(var(--primary))]">{values.sequence === 'random' ? values.seed : '—'}</span></div>
        </div>
        <div>
          <label className="field-label">frame rate</label>
          <div className="grid grid-cols-2 gap-1 segmented">
            {[30, 60].map((fps) => <button type="button" key={fps} className={`segment ${values.fps === fps ? 'active' : ''}`} onClick={() => patch({ fps: fps as RenderInput['fps'] })} data-testid={`button-fps-${fps}`}>{fps} FPS</button>)}
          </div>
        </div>
        <div>
          <label className="field-label">quality profile</label>
          <div className="space-y-1">
            {qualityOptions.map((item) => <button type="button" key={item.value} className={`flex w-full items-center justify-between border px-2.5 py-2 text-left transition-colors ${values.quality === item.value ? 'border-[hsl(var(--primary)/.6)] bg-[hsl(var(--primary)/.08)]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`} onClick={() => patch({ quality: item.value })} data-testid={`button-quality-${item.value}`}><span className={`mono text-[10px] ${values.quality === item.value ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>{item.label}</span><span className="text-[10px] text-[hsl(var(--muted-foreground))]">{item.detail}</span></button>)}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="filename">output filename</label>
          <input id="filename" className="console-input" value={values.filename ?? ''} onChange={(event) => patch({ filename: safeFileName(event.target.value) })} placeholder="contactreel-export.mp4" maxLength={120} data-testid="input-output-filename" />
        </div>
        <div>
          <label className="field-label" htmlFor="callback-url">callback URL <span className="normal-case tracking-normal text-[hsl(var(--muted-foreground)/.7)]">/ optional</span></label>
          <input id="callback-url" type="url" className="console-input" value={values.callbackUrl ?? ''} onChange={(event) => patch({ callbackUrl: event.target.value || null })} placeholder="https://your-worker/hook" data-testid="input-callback-url" />
        </div>
        {values.sequence === 'random' && (
          <div>
            <label className="field-label" htmlFor="seed">random seed</label>
            <div className="flex gap-2">
              <input id="seed" type="number" min={0} max={2147483647} className="console-input" value={values.seed ?? ''} onChange={(event) => patch({ seed: event.target.value === '' ? null : Number(event.target.value) })} data-testid="input-seed" />
              <button type="button" className="console-button shrink-0 px-2.5" onClick={() => patch({ seed: Math.floor(Math.random() * 2147483647) })} aria-label="Generate new seed" data-testid="button-regenerate-seed"><RotateCcw size={13} /></button>
            </div>
          </div>
        )}
        <div className="hairline" />
        <div className="flex items-center justify-between mono text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>{frameCount} SOURCE FRAMES / {estimatedCuts} OUTPUT CUTS</span>
          <span className="text-[hsl(var(--foreground))]">{values.format} · H.264</span>
        </div>
        <button type="button" className="console-button primary w-full py-2.5" disabled={!sourceId || frameCount === 0 || isRendering || values.duration < 0.5 || values.photoDuration < 0.03} onClick={onRender} data-testid="button-queue-render">
          {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {isRendering ? 'VALIDATING QUEUE REQUEST' : 'QUEUE MP4 RENDER'}
        </button>
        {!sourceId && <p className="text-center mono text-[10px] text-[hsl(var(--accent))]">SELECT OR CREATE A SOURCE FIRST</p>}
      </div>
    </section>
  );
}

function RenderStatus({
  job,
  isLoading,
  isError,
  onCancel,
  onRetry,
  downloadUrl,
}: {
  job: any;
  isLoading: boolean;
  isError: boolean;
  onCancel: () => void;
  onRetry: () => void;
  downloadUrl: string | null;
}) {
  if (!job && !isLoading) return null;
  const active = job?.status === 'queued' || job?.status === 'rendering';
  return (
    <section className="console-card reveal overflow-hidden border-[hsl(var(--primary)/.35)]" data-testid="section-render-status">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-3 py-3">
        <div className="flex items-center gap-2"><Gauge size={15} className="text-[hsl(var(--primary))]" /><span className="eyebrow text-[hsl(var(--foreground))]">render monitor</span><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{job?.jobId?.slice(0, 12) ?? 'CONNECTING'}</span></div>
        {active && <button type="button" className="console-button danger" onClick={onCancel} data-testid="button-cancel-render"><X size={12} /> CANCEL JOB</button>}
        {job?.status === 'completed' && downloadUrl && <a className="console-button primary" href={downloadUrl} download={job.output?.filename} data-testid="link-download-render"><ArrowDownToLine size={13} /> DOWNLOAD MP4</a>}
      </div>
      {isLoading && <div className="p-4" data-testid="loading-render"><div className="h-2 w-full animate-pulse bg-[hsl(var(--muted))]" /><div className="mt-3 h-3 w-2/3 animate-pulse bg-[hsl(var(--muted))]" /></div>}
      {isError && <div className="flex items-center justify-between gap-3 p-4" data-testid="error-render"><span className="text-[11px] text-[hsl(var(--accent))]">Could not read this job.</span><button type="button" className="console-button" onClick={onRetry} data-testid="button-retry-render"><RefreshCw size={12} /> RETRY</button></div>}
      {job && !isLoading && !isError && (
        <div className="p-3">
          <div className="flex items-end justify-between"><div><div className="mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{job.stage || job.status}</div><div className="mt-1 text-lg font-semibold tracking-[-.04em]">{job.status === 'completed' ? 'Master ready.' : job.status === 'failed' ? 'Render failed.' : job.status === 'cancelled' ? 'Render cancelled.' : `${Math.round(job.progress)}% rendered`}</div></div><div className="mono text-[11px] text-[hsl(var(--primary))]">{formatTime(job.elapsedSeconds)}{job.estimatedRemainingSeconds !== null && active ? ` / ~${formatTime(job.estimatedRemainingSeconds)}` : ''}</div></div>
          <div className="mt-3 h-1.5 overflow-hidden bg-[hsl(var(--muted))]"><div className={`h-full ${job.status === 'failed' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary))]'}`} style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} /></div>
          {job.output && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[hsl(var(--border))] pt-3 text-[10px] mono text-[hsl(var(--muted-foreground))] sm:grid-cols-4"><span>{job.output.width}×{job.output.height}</span><span>{job.output.fps} FPS</span><span>{formatBytes(job.output.size)}</span><span>{job.output.codec}</span></div>}
          {job.error && <div className="mt-3 border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.08)] p-2 text-[11px] text-[hsl(7_73%_72%)]" data-testid="text-render-error">{job.error.message}</div>}
        </div>
      )}
    </section>
  );
}

export default function Editor() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [sourceName, setSourceName] = useState('untitled-roll');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [jobId, setJobId] = useState('');
  const [toast, setToast] = useState('');
  const [values, setValues] = useState<RenderInput>({ sourceId: '', duration: 30, photoDuration: 0.1, format: '9:16', fps: 30, quality: 'high', sequence: 'random', seed: Math.floor(Math.random() * 2147483647), callbackUrl: null, filename: 'contactreel-export.mp4' });
  const sourcesQuery = useListSources({ query: { queryKey: getListSourcesQueryKey() } });
  const sources = Array.isArray(sourcesQuery.data) ? sourcesQuery.data : [];
  const sourceQuery = useGetSource(selectedId, { query: { enabled: Boolean(selectedId), queryKey: getGetSourceQueryKey(selectedId) } });
  const source = sourceQuery.data;
  const createSource = useCreateSource();
  const createRender = useCreateRender();
  const cancelRender = useCancelRender();
  const renderQuery = useGetRender(jobId, { query: { enabled: Boolean(jobId), queryKey: getGetRenderQueryKey(jobId), refetchInterval: jobId ? 2200 : false } });
  const job = renderQuery.data;
  const downloadQuery = useGetRenderDownload(jobId, { query: { enabled: Boolean(jobId && job?.status === 'completed'), queryKey: getGetRenderDownloadQueryKey(jobId) } });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const localImagesRef = useRef(localImages);
  localImagesRef.current = localImages;

  useEffect(() => {
    if (!selectedId && sources.length) setSelectedId(sources[0].id);
  }, [selectedId, sources]);

  useEffect(() => {
    if (source) {
      setValues((current) => ({ ...current, sourceId: source.id }));
      setCurrentIndex(0);
      localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
      setLocalImages([]);
    }
  }, [source]);

  useEffect(() => {
    if (downloadQuery.data instanceof Blob) {
      const url = URL.createObjectURL(downloadQuery.data);
      setDownloadUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      return () => URL.revokeObjectURL(url);
    }
    return undefined;
  }, [downloadQuery.data]);

  useEffect(() => () => localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)), []);

  const images = useMemo<SourceImage[]>(() => {
    if (localImages.length) return localImages.map((image) => ({ id: image.id, name: image.file.name, contentType: image.file.type, previewUrl: image.url, width: image.width, height: image.height }));
    return source?.images ?? [];
  }, [localImages, source]);

  const previewTimeline = useMemo(() => {
    if (!images.length) return null;
    return calculateTimeline(
      images.map((image) => image.id),
      Number(values.duration),
      Number(values.photoDuration),
      values.fps,
      values.sequence,
      values.seed ?? undefined,
    );
  }, [images, values.duration, values.photoDuration, values.fps, values.sequence, values.seed]);

  const displayImages = useMemo(() => {
    if (!previewTimeline) return [];
    return previewTimeline.frames
      .filter((frame, index, frames) => index === 0 || frame.imageId !== frames[index - 1]?.imageId)
      .map((frame) => images.find((image) => image.id === frame.imageId))
      .filter((image): image is SourceImage => Boolean(image));
  }, [images, previewTimeline]);

  useEffect(() => {
    if (currentIndex >= displayImages.length) setCurrentIndex(Math.max(0, displayImages.length - 1));
  }, [currentIndex, displayImages.length]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)).slice(0, 100 - localImages.length);
    incoming.forEach((file) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => setLocalImages((current) => [...current, { id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url, width: image.naturalWidth, height: image.naturalHeight }]);
      image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
    });
  };

  const removeLocal = (id: string) => {
    setLocalImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((image) => image.id !== id);
    });
  };

  const createLocalSource = async () => {
    try {
      const data = await Promise.all(localImages.map(async (image) => ({ name: image.file.name, contentType: image.file.type as 'image/jpeg' | 'image/png' | 'image/webp', dataUrl: await readAsDataUrl(image.file) })));
      createSource.mutate({ data: { name: sourceName.trim(), images: data } }, {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          setSelectedId(created.id);
          setToast('Source locked. Sequence is ready.');
          localImages.forEach((image) => URL.revokeObjectURL(image.url));
          setLocalImages([]);
        },
        onError: (error) => setToast(error instanceof Error ? error.message : 'Source upload failed.'),
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not prepare images.');
    }
  };

  const queueRender = () => {
    const input: RenderInput = { ...values, sourceId: selectedId || values.sourceId, duration: Number(values.duration), photoDuration: Number(values.photoDuration), filename: safeFileName(values.filename ?? '') || 'contactreel-export.mp4' };
    createRender.mutate({ data: input }, {
      onSuccess: (accepted) => { setJobId(accepted.jobId); setToast(`Job queued with seed ${accepted.seed}.`); },
      onError: (error) => setToast(error instanceof Error ? error.message : 'Render request was rejected.'),
    });
  };

  const cancel = () => {
    if (!jobId) return;
    cancelRender.mutate({ jobId }, {
      onSuccess: (cancelled) => {
        queryClient.setQueryData(getGetRenderQueryKey(jobId), cancelled);
        setToast('Render cancelled.');
      },
      onError: (error) => setToast(error instanceof Error ? error.message : 'Could not cancel render.'),
    });
  };

  const activeSourceId = selectedId || values.sourceId;
  return (
    <div className="console-app">
      <header className="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-[hsl(30_11%_7%/.92)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <BrandMark />
          <div className="hidden items-center gap-5 md:flex"><div className="eyebrow">deterministic photo montage / h.264 pipeline</div><HealthStrip /></div>
          <div className="flex items-center gap-2"><button type="button" className="console-button hidden sm:inline-flex" onClick={() => setToast('Every setting is sent to the render worker as shown.')} data-testid="button-help"><CircleHelp size={13} /> GUIDE</button><button type="button" className="console-button" onClick={() => queryClient.invalidateQueries()} data-testid="button-refresh-all"><RotateCcw size={13} /> <span className="hidden sm:inline">SYNC</span></button></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1700px] px-4 pb-8 pt-4 lg:px-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><div className="eyebrow text-[hsl(var(--primary))]">workspace / montage editor</div><h1 className="mt-1 text-2xl font-semibold tracking-[-0.06em] sm:text-3xl">Build the cut.</h1></div>
          <div className="hidden items-center gap-2 mono text-[10px] text-[hsl(var(--muted-foreground))] md:flex"><span className="status-dot ok" /> AUTOSAVE OFF / EXPLICIT QUEUE</div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(430px,1fr)_330px]">
          <aside className="space-y-4">
            <LocalUpload localImages={localImages} sourceName={sourceName} setSourceName={setSourceName} onFiles={handleFiles} onRemove={removeLocal} onCreate={createLocalSource} isCreating={createSource.isPending} />
            <SourceRail sources={sources} isLoading={sourcesQuery.isLoading} isError={sourcesQuery.isError} selectedId={selectedId} onSelect={(id) => { localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)); setLocalImages([]); setSelectedId(id); setValues((current) => ({ ...current, sourceId: id })); }} onRetry={() => sourcesQuery.refetch()} />
          </aside>
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between mono text-[10px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><LockKeyhole size={12} className="text-[hsl(var(--primary))]" /> SEQUENCE INSPECTOR</span><span>{activeSourceId ? `SOURCE ${activeSourceId.slice(0, 8)}` : 'NO SOURCE SELECTED'}</span></div>
            <PreviewStage images={displayImages} currentIndex={currentIndex} onIndex={setCurrentIndex} format={values.format} sequence={values.sequence} seed={values.seed ?? null} duration={values.duration} photoDuration={values.photoDuration} />
            {jobId && <RenderStatus job={job} isLoading={renderQuery.isLoading} isError={renderQuery.isError} onCancel={cancel} onRetry={() => renderQuery.refetch()} downloadUrl={downloadUrl} />}
          </div>
          <aside className="space-y-4">
            <SettingsPanel values={values} setValues={setValues} sourceId={activeSourceId} frameCount={displayImages.length} onRender={queueRender} isRendering={createRender.isPending} />
            <div className="console-card p-3" data-testid="panel-output-notes"><div className="flex items-center gap-2"><HardDrive size={14} className="text-[hsl(var(--primary))]" /><span className="eyebrow">pipeline notes</span></div><div className="mt-3 space-y-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]"><p><span className="text-[hsl(var(--foreground))]">01</span> Source binaries stay out of the queue payload once locked.</p><p><span className="text-[hsl(var(--foreground))]">02</span> A seed makes random order reproducible across retries.</p><p><span className="text-[hsl(var(--foreground))]">03</span> MP4 output is validated server-side before download.</p></div></div>
          </aside>
        </div>
      </main>
      {toast && <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 border border-[hsl(var(--primary)/.55)] bg-[hsl(28_14%_12%)] px-3 py-2.5 shadow-[0_12px_32px_hsl(30_20%_2%/.55)] reveal" role="status" data-testid="status-toast"><Check size={14} className="shrink-0 text-[hsl(var(--primary))]" /><span className="mono text-[10px]">{toast}</span><button type="button" className="ml-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={() => setToast('')} data-testid="button-dismiss-toast"><X size={14} /></button></div>}
    </div>
  );
}
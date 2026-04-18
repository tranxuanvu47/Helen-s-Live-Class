import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, debounceTime } from 'rxjs';

import { StreamVideoService, MeetingEvent } from '../../../core/services/stream-video.service';

export type DrawingMode = 'draw' | 'erase' | 'pointer' | 'off';

interface Point { x: number; y: number }
interface RemotePointer { x: number; y: number; userName: string; hideTimer?: ReturnType<typeof setTimeout> }

@Component({
  selector: 'app-drawing-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './drawing-canvas.component.html',
  styleUrl: './drawing-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawingCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Active tool. When 'off' the overlay is transparent to pointer events. */
  @Input() mode: DrawingMode = 'off';
  @Input() color = '#e0001b';
  @Input() lineWidth = 3;

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  /** Remote pointer positions keyed by userId. */
  remotePointers = new Map<string, RemotePointer>();

  private ctx: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  private lastPoint: Point | null = null;
  private currentStrokePoints: Point[] = [];
  private resizeObserver!: ResizeObserver;
  private pointerMove$ = new Subject<Point>();
  private destroy$ = new Subject<void>();

  constructor(
    private videoService: StreamVideoService,
    private ngZone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d');
    this.fitCanvas();

    this.resizeObserver = new ResizeObserver(() => this.ngZone.run(() => this.fitCanvas()));
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);

    // Subscribe to incoming meeting events from remote participants.
    this.videoService.meetingEvents$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => this.handleRemoteEvent(event));

    // Debounce pointer-move broadcasts to ~30ms.
    this.pointerMove$
      .pipe(debounceTime(30), takeUntil(this.destroy$))
      .subscribe((pt) => {
        const userId = this.videoService.getCurrentUserId() ?? '';
        const userName = 'You';
        this.videoService.sendMeetingEvent({ type: 'pointer-move', ...pt, userId, userName });
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && this.canvasRef) {
      if (changes['mode'].currentValue === 'off') {
        this.videoService.sendMeetingEvent({
          type: 'pointer-hide',
          userId: this.videoService.getCurrentUserId() ?? '',
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Pointer event handlers ──────────────────────────────────────────────────

  onPointerDown(event: PointerEvent): void {
    if (this.mode === 'off') return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const pt = this.normalizeToCanvas(event);

    if (this.mode === 'draw' || this.mode === 'erase') {
      this.isDrawing = true;
      this.lastPoint = pt;
      this.currentStrokePoints = [pt];
    } else if (this.mode === 'pointer') {
      this.pointerMove$.next(pt);
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (this.mode === 'off') return;
    const pt = this.normalizeToCanvas(event);

    if (this.mode === 'pointer') {
      this.pointerMove$.next(pt);
      return;
    }

    if (!this.isDrawing || !this.lastPoint) return;

    this.drawSegment(this.lastPoint, pt, this.mode === 'erase');
    this.currentStrokePoints.push(pt);
    this.lastPoint = pt;
  }

  onPointerUp(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.lastPoint = null;

    if (this.currentStrokePoints.length > 0) {
      // Normalise absolute canvas pixels to [0,1] before broadcasting.
      const canvas = this.canvasRef.nativeElement;
      const normalized = this.currentStrokePoints.map((p) => ({
        x: p.x / canvas.width,
        y: p.y / canvas.height,
      }));
      this.videoService.sendMeetingEvent({
        type: 'draw-stroke',
        points: normalized,
        color: this.mode === 'erase' ? '__erase__' : this.color,
        width: this.lineWidth,
      });
    }
    this.currentStrokePoints = [];
  }

  clearCanvas(): void {
    if (!this.ctx || !this.canvasRef) return;
    this.ctx.clearRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
    this.videoService.sendMeetingEvent({ type: 'draw-clear' });
  }

  // ── Private drawing helpers ─────────────────────────────────────────────────

  private fitCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    // Preserve drawing by saving/restoring image data.
    const imageData = this.ctx?.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    if (imageData) this.ctx?.putImageData(imageData, 0, 0);
  }

  private normalizeToCanvas(event: PointerEvent): Point {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private drawSegment(from: Point, to: Point, erase: boolean): void {
    if (!this.ctx) return;
    this.ctx.save();
    if (erase) {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
      this.ctx.lineWidth = this.lineWidth * 4;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.lineWidth;
    }
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private replayStroke(
    points: Array<{ x: number; y: number }>,
    color: string,
    width: number,
  ): void {
    if (!this.ctx || points.length < 2) return;
    const canvas = this.canvasRef.nativeElement;
    const denorm = points.map((p) => ({
      x: p.x * canvas.width,
      y: p.y * canvas.height,
    }));
    for (let i = 1; i < denorm.length; i++) {
      const erase = color === '__erase__';
      this.drawSegment(denorm[i - 1], denorm[i], erase);
    }
  }

  // ── Remote event handler ────────────────────────────────────────────────────

  private handleRemoteEvent(event: MeetingEvent): void {
    switch (event.type) {
      case 'draw-stroke':
        this.replayStroke(event.points, event.color, event.width);
        break;

      case 'draw-clear':
        this.ctx?.clearRect(
          0, 0,
          this.canvasRef.nativeElement.width,
          this.canvasRef.nativeElement.height,
        );
        break;

      case 'pointer-move': {
        const existing = this.remotePointers.get(event.userId);
        if (existing?.hideTimer) clearTimeout(existing.hideTimer);
        const hideTimer = setTimeout(() => {
          this.remotePointers.delete(event.userId);
        }, 1500);
        this.remotePointers.set(event.userId, {
          x: event.x,
          y: event.y,
          userName: event.userName,
          hideTimer,
        });
        break;
      }

      case 'pointer-hide':
        this.remotePointers.delete(event.userId);
        break;
    }
  }

  /** Convert normalised [0,1] pointer coordinates to CSS pixel positions. */
  pointerStyle(ptr: RemotePointer): Record<string, string> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return {};
    return {
      left: `${ptr.x * canvas.width}px`,
      top: `${ptr.y * canvas.height}px`,
    };
  }

  get remotePointerEntries(): Array<[string, RemotePointer]> {
    return Array.from(this.remotePointers.entries());
  }
}

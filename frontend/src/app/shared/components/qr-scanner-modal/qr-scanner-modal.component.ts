import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import jsQR from 'jsqr';

@Component({
  selector: 'app-qr-scanner-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-scanner-modal.component.html',
  styleUrl: './qr-scanner-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrScannerModalComponent implements AfterViewInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;

  result = signal<string | null>(null);
  isCopied = signal(false);
  cameraError = signal<string | null>(null);
  isScanning = signal(true);

  private stream: MediaStream | null = null;
  private rafId = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const video = this.videoEl.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.scanLoop();
    } catch {
      this.cameraError.set('Could not access camera. Please allow camera permission.');
      this.isScanning.set(false);
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  close(): void {
    this.closed.emit();
  }

  copyResult(): void {
    const val = this.result();
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
      this.cdr.markForCheck();
    });
  }

  restart(): void {
    this.result.set(null);
    this.isScanning.set(true);
    this.scanLoop();
  }

  private scanLoop(): void {
    const video = this.videoEl?.nativeElement;
    const canvas = this.canvasEl?.nativeElement;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          this.result.set(code.data);
          this.isScanning.set(false);
          this.cdr.markForCheck();
          return; // stop scanning after first hit
        }
      }
      this.rafId = requestAnimationFrame(scan);
    };

    this.rafId = requestAnimationFrame(scan);
  }
}

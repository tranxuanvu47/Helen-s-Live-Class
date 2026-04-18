import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { StreamVideoParticipant, CallingState, SfuModels } from '@stream-io/video-client';
import { Subject, takeUntil } from 'rxjs';

import { StreamVideoService } from '../../../core/services/stream-video.service';
import { AuthService } from '../../../core/services/auth.service';
import { VideoTileComponent } from '../../../shared/components/video-tile/video-tile.component';
import { DrawingCanvasComponent, DrawingMode } from '../../../shared/components/drawing-canvas/drawing-canvas.component';
import { QrScannerModalComponent } from '../../../shared/components/qr-scanner-modal/qr-scanner-modal.component';

@Component({
  selector: 'app-meeting-room',
  standalone: true,
  imports: [CommonModule, VideoTileComponent, DrawingCanvasComponent, QrScannerModalComponent],
  templateUrl: './meeting-room.component.html',
  styleUrl: './meeting-room.component.scss',
})
export class MeetingRoomComponent implements OnInit, OnDestroy {
  @ViewChild('remoteAreaRef') remoteAreaRef!: ElementRef<HTMLElement>;

  callId = '';
  participants: StreamVideoParticipant[] = [];
  localParticipant: StreamVideoParticipant | undefined = undefined;
  callingState: CallingState = CallingState.IDLE;

  // ── Existing state ───────────────────────────────────────────────────────────
  isCameraEnabled = signal(true);
  isMicEnabled = signal(true);
  isJoining = signal(true);
  errorMessage = signal('');
  isMirrored = signal(true);
  isHost = signal(false);
  isScreenSharing = signal(false);

  // ── New feature state ────────────────────────────────────────────────────────
  isVideoPaused = signal(false);
  isVoiceOnly = signal(false);
  /** Active drawing/pointer tool. */
  drawingMode = signal<DrawingMode>('off');
  drawingColor = signal('#e0001b');
  showQrScanner = signal(false);
  /** Whether this user's remote flashlight request is active. */
  flashlightOn = signal(false);

  readonly CallingState = CallingState;
  readonly drawingModes: DrawingMode[] = ['draw', 'erase', 'pointer'];

  private destroy$ = new Subject<void>();
  private viewportCleanup: (() => void) | undefined;
  private audioResumed = false;

  @HostListener('click')
  onFirstInteraction(): void {
    if (!this.audioResumed) {
      this.audioResumed = true;
      this.videoService.resumeAudio();
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private videoService: StreamVideoService,
    private auth: AuthService,
    private el: ElementRef<HTMLElement>,
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.videoService.initClient(user.userId, user.userName, user.token, user.userImage);
    this.callId = this.route.snapshot.paramMap.get('callId') ?? '';

    this.videoService.participants$.pipe(takeUntil(this.destroy$)).subscribe((p) => (this.participants = p));
    this.videoService.localParticipant$.pipe(takeUntil(this.destroy$)).subscribe((p) => (this.localParticipant = p));
    this.videoService.callingState$.pipe(takeUntil(this.destroy$)).subscribe((cs) => (this.callingState = cs));
    this.videoService.isCameraEnabled$.pipe(takeUntil(this.destroy$)).subscribe((v) => this.isCameraEnabled.set(v));
    this.videoService.isMicEnabled$.pipe(takeUntil(this.destroy$)).subscribe((v) => this.isMicEnabled.set(v));
    this.videoService.isHost$.pipe(takeUntil(this.destroy$)).subscribe((v) => this.isHost.set(v));
    this.videoService.isScreenSharing$.pipe(takeUntil(this.destroy$)).subscribe((v) => this.isScreenSharing.set(v));
    this.videoService.isVideoPaused$.pipe(takeUntil(this.destroy$)).subscribe((v) => this.isVideoPaused.set(v));

    try {
      await this.videoService.joinCall(this.callId);
      this.isJoining.set(false);

      const call = this.videoService.getCall();
      if (call) {
        this.viewportCleanup = call.setViewport(this.el.nativeElement);
      }
    } catch (err) {
      console.error('Failed to join call', err);
      this.errorMessage.set('Failed to join the meeting. Please try again.');
      this.isJoining.set(false);
    }
  }

  // ── Existing controls ────────────────────────────────────────────────────────

  async toggleCamera(): Promise<void> { await this.videoService.toggleCamera(); }
  async toggleMic(): Promise<void> { await this.videoService.toggleMic(); }
  async toggleScreenShare(): Promise<void> { await this.videoService.toggleScreenShare(); }
  toggleMirror(): void { this.isMirrored.update((v) => !v); }

  async leaveCall(): Promise<void> {
    await this.videoService.leaveCall();
    this.router.navigate(['/chat']);
  }

  async endCallForAll(): Promise<void> {
    await this.videoService.endCallForAll();
    this.router.navigate(['/chat']);
  }

  copyInviteLink(): void {
    const url = `${window.location.origin}/meeting/${this.callId}`;
    navigator.clipboard.writeText(url).catch(console.error);
  }

  // ── New feature handlers ─────────────────────────────────────────────────────

  /** Capture the visible video area as a PNG and download it. */
  captureScreenshot(): void {
    const area = this.remoteAreaRef?.nativeElement ?? this.el.nativeElement;
    const video = area.querySelector<HTMLVideoElement>('video');
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${this.callId}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  async toggleVideoPause(): Promise<void> {
    await this.videoService.toggleVideoPause();
  }

  /** Toggle voice-only mode (camera off, mic on). */
  async toggleVoiceOnly(): Promise<void> {
    if (this.isVoiceOnly()) {
      this.isVoiceOnly.set(false);
      if (!this.isCameraEnabled()) {
        await this.videoService.toggleCamera();
      }
    } else {
      this.isVoiceOnly.set(true);
      if (this.isCameraEnabled()) {
        await this.videoService.toggleCamera();
      }
    }
  }

  /** Cycle drawing mode: off → draw → erase → pointer → off */
  setDrawingMode(mode: DrawingMode): void {
    this.drawingMode.set(this.drawingMode() === mode ? 'off' : mode);
  }

  clearDrawing(): void {
    // Handled by DrawingCanvasComponent directly via (clear) output or
    // by calling the service; broadcast is done inside the component.
    // We set a signal that the component watches.
    this.drawingMode.set('off');
  }

  /** Request remote participant(s) to toggle their flashlight. */
  async toggleRemoteFlashlight(): Promise<void> {
    const next = !this.flashlightOn();
    this.flashlightOn.set(next);
    await this.videoService.sendMeetingEvent({ type: 'flashlight', enabled: next });
  }

  openQrScanner(): void { this.showQrScanner.set(true); }
  closeQrScanner(): void { this.showQrScanner.set(false); }

  // ── Getters ──────────────────────────────────────────────────────────────────

  get remoteParticipants(): StreamVideoParticipant[] {
    return this.participants.filter((p) => !p.isLocalParticipant);
  }

  get screenSharingParticipant(): StreamVideoParticipant | undefined {
    return this.participants.find((p) =>
      p.publishedTracks.includes(SfuModels.TrackType.SCREEN_SHARE),
    );
  }

  get participantCount(): number { return this.participants.length; }

  get isDrawingActive(): boolean { return this.drawingMode() !== 'off'; }

  ngOnDestroy(): void {
    this.viewportCleanup?.();
    this.destroy$.next();
    this.destroy$.complete();
  }
}

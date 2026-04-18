import {
  Component,
  Input,
  OnChanges,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamVideoParticipant, VideoTrackType, SfuModels } from '@stream-io/video-client';
import { StreamVideoService } from '../../../core/services/stream-video.service';

@Component({
  selector: 'app-video-tile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-tile.component.html',
  styleUrl: './video-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTileComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) participant!: StreamVideoParticipant;
  @Input() isLocal = false;
  /** Mirror the local video horizontally (selfie-camera convention). */
  @Input() mirrored = false;
  /** Which track to bind: camera video or screen share. */
  @Input() trackType: VideoTrackType = 'videoTrack';

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('audioEl') audioEl!: ElementRef<HTMLAudioElement>;

  private videoCleanup: (() => void) | undefined;
  private audioCleanup: (() => void) | undefined;

  private readonly videoService = inject(StreamVideoService);

  ngAfterViewInit(): void {
    this.bindElements();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const participantChange = changes['participant'];
    const trackTypeChange = changes['trackType'];
    if ((participantChange || trackTypeChange) && this.videoEl) {
      const prev = participantChange?.previousValue as StreamVideoParticipant | undefined;
      const curr = (participantChange?.currentValue ?? this.participant) as StreamVideoParticipant;
      if (prev?.sessionId !== curr.sessionId || trackTypeChange) {
        this.unbindElements();
        this.bindElements();
      }
    }
  }

  ngOnDestroy(): void {
    this.unbindElements();
  }

  /**
   * Delegates stream management to the SDK's DynascaleManager via
   * call.bindVideoElement / call.bindAudioElement. This is the correct
   * integration point: the SDK sets srcObject, manages track subscriptions,
   * and adapts quality based on element dimensions — all automatically.
   *
   * trackElementVisibility registers the element with the SDK's viewport
   * tracker so it receives video as soon as it becomes visible on screen.
   */
  private bindElements(): void {
    const call = this.videoService.getCall();
    if (!call) return;

    const videoEl = this.videoEl?.nativeElement;
    const audioEl = this.audioEl?.nativeElement;
    const { sessionId } = this.participant;

    if (videoEl) {
      const cleanupBind = call.bindVideoElement(videoEl, sessionId, this.trackType) ?? undefined;
      const cleanupVisibility = call.trackElementVisibility(videoEl, sessionId, this.trackType);
      this.videoCleanup = () => {
        cleanupBind?.();
        cleanupVisibility();
      };
    }

    if (audioEl && !this.isLocal) {
      this.audioCleanup = call.bindAudioElement(audioEl, sessionId, 'audioTrack') ?? undefined;
    }
  }

  private unbindElements(): void {
    this.videoCleanup?.();
    this.videoCleanup = undefined;
    this.audioCleanup?.();
    this.audioCleanup = undefined;
  }

  get displayName(): string {
    return this.participant.name ?? this.participant.userId ?? 'Participant';
  }

  /** True when the SDK has received and delivered the participant's video stream. */
  get hasVideo(): boolean {
    if (this.trackType === 'screenShareTrack') {
      return this.participant.publishedTracks.includes(SfuModels.TrackType.SCREEN_SHARE);
    }
    return !!this.participant.videoStream;
  }

  get initials(): string {
    return this.displayName
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}

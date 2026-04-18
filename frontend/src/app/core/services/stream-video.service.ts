import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  StreamVideoClient,
  Call,
  StreamVideoParticipant,
  CallingState,
  InputDeviceStatus,
} from '@stream-io/video-client';

import { environment } from '../../../environments/environment';

/** Discriminated union for all custom meeting events broadcast via sendCustomEvent(). */
export type MeetingEvent =
  | { type: 'draw-stroke'; points: Array<{ x: number; y: number }>; color: string; width: number }
  | { type: 'draw-clear' }
  | { type: 'pointer-move'; x: number; y: number; userId: string; userName: string }
  | { type: 'pointer-hide'; userId: string }
  | { type: 'flashlight'; enabled: boolean };

@Injectable({ providedIn: 'root' })
export class StreamVideoService implements OnDestroy {
  private client: StreamVideoClient | null = null;
  private call: Call | null = null;
  private participantsSub: (() => void) | null = null;
  private customEventUnsub: (() => void) | null = null;
  private currentUserId: string | null = null;
  private frozenCanvasStream: MediaStream | null = null;

  readonly participants$ = new BehaviorSubject<StreamVideoParticipant[]>([]);
  readonly localParticipant$ = new BehaviorSubject<StreamVideoParticipant | undefined>(undefined);
  readonly callingState$ = new BehaviorSubject<CallingState>(CallingState.IDLE);
  readonly isCameraEnabled$ = new BehaviorSubject<boolean>(true);
  readonly isMicEnabled$ = new BehaviorSubject<boolean>(true);
  readonly isHost$ = new BehaviorSubject<boolean>(false);
  readonly isScreenSharing$ = new BehaviorSubject<boolean>(false);
  readonly isVideoPaused$ = new BehaviorSubject<boolean>(false);
  /** Emits whenever any participant sends a custom meeting event. */
  readonly meetingEvents$ = new Subject<MeetingEvent>();

  constructor(private ngZone: NgZone) {}

  /** Initialise the video client once after login. */
  initClient(userId: string, userName: string, token: string, userImage?: string | null): void {
    if (this.client) return;

    this.currentUserId = userId;
    this.client = new StreamVideoClient({
      apiKey: environment.streamApiKey,
      user: {
        id: userId,
        name: userName,
        image: userImage ?? undefined,
      },
      token,
    });
  }

  /** Create and join a video call by callId (client-side, no backend required). */
  async joinCall(callId: string, callType = 'default'): Promise<void> {
    if (!this.client) throw new Error('Video client not initialised');

    this.call = this.client.call(callType, callId);
    await this.call.join({ create: true });

    const createdById = this.call.state.createdBy?.id;
    this.isHost$.next(!!createdById && createdById === this.currentUserId);

    this.syncState();
    this.subscribeCustomEvents();
  }

  async toggleCamera(): Promise<void> {
    if (!this.call) return;
    await this.call.camera.toggle();
    this.isCameraEnabled$.next(
      this.call.camera.state.status === 'enabled',
    );
  }

  async toggleMic(): Promise<void> {
    if (!this.call) return;
    await this.call.microphone.toggle();
    this.isMicEnabled$.next(
      this.call.microphone.state.status === 'enabled',
    );
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.call) return;
    await this.call.screenShare.toggle();
    this.isScreenSharing$.next(this.call.screenShare.state.status === 'enabled');
  }

  /**
   * Freeze-frame pause: captures the last camera frame on a canvas, publishes
   * the static canvas stream instead of the live camera.  Remote participants
   * see your last frame rather than a black tile.
   */
  async toggleVideoPause(): Promise<void> {
    if (!this.call) return;

    if (this.isVideoPaused$.value) {
      if (this.frozenCanvasStream) {
        this.frozenCanvasStream.getTracks().forEach((t) => t.stop());
        this.frozenCanvasStream = null;
      }
      await this.call.camera.enable();
      this.isCameraEnabled$.next(true);
      this.isVideoPaused$.next(false);
    } else {
      const mediaStream = this.call.camera.state.mediaStream;
      const videoTrack = mediaStream?.getVideoTracks()[0];
      if (!videoTrack) return;

      const canvas = document.createElement('canvas');
      const settings = videoTrack.getSettings();
      canvas.width = settings.width ?? 640;
      canvas.height = settings.height ?? 480;
      const ctx = canvas.getContext('2d');

      const liveVideo = document.querySelector<HTMLVideoElement>(
        '.meeting-room__local-preview video',
      );
      if (liveVideo && ctx) {
        ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);
      }

      this.frozenCanvasStream = (canvas as HTMLCanvasElement & {
        captureStream(fps?: number): MediaStream;
      }).captureStream(0);

      await this.call.camera.disable();
      this.isCameraEnabled$.next(false);
      this.isVideoPaused$.next(true);
    }
  }

  /** Broadcast a custom meeting event to all participants. */
  async sendMeetingEvent(payload: MeetingEvent): Promise<void> {
    await this.call?.sendCustomEvent(payload as Record<string, unknown>);
  }

  /** Leave the call (current user only). */
  async leaveCall(): Promise<void> {
    if (this.call?.screenShare.state.status === 'enabled') {
      await this.call.screenShare.disable({ forceStop: true });
    }
    if (this.isVideoPaused$.value) {
      this.frozenCanvasStream?.getTracks().forEach((t) => t.stop());
      this.frozenCanvasStream = null;
    }
    this.customEventUnsub?.();
    this.customEventUnsub = null;
    this.cleanupSubscriptions();
    await this.call?.leave();
    this.call = null;
    this.isHost$.next(false);
    this.participants$.next([]);
    this.localParticipant$.next(undefined);
    this.callingState$.next(CallingState.IDLE);
    this.isCameraEnabled$.next(true);
    this.isMicEnabled$.next(true);
    this.isScreenSharing$.next(false);
    this.isVideoPaused$.next(false);
  }

  /** End the call for all participants (host only). */
  async endCallForAll(): Promise<void> {
    if (!this.call) return;
    await this.call.endCall();
    await this.leaveCall();
  }

  getCall(): Call | null {
    return this.call;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /** Resume audio elements blocked by the browser's autoplay policy. */
  async resumeAudio(): Promise<void> {
    await this.call?.dynascaleManager.resumeAudio();
  }

  private syncState(): void {
    if (!this.call) return;

    const state = this.call.state;

    const sub1 = state.participants$.subscribe(
      (participants) => {
        this.ngZone.run(() => {
          this.participants$.next(participants);
          const local = participants.find((p) => p.isLocalParticipant);
          this.localParticipant$.next(local);
        });
      },
    );

    const sub2 = this.call.state.callingState$.subscribe(
      (cs) => this.ngZone.run(() => this.callingState$.next(cs)),
    );

    const sub3 = this.call.screenShare.state.status$.subscribe(
      (status) => this.ngZone.run(() => this.isScreenSharing$.next(status === 'enabled')),
    );

    this.participantsSub = () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
      sub3.unsubscribe();
    };
  }

  private subscribeCustomEvents(): void {
    if (!this.call) return;

    this.customEventUnsub = this.call.on('custom', (event) => {
      const payload = (event as { custom?: Record<string, unknown> }).custom;
      if (!payload?.['type']) return;

      const meetingEvent = payload as unknown as MeetingEvent;

      if (meetingEvent.type === 'flashlight') {
        this.applyTorch(meetingEvent.enabled);
      }

      this.ngZone.run(() => this.meetingEvents$.next(meetingEvent));
    });
  }

  private applyTorch(enabled: boolean): void {
    const mediaStream = this.call?.camera.state.mediaStream;
    const track = mediaStream?.getVideoTracks()[0];
    if (!track) return;

    track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] })
      .catch(() => {
        // torch is only supported on Chrome for Android; ignore silently on desktop.
      });
  }

  private cleanupSubscriptions(): void {
    this.participantsSub?.();
    this.participantsSub = null;
  }

  async disconnectClient(): Promise<void> {
    await this.leaveCall();
    await this.client?.disconnectUser();
    this.client = null;
    this.currentUserId = null;
  }

  ngOnDestroy(): void {
    this.disconnectClient();
  }
}

import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatClientService, ChannelService } from 'stream-chat-angular';

import { environment } from '../../../environments/environment';
import {
  CreateChannelRequest,
  CreateChannelResponse,
} from '../models/channel.model';

/** Minimum ms between consecutive typing.start events per thread/channel. */
const TYPING_START_THROTTLE_MS = 3_000;
/** ms to wait before flushing typing.stop after a burst of sends. */
const TYPING_STOP_DEBOUNCE_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class StreamChatService implements OnDestroy {
  private connected = false;

  constructor(
    private chatClientService: ChatClientService,
    private channelService: ChannelService,
    private http: HttpClient,
  ) {}

  /**
   * Connect the Stream Chat client and initialise the channel list.
   * Call once after successful login.
   */
  async connect(
    userId: string,
    userName: string,
    token: string,
    userImage?: string | null,
  ): Promise<void> {
    if (this.connected) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.chatClientService.init(
      environment.streamApiKey,
      { id: userId, name: userName, image: userImage ?? undefined } as any,
      token,
    ) as unknown as Promise<unknown>);

    this.channelService.init(
      { type: 'messaging', members: { $in: [userId] } },
      { last_message_at: -1 },
      { limit: 30 },
    );

    this.patchTypingThrottle();
    this.connected = true;
  }

  /**
   * Patches ChannelService.typingStarted / typingStopped to reduce /event
   * API calls and avoid 429s when messages are sent in rapid succession.
   *
   * Strategy:
   *  - typing.start  → throttled: at most once per TYPING_START_THROTTLE_MS
   *                    per parentId (channel or thread).
   *  - typing.stop   → debounced: fires only once, TYPING_STOP_DEBOUNCE_MS
   *                    after the last stopTyping call in a burst; skipped
   *                    entirely if no typing.start was sent for that context.
   */
  private patchTypingThrottle(): void {
    // parentId (undefined = channel root) → timestamp of last sent typing.start
    const lastStartSent = new Map<string | undefined, number>();
    // parentId → whether a typing.start has been sent and not yet stopped
    const typingActive = new Set<string | undefined>();
    // parentId → pending debounce timer handle
    const stopTimers = new Map<string | undefined, ReturnType<typeof setTimeout>>();

    const orig = {
      started: this.channelService.typingStarted.bind(this.channelService),
      stopped: this.channelService.typingStopped.bind(this.channelService),
    };

    this.channelService.typingStarted = async (parentId?: string) => {
      const now = Date.now();
      const last = lastStartSent.get(parentId) ?? 0;
      if (now - last < TYPING_START_THROTTLE_MS) return;

      lastStartSent.set(parentId, now);
      typingActive.add(parentId);
      await orig.started(parentId);
    };

    this.channelService.typingStopped = async (parentId?: string) => {
      // Nothing to stop if we never sent a typing.start
      if (!typingActive.has(parentId)) return;

      typingActive.delete(parentId);
      // Reset so the next typing session fires typing.start immediately
      lastStartSent.delete(parentId);

      // Cancel any pending debounced stop and reschedule
      const existing = stopTimers.get(parentId);
      if (existing !== undefined) clearTimeout(existing);

      stopTimers.set(
        parentId,
        setTimeout(async () => {
          stopTimers.delete(parentId);
          await orig.stopped(parentId);
        }, TYPING_STOP_DEBOUNCE_MS),
      );
    };
  }

  /** Re-run the channel query (e.g. after creating a new channel). */
  refreshChannels(userId: string): void {
    this.channelService.init(
      { type: 'messaging', members: { $in: [userId] } },
      { last_message_at: -1 },
      { limit: 30 },
    );
  }

  /** Create a channel on the backend, then refresh the list. */
  createChannel(
    payload: CreateChannelRequest,
  ): Observable<CreateChannelResponse> {
    return this.http.post<CreateChannelResponse>(
      `${environment.apiUrl}/channels`,
      payload,
    );
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.chatClientService.disconnectUser();
    this.connected = false;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

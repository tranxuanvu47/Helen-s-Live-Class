import { Injectable, OnDestroy } from '@angular/core';
import { ChatClientService, ChannelService } from 'stream-chat-angular';
import { StreamChat, Channel } from 'stream-chat';

import { environment } from '../../../environments/environment';

/** Minimum ms between consecutive typing.start events per thread/channel. */
const TYPING_START_THROTTLE_MS = 3_000;
/** ms to wait before flushing typing.stop after a burst of sends. */
const TYPING_STOP_DEBOUNCE_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class StreamChatService implements OnDestroy {
  private connected = false;
  private client: StreamChat | null = null;

  constructor(
    private chatClientService: ChatClientService,
    private channelService: ChannelService,
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

    this.client = StreamChat.getInstance(environment.streamApiKey);

    await this.client.connectUser(
      { id: userId, name: userName, image: userImage ?? undefined },
      token,
    );

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
      if (!typingActive.has(parentId)) return;

      typingActive.delete(parentId);
      lastStartSent.delete(parentId);

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

  /** Create a channel client-side using Stream Chat SDK. */
  async createChannel(
    memberIds: string[],
    channelName?: string,
  ): Promise<Channel> {
    if (!this.client) throw new Error('Chat client not connected');

    const channel = this.client.channel('messaging', {
      members: memberIds,
      name: channelName,
    });

    await channel.watch();
    return channel;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.chatClientService.disconnectUser();
    this.client = null;
    this.connected = false;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

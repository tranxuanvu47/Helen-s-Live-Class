import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChatClientService,
  ChannelService,
  StreamChatModule,
  StreamAutocompleteTextareaModule,
  StreamI18nService,
} from 'stream-chat-angular';

import { AuthResponse } from '../app/core/models/auth.model';

@Component({
  selector: 'stream-chat-widget',
  standalone: true,
  imports: [CommonModule, StreamChatModule, StreamAutocompleteTextareaModule],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent implements OnChanges, OnDestroy {
  /** ID of the channel to open. Maps to the `channel-id` HTML attribute. */
  @Input() channelId = '';

  /** ID of the user connecting to chat. Maps to the `user-id` HTML attribute. */
  @Input() userId = '';

  /**
   * Optional display name for the user.
   * If omitted, falls back to `userId`. Maps to `user-name` attribute.
   */
  @Input() userName = '';

  /**
   * Base URL of the Stream Chat backend.
   * Defaults to `/api`; override when the widget is hosted on a different origin.
   * Maps to the `api-url` HTML attribute.
   */
  @Input() apiUrl = '/api';

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly connected = signal(false);

  private disconnectFn: (() => Promise<void>) | null = null;

  constructor(
    private readonly chatClientService: ChatClientService,
    private readonly channelService: ChannelService,
    private readonly http: HttpClient,
    streamI18n: StreamI18nService,
  ) {
    streamI18n.setTranslation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const channelChanged = 'channelId' in changes;
    const userChanged = 'userId' in changes;

    if ((channelChanged || userChanged) && this.channelId && this.userId) {
      void this.initWidget();
    }
  }

  ngOnDestroy(): void {
    void this.disconnectFn?.();
  }

  private async initWidget(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.connected.set(false);

    // Disconnect a previous session before starting a new one
    if (this.disconnectFn) {
      await this.disconnectFn();
      this.disconnectFn = null;
    }

    try {
      const authRes = await this.fetchToken();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.chatClientService.init(
        authRes.apiKey,
        {
          id: authRes.userId,
          name: authRes.userName,
          image: authRes.userImage ?? undefined,
        } as any,
        authRes.token,
      ) as unknown as Promise<unknown>);

      this.disconnectFn = () => this.chatClientService.disconnectUser();

      const channel = this.chatClientService.chatClient.channel(
        'messaging',
        this.channelId,
      );
      await channel.watch();
      this.channelService.setAsActiveChannel(channel);

      this.connected.set(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to connect to chat';
      this.error.set(message);
      console.error('[stream-chat-widget]', err);
    } finally {
      this.loading.set(false);
    }
  }

  private fetchToken(): Promise<AuthResponse> {
    const displayName = this.userName || this.userId;
    return new Promise((resolve, reject) => {
      this.http
        .post<AuthResponse>(`${this.apiUrl}/auth/token`, {
          userId: this.userId,
          userName: displayName,
        })
        .subscribe({ next: resolve, error: reject });
    });
  }
}

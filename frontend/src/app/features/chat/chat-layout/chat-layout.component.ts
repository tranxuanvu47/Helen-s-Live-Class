import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Channel } from 'stream-chat';
import { ChannelService, CustomTemplatesService, DefaultStreamChatGenerics, StreamChatModule } from 'stream-chat-angular';
import { Subscription, combineLatest } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { StreamChatService } from '../../../core/services/stream-chat.service';
import { StreamVideoService } from '../../../core/services/stream-video.service';
import { ChannelHideService } from '../../../core/services/channel-hide.service';
import { HeaderComponent } from '../../../shared/components/header/header.component';
import { CreateChannelModalComponent } from '../create-channel-modal/create-channel-modal.component';
import { ChannelContextMenuComponent } from '../channel-context-menu/channel-context-menu.component';
import { EditChannelModalComponent } from '../edit-channel-modal/edit-channel-modal.component';
import { AuthUser } from '../../../core/models/auth.model';

type StreamChannel = Channel<DefaultStreamChatGenerics>;

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  channel: StreamChannel | null;
}

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    StreamChatModule,
    HeaderComponent,
    CreateChannelModalComponent,
    ChannelContextMenuComponent,
    EditChannelModalComponent,
  ],
  templateUrl: './chat-layout.component.html',
  styleUrl: './chat-layout.component.scss',
})
export class ChatLayoutComponent implements OnInit, AfterViewInit, OnDestroy {
  // ── General ───────────────────────────────────────────────────────────────
  user: AuthUser | null = null;
  showCreateModal = signal(false);
  isStartingMeeting = signal(false);

  // ── Mobile sidebar state ──────────────────────────────────────────────────
  isSidebarOpen = signal(false);

  // ── Join Meeting modal ────────────────────────────────────────────────────
  showJoinModal = signal(false);
  joinError = signal('');

  // ── Meeting Created modal ─────────────────────────────────────────────────
  showMeetingCreatedModal = signal(false);
  createdMeetingId = signal('');
  isMeetingIdCopied = signal(false);

  // ── Sidebar tabs ──────────────────────────────────────────────────────────
  activeTab = signal<'channels' | 'hidden'>('channels');

  // ── Channel hide state ────────────────────────────────────────────────────
  hiddenIds = signal<Set<string>>(new Set());
  hiddenChannels = signal<StreamChannel[]>([]);
  activeChannelCid = signal<string | undefined>(undefined);

  // ── Context menu ──────────────────────────────────────────────────────────
  contextMenuState = signal<ContextMenuState>({ visible: false, x: 0, y: 0, channel: null });

  // ── Edit channel modal ────────────────────────────────────────────────────
  editChannelTarget = signal<StreamChannel | null>(null);

  // ── Custom channel preview template ──────────────────────────────────────
  @ViewChild('channelPreviewTpl', { static: false })
  channelPreviewTpl!: TemplateRef<{ channel: StreamChannel }>;

  private subs = new Subscription();
  private allChannels: StreamChannel[] = [];

  constructor(
    private auth: AuthService,
    private chatService: StreamChatService,
    private videoService: StreamVideoService,
    private router: Router,
    private channelService: ChannelService,
    private customTemplatesService: CustomTemplatesService,
    private channelHideService: ChannelHideService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.user = this.auth.currentUser;

    if (!this.user) {
      this.router.navigate(['/login']);
      return;
    }

    this.chatService
      .connect(this.user.userId, this.user.userName, this.user.token, this.user.userImage)
      .then(() => {
        this.videoService.initClient(
          this.user!.userId,
          this.user!.userName,
          this.user!.token,
          this.user!.userImage,
        );
      })
      .catch(console.error);

    // Track active channel
    this.subs.add(
      this.channelService.activeChannel$.subscribe((ch) => {
        this.ngZone.run(() => this.activeChannelCid.set(ch?.cid));
      }),
    );

    // Track channels + hidden IDs together so hiddenChannels stays in sync
    this.subs.add(
      combineLatest([
        this.channelService.channels$,
        this.channelHideService.hiddenChannelIds$,
      ]).subscribe(([channels, hiddenSet]) => {
        this.ngZone.run(() => {
          this.allChannels = channels ?? [];
          this.hiddenIds.set(new Set(hiddenSet));
          this.hiddenChannels.set(
            this.allChannels.filter((c) => hiddenSet.has(c.cid)),
          );
        });
      }),
    );
  }

  ngAfterViewInit(): void {
    // Register the custom channel preview template with stream-chat-angular
    this.customTemplatesService.channelPreviewTemplate$.next(
      this.channelPreviewTpl as TemplateRef<{ channel: StreamChannel }>,
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    // Reset the template so it doesn't linger if the component is destroyed
    this.customTemplatesService.channelPreviewTemplate$.next(undefined);
  }

  // ── Mobile sidebar ────────────────────────────────────────────────────────
  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  // ── Channel helpers ───────────────────────────────────────────────────────

  selectChannel(channel: StreamChannel): void {
    this.channelService.setAsActiveChannel(channel);
    // Switch to channels tab when opening a hidden channel from the hidden tab
    if (this.activeTab() === 'hidden') {
      this.activeTab.set('channels');
    }
    // Close sidebar on mobile after selecting
    this.closeSidebar();
  }

  getChannelInitials(channel: StreamChannel): string {
    const name: string = (channel.data?.['name'] as string | undefined) ?? '';
    return name.trim().slice(0, 2).toUpperCase() || '#';
  }

  getLastMessageText(channel: StreamChannel): string {
    const messages = channel.state?.messages ?? [];
    const last = messages[messages.length - 1];
    if (!last) return 'No messages yet';
    const text: string = (last as { text?: string }).text ?? '';
    return text.length > 50 ? text.slice(0, 47) + '…' : text || 'Attachment';
  }

  getChannelName(channel: StreamChannel): string {
    return (channel.data?.['name'] as string | undefined) ?? channel.cid;
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  openContextMenu(event: MouseEvent, channel: StreamChannel): void {
    event.preventDefault();
    event.stopPropagation();

    // Walk up from the actual clicked element to the channel row.
    // currentTarget can be unreliable inside ng-template projections.
    const row = (event.target as HTMLElement).closest<HTMLElement>('.custom-preview');

    if (row) {
      const rect = row.getBoundingClientRect();
      const MENU_W = 204;
      const MENU_H = 120;
      const x = Math.min(rect.left, window.innerWidth - MENU_W - 8);
      const y = rect.bottom + MENU_H <= window.innerHeight
        ? rect.bottom + 2
        : rect.top - MENU_H - 2;
      this.contextMenuState.set({ visible: true, x, y, channel });
    } else {
      // Fallback: place near the cursor
      this.contextMenuState.set({ visible: true, x: event.clientX, y: event.clientY + 4, channel });
    }
  }

  closeContextMenu(): void {
    this.contextMenuState.set({ visible: false, x: 0, y: 0, channel: null });
  }

  onEditChannel(channel: StreamChannel): void {
    this.editChannelTarget.set(channel);
  }

  closeEditModal(): void {
    this.editChannelTarget.set(null);
  }

  @HostListener('document:contextmenu', ['$event'])
  onDocumentContextMenu(event: MouseEvent): void {
    // If the context menu is open and the user right-clicks elsewhere, close it
    if (this.contextMenuState().visible) {
      this.closeContextMenu();
    }
  }

  onHideToggle(channel: StreamChannel): void {
    if (this.channelHideService.isHidden(channel.cid)) {
      this.channelHideService.unhide(channel.cid);
    } else {
      this.channelHideService.hide(channel.cid);
      // If this was the active channel, deselect it
      if (this.activeChannelCid() === channel.cid) {
        this.channelService.deselectActiveChannel();
      }
    }
  }

  async onDeleteChannel(channel: StreamChannel): Promise<void> {
    try {
      await channel.delete();
      this.channelService.removeChannel(channel.cid);
      this.channelHideService.unhide(channel.cid);
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  }

  // ── Create modal ──────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  // ── Start Meeting ─────────────────────────────────────────────────────────

  async startMeeting(): Promise<void> {
    if (!this.user || this.isStartingMeeting()) return;
    this.isStartingMeeting.set(true);

    this.videoService
      .createMeeting({ createdById: this.user.userId })
      .subscribe({
        next: (res) => {
          this.isStartingMeeting.set(false);
          this.createdMeetingId.set(res.callId);
          this.isMeetingIdCopied.set(false);
          this.showMeetingCreatedModal.set(true);
          navigator.clipboard.writeText(res.callId).then(() => {
            this.isMeetingIdCopied.set(true);
          }).catch(console.error);
        },
        error: (err) => {
          console.error('Failed to create meeting', err);
          this.isStartingMeeting.set(false);
        },
      });
  }

  joinCreatedMeeting(): void {
    const id = this.createdMeetingId();
    this.showMeetingCreatedModal.set(false);
    this.router.navigate(['/meeting', id]);
  }

  copyCreatedMeetingId(): void {
    navigator.clipboard.writeText(this.createdMeetingId()).then(() => {
      this.isMeetingIdCopied.set(true);
      setTimeout(() => this.isMeetingIdCopied.set(false), 2000);
    }).catch(console.error);
  }

  // ── Join Meeting ──────────────────────────────────────────────────────────

  openJoinModal(): void {
    this.joinError.set('');
    this.showJoinModal.set(true);
  }

  closeJoinModal(): void {
    this.showJoinModal.set(false);
  }

  joinMeeting(idInput: HTMLInputElement): void {
    const id = idInput.value.trim();
    if (!id) {
      this.joinError.set('Please enter a Meeting ID.');
      return;
    }
    this.showJoinModal.set(false);
    this.router.navigate(['/meeting', id]);
  }
}

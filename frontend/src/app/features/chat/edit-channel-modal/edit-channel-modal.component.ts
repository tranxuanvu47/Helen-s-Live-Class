import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Channel, DefaultGenerics, UserResponse } from 'stream-chat';
import { ChatClientService, DefaultStreamChatGenerics } from 'stream-chat-angular';

type StreamChannel = Channel<DefaultStreamChatGenerics>;

interface MemberInfo {
  userId: string;
  name: string;
  image?: string;
}

interface UserResult {
  id: string;
  name: string;
  image?: string;
}

@Component({
  selector: 'app-edit-channel-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-channel-modal.component.html',
  styleUrl: './edit-channel-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditChannelModalComponent implements OnInit {
  @Input({ required: true }) channel!: StreamChannel;
  @Input() currentUserId = '';

  @Output() readonly closed = new EventEmitter<void>();

  // ── Channel name ──────────────────────────────────────────────────────────
  channelName = '';
  isSavingName = signal(false);
  nameError = signal('');
  nameSaved = signal(false);

  // ── Members ───────────────────────────────────────────────────────────────
  members = signal<MemberInfo[]>([]);
  removingId = signal<string | null>(null);

  // ── Add member search ─────────────────────────────────────────────────────
  searchQuery = '';
  searchResults = signal<UserResult[]>([]);
  isSearching = signal(false);
  searchError = signal('');
  addingId = signal<string | null>(null);

  private searchTimeout?: ReturnType<typeof setTimeout>;

  constructor(private chatClientService: ChatClientService) {}

  ngOnInit(): void {
    this.channelName = (this.channel.data?.['name'] as string | undefined) ?? '';
    this.loadMembers();
  }

  private loadMembers(): void {
    const raw = this.channel.state.members;
    this.members.set(
      Object.values(raw).map((m) => ({
        userId: m.user_id ?? m.user?.id ?? '',
        name: m.user?.name ?? m.user_id ?? '',
        image: m.user?.image as string | undefined,
      })),
    );
  }

  getInitials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase() || '?';
  }

  // ── Save channel name ──────────────────────────────────────────────────────
  async saveName(): Promise<void> {
    const trimmed = this.channelName.trim();
    if (!trimmed) {
      this.nameError.set('Channel name is required.');
      return;
    }
    if (trimmed === (this.channel.data?.['name'] as string | undefined)) {
      this.nameError.set('');
      this.nameSaved.set(true);
      setTimeout(() => this.nameSaved.set(false), 2000);
      return;
    }

    this.isSavingName.set(true);
    this.nameError.set('');
    try {
      await this.channel.update({ name: trimmed } as Parameters<typeof this.channel.update>[0]);
      this.nameSaved.set(true);
      setTimeout(() => this.nameSaved.set(false), 2000);
    } catch (err) {
      console.error('Failed to update channel name', err);
      this.nameError.set('Failed to update. Please try again.');
    } finally {
      this.isSavingName.set(false);
    }
  }

  // ── Remove member ─────────────────────────────────────────────────────────
  async removeMember(userId: string): Promise<void> {
    if (userId === this.currentUserId) return;
    this.removingId.set(userId);
    try {
      await this.channel.removeMembers([userId]);
      this.loadMembers();
    } catch (err) {
      console.error('Failed to remove member', err);
    } finally {
      this.removingId.set(null);
    }
  }

  // ── Search users ──────────────────────────────────────────────────────────
  onSearchInput(): void {
    clearTimeout(this.searchTimeout);
    const q = this.searchQuery.trim();
    if (!q) {
      this.searchResults.set([]);
      this.searchError.set('');
      return;
    }
    this.searchTimeout = setTimeout(() => this.runSearch(q), 300);
  }

  private async runSearch(q: string): Promise<void> {
    this.isSearching.set(true);
    this.searchError.set('');
    try {
      const currentIds = this.members().map((m) => m.userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await this.chatClientService.chatClient.queryUsers(
        { $or: [{ id: { $autocomplete: q } }, { name: { $autocomplete: q } }] } as any,
        { id: 1 },
        { limit: 8 },
      );
      const filtered = res.users
        .filter((u) => !currentIds.includes(u.id))
        .map((u) => ({
          id: u.id,
          name: (u.name as string | undefined) ?? u.id,
          image: u.image as string | undefined,
        }));
      this.searchResults.set(filtered);
      if (filtered.length === 0) this.searchError.set('No users found.');
    } catch (err) {
      console.error('User search failed', err);
      this.searchError.set('Search failed. Try again.');
    } finally {
      this.isSearching.set(false);
    }
  }

  async addMember(user: UserResult): Promise<void> {
    this.addingId.set(user.id);
    try {
      await this.channel.addMembers([user.id]);
      this.searchResults.set(this.searchResults().filter((u) => u.id !== user.id));
      this.loadMembers();
    } catch (err) {
      console.error('Failed to add member', err);
    } finally {
      this.addingId.set(null);
    }
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ecm-backdrop')) {
      this.close();
    }
  }
}

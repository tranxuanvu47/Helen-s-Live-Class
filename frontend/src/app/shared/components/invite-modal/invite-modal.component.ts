import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { StreamChatService } from '../../../core/services/stream-chat.service';
import { MeetingInviteService } from '../../../core/services/meeting-invite.service';
import { AuthUser } from '../../../core/models/auth.model';

interface SearchResult {
  id: string;
  name: string;
  image?: string;
  invited: boolean;
}

@Component({
  selector: 'app-invite-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invite-modal.component.html',
  styleUrl: './invite-modal.component.scss',
})
export class InviteModalComponent implements OnInit {
  @Input() callId = '';
  @Output() closed = new EventEmitter<void>();

  currentUser: AuthUser | null = null;
  searchQuery = '';
  searchResults = signal<SearchResult[]>([]);
  isSearching = signal(false);
  isSending = signal(false);

  constructor(
    private auth: AuthService,
    private chatService: StreamChatService,
    private inviteService: MeetingInviteService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.currentUser;
  }

  async searchUsers(): Promise<void> {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.searchResults.set([]);
      return;
    }
    this.isSearching.set(true);
    try {
      const client = this.chatService.getClient();
      if (!client) {
        this.isSearching.set(false);
        return;
      }
      const response = await client.queryUsers(
        { $or: [{ name: { $autocomplete: query } }, { id: { $autocomplete: query } }] },
        { id: 1, name: 1 },
        { limit: 15 },
      );
      const results: SearchResult[] = response.users
        .filter((u) => u.id !== this.currentUser?.userId)
        .map((u) => ({
          id: u.id,
          name: u.name || u.id,
          image: u.image,
          invited: false,
        }));
      this.searchResults.set(results);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      this.isSearching.set(false);
    }
  }

  async inviteUser(user: SearchResult): Promise<void> {
    if (user.invited || !this.currentUser || this.isSending()) return;
    this.isSending.set(true);
    try {
      this.inviteService.sendInvite(
        this.callId,
        this.currentUser.userName,
        this.currentUser.userImage ?? undefined,
      );

      const channel = await this.chatService.createChannel(
        [this.currentUser.userId, user.id],
        `${this.currentUser.userName} invited you to a meeting`,
      );
      await channel.sendMessage({
        text: `${this.currentUser.userName} invited you to join meeting: ${this.callId}`,
        metadata: {
          type: 'meeting_invite',
          callId: this.callId,
          hostName: this.currentUser.userName,
        },
      });

      this.searchResults.update((results) =>
        results.map((r) => (r.id === user.id ? { ...r, invited: true } : r)),
      );
    } catch (err) {
      console.error('Invite failed', err);
    } finally {
      this.isSending.set(false);
    }
  }

  getInitials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase();
  }

  close(): void {
    this.closed.emit();
  }
}

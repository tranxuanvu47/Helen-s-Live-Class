import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MeetingInviteService, MeetingInviteNotification } from '../../../core/services/meeting-invite.service';

@Component({
  selector: 'app-meeting-invite-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './meeting-invite-toast.component.html',
  styleUrl: './meeting-invite-toast.component.scss',
})
export class MeetingInviteToastComponent implements OnInit, OnDestroy {
  @Input() autoShow = true;
  @Output() dismiss = new EventEmitter<void>();

  invites = signal<MeetingInviteNotification[]>([]);
  visible = signal(false);
  currentInvite = signal<MeetingInviteNotification | null>(null);
  private queue: MeetingInviteNotification[] = [];
  private sub: Subscription | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private inviteService: MeetingInviteService, private router: Router) {}

  ngOnInit(): void {
    this.sub = this.inviteService.invites$.subscribe((invites) => {
      const unread = invites.filter((i) => !i.read);
      this.invites.set(unread);

      if (unread.length > 0) {
        if (!this.visible() && this.autoShow) {
          this.showNext();
        }
      }
    });
  }

  private showNext(): void {
    const all = this.invites();
    const next = all.find((i) => !i.read);
    if (next) {
      this.currentInvite.set(next);
      this.visible.set(true);
      this.inviteService.markAsRead(next.id);
      this.scheduleDismiss();
    }
  }

  private scheduleDismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.hideToast(), 8000);
  }

  joinMeeting(): void {
    const invite = this.currentInvite();
    if (!invite) return;
    this.clearDismiss();
    this.router.navigate(['/meeting', invite.callId]);
  }

  skipToNext(): void {
    this.clearDismiss();
    const was = this.currentInvite();
    if (was) this.inviteService.markAsRead(was.id);
    this.currentInvite.set(null);
    this.visible.set(false);
    setTimeout(() => {
      const remaining = this.invites().filter((i) => !i.read);
      if (remaining.length > 0) {
        this.showNext();
      }
    }, 300);
  }

  hideToast(): void {
    this.clearDismiss();
    const was = this.currentInvite();
    if (was) this.inviteService.markAsRead(was.id);
    this.visible.set(false);
    this.currentInvite.set(null);
    this.dismiss.emit();
  }

  private clearDismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  getInitials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase();
  }

  getTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }

  get unreadCount(): number {
    return this.invites().filter((i) => !i.read).length;
  }

  ngOnDestroy(): void {
    this.clearDismiss();
    this.sub?.unsubscribe();
  }
}

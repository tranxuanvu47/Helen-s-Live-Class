import { Component, EventEmitter, Input, Output, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StreamChatService } from '../../../core/services/stream-chat.service';
import { StreamVideoService } from '../../../core/services/stream-video.service';
import { AuthUser } from '../../../core/models/auth.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  @Input() user: AuthUser | null = null;
  @Input() isSidebarOpen = false;
  @Output() newChannel = new EventEmitter<void>();
  @Output() startMeeting = new EventEmitter<void>();
  @Output() joinMeeting = new EventEmitter<void>();
  @Output() toggleSidebar = new EventEmitter<void>();

  showMeetingMenu = signal(false);

  constructor(
    private auth: AuthService,
    private chatService: StreamChatService,
    private videoService: StreamVideoService,
    private router: Router,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.app-header__meeting-wrapper')) {
      this.showMeetingMenu.set(false);
    }
  }

  toggleMeetingMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.showMeetingMenu.update((v) => !v);
  }

  onStartMeeting(): void {
    this.showMeetingMenu.set(false);
    this.startMeeting.emit();
  }

  onJoinMeeting(): void {
    this.showMeetingMenu.set(false);
    this.joinMeeting.emit();
  }

  async logout(): Promise<void> {
    await this.chatService.disconnect();
    await this.videoService.disconnectClient();
    this.auth.logout();
  }

  getInitials(): string {
    const name = this.user?.userName ?? 'U';
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}

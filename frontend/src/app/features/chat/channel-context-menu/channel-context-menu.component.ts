import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Channel } from 'stream-chat';
import { DefaultStreamChatGenerics } from 'stream-chat-angular';

type StreamChannel = Channel<DefaultStreamChatGenerics>;

@Component({
  selector: 'app-channel-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-context-menu.component.html',
  styleUrl: './channel-context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelContextMenuComponent {
  @Input({ required: true }) x = 0;
  @Input({ required: true }) y = 0;
  @Input({ required: true }) channel!: StreamChannel;
  @Input() isHidden = false;

  @Output() readonly hideToggle = new EventEmitter<StreamChannel>();
  @Output() readonly editChannel = new EventEmitter<StreamChannel>();
  @Output() readonly deleteChannel = new EventEmitter<StreamChannel>();
  @Output() readonly close = new EventEmitter<void>();

  confirmDelete = signal(false);

  /** Skip the very first document click that opened this menu. */
  private skipNextDocumentClick = true;

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.skipNextDocumentClick) {
      this.skipNextDocumentClick = false;
      return;
    }
    this.close.emit();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.close.emit();
  }

  onHideToggle(): void {
    this.hideToggle.emit(this.channel);
    this.close.emit();
  }

  onEdit(): void {
    this.editChannel.emit(this.channel);
    this.close.emit();
  }

  onDeleteRequest(): void {
    this.confirmDelete.set(true);
  }

  onDeleteConfirm(): void {
    this.deleteChannel.emit(this.channel);
    this.close.emit();
  }

  onDeleteCancel(): void {
    this.confirmDelete.set(false);
  }
}

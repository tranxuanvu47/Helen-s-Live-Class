import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { StreamChatService } from '../../../core/services/stream-chat.service';
import { AuthUser } from '../../../core/models/auth.model';

@Component({
  selector: 'app-create-channel-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-channel-modal.component.html',
  styleUrl: './create-channel-modal.component.scss',
})
export class CreateChannelModalComponent {
  @Input() user!: AuthUser;
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<string>();

  form: FormGroup;
  isLoading = signal(false);
  errorMessage = signal('');

  constructor(
    private fb: FormBuilder,
    private chatService: StreamChatService,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
      description: ['', [Validators.maxLength(200)]],
      members: [''],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const { name, description, members: membersRaw } = this.form.value as {
        name: string;
        description: string;
        members: string;
      };

      const memberList = membersRaw
        ? membersRaw.split(',').map((m: string) => m.trim()).filter(Boolean)
        : [];

      const memberIds = [...new Set([this.user.userId, ...memberList])];

      const channel = await this.chatService.createChannel(memberIds, name.trim());

      if (description.trim()) {
        await channel.updatePartial({ set: { description: description.trim() } });
      }

      this.chatService.refreshChannels(this.user.userId);
      this.created.emit(channel.id);
      this.close();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to create channel.';
      this.errorMessage.set(message);
      this.isLoading.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }
}

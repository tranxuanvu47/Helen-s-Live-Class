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

  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { name, description, members: membersRaw } = this.form.value as {
      name: string;
      description: string;
      members: string;
    };

    const members = membersRaw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    this.chatService
      .createChannel({
        name: name.trim(),
        description: description.trim(),
        createdById: this.user.userId,
        members,
      })
      .subscribe({
        next: (res) => {
          this.chatService.refreshChannels(this.user.userId);
          this.created.emit(res.channelId);
          this.close();
        },
        error: (err) => {
          this.errorMessage.set(
            err?.error?.error?.message ?? 'Failed to create channel.',
          );
          this.isLoading.set(false);
        },
      });
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

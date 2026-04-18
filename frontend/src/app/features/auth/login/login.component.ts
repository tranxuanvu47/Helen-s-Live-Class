import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../../core/services/auth.service';
import { StreamChatService } from '../../../core/services/stream-chat.service';
import { StreamVideoService } from '../../../core/services/stream-video.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  form: FormGroup;
  isLoading = signal(false);
  errorMessage = signal('');

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private chatService: StreamChatService,
    private videoService: StreamVideoService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      userId: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      userName: ['', [Validators.required, Validators.minLength(2)]],
      userImage: ['', [Validators.pattern(/^https?:\/\/.+/)]],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { userId, userName, userImage } = this.form.value as {
      userId: string;
      userName: string;
      userImage: string;
    };

    this.auth
      .login({ userId: userId.trim(), userName: userName.trim(), userImage: userImage || undefined })
      .subscribe({
        next: async (res) => {
          await this.chatService.connect(res.userId, res.userName, res.token, res.userImage);
          this.videoService.initClient(res.userId, res.userName, res.token, res.userImage);
          this.router.navigate(['/chat']);
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.error?.message ?? 'Login failed. Please try again.');
          this.isLoading.set(false);
        },
      });
  }

  async loginAsGuest(): Promise<void> {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.auth.loginAsGuest().subscribe({
      next: async (res) => {
        await this.chatService.connect(res.userId, res.userName, res.token, res.userImage);
        this.videoService.initClient(res.userId, res.userName, res.token, res.userImage);
        this.router.navigate(['/chat']);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.error?.message ?? 'Guest login failed.');
        this.isLoading.set(false);
      },
    });
  }

  getFieldError(field: string): string {
    const ctrl = this.form.get(field);
    if (!ctrl || !ctrl.touched || ctrl.valid) return '';
    if (ctrl.errors?.['required']) return 'This field is required.';
    if (ctrl.errors?.['minlength'])
      return `Minimum ${ctrl.errors['minlength'].requiredLength} characters.`;
    if (ctrl.errors?.['pattern']) {
      if (field === 'userId') return 'Only letters, numbers, underscores and hyphens allowed.';
      if (field === 'userImage') return 'Must be a valid URL (http/https).';
    }
    return 'Invalid value.';
  }
}

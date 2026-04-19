import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SignJWT } from 'jose';
import { v4 as uuidv4 } from 'uuid';

import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, LoginRequest } from '../models/auth.model';

const STORAGE_KEY = 'stream_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(
    this.loadFromStorage(),
  );

  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private router: Router) {}

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  private async createStreamToken(userId: string): Promise<string> {
    const encoder = new TextEncoder();
    const secret = encoder.encode(environment.streamApiSecret);

    const expiresAt = Math.floor(Date.now() / 1000) + 86_400;

    const token = await new SignJWT({ user_id: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(secret);

    return token;
  }

  async login(payload: LoginRequest): Promise<AuthResponse> {
    const userId = payload.userId.trim();
    const userName = payload.userName.trim();
    const userImage = payload.userImage || undefined;

    const token = await this.createStreamToken(userId);

    const response: AuthResponse = {
      token,
      userId,
      userName,
      userImage: userImage ?? null,
      apiKey: environment.streamApiKey,
    };

    const user: AuthUser = { ...response };
    this.persist(user);
    this.currentUserSubject.next(user);

    return response;
  }

  async loginAsGuest(): Promise<AuthResponse> {
    const suffix = uuidv4().replace(/-/g, '').slice(0, 8);
    const userId = `guest_${suffix}`;
    const userName = `Guest ${suffix.slice(0, 4).toUpperCase()}`;

    const token = await this.createStreamToken(userId);

    const response: AuthResponse = {
      token,
      userId,
      userName,
      userImage: null,
      apiKey: environment.streamApiKey,
    };

    const user: AuthUser = { ...response };
    this.persist(user);
    this.currentUserSubject.next(user);

    return response;
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  private persist(user: AuthUser): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  private loadFromStorage(): AuthUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface MeetingInviteNotification {
  id: string;
  callId: string;
  hostName: string;
  hostImage?: string;
  timestamp: number;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class MeetingInviteService {
  private readonly STORAGE_KEY = 'meeting_invites';

  private invitesSubject = new BehaviorSubject<MeetingInviteNotification[]>([]);
  readonly invites$ = this.invitesSubject.asObservable();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const invites: MeetingInviteNotification[] = JSON.parse(raw);
        this.invitesSubject.next(invites);
      }
    } catch {
      this.invitesSubject.next([]);
    }
  }

  private saveToStorage(invites: MeetingInviteNotification[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(invites));
    } catch {
      // ignore storage errors
    }
  }

  sendInvite(callId: string, hostName: string, hostImage?: string): MeetingInviteNotification {
    const invite: MeetingInviteNotification = {
      id: `${callId}-${Date.now()}`,
      callId,
      hostName,
      hostImage,
      timestamp: Date.now(),
      read: false,
    };
    const current = this.invitesSubject.value;
    const updated = [invite, ...current].slice(0, 20);
    this.invitesSubject.next(updated);
    this.saveToStorage(updated);
    return invite;
  }

  getUnreadCount(): number {
    return this.invitesSubject.value.filter((i) => !i.read).length;
  }

  markAsRead(id: string): void {
    const updated = this.invitesSubject.value.map((i) =>
      i.id === id ? { ...i, read: true } : i,
    );
    this.invitesSubject.next(updated);
    this.saveToStorage(updated);
  }

  dismissInvite(id: string): void {
    const updated = this.invitesSubject.value.filter((i) => i.id !== id);
    this.invitesSubject.next(updated);
    this.saveToStorage(updated);
  }

  clearAll(): void {
    this.invitesSubject.next([]);
    this.saveToStorage([]);
  }
}

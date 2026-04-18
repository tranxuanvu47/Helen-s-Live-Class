import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const STORAGE_KEY = 'stream_chat_hidden_channels';

@Injectable({ providedIn: 'root' })
export class ChannelHideService {
  private readonly ids: Set<string>;
  readonly hiddenChannelIds$ = new BehaviorSubject<Set<string>>(new Set<string>());

  constructor() {
    this.ids = new Set(this.load());
    this.hiddenChannelIds$.next(new Set(this.ids));
  }

  hide(cid: string): void {
    this.ids.add(cid);
    this.flush();
  }

  unhide(cid: string): void {
    this.ids.delete(cid);
    this.flush();
  }

  isHidden(cid: string): boolean {
    return this.ids.has(cid);
  }

  private flush(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.ids]));
    this.hiddenChannelIds$.next(new Set(this.ids));
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
}

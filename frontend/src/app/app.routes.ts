import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat/chat-layout/chat-layout.component').then(
        (m) => m.ChatLayoutComponent,
      ),
  },
  {
    path: 'meeting/:callId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/meeting/meeting-room/meeting-room.component').then(
        (m) => m.MeetingRoomComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '/login',
  },
];

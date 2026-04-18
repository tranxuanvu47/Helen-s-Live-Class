export interface LoginRequest {
  userId: string;
  userName: string;
  userImage?: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  userName: string;
  userImage: string | null;
  apiKey: string;
}

export interface AuthUser {
  token: string;
  userId: string;
  userName: string;
  userImage: string | null;
  apiKey: string;
}

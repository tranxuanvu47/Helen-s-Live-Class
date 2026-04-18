export interface CreateChannelRequest {
  name: string;
  createdById: string;
  members?: string[];
  description?: string;
}

export interface CreateChannelResponse {
  channelId: string;
  channelType: string;
  name: string;
  description: string;
  createdById: string;
  members: string[];
}

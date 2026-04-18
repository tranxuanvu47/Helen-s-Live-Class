export interface CreateMeetingRequest {
  createdById: string;
  callId?: string;
  title?: string;
}

export interface MeetingResponse {
  callId: string;
  callType: string;
  title: string;
  createdById: string;
  joinUrl: string;
}

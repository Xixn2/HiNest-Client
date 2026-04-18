/**
 * 채팅 관련 공유 타입.
 * ChatMiniApp / MessageBubble / 확장 뷰들에서 공통으로 사용.
 */

export type RoomMember = { user: { id: string; name: string; avatarColor?: string } };

export type Room = {
  id: string;
  name: string;
  type: "GROUP" | "DIRECT" | "TEAM";
  members: RoomMember[];
  messages: {
    content: string;
    createdAt: string;
    kind?: "TEXT" | "IMAGE" | "VIDEO" | "FILE";
    fileName?: string | null;
    senderId?: string;
  }[];
};

export type Reaction = {
  userId: string;
  emoji: string;
  user?: { name: string };
};

export type Message = {
  id: string;
  content: string;
  kind: "TEXT" | "IMAGE" | "VIDEO" | "FILE";
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedById?: string | null;
  createdAt: string;
  sender: { id: string; name: string; avatarColor?: string };
  reactions?: Reaction[];
};

export type Attachment = {
  url: string;
  name: string;
  type: string;
  size: number;
  kind: "IMAGE" | "VIDEO" | "FILE";
};

export type MessageHit = {
  roomId: string;
  room: Room;
  message: {
    id: string;
    content: string;
    createdAt: string;
    sender: { id: string; name: string; avatarColor?: string };
  };
};

export type RoomLocalSetting = { nickname?: string; muted?: boolean };

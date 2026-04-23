-- 채팅 데이터 전체 초기화 — 관리자 요청.
-- ChatRoom 은 ChatMessage/RoomMember 로 onDelete:Cascade 돼있고,
-- ChatMessage 는 MessageReaction 으로 Cascade 라 ChatRoom 만 지워도 전부 정리됨.
-- 다만 확실히 깨끗한 상태를 보장하려고 명시적으로 하위부터 지운다.
DELETE FROM "MessageReaction";
DELETE FROM "ChatMessage";
DELETE FROM "RoomMember";
DELETE FROM "ChatRoom";

import {create} from "zustand"

// Định nghĩa các type thay vì import từ Prisma
export type ChannelType = "TEXT" | "AUDIO" | "VIDEO" | "WATCH";

export interface Server {
  id: string;
  name: string;
  imageUrl: string;
  inviteCode: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  serverId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ModalType="createServer"|"invite"|"editServer"|"members"|"createChannel"|"leaveServer"|"deleteServer"|"deleteChannel"|"editChannel"|"messageFile"|"deleteMessage";

interface ModalData{
    server?: Server;
    channel?: Channel;
    channelType?: ChannelType;
    apiUrl?: string;
    query?: Record<string,any>;
}

interface ModalStore{
    type: ModalType | null;
    data: ModalData;
    isOpen: boolean;
    onOpen: (type: ModalType, data?: ModalData) => void;
    onClose: () => void;
}

export const useModal = create<ModalStore>((set) => ({
    type: null,
    data: {},
    isOpen: false,
    onOpen: (type, data = {}) => set({ isOpen: true, type, data }),
    onClose: () => set({ type: null, isOpen: false })
}));
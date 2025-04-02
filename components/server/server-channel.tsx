"use client";

import { Edit, Hash, Lock, Mic, Trash, Video, MonitorPlay, Bot } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ActionTooltip } from "../action-tooltip";
import { ModalType, useModal } from "@/hooks/use-modal-store";
import { Channel, MemberRole, ChannelType } from "@prisma/client";

// Sử dụng kiểu Server tương thích với use-modal-store
interface Server {
  id: string;
  name: string;
  imageUrl: string;
  inviteCode: string;
  profileId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ServerChannelProps {
  channel: Channel;
  server: Server;
  role?: MemberRole;
}

export const ServerChannel = ({
  channel,
  server,
  role,
}: ServerChannelProps) => {
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();

  const onClick = () => {
    router.push(`/servers/${server.id}/channels/${channel.id}`);
  };

  const onAction = (e: React.MouseEvent, action: ModalType) => {
    e.stopPropagation();
    onOpen(action, { channel, server });
  };

  const iconMap = {
    TEXT: Hash,
    AUDIO: Mic,
    VIDEO: Video,
    WATCH: MonitorPlay,
    CHATBOT: Bot
  };

  const Icon = iconMap[channel.type as keyof typeof iconMap] || Hash;

  // Kiểm tra xem channel hiện tại có được chọn không
  const isActive = params?.channelId === channel.id;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group p-2 rounded-md flex items-center gap-x-2 w-full hover:bg-zinc-700/10 dark:hover:bg-zinc-700/50 transition mb-1",
        isActive && "bg-zinc-700/20 dark:bg-zinc-700"
      )}
    >
      <Icon className="flex-shrink-0 w-5 h-5 text-zinc-500 dark:text-zinc-400" />
      <div className="truncate flex-1 text-sm font-semibold text-zinc-500 dark:text-zinc-300 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition">
        {channel.name}
      </div>
      {channel.name !== "general" && role !== MemberRole.GUEST && (
        <div className="ml-auto flex items-center gap-x-2">
          <ActionTooltip label="Edit">
            <Edit
              onClick={(e) => onAction(e, "editChannel")}
              className="hidden group-hover:block w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
          <ActionTooltip label="Delete">
            <Trash
              onClick={(e) => onAction(e, "deleteChannel")}
              className="hidden group-hover:block w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
        </div>
      )}
      {channel.name === "general" && (
        <Lock className="ml-auto w-4 h-4 text-zinc-500 dark:text-zinc-400" />
      )}
    </button>
  );
};
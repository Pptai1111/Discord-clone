import { ChatHeader } from '@/components/chat/chat-header'
import { ChatInput } from '@/components/chat/chat-input'
import ChatMessages from '@/components/chat/chat-messages'
import { MediaRoom } from '@/components/media-room'
import { WatchRoom } from '@/components/watch-room'
import { currentProfile } from '@/lib/current-profile'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'

// Thêm cấu hình dynamic để tránh lỗi hydration
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Định nghĩa ChannelType trực tiếp trong file thay vì import
type ChannelType = "TEXT" | "AUDIO" | "VIDEO" | "WATCH";

interface ChannelIdPageProps {
  params: {
    serverId: string
    channelId: string
  }
}

const ChannelIdPage = async ({ params }: ChannelIdPageProps) => {
  const profile = await currentProfile()
  const {serverId,channelId}=await params;

  if (!profile) {
    return redirect('/sign-in')
  }

  const channel = await db.channel.findUnique({
    where: {
      id: channelId,
    },
  })

  const member = await db.member.findFirst({
    where: {
      serverId: serverId,
      profileId: profile.id,
    },
  })

  if (!channel || !member) {
    redirect('/')
  }

  // Helper function to check channel type
  const isChannelType = (type: string) => {
    return channel.type === type;
  }

  return (
    <div className='bg-zinc-200 dark:bg-[#313338] flex flex-col h-[100vh]'>
      <ChatHeader
        name={channel.name}
        serverId={channel.serverId}
        type='channel'
      />
      {isChannelType("TEXT") && (
        <>
          <ChatMessages
            member={member}
            name={channel.name}
            chatId={channel.id}
            type='channel'
            apiUrl='/api/messages'
            socketUrl='/api/socket/messages'
            socketQuery={{
              channelId: channel.id,
              serverId: channel.serverId,
            }}
            paramKey='channelId'
            paramValue={channel.id}
          />
          <ChatInput
            name={channel.name}
            type='channel'
            apiUrl='/api/socket/messages'
            query={{
              channelId: channel.id,
              serverId: channel.serverId,
            }}
          />
        </>
      )}
      {isChannelType("AUDIO") && (
        <MediaRoom chatId={channel.id} video={false} audio={true} />
      )}
      {isChannelType("VIDEO") && (
        <MediaRoom chatId={channel.id} video={true} audio={true} />
      )}
      {isChannelType("WATCH") && (
        <div className="flex h-full">
          <div className="flex-1">
            <WatchRoom chatId={channel.id} member={member} />
          </div>
          <div className="w-80 border-l border-zinc-700 dark:border-zinc-700 flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              <ChatMessages
                member={member}
                name={channel.name}
                chatId={channel.id}
                type='channel'
                apiUrl='/api/messages'
                socketUrl='/api/socket/messages'
                socketQuery={{
                  channelId: channel.id,
                  serverId: channel.serverId,
                }}
                paramKey='channelId'
                paramValue={channel.id}
              />
            </div>
            <div className="mt-auto p-4 border-t border-zinc-700 dark:border-zinc-700">
              <ChatInput
                name={channel.name}
                type='channel'
                apiUrl='/api/socket/messages'
                query={{
                  channelId: channel.id,
                  serverId: channel.serverId,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChannelIdPage
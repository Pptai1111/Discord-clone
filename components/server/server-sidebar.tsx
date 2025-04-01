import { currentProfile } from "@/lib/current-profile";
import { redirect } from "next/navigation";
import {db} from "@/lib/db"
import { ServerHeader } from "./server-header";
import { ScrollArea } from "../ui/scroll-area";
import { ServerSearch } from "./server-search";
import { Hash, Mic, ShieldAlert, ShieldCheck, Video, MonitorPlay } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ServerMember } from "./server-member";

// Định nghĩa ChannelType và MemberRole trực tiếp
enum ChannelType {
  TEXT = "TEXT",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  WATCH = "WATCH"
}

enum MemberRole {
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
  GUEST = "GUEST"
}

// Định nghĩa các interface để dùng trong component
interface Channel {
  id: string;
  name: string;
  type: string;
  serverId: string;
}

interface Profile {
  id: string;
  name: string;
}

interface Member {
  id: string;
  role: string;
  profileId: string;
  profile: Profile;
}

interface Server {
  id: string;
  name: string;
  channels: Channel[];
  members: Member[];
}

interface ServerSidebarProps{
    serverId:string
}

const iconMap = {
    [ChannelType.TEXT]:<Hash className="mr-2 h-4 w-4"/>,
    [ChannelType.AUDIO]:<Mic className="mr-2 h-4 w-4"/>,
    [ChannelType.VIDEO]:<Video className="mr-2 h-4 w-4"/>,
    [ChannelType.WATCH]:<MonitorPlay className="mr-2 h-4 w-4"/>
}

const roleIconMap = {
    [MemberRole.GUEST]:null,
    [MemberRole.MODERATOR]:<ShieldCheck className="h-4 w-4 mr-2 text-indigo-500"/>,
    [MemberRole.ADMIN]:<ShieldAlert className="h-4 w-4 mr-2 text-rose-500"/>
}


export const ServerSidebar=async({serverId}:ServerSidebarProps)=>{
    const profile=await currentProfile();
    
    if(!profile) return redirect("/");

    const server = await db.server.findUnique({
        where:{
            id:serverId
        },
        include:{
            channels:{
                orderBy:{
                    createdAt:"asc"
                },
            },
            members:{
                include:{
                    profile:true,
                },
                orderBy:{
                    role:"asc",
                }
            }
        }
    }) as Server | null;

const textChannels = server?.channels.filter((channel: Channel) => channel.type === ChannelType.TEXT);
const audioChannels = server?.channels.filter((channel: Channel) => channel.type === ChannelType.AUDIO);
const videoChannels = server?.channels.filter((channel: Channel) => channel.type === ChannelType.VIDEO);
const watchChannels = server?.channels.filter((channel: Channel) => channel.type === ChannelType.WATCH || channel.type === "WATCH");
const members = server?.members.filter((member: Member) => member.profileId !== profile.id);

if(!server) return redirect("/")

const role = server.members.find((member: Member) => member.profileId === profile.id)?.role as MemberRole;

    return(
        <div className="flex flex-col h-full text-primary w-full dark:bg-[#2B2D31] bg-[#F2F3F5]">
            <ServerHeader server={server} role={role}/>
            <ScrollArea className="flex-1 px-3">
                <div className="mt-2">
                    <ServerSearch data={[
                        {
                            label:"Text Channels",
                            type:"channel",
                            data:textChannels?.map((channel: Channel)=>(
                                {
                                    id:channel.id,
                                    name:channel.name,
                                    icon:iconMap[channel.type as keyof typeof iconMap]
                                }
                            ))
                        },
                        {
                            label:"Voice Channels",
                            type:"channel",
                            data:audioChannels?.map((channel: Channel)=>(
                                {
                                    id:channel.id,
                                    name:channel.name,
                                    icon:iconMap[channel.type as keyof typeof iconMap]
                                }
                            ))
                        },
                        {
                            label:"Video Channels",
                            type:"channel",
                            data:videoChannels?.map((channel: Channel)=>(
                                {
                                    id:channel.id,
                                    name:channel.name,
                                    icon:iconMap[channel.type as keyof typeof iconMap]
                                }
                            ))
                        },
                        {
                            label:"Watch Channels",
                            type:"channel",
                            data:watchChannels?.map((channel: Channel)=>(
                                {
                                    id:channel.id,
                                    name:channel.name,
                                    icon:iconMap[ChannelType.WATCH]
                                }
                            ))
                        },
                        {
                            label:"Members",
                            type:"member",
                            data:members?.map((member: Member)=>(
                                {
                                    id:member.id,
                                    name:member.profile.name,
                                    icon:roleIconMap[member.role as keyof typeof roleIconMap]
                                }
                            ))
                        },
                    ]
                    }/>
                </div>
                <Separator className="bg-zinc-200 dark:bg-zinc-700 rounded-md my-2"/>
                {!!textChannels?.length && (
                    <div className="mb-2">
                        <ServerSection
                        sectionType="channels" channelType={ChannelType.TEXT} role={role} label="Text Channels"/>
                        {textChannels.map((channel: Channel)=>(
                            <ServerChannel
                            key={channel.id}
                            channel={channel}
                            role={role}
                            server={server}
                            />
                        ))}
                    </div>
                )}

                {!!audioChannels?.length && (
                    <div className="mb-2">
                        <ServerSection
                        sectionType="channels" channelType={ChannelType.AUDIO} role={role} label="Voice Channels"/>
                        {audioChannels.map((channel: Channel)=>(
                            <ServerChannel
                            key={channel.id}
                            channel={channel}
                            role={role}
                            server={server}
                            />
                        ))}
                    </div>
                )}

                {!!videoChannels?.length && (
                    <div className="mb-2">
                        <ServerSection
                        sectionType="channels" channelType={ChannelType.VIDEO} role={role} label="Video Channels"/>
                        {videoChannels.map((channel: Channel)=>(
                            <ServerChannel
                            key={channel.id}
                            channel={channel}
                            role={role}
                            server={server}
                            />
                        ))}
                    </div>
                )}

                {!!watchChannels?.length && (
                    <div className="mb-2">
                        <ServerSection
                        sectionType="channels" channelType={ChannelType.WATCH} role={role} label="Watch Channels"/>
                        {watchChannels.map((channel: Channel)=>(
                            <ServerChannel
                            key={channel.id}
                            channel={channel}
                            role={role}
                            server={server}
                            />
                        ))}
                    </div>
                )}

                {!!members?.length && (
                    <div className="mb-2">
                        <ServerSection
                        sectionType="members" role={role} label="Members" server={server}/>
                        {members.map((member: Member)=>(
                            <ServerMember key={member.id}
                            member={member}
                            server={server}
                            />
                        ))}
                    </div>
                )}

                
            </ScrollArea>
        </div>
    )
}
"use client";

interface ChatInputProps{
    apiUrl:string;
    query:Record<string,any>;
    name:string;
    type:"conversation"|"channel"
}
export const ChatInput=({apiUrl,query,name,type}:ChatInputProps)=>{
    return <div>
        Chat Input
    </div>
}
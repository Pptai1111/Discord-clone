"use client";

import queryString from "query-string";
import axios from "axios"
import * as z from "zod";
import {zodResolver} from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog"

import {Form,FormControl,FormField,FormItem,FormLabel,FormMessage} from "@/components/ui/form"

import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "../ui/select";
import { useEffect } from "react";
import { ChannelType } from "@/hooks/use-modal-store";

// Định nghĩa zod schema với ChannelType
const formSchema = z.object({
    name: z.string().min(1, {
        message: "Channel name is required."
    }).refine(name => name !== "general", {
        message: "Channel name cannot be 'general'"
    }),
    type: z.enum(["TEXT", "AUDIO", "VIDEO", "WATCH", "CHATBOT"] as const)
});

// Danh sách các loại kênh để hiển thị trong dropdown
const CHANNEL_TYPES: ChannelType[] = ["TEXT", "AUDIO", "VIDEO", "WATCH", "CHATBOT"];

export const EditChannelModal=()=>{
    const {isOpen,onClose,type,data}=useModal();
    const router=useRouter();
    const {server,channel}=data;

    const isModalOpen=isOpen && type==='editChannel';

    const form=useForm({
        resolver: zodResolver(formSchema),
        defaultValues:{
            name:"",
            type: (channel?.type as ChannelType) || "TEXT",
        }
    });

    useEffect(()=>{
        if(channel){
            form.setValue("name",channel.name)
            form.setValue("type", channel.type as ChannelType)
        }
    },[form,channel])

    const isLoading=form.formState.isSubmitting;

    const onSubmit=async(values:z.infer<typeof formSchema>)=>{
        try{

            const url=queryString.stringifyUrl({
                url:`/api/channels/${channel?.id}`,
                query:{
                    serverId:server?.id
                }
            })
            await axios.patch(url,values)

            form.reset()
            router.refresh()
            onClose();
        }
        catch(error){
            console.log(error)
        }
    }

    const handleClose=()=>{
        form.reset()
        onClose();
    }

    return(
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-white p-2 font-bold text-black overflow-hidden">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Edit Channels
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="space-y-8 px-6">

                            <FormField control={form.control} name="name" 
                            render={({field})=>(
                                <FormItem>
                                    <FormLabel className="uppercase text-xs font-bold text-zinc-500 dark:text-secondary/70">
                                        Channel name
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                        disabled={isLoading} className="bg-zinc-300/50 border-0 focus-visible:ring-0 text-black focus-visible:ring-offset-0"
                                        placeholder="Enter channel name"
                                        {...field}/>
                                    </FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="type" render={({field})=>(
                                <FormItem>
                                    <FormLabel>ChannelType</FormLabel>
                                    <Select
                                    disabled={isLoading}
                                    onValueChange={field.onChange}
                                    defaultValue={field.value} >
                                    <FormControl>
                                        <SelectTrigger className="bg-zinc-300/50 border-0 focus:ring-0 text-black ring-offset-0 focus:ring-offset-0 capitalize outline-none"
                                        >
                                            <SelectValue placeholder="Select a channel type"/>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {CHANNEL_TYPES.map((type)=>(
                                            <SelectItem key={type} value={type} className="capitalize">
                                                {type.toLowerCase()}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                        </div>
                        <DialogFooter className="px-6 py-4">
                            <Button disabled={isLoading} variant="primary">Save Changes</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
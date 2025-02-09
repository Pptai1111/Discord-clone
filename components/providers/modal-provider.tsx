'use client'

import {CreateServerModal} from "@/components/modals/create-server-modal"
import { InviteModal } from "../modals/invite-modal"

export const ModalProvider=()=>{
    return (
        <>
        <CreateServerModal/>
        <InviteModal/>
        </>
    )
}
'use client'

import { FileIcon, X } from 'lucide-react'
import Image from 'next/image'

import { UploadDropzone } from '@/lib/uploadthing'

import '@uploadthing/react/styles.css'

interface FileUploadProps {
  onChange: (url?: string) => void
  value: string
  endpoint: 'messageFile' | 'serverImage'
}

export const FileUpload = ({ onChange, value, endpoint }: FileUploadProps) => {
  const fileType = value?.split('?')[0].split('.').pop()

  if (value && fileType != 'pdf') {
    console.log(value)
    return (
      <div className='relative h-20 w-20'>
        <Image
          fill
          sizes='(max-width: 40px), (max-height: 40px)'
          alt='Upload'
          src={value}
          className='rounded-full'
        />
        <button
          onClick={() => onChange('')}
          className='bg-rose-500 text-white p-1 rounded-full absolute top-0 right-0 shadow-sm'
          type='button'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    )
  }

  if (value && fileType === 'pdf') {
    console.log("fileType",fileType)
    return (
      <div className='relative flex items-center p-2 mt-2 rounded-md bg-background/10'>
        <FileIcon className='h-10 w-10 fill-indigo-200 stroke-indigo-500' />
        <a
          href={value}
          target='_blank'
          rel='noopener nereferrer'
          className='ml-2 text-sm text-indigo-500 dark:text-indigo-500 hover:underline'
        >
          {value}
        </a>
        <button
          onClick={() => onChange('')}
          className='bg-rose-500 text-white p-1 rounded-full absolute -top-2 -right-2 shadow-sm'
          type='button'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    )
  }

  return (
    <UploadDropzone
      endpoint={endpoint}
      onClientUploadComplete={(res) => {
        console.log("Upload Response:", res);
        onChange(res?.[0].url)
      }}
      onUploadError={(error: Error) => {
        console.log(error)
      }}
    />
  )
}
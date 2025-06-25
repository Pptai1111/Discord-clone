'use client'

import { useState, useEffect } from 'react'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { useUser } from '@clerk/nextjs'
import { Loader2, AlertTriangle, RefreshCw, Mic, Video, MicOff, VideoOff } from 'lucide-react'

interface MediaRoomProps {
  chatId: string
  video: boolean
  audio: boolean
}

export const MediaRoom = ({ chatId, video, audio }: MediaRoomProps) => {
  const { user } = useUser()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const fetchToken = async () => {
    if (!user?.firstName || !user?.lastName) return

    setIsLoading(true)
    setError(null)
    
    try {
      const name = `${user.firstName} ${user.lastName}`
      console.log('Fetching LiveKit token for:', { room: chatId, username: name })
      
      const resp = await fetch(`/api/token?room=${chatId}&username=${name}`)
      
      if (!resp.ok) {
        const errorData = await resp.json()
        console.error('Failed to fetch token:', errorData)
        throw new Error(errorData.error || `Server error: ${resp.status}`)
      }
      
      const data = await resp.json()
      console.log('Token received, length:', data.token?.length || 0)
      
      if (!data.token) {
        throw new Error('No token received from server')
      }
      
      setToken(data.token)
      setError(null)
    } catch (error) {
      console.error('Error fetching token:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch token')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchToken()
  }, [user?.firstName, user?.lastName, chatId])

  // Kiểm tra quyền truy cập camera/mic trước khi kết nối
  useEffect(() => {
    if (!token || !video && !audio) return;

    const checkDevicePermissions = async () => {
      try {
        // Chỉ yêu cầu quyền truy cập vào các thiết bị cần thiết
        const constraints: MediaStreamConstraints = {};
        if (audio) constraints.audio = true;
        if (video) constraints.video = true;

        // Yêu cầu quyền truy cập
        await navigator.mediaDevices.getUserMedia(constraints);
        setDeviceError(null);
      } catch (error: any) {
        console.error('Device permission error:', error);
        
        // Xử lý các loại lỗi khác nhau
        if (error.name === 'NotFoundError') {
          setDeviceError(`Không tìm thấy ${video ? 'camera' : ''}${video && audio ? ' và ' : ''}${audio ? 'micro' : ''} trên thiết bị của bạn.`);
        } else if (error.name === 'NotAllowedError') {
          setDeviceError(`Vui lòng cấp quyền truy cập ${video ? 'camera' : ''}${video && audio ? ' và ' : ''}${audio ? 'micro' : ''} để sử dụng tính năng này.`);
        } else {
          setDeviceError(`Không thể truy cập thiết bị: ${error.message}`);
        }
      }
    };

    checkDevicePermissions();
  }, [token, video, audio]);

  // Error display component
  if (error) {
    return (
      <div className='flex flex-col flex-1 justify-center items-center p-6'>
        <AlertTriangle className='h-10 w-10 text-red-500 mb-4' />
        <h3 className='text-lg font-semibold mb-2'>Lỗi Kết Nối</h3>
        <p className='text-sm text-center text-zinc-500 dark:text-zinc-400 mb-4'>
          {error}
        </p>
        <button 
          onClick={fetchToken}
          className='flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md'
        >
          <RefreshCw className='h-4 w-4' />
          Thử Lại
        </button>
      </div>
    )
  }

  // Device error display
  if (deviceError) {
    return (
      <div className='flex flex-col flex-1 justify-center items-center p-6'>
        <div className='flex gap-2 mb-4'>
          {video && <VideoOff className='h-8 w-8 text-amber-500' />}
          {audio && <MicOff className='h-8 w-8 text-amber-500' />}
        </div>
        <h3 className='text-lg font-semibold mb-2'>Không thể truy cập thiết bị</h3>
        <p className='text-sm text-center text-zinc-500 dark:text-zinc-400 mb-4 max-w-md'>
          {deviceError}
        </p>
        <div className='flex flex-col gap-3 items-center'>
          <p className='text-xs text-zinc-500'>Bạn vẫn có thể tham gia mà không cần {video && !audio ? 'camera' : audio && !video ? 'micro' : 'thiết bị'}</p>
          <div className='flex gap-2'>
            <button 
              onClick={() => setDeviceError(null)}
              className='flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md'
            >
              Tham Gia Không Dùng Thiết Bị
            </button>
            <button 
              onClick={() => window.location.reload()}
              className='flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-md'
            >
              <RefreshCw className='h-4 w-4' />
              Thử Lại
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading || token === '') {
    return (
      <div className='flex flex-col flex-1 justify-center items-center'>
        <Loader2 className='h-7 w-7 text-zinc-500 animate-spin my-4' />
        <p className='text-xs text-zinc-500 dark:text-zinc-400'>Đang kết nối...</p>
      </div>
    )
  }

  return (
    <LiveKitRoom
      data-lk-theme='default'
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={token}
      connect={true}
      video={video && !deviceError}
      audio={audio && !deviceError}
      onError={(error) => {
        console.error('LiveKit connection error:', error)
        // Xử lý cụ thể cho từng loại lỗi
        if (error.message.includes('Requested device not found')) {
          setDeviceError(`Không tìm thấy ${video ? 'camera' : ''}${video && audio ? ' và ' : ''}${audio ? 'micro' : ''} trên thiết bị của bạn.`);
        } 
        else if (error.message.includes('Permission denied')) {
          setDeviceError('Vui lòng cấp quyền truy cập thiết bị.');
        }
        else if (error.message.includes('Client initiated disconnect')) {
          // Đây thường là lỗi do client chủ động ngắt kết nối, có thể bỏ qua
          console.log('Client initiated disconnect, attempting to reconnect');
        }
        else {
          setError(`Lỗi kết nối: ${error.message}`);
        }
      }}
    >
      <VideoConference />
    </LiveKitRoom>
  )
}
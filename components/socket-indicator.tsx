'use client'

import { useSocket } from './providers/socket-provider'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Wifi, WifiOff, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'

export const SocketIndicator = () => {
  const { isConnected, isPolling, reconnect } = useSocket()
  const [showReconnect, setShowReconnect] = useState(false)
  
  // Hiển thị nút kết nối lại sau 10 giây nếu vẫn chưa kết nối được
  useEffect(() => {
    let timer: NodeJS.Timeout
    
    if (!isConnected) {
      timer = setTimeout(() => {
        setShowReconnect(true)
      }, 10000)
    } else {
      setShowReconnect(false)
    }
    
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isConnected])
  
  // Fix: Hàm an toàn để thử kết nối lại
  const handleReconnect = () => {
    if (reconnect && typeof reconnect === 'function') {
      try {
        console.log('Attempting reconnect from indicator button')
        reconnect()
      } catch (error) {
        console.error('Error reconnecting:', error)
        // Tải lại trang nếu không thể kết nối lại
        window.location.reload()
      }
    } else {
      console.warn('Reconnect function not available, reloading page')
      window.location.reload()
    }
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant='outline' className='bg-yellow-600 text-white border-none flex items-center'>
          <WifiOff className="w-3 h-3 mr-1" />
          Đang cố kết nối lại...
        </Badge>
        {showReconnect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            className="text-xs px-2 py-1 h-auto"
          >
            Kết nối lại
          </Button>
        )}
      </div>
    )
  }
  
  if (isPolling) {
    return (
      <Badge variant='outline' className='bg-orange-600 text-white border-none flex items-center'>
        <Wifi className="w-3 h-3 mr-1" />
        Đang dùng Polling (1s)
      </Badge>
    )
  }

  return (
    <Badge variant='outline' className='bg-emerald-600 text-white border-none flex items-center'>
      <Radio className="w-3 h-3 mr-1" />
      Kết nối WebSocket
    </Badge>
  )
}
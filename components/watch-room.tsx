'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, PlusCircle, PlayIcon, PauseIcon, SkipForward, Settings, AlertTriangle, Users, ArrowBigLeft, ArrowBigRight, Pause, Play, RefreshCw } from 'lucide-react'
import { useWatchSocket } from '@/hooks/use-watch-socket'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import axios from "axios"

// Tránh lỗi hydration bằng cách tải ReactPlayer động
const ReactPlayer = dynamic(() => import('react-player/lazy'), {
  ssr: false,
})

// Định nghĩa interface Member thay vì import từ @prisma/client
interface Member {
  id: string;
  role: string;
  profileId?: string;
  profile?: {
    name: string;
    imageUrl: string;
  }
}

interface VideoItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  addedAt?: number;
  addedBy?: string;
}

interface Viewer {
  id: string;
  name: string;
  role: string;
  imageUrl?: string;
}

interface WatchRoomProps {
  chatId: string;
  member: Member;
}

export const WatchRoom = ({ chatId, member }: WatchRoomProps) => {
  console.log('WatchRoom được render với chatId:', chatId, 'member:', member?.profileId);
  
  const router = useRouter();
  const { userId } = useAuth();
  const { 
    socket, 
    isConnected, 
    isPolling, 
    next, 
    play, 
    pause, 
    seek, 
    addVideo, 
    playlist: remotePlaylist, 
    currentIndex: remoteIndex, 
    isPlaying: remotePlaying, 
    progress: remoteProgress, 
    viewers: remoteViewers, 
    requestSync,
    fallbackSyncRequest
  } = useWatchSocket(chatId, userId || '')
  
  const [playlist, setPlaylist] = useState<VideoItem[]>([])
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0)
  const [playing, setPlaying] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [inputUrl, setInputUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false)
  const [isBuffering, setIsBuffering] = useState<boolean>(false)
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [showViewers, setShowViewers] = useState<boolean>(false)
  const playerRef = useRef<any>(null)
  const isAdmin = useMemo(() => member.role === "ADMIN" || member.role === "MODERATOR", [member])
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isClientSide, setIsClientSide] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Đảm bảo chỉ hiển thị ở phía client
  useEffect(() => {
    setIsClientSide(true);
  }, []);

  // Đồng bộ dữ liệu từ hook
  useEffect(() => {
    if (remotePlaylist && remotePlaylist.length > 0) {
      setPlaylist(remotePlaylist);
    }
    if (typeof remoteIndex === 'number') {
      setCurrentVideoIndex(remoteIndex);
    }
    if (typeof remotePlaying === 'boolean') {
      setPlaying(remotePlaying);
    }
    if (typeof remoteProgress === 'number') {
      setProgress(remoteProgress);
    }
    if (remoteViewers && remoteViewers.length > 0) {
      setViewers(remoteViewers);
    }
  }, [remotePlaylist, remoteIndex, remotePlaying, remoteProgress, remoteViewers]);

  // Thêm viewer hiện tại khi kết nối
  useEffect(() => {
    if (socket && userId) {
      const viewer: Viewer = {
        id: userId,
        name: member?.profile?.name || 'Người dùng',
        role: member?.role || 'GUEST',
        imageUrl: member?.profile?.imageUrl
      };
      
      socket.emit('watch:join', {
        chatId,
        event: 'watch:join',
        data: { viewer }
      });
      
      return () => {
        socket.emit('watch:leave', {
          chatId,
          event: 'watch:leave',
          data: { viewerId: userId }
        });
      };
    }
  }, [socket, chatId, userId, member]);

  // Xử lý các sự kiện liên quan đến danh sách người xem
  useEffect(() => {
    if (!socket) return;
    
    const onJoin = (data: { viewer: Viewer }) => {
      setViewers(prev => {
        // Kiểm tra xem người xem đã tồn tại chưa
        const exists = prev.some(v => v.id === data.viewer.id);
        if (exists) return prev;
        return [...prev, data.viewer];
      });
    };
    
    const onLeave = (data: { viewerId: string }) => {
      setViewers(prev => prev.filter(v => v.id !== data.viewerId));
    };
    
    const onSyncViewers = (data: { viewers: Viewer[] }) => {
      if (Array.isArray(data.viewers)) {
        setViewers(data.viewers);
      }
    };
    
    socket.on('watch:join', onJoin);
    socket.on('watch:leave', onLeave);
    socket.on('watch:syncViewers', onSyncViewers);
    
    return () => {
      socket.off('watch:join', onJoin);
      socket.off('watch:leave', onLeave);
      socket.off('watch:syncViewers', onSyncViewers);
    };
  }, [socket]);

  // Socket events listeners setup
  useEffect(() => {
    if (!socket) return;
    
    console.log('Setting up socket listeners in WatchRoom for chatId:', chatId);
    
    // JOIN ROOM - Ensure we're part of the socket.io room
    try {
      // Join socket room first
      socket.emit('join-room', chatId);
      console.log(`Emitted join-room for ${chatId}`);
      
      // Then send formal watch:join event with user data
      const viewer: Viewer = {
        id: member.id,
        name: member.profile?.name || 'Unknown',
        role: member.role,
        imageUrl: member.profile?.imageUrl
      };
      
      socket.emit('watch:join', {
        chatId,
        viewer
      });
      
      console.log(`Emitted watch:join for ${chatId} with viewer:`, viewer);
    } catch (error) {
      console.error('Error joining room:', error);
      // Fallback HTTP
      fetch('/api/socket/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Socket-ID': socket.id || '', // Include socket ID if available
        },
        body: JSON.stringify({
          chatId,
          event: 'watch:join',
          data: {
            viewer: {
              id: member.id,
              name: member.profile?.name || 'Unknown',
              role: member.role,
              imageUrl: member.profile?.imageUrl
            }
          }
        })
      }).catch(err => console.error('HTTP fallback error:', err));
    }
    
    // Tăng cường xử lý sự kiện play từ server - bất kể ai là người phát/tạm dừng
    const onPlay = (data: { chatId: string, time?: number, userId?: string, timestamp?: number }) => {
      console.log(`Received play event for room ${data.chatId} at time ${data.time}s by ${data.userId}`);
      
      // Chỉ xử lý event cho đúng phòng
      if (data.chatId !== chatId) return;
      
      // Nếu có thời gian cụ thể, seek đến thời điểm đó
      if (data.time !== undefined && playerRef.current) {
        console.log(`Seeking to ${data.time}s before playing`);
        playerRef.current.seekTo(data.time, 'seconds');
        setProgress(data.time);
      }
      
      // Bất kể ai cũng phải phát theo lệnh từ server
      setPlaying(true);
    };
    
    // Tăng cường xử lý sự kiện pause từ server
    const onPause = (data: { chatId: string, time?: number, userId?: string, timestamp?: number }) => {
      console.log(`Received pause event for room ${data.chatId} at time ${data.time}s by ${data.userId}`);
      
      // Chỉ xử lý event cho đúng phòng
      if (data.chatId !== chatId) return;
      
      // Nếu có thời gian cụ thể, seek đến thời điểm đó
      if (data.time !== undefined && playerRef.current) {
        console.log(`Seeking to ${data.time}s before pausing`);
        playerRef.current.seekTo(data.time, 'seconds');
        setProgress(data.time);
      }
      
      // Bất kể ai cũng phải tạm dừng theo lệnh từ server
      setPlaying(false);
    };
    
    // Tăng cường xử lý sự kiện seek từ server
    const onSeek = (data: { chatId: string, time: number, userId?: string, isPlaying?: boolean }) => {
      console.log(`Received seek event for room ${data.chatId} to ${data.time}s by ${data.userId}`);
      
      // Chỉ xử lý event cho đúng phòng
      if (data.chatId !== chatId) return;
      
      if (playerRef.current) {
        playerRef.current.seekTo(data.time, 'seconds');
        setProgress(data.time);
        
        // Cập nhật trạng thái playing nếu cần
        if (data.isPlaying !== undefined) {
          setPlaying(data.isPlaying);
        }
      }
    };
    
    // Tăng cường xử lý sự kiện next từ server
    const onNext = (data: { chatId: string, index: number, userId?: string, progress?: number, isPlaying?: boolean }) => {
      console.log(`Received next event for room ${data.chatId} to index ${data.index} by ${data.userId}`);
      
      // Chỉ xử lý event cho đúng phòng
      if (data.chatId !== chatId) return;
      
      // Cập nhật index
      setCurrentVideoIndex(data.index);
      
      // Cập nhật progress nếu có
      if (data.progress !== undefined) {
        setProgress(data.progress);
      }
      
      // Cập nhật trạng thái playing nếu có
      if (data.isPlaying !== undefined) {
        setPlaying(data.isPlaying);
      }
    };
    
    // Register handlers
    socket.on('watch:play', onPlay);
    socket.on('watch:pause', onPause);
    socket.on('watch:seek', onSeek);
    socket.on('watch:next', onNext);
    
    // Request initial sync
    setTimeout(() => {
      console.log('Requesting initial sync for room:', chatId);
      try {
        socket.emit('watch:requestSync', { chatId });
      } catch (error) {
        console.error('Error requesting sync:', error);
        // Fallback HTTP API call
        fetch('/api/socket/watch', {
          method: 'POST',
        headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            event: 'watch:requestSync',
            data: {}
          })
        }).catch(err => console.error('HTTP fallback error:', err));
      }
    }, 1000);

    // Clean up event listeners
      return () => {
      socket.off('watch:play', onPlay);
      socket.off('watch:pause', onPause);
      socket.off('watch:seek', onSeek);
      socket.off('watch:next', onNext);
      
      // Leave room when component unmounts
      try {
          socket.emit('watch:leave', {
            chatId,
          viewerId: member.id
          });
          socket.emit('leave-room', chatId);
      } catch (error) {
        console.error('Error leaving room:', error);
        }
      };
  }, [socket, chatId, member]);

  // Thêm một interval để yêu cầu đồng bộ định kỳ nếu playlist rỗng
  useEffect(() => {
    let syncInterval: NodeJS.Timeout | null = null;
    
    // Nếu playlist rỗng và socket đã kết nối, yêu cầu đồng bộ mỗi 5 giây
    if (isConnected && socket && playlist.length === 0) {
      console.log("[WATCH-ROOM] Playlist rỗng, thiết lập đồng bộ định kỳ");
      syncInterval = setInterval(() => {
        console.log("[WATCH-ROOM] Yêu cầu đồng bộ định kỳ (playlist rỗng)");
        socket.emit('watch:requestSync', { chatId });
      }, 5000);
    }
    
    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [isConnected, socket, playlist.length, socket]);

  // Thêm log khi playlist thay đổi
  useEffect(() => {
    console.log('Watch Room: Playlist cập nhật, số video:', playlist.length);
    if (playlist.length > 0) {
      console.log('Video hiện tại:', playlist[currentVideoIndex]?.url);
    }
  }, [playlist, currentVideoIndex]);

  // Thêm hàm nextVideo thiếu
  const nextVideo = (index: number) => {
    if (isAdmin && socket) {
      const currentTime = playerRef.current?.getCurrentTime() || 0;
      try {
        next(index);
        setCurrentVideoIndex(index);
        setProgress(0);
      } catch (error) {
        console.error('Error changing video:', error);
        // Fallback HTTP API call
        fetch('/api/socket/watch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            event: 'watch:next',
            data: {
              index,
              userId: member.id
            }
          })
        }).catch(err => console.error('HTTP fallback error:', err));
      }
    }
  };

  // Sửa các hàm xử lý để sử dụng các hàm từ hook
  const handlePlay = () => {
    setPlaying(true);
    try {
      if (!socket) return;
      const currentTime = playerRef.current?.getCurrentTime() || progress;
      play(); // Sử dụng hàm play từ hook
    } catch (error) {
      console.error('Socket event error:', error);
      // Fallback HTTP API call
      fetch('/api/socket/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          event: 'watch:play',
          data: {
            time: playerRef.current?.getCurrentTime() || progress,
            userId: member.id
          }
        })
      }).catch(err => console.error('HTTP fallback error:', err));
    }
  };

  const handlePause = () => {
    setPlaying(false);
    try {
      if (!socket) return;
      const currentTime = playerRef.current?.getCurrentTime() || progress;
      pause(); // Sử dụng hàm pause từ hook
    } catch (error) {
      console.error('Socket event error:', error);
      // Fallback HTTP API call
      fetch('/api/socket/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          event: 'watch:pause',
          data: {
            time: playerRef.current?.getCurrentTime() || progress,
            userId: member.id
          }
        })
      }).catch(err => console.error('HTTP fallback error:', err));
    }
  };

  const handleSeek = (time: number) => {
    setProgress(time);
    try {
      if (!socket) return;
      seek(time); // Sử dụng hàm seek từ hook
    } catch (error) {
      console.error('Socket event error:', error);
      // Fallback HTTP API call
      fetch('/api/socket/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          event: 'watch:seek',
          data: {
            time,
            userId: member.id
          }
        })
      }).catch(err => console.error('HTTP fallback error:', err));
    }
  };

  const handleAddVideo = async () => {
    if (!inputUrl || !inputUrl.trim()) {
      setError('Vui lòng nhập URL video');
      return;
    }

    // Đặt trạng thái
    setIsLoadingVideo(true);
    setError(null);
    
    try {
      // Chuẩn hóa URL
      let processedUrl = inputUrl.trim();
      
      // Xử lý URL YouTube shorts
      if (processedUrl.includes('youtube.com/shorts/')) {
        processedUrl = processedUrl.replace('/shorts/', '/watch?v=');
      }
      
      // Thêm protocol nếu không có
      if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }
      
      console.log(`URL sau khi xử lý: ${processedUrl}`);
      
      // Kiểm tra URL có đúng định dạng không
      try {
        new URL(processedUrl);
      } catch (e) {
        setError('URL không đúng định dạng');
        setIsLoadingVideo(false);
        return;
      }
      
      // Kiểm tra URL có phát được không - CHỈ THỰC HIỆN Ở CLIENT
      if (isClientSide) {
        try {
          const ReactPlayerModule = await import('react-player/lazy');
          if (!ReactPlayerModule.default.canPlay(processedUrl)) {
        setError('URL không được hỗ trợ. Hãy thử URL từ YouTube, Vimeo, v.v.');
        setIsLoadingVideo(false);
        return;
          }
        } catch (error) {
          console.error("Lỗi khi kiểm tra URL:", error);
        }
      }
      
      // Xác định ID video và lấy thumbnail
      let videoId = '';
      let thumbnail = '';
      let title = '';
      
      // YouTube
      if (processedUrl.includes('youtube.com') || processedUrl.includes('youtu.be')) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = processedUrl.match(regex);
        if (match && match[1]) {
          videoId = match[1];
          thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          title = `YouTube Video (${videoId})`;
        } else {
          thumbnail = getDefaultThumbnail('youtube');
          title = `YouTube Video`;
        }
      } else if (processedUrl.includes('vimeo.com')) {
        thumbnail = getDefaultThumbnail('vimeo');
        title = `Vimeo Video`;
      } else {
        thumbnail = getDefaultThumbnail('other');
        title = `Video`;
      }
      
      // Tạo video object với ID ổn định
      const video: VideoItem = {
        id: videoId || `video-${Date.now().toString()}`,
        url: processedUrl,
        title: title,
        thumbnail: thumbnail,
        addedAt: Date.now(),
        addedBy: userId || 'unknown'
      };
      
      console.log('Thêm video mới:', video);
      
      if (addVideo) {
        // Sử dụng hàm từ hook
        addVideo(video);
      } else {
        // Fallback
      try {
        const response = await fetch('/api/socket/watch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            event: 'watch:addVideo',
            data: { 
              video,
              userId 
            }
          }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Kết quả thêm video:', result);
        
        if (result.success) {
          // Thêm vào playlist local để hiển thị ngay lập tức
          setPlaylist(prev => {
            // Kiểm tra trùng lặp
            const exists = prev.some(item => item.url === video.url || item.id === video.id);
            if (exists) return prev;
            return [...prev, video];
          });
          
            // Yêu cầu đồng bộ sau khi thêm
            if (requestSync) {
              setTimeout(requestSync, 500);
            }
        }
      } catch (err) {
        console.error('Lỗi khi gửi video qua HTTP:', err);
        setError('Không thể thêm video. Vui lòng thử lại sau.');
        }
      }
      
      // Reset input
      setInputUrl('');
      setIsLoadingVideo(false);
    } catch (error) {
      console.error('Lỗi khi xử lý video:', error);
      setError('Có lỗi xảy ra khi thêm video. Vui lòng thử lại.');
      setIsLoadingVideo(false);
    }
  };

  // Xử lý khi bấm Enter trong input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isAdmin) {
      e.preventDefault();
      handleAddVideo();
    }
  };

  const handleNext = () => {
    if (isAdmin && playlist.length > 0) {
      const nextIndex = (currentVideoIndex + 1) % playlist.length
      nextVideo(nextIndex)
      setCurrentVideoIndex(nextIndex)
    }
  }

  const handleProgress = (state: { playedSeconds: number }) => {
    setProgress(state.playedSeconds)
  }

  const handleEnded = () => {
    if (isAdmin) {
      handleNext()
    }
  }

  const handleError = (e: any) => {
    console.error('Player error:', e)
    setError('Failed to load video. Please try a different URL or refresh the page.')
  }

  // Lấy video hiện tại và duration
  const currentVideo = playlist[currentVideoIndex]
  const duration = playerRef.current?.getDuration() || 1

  // Xử lý auto-reconnect khi mất kết nối
  useEffect(() => {
    if (!isConnected && socket) {
      const timerId = setTimeout(() => {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Cố gắng kết nối lại lần thứ ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
          requestSync();
          setReconnectAttempts(prev => prev + 1);
        } else {
          // Quá số lần thử, sử dụng fallback HTTP
          console.log('Đã đạt giới hạn thử lại - Chuyển sang chế độ HTTP fallback');
          fallbackSyncRequest();
        }
      }, 2000 * Math.pow(1.5, reconnectAttempts)); // Backoff strategy

      return () => clearTimeout(timerId);
    } else if (isConnected) {
      // Reset lại số lần thử khi đã kết nối thành công
      setReconnectAttempts(0);
    }
  }, [isConnected, socket, reconnectAttempts, requestSync, fallbackSyncRequest]);

  // Hiển thị trạng thái kết nối
  const showConnectionStatus = () => {
    if (isSyncing) {
      return (
        <div className="flex items-center text-amber-500 text-xs px-2 py-1 rounded-md bg-amber-500/20">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          <span>Đang đồng bộ...</span>
        </div>
      )
    }
    
    if (!isConnected) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center text-red-500 text-xs px-2 py-1 rounded-md bg-red-500/20 cursor-pointer"
                onClick={() => {
                  requestSync();
                  setReconnectAttempts(0);
                }}>
                <AlertTriangle className="h-3 w-3 mr-1" />
                <span>Mất kết nối{isPolling ? ' (đang thử lại)' : ''}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Nhấn để thử kết nối lại</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    
    return (
      <div className="flex items-center text-green-500 text-xs px-2 py-1 rounded-md bg-green-500/20">
        <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
        <span>Đã kết nối</span>
      </div>
    )
  }

  // Xử lý khi video bắt đầu được tải
  const handleBufferStart = () => {
    setIsBuffering(true);
  }

  // Xử lý khi video đã được tải xong và sẵn sàng phát
  const handleBufferEnd = () => {
    setIsBuffering(false);
  }

  // Xử lý khi bắt đầu tải video
  const handleVideoLoad = () => {
    setIsLoadingVideo(true);
  }

  // Xử lý khi video đã sẵn sàng
  const handleVideoReady = () => {
    setIsLoadingVideo(false);
  }

  // Format tên người xem
  const getInitials = (name: string = '') => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  // Thêm hàm tạo thumbnail động cho video không có thumbnail
  const getDefaultThumbnail = (source: string, videoId: string = '') => {
    // Sử dụng URL tĩnh dựa trên nguồn thay vì gọi API động
    switch (source) {
      case 'youtube':
        return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : 'https://i.imgur.com/MJ6SogY.png';
      case 'vimeo':
        return 'https://i.imgur.com/HRjbr8L.png';
      case 'facebook':
        return 'https://i.imgur.com/VbYMzK5.png';
      case 'twitch':
        return 'https://i.imgur.com/1biVLCh.png';
      default:
        return 'https://i.imgur.com/MmXXUmY.png'; // Ảnh mặc định
    }
  };

  // Thêm log lúc khởi tạo component
  useEffect(() => {
    console.log('WatchRoom component khởi tạo');
    console.log('Trạng thái ban đầu: isAdmin=', isAdmin, 'chatId=', chatId);
    
    return () => {
      console.log('WatchRoom component unmounted');
    };
  }, []);

  // Theo dõi thay đổi playlist
  useEffect(() => {
    console.log('Playlist hiện tại:', playlist);
    console.log('Video hiện tại index:', currentVideoIndex);
    console.log('Video hiện tại:', playlist[currentVideoIndex]);
  }, [playlist, currentVideoIndex]);

  // Kiểm tra URL video có hợp lệ không
  const isValidVideoUrl = async (url: string): Promise<boolean> => {
    try {
      // Chuẩn hóa URL
      let processedUrl = url.trim();
      
      // Xử lý URL YouTube shorts
      if (processedUrl.includes('youtube.com/shorts/')) {
        processedUrl = processedUrl.replace('/shorts/', '/watch?v=');
      }
      
      // Thêm protocol nếu không có
      if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }
      
      // Kiểm tra URL có đúng định dạng không
      try {
        new URL(processedUrl);
      } catch (e) {
        return false;
      }
      
      // Kiểm tra có thể phát được không
      try {
        const ReactPlayerModule = await import('react-player/lazy');
        return ReactPlayerModule.default.canPlay(processedUrl);
      } catch (error) {
        console.error("Lỗi khi kiểm tra URL:", error);
        return false;
      }
    } catch (error) {
      console.error('Lỗi khi kiểm tra URL video:', error);
      return false;
    }
  };

  // Lấy ID video từ URL
  const extractVideoId = (url: string): string | null => {
    try {
      // YouTube
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = url.match(regex);
        return match && match[1] ? match[1] : null;
      }
      
      // Vimeo
      if (url.includes('vimeo.com')) {
        const regex = /vimeo\.com\/(?:video\/)?(\d+)/i;
        const match = url.match(regex);
        return match && match[1] ? match[1] : null;
      }
      
      return null;
    } catch (error) {
      console.error('Lỗi khi trích xuất ID video:', error);
      return null;
    }
  };

  // Lấy thông tin video
  const getVideoInfo = async (videoId: string | null): Promise<{ title?: string; thumbnail?: string } | null> => {
    try {
      if (!videoId) return null;
      
      // Giả lập lấy thông tin từ YouTube
      if (videoId.length === 11) { // YouTube video ID thường có 11 ký tự
        return {
          title: `YouTube Video (${videoId})`,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        };
      }
      
      // Vimeo hoặc các nguồn khác
      return {
        title: `Video ${Date.now()}`,
        thumbnail: 'https://i.imgur.com/MmXXUmY.png'
      };
    } catch (error) {
      console.error('Lỗi khi lấy thông tin video:', error);
      return null;
    }
  };

  // Đảm bảo không render ReactPlayer ở server
  const renderPlayer = () => {
    if (!isClientSide) return null;
    
    if (currentVideo) {
  return (
          <>
            {/* Hiển thị trạng thái loading/buffering */}
            {(isLoadingVideo || isBuffering) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                <div className="flex flex-col items-center">
                  <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-2" />
                  <p className="text-white text-sm">
                    {isLoadingVideo ? 'Đang tải video...' : 'Đang buffer...'}
                  </p>
                </div>
              </div>
            )}
            <ReactPlayer
              ref={playerRef}
              url={currentVideo.url}
              width="100%"
              height="100%"
            playing={playing}
              controls={false}
              onProgress={handleProgress}
              onEnded={handleEnded}
              onError={handleError}
              onBuffer={handleBufferStart}
              onBufferEnd={handleBufferEnd}
              onReady={handleVideoReady}
              onStart={handleVideoReady}
              config={{
                youtube: {
                  playerVars: { 
                    showinfo: 1,
                  origin: typeof window !== 'undefined' ? window.location.origin : '',
                    rel: 0
                  },
                  embedOptions: {
                    onError: (e: any) => handleError(e)
                  }
                },
                file: {
                  forceVideo: true,
                  attributes: {
                    controlsList: 'nodownload',
                    crossOrigin: 'anonymous'
                  }
                }
              }}
              playsinline={true}
            />
          </>
      );
    }
    
    return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <h3 className="text-xl font-semibold mb-4">Get started by adding media to the session.</h3>
              <div className="flex justify-center">
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Enter video URL (YouTube, Vimeo, etc.)"
                  className="bg-zinc-700 text-white w-80"
                  disabled={!isAdmin}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={handleAddVideo}
                  className="ml-2 bg-indigo-500 hover:bg-indigo-600"
                  disabled={!isAdmin}
                >
                  <PlusCircle className="h-5 w-5 mr-1" /> Add Media
                </Button>
              </div>
              {!isAdmin && (
                <p className="text-xs text-zinc-500 mt-3">Chỉ Admin và Moderator mới có thể thêm video</p>
              )}
            </div>
          </div>
    );
  };

  // Display error state if there's an error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-800 p-4">
        <AlertTriangle className="text-red-500 h-10 w-10 mb-4" />
        <h3 className="text-xl font-semibold mb-2 text-center">Error</h3>
        <p className="text-sm text-center text-zinc-300 mb-4">{error}</p>
        <Button 
          onClick={() => {
            setError(null)
            if (socket) socket.emit('watch:requestSync', { chatId })
          }}
          className="bg-indigo-500 hover:bg-indigo-600"
        >
          Retry Connection
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 relative">
      {!isClientSide ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-10 w-10 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-zinc-800 p-3 flex items-center justify-between">
            <h2 className="text-zinc-100 font-semibold flex items-center">
              <span>Watch Together</span>
              <div className="ml-2">
                {showConnectionStatus()}
              </div>
            </h2>
            
            <div className="flex items-center gap-2">
              {!isConnected && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    requestSync();
                    setReconnectAttempts(0);
                  }}
                  disabled={isPolling}
                  className="p-1 h-7"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  <span>Kết nối lại</span>
                </Button>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className={cn("p-1 h-7 w-7", showViewers && "bg-zinc-600")}
                      onClick={() => setShowViewers(!showViewers)}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Người xem ({viewers.length})</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Danh sách người xem */}
          {showViewers && Array.isArray(viewers) && viewers.length > 0 && (
            <div className="bg-zinc-900 p-2 border-b border-zinc-700 max-h-32 overflow-y-auto">
              <h4 className="text-xs font-semibold text-zinc-400 mb-2">NGƯỜI ĐANG XEM ({viewers.length})</h4>
              <div className="flex flex-wrap gap-2">
                {viewers.map(viewer => (
                  <div key={viewer.id} className="flex items-center gap-1">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={viewer.imageUrl} />
                      <AvatarFallback className="text-xs bg-indigo-700">
                        {getInitials(viewer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-zinc-300">
                      {viewer.role === 'ADMIN' ? `${viewer.name} (Admin)` : 
                       viewer.role === 'MODERATOR' ? `${viewer.name} (Mod)` : 
                       viewer.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 relative">
            {renderPlayer()}
          </div>

          {/* Controls */}
          {currentVideo && (
            <div className="flex items-center bg-zinc-900 p-2 border-t border-zinc-700">
              <Button 
                onClick={playing ? handlePause : handlePlay}
                variant="ghost" 
                disabled={!isAdmin} 
                className="text-zinc-400 hover:text-white"
              >
                {playing ? (
                  <PauseIcon className="h-5 w-5" />
                ) : (
                  <PlayIcon className="h-5 w-5" />
                )}
              </Button>
              
              <Button 
                onClick={handleNext}
                variant="ghost" 
                disabled={!isAdmin || !Array.isArray(playlist) || playlist.length <= 1} 
                className="text-zinc-400 hover:text-white"
              >
                <SkipForward className="h-5 w-5" />
              </Button>

              <div className="flex-1 mx-4">
                <div className="bg-zinc-700 h-1 w-full rounded overflow-hidden cursor-pointer">
                  <div 
                    className="bg-indigo-500 h-full" 
                    style={{ width: `${(progress / duration) * 100}%` }}
                    onClick={(e) => {
                      if (isAdmin && playerRef.current) {
                        const bounds = e.currentTarget.getBoundingClientRect()
                        const percent = (e.clientX - bounds.left) / bounds.width
                        const duration = playerRef.current.getDuration() || 0
                        handleSeek(percent * duration)
                      }
                    }}
                  ></div>
                </div>
              </div>

              <Button 
                variant="ghost"
                className="text-zinc-400 hover:text-white"
                disabled={!isAdmin}
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Playlist */}
          <div className="bg-zinc-900 p-2 border-t border-zinc-700">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-zinc-300">NEXT UP</h3>
              <div className="flex">
                <Input 
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Enter video URL"
                  className="bg-zinc-700 text-white text-sm h-8 mr-2"
                  disabled={!isAdmin}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={handleAddVideo}
                  size="sm"
                  className="bg-indigo-500 hover:bg-indigo-600 h-8"
                  disabled={!isAdmin}
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="max-h-32 overflow-y-auto w-full">
              {error && (
                <div className="text-red-400 text-xs mb-2 px-1">{error}</div>
              )}
              {Array.isArray(playlist) && playlist.length > 0 ? (
                <ul className="w-full break-words whitespace-normal">
                  {playlist.map((video, index) => (
                    <li 
                      key={video.id || index}
                      className={`flex items-center p-2 rounded ${
                        index === currentVideoIndex ? 'bg-zinc-700' : 'hover:bg-zinc-800'
                      } ${!isAdmin ? 'cursor-default' : 'cursor-pointer'} w-full break-all`}
                      onClick={() => {
                        if (isAdmin) {
                          nextVideo(index)
                          setCurrentVideoIndex(index)
                        }
                      }}
                    >
                      <div className="flex-1 truncate overflow-ellipsis break-words">{video.title}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-zinc-500 text-sm">No videos in playlist</div>
              )}
            </div>
            {!isAdmin && Array.isArray(playlist) && playlist.length > 0 && (
              <p className="text-xs text-zinc-500 mt-2">Chỉ Admin và Moderator mới có thể điều khiển danh sách phát</p>
            )}
          </div>
        </>
      )}
    </div>
  )
} 
'use client'

import { useState, useEffect, useRef } from 'react'
import ReactPlayer from 'react-player'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, PlusCircle, PlayIcon, PauseIcon, SkipForward, Settings, AlertTriangle, Users, ArrowBigLeft, ArrowBigRight, Pause, Play } from 'lucide-react'
import { useWatchSocket } from '@/hooks/use-watch-socket'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import axios from "axios"

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
  const [playlist, setPlaylist] = useState<VideoItem[]>([])
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [inputUrl, setInputUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false)
  const [isBuffering, setIsBuffering] = useState<boolean>(false)
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [showViewers, setShowViewers] = useState<boolean>(false)
  const playerRef = useRef<ReactPlayer>(null)
  const [isAdmin] = useState<boolean>(member?.role === 'ADMIN' || member?.role === 'MODERATOR')
  const { isConnected, isPolling, socket, play, pause, seek, addVideo: addVideoToSocket, next: nextVideo, requestSync } = useWatchSocket(chatId)

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

  useEffect(() => {
    if (!socket) {
      return;
    }

    socket.on('watch:play', () => {
      setIsPlaying(true)
    })
    
    socket.on('watch:pause', () => {
      setIsPlaying(false)
    })
    
    socket.on('watch:seek', (data: { time: number }) => {
      if (playerRef.current) {
        playerRef.current.seekTo(data.time)
        setProgress(data.time)
      }
    })
    
    socket.on('watch:addVideo', (data: { video: VideoItem }) => {
      setPlaylist((prev) => {
        const exists = prev.some(item => item.id === data.video.id || item.url === data.video.url);
        if (exists) return prev;
        return [...prev, data.video];
      })
    })
    
    socket.on('watch:next', (data: { index: number }) => {
      setCurrentVideoIndex(data.index)
    })
    
    socket.on('watch:sync', (data: { 
      playlist: VideoItem[], 
      currentIndex: number, 
      isPlaying: boolean, 
      progress: number 
    }) => {
      if (data.playlist && Array.isArray(data.playlist)) {
        const uniqueMap = new Map();
        data.playlist.forEach(video => {
          if (video && video.id) {
            uniqueMap.set(video.id, video);
          }
        });
        const uniquePlaylist = Array.from(uniqueMap.values());
        setPlaylist(uniquePlaylist);
      } else {
        setPlaylist([]);
      }
      
      setCurrentVideoIndex(data.currentIndex);
      setIsPlaying(data.isPlaying);
      if (playerRef.current) {
        playerRef.current.seekTo(data.progress);
      }
    })

    socket.on('error', (error: any) => {
      setError(error?.message || 'An error occurred with the connection')
      console.error('Socket error:', error)
    })
    
    return () => {
      socket.off('watch:play')
      socket.off('watch:pause')
      socket.off('watch:seek')
      socket.off('watch:addVideo')
      socket.off('watch:next')
      socket.off('watch:sync')
      socket.off('error')
    }
  }, [socket, chatId])

  // Gửi thông tin người xem khi tham gia 
  useEffect(() => {
    if (socket && userId && isConnected) {
      console.log('Gửi thông tin tham gia phòng watch:', chatId);
      
      // Tham gia vào room socket trước
      socket.emit('join-room', chatId);
      
      // Gửi thông tin người xem
      const viewer: Viewer = {
        id: userId,
        name: member?.profile?.name || 'Người dùng',
        role: member?.role || 'GUEST',
        imageUrl: member?.profile?.imageUrl
      };
      
      socket.emit('watch:join', {
        chatId,
        event: 'watch:join',
        data: { viewer },
        headers: {
          'x-socket-id': socket.id
        }
      });
      
      // Yêu cầu đồng bộ dữ liệu
      setTimeout(() => {
        requestSync();
      }, 300);
      
      // Khi rời phòng
      return () => {
        if (socket && userId) {
          socket.emit('watch:leave', {
            chatId,
            event: 'watch:leave',
            data: { viewerId: userId }
          });
          
          socket.emit('leave-room', chatId);
        }
      };
    }
  }, [socket, userId, isConnected, chatId, member, requestSync]);

  // Thêm một interval để yêu cầu đồng bộ định kỳ nếu playlist rỗng
  useEffect(() => {
    let syncInterval: NodeJS.Timeout | null = null;
    
    // Nếu playlist rỗng và socket đã kết nối, yêu cầu đồng bộ mỗi 5 giây
    if (isConnected && socket && playlist.length === 0) {
      console.log("[WATCH-ROOM] Playlist rỗng, thiết lập đồng bộ định kỳ");
      syncInterval = setInterval(() => {
        console.log("[WATCH-ROOM] Yêu cầu đồng bộ định kỳ (playlist rỗng)");
        requestSync();
      }, 5000);
    }
    
    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [isConnected, socket, playlist.length, requestSync]);

  // Thêm log khi playlist thay đổi
  useEffect(() => {
    console.log('Watch Room: Playlist cập nhật, số video:', playlist.length);
    if (playlist.length > 0) {
      console.log('Video hiện tại:', playlist[currentVideoIndex]?.url);
    }
  }, [playlist, currentVideoIndex]);

  const handlePlay = () => {
    if (isAdmin) {
      play()
      setIsPlaying(true)
    }
  }

  const handlePause = () => {
    if (isAdmin) {
      pause()
      setIsPlaying(false)
    }
  }

  const handleSeek = (time: number) => {
    if (isAdmin) {
      seek(time)
      setProgress(time)
    }
  }

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
      
      // Kiểm tra URL có phát được không
      const canPlay = ReactPlayer.canPlay(processedUrl);
      if (!canPlay) {
        setError('URL không được hỗ trợ. Hãy thử URL từ YouTube, Vimeo, v.v.');
        setIsLoadingVideo(false);
        return;
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
          title = `YouTube Video ${Date.now()}`;
        }
      } else if (processedUrl.includes('vimeo.com')) {
        thumbnail = getDefaultThumbnail('vimeo');
        title = `Vimeo Video ${Date.now()}`;
      } else {
        thumbnail = getDefaultThumbnail('other');
        title = `Video ${Date.now()}`;
      }
      
      // Tạo video object
      const video: VideoItem = {
        id: videoId || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: processedUrl,
        title: title,
        thumbnail: thumbnail,
        addedAt: Date.now(),
        addedBy: userId || 'unknown'
      };
      
      console.log('Thêm video mới:', video);
      
      // Gửi trực tiếp qua HTTP thay vì Socket
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
          
          // Reset input
          setInputUrl('');
          
          // Yêu cầu đồng bộ để đảm bảo tất cả client thấy video mới
          setTimeout(() => {
            fetch('/api/socket/watch', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId,
                event: 'watch:requestSync',
                data: {}
              }),
            }).catch(error => console.error('Lỗi khi đồng bộ:', error));
          }, 500);
        }
      } catch (err) {
        console.error('Lỗi khi gửi video qua HTTP:', err);
        setError('Không thể thêm video. Vui lòng thử lại sau.');
      }
      
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

  const currentVideo = playlist[currentVideoIndex]
  const duration = playerRef.current?.getDuration() || 1

  // Show connection state for better UX
  const connectionStatus = () => {
    if (isConnected) {
      return <span className="text-xs text-green-500 flex items-center gap-1">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Connected
      </span>
    }
    if (isPolling) {
      return <span className="text-xs text-amber-500 flex items-center gap-1">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span> Reconnecting...
      </span>
    }
    return <span className="text-xs text-red-500 flex items-center gap-1">
      <span className="w-2 h-2 bg-red-500 rounded-full"></span> Disconnected
    </span>
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
      return ReactPlayer.canPlay(processedUrl);
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
            requestSync()
          }}
          className="bg-indigo-500 hover:bg-indigo-600"
        >
          Retry Connection
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-800">
      <div className="px-3 py-2 border-b border-zinc-700 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-zinc-200">Watch Together</h3>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 relative text-zinc-400 hover:text-white"
                  onClick={() => setShowViewers(!showViewers)}
                >
                  <Users className="h-4 w-4" />
                  {Array.isArray(viewers) && viewers.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                      {viewers.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Người đang xem</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {connectionStatus()}
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
        {currentVideo ? (
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
              playing={isPlaying}
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
                    origin: window.location.origin,
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
        ) : (
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
        )}
      </div>

      {/* Controls */}
      {currentVideo && (
        <div className="flex items-center bg-zinc-900 p-2 border-t border-zinc-700">
          <Button 
            onClick={isPlaying ? handlePause : handlePlay}
            variant="ghost" 
            disabled={!isAdmin} 
            className="text-zinc-400 hover:text-white"
          >
            {isPlaying ? (
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
    </div>
  )
} 
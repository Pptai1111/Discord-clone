import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "@/components/providers/socket-provider";

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
  lastActive?: number;
}

// Lưu trữ trạng thái khi mất kết nối
const WATCH_STATE_STORAGE_KEY = 'watch_room_state';

export const useWatchSocket = (chatId: string, userId?: string) => {
  // Trạng thái kết nối
  const [isConnected, setIsConnected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const { socket, reconnect } = useSocket();
  
  // State cho playlist và viewers
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  
  // State cho polling và heartbeat
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 10; // Tăng số lần thử từ 5 lên 10
  const lastPingTimeRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Caching cho request
  const lastRequestTimeRef = useRef<Record<string, number>>({});
  const MIN_REQUEST_INTERVAL = 500; // Tối thiểu 500ms giữa các request

  // Lưu trạng thái vào localStorage
  const saveStateToStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stateToSave = {
        chatId,
        playlist,
        currentIndex,
        isPlaying,
        progress,
        timestamp: Date.now()
      };
      
      localStorage.setItem(
        `${WATCH_STATE_STORAGE_KEY}_${chatId}`, 
        JSON.stringify(stateToSave)
      );
      
      console.log('[CLIENT] Saved watch state to storage');
    } catch (e) {
      console.error('[CLIENT] Error saving state to storage:', e);
    }
  }, [chatId, playlist, currentIndex, isPlaying, progress]);
  
  // Khôi phục trạng thái từ localStorage
  const restoreStateFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return false;
    
    try {
      const savedStateString = localStorage.getItem(
        `${WATCH_STATE_STORAGE_KEY}_${chatId}`
      );
      
      if (!savedStateString) return false;
      
      const savedState = JSON.parse(savedStateString);
      const now = Date.now();
      
      // Chỉ khôi phục state nếu được lưu trong vòng 5 phút
      if (now - savedState.timestamp > 5 * 60 * 1000) {
        console.log('[CLIENT] Saved state is too old, not restoring');
        localStorage.removeItem(`${WATCH_STATE_STORAGE_KEY}_${chatId}`);
        return false;
      }
      
      if (savedState.chatId !== chatId) return false;
      
      console.log('[CLIENT] Restoring state from storage:', {
        playlistCount: savedState.playlist?.length || 0,
        currentIndex: savedState.currentIndex,
        isPlaying: savedState.isPlaying
      });
      
      if (savedState.playlist?.length > 0) {
        setPlaylist(savedState.playlist);
        setCurrentIndex(savedState.currentIndex || 0);
        setProgress(savedState.progress || 0);
        setIsPlaying(false); // Luôn bắt đầu ở trạng thái tạm dừng sau khi khôi phục
        
        return true;
      }
      
      return false;
    } catch (e) {
      console.error('[CLIENT] Error restoring state from storage:', e);
      return false;
    }
  }, [chatId]);

  // Throttle utility
  const throttledRequestRef = useRef<Function | null>(null);

  const throttle = useCallback((func: Function, delay: number) => {
    let lastCall = 0;
    return (...args: any[]) => {
      const now = new Date().getTime();
      if (now - lastCall < delay) {
        return;
      }
      lastCall = now;
      return func(...args);
    };
  }, []);

  // Tự động lưu trạng thái khi state thay đổi
  useEffect(() => {
    if (playlist.length > 0) {
      saveStateToStorage();
    }
  }, [playlist, currentIndex, isPlaying, progress, saveStateToStorage]);

  // Gửi heartbeat định kỳ
  useEffect(() => {
    if (!socket || !isConnected || !userId) return;
    
    // Gửi heartbeat mỗi 30 giây để giữ phiên
    const heartbeatInterval = setInterval(() => {
      socket.emit('watch:heartbeat', {
        chatId,
        event: 'watch:heartbeat',
        data: { viewerId: userId }
      });
    }, 30000);
    
    heartbeatIntervalRef.current = heartbeatInterval;
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, isConnected, chatId, userId]);

  // Thiết lập kết nối và lắng nghe sự kiện
  useEffect(() => {
    if (!socket) {
      return;
    }

    const onConnect = () => {
      console.log('Socket connected in watch-socket');
      setIsConnected(true);
      setIsPolling(false);
      lastPingTimeRef.current = Date.now();
      
      // Hủy polling nếu đã kết nối lại
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // Yêu cầu đồng bộ dữ liệu ngay khi kết nối
      socket.emit('watch:requestSync', {
        chatId,
        event: 'watch:requestSync'
      });
    };

    const onDisconnect = () => {
      console.log('Socket disconnected in watch-socket');
      setIsConnected(false);
      
      // Lưu trạng thái hiện tại khi mất kết nối
      if (playlist.length > 0) {
        saveStateToStorage();
      }
      
      // Bắt đầu polling khi mất kết nối
      if (!pollingIntervalRef.current) {
        setIsPolling(true);
        setRetryCount(0);
        
        console.warn("Mất kết nối socket - chuyển sang chế độ polling");
        
        // Sử dụng backoff strategy để tăng thời gian giữa các lần retry
        const getPollingInterval = (retryCount: number) => {
          // Bắt đầu với 1000ms và tăng dần, tối đa 10000ms
          return Math.min(1000 * Math.pow(1.5, retryCount), 10000);
        };
        
        pollingIntervalRef.current = setInterval(() => {
          console.log('Polling for updates...');
          
          // Tăng số lần thử
          setRetryCount(prev => {
            const newCount = prev + 1;
            
            // Thử kết nối lại socket sau một số lần polling
            if (newCount % 3 === 0) {
              console.log('Trying to reconnect socket...');
              
              // Sử dụng exponential backoff cho việc reconnect
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              
              reconnectTimeoutRef.current = setTimeout(() => {
                reconnect();
                reconnectTimeoutRef.current = null;
              }, getPollingInterval(newCount));
            }
            
            // Cập nhật polling interval dựa trên số lần thử
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              
              if (newCount <= MAX_RETRIES) {
                pollingIntervalRef.current = setInterval(() => {
                  pollForUpdates();
                }, getPollingInterval(newCount));
              } else {
                pollingIntervalRef.current = null;
                setIsPolling(false);
                console.error("Đã đạt giới hạn thử lại - Vui lòng tải lại trang");
              }
            }
            
            return newCount;
          });
          
          pollForUpdates();
        }, 1000);
      }
    };
    
    // Hàm polling cập nhật qua HTTP
    const pollForUpdates = () => {
      // Fetch qua HTTP
      fetch(`/api/socket/watch?chatId=${chatId}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Polled data:', data);
          
          // Cập nhật state từ polling
          if (data.playlist) setPlaylist(data.playlist);
          if (data.currentIndex !== undefined) setCurrentIndex(data.currentIndex);
          if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.viewers) setViewers(data.viewers);
        })
        .catch(error => {
          console.error('Polling error:', error);
          
          // Nếu thử lại quá nhiều lần, dừng polling
          if (retryCount >= MAX_RETRIES) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              setIsPolling(false);
              
              console.error("Không thể kết nối - Vui lòng tải lại trang");
            }
          }
        });
    };

    // Lắng nghe các sự kiện
    const setupSocketListeners = () => {
      // Đăng ký sự kiện kết nối
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      
      // Sự kiện liên quan đến video
      socket.on('watch:play', (data: { chatId: string }) => {
        console.log('Nhận sự kiện watch:play:', data);
        setIsPlaying(true);
      });
      
      socket.on('watch:pause', (data: { chatId: string }) => {
        console.log('Nhận sự kiện watch:pause:', data);
        setIsPlaying(false);
      });
      
      socket.on('watch:seek', (data: { time: number }) => {
        console.log('Nhận sự kiện watch:seek:', data);
        setProgress(data.time);
      });
      
      socket.on('watch:addVideo', (data: { video: VideoItem; chatId: string }) => {
        console.log('[CLIENT] Nhận sự kiện watch:addVideo:', data);
        
        // Kiểm tra xem event này có dành cho phòng hiện tại không
        if (data.chatId && data.chatId !== chatId) {
          console.log('[CLIENT] Bỏ qua video không phải cho phòng này');
          return;
        }
        
        // Kiểm tra tính hợp lệ của video
        if (!data.video || !data.video.url) {
          console.warn('[CLIENT] Nhận được video không hợp lệ');
          return;
        }
        
        // Đảm bảo video có ID
        const video = {
          ...data.video,
          id: data.video.id || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        
        console.log('[CLIENT] Thêm video mới vào playlist:', video.url);
        
        // Thêm video vào playlist nếu chưa tồn tại
        setPlaylist(prev => {
          // Kiểm tra xem video đã tồn tại chưa
          const exists = prev.some(item => 
            item.id === video.id || item.url === video.url
          );
          
          // Nếu đã tồn tại, không thêm nữa
          if (exists) {
            console.log('[CLIENT] Video đã tồn tại trong playlist');
            return prev;
          }
          
          console.log('[CLIENT] Đã thêm video mới vào playlist:', video.title || video.url);
          const newPlaylist = [...prev, video];
          
          // Lưu trạng thái vào storage
          setTimeout(() => saveStateToStorage(), 0);
          
          return newPlaylist;
        });
      });
      
      socket.on('watch:next', (data: { index: number }) => {
        console.log('Nhận sự kiện watch:next:', data);
        setCurrentIndex(data.index);
      });
      
      socket.on('watch:sync', (data: { 
        playlist: VideoItem[], 
        currentIndex: number, 
        isPlaying: boolean, 
        progress: number,
        chatId?: string
      }) => {
        // Đảm bảo chỉ xử lý dữ liệu dành cho phòng này
        if (data.chatId && data.chatId !== chatId) {
          console.log(`[CLIENT] Bỏ qua sync không phải cho phòng này: ${data.chatId}`);
          return;
        }

        console.log(`[CLIENT] Nhận sự kiện watch:sync với dữ liệu:`, {
          playlistCount: data.playlist?.length || 0,
          currentIndex: data.currentIndex,
          isPlaying: data.isPlaying,
          progress: data.progress
        });
        
        // Xử lý playlist
        if (data.playlist && Array.isArray(data.playlist)) {
          try {
            // Kiểm tra tính hợp lệ của mỗi video trong playlist
            const validPlaylist = data.playlist.filter(item => 
              item && typeof item === 'object' && item.url
            ).map(video => ({
              ...video,
              id: video.id || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              thumbnail: video.thumbnail || 'https://i.imgur.com/MmXXUmY.png',
              title: video.title || `Video ${Date.now()}`
            }));
            
            if (validPlaylist.length > 0) {
              console.log(`[CLIENT] Đồng bộ hóa playlist mới (${validPlaylist.length} videos)`, 
                validPlaylist.map(v => ({ id: v.id, url: v.url.substring(0, 30) + '...' }))
              );
              
              // Cập nhật playlist hoàn chỉnh, không chỉ thêm video mới
              setPlaylist(validPlaylist);
              
              // Lưu vào localStorage
              setTimeout(() => saveStateToStorage(), 0);
            } else if (data.playlist.length === 0) {
              console.log('[CLIENT] Xóa playlist do nhận playlist rỗng');
              setPlaylist([]);
            } else {
              console.warn('[CLIENT] Nhận được playlist không hợp lệ');
            }
          } catch (error) {
            console.error('[CLIENT] Lỗi khi xử lý playlist:', error);
          }
        }
        
        // Cập nhật các state khác nếu có
        if (typeof data.currentIndex === 'number') {
          console.log(`[CLIENT] Cập nhật currentIndex: ${data.currentIndex}`);
          setCurrentIndex(data.currentIndex);
        }
        
        if (typeof data.isPlaying === 'boolean') {
          console.log(`[CLIENT] Cập nhật isPlaying: ${data.isPlaying}`);
          setIsPlaying(data.isPlaying);
        }
        
        if (typeof data.progress === 'number') {
          console.log(`[CLIENT] Cập nhật progress: ${data.progress}`);
          setProgress(data.progress);
        }
      });
      
      // Sự kiện liên quan đến người xem
      socket.on('watch:join', (data: { viewer: Viewer }) => {
        console.log('Nhận sự kiện watch:join:', data);
        setViewers(prev => {
          const exists = prev.some(v => v.id === data.viewer.id);
          if (exists) return prev;
          return [...prev, data.viewer];
        });
      });
      
      socket.on('watch:leave', (data: { viewerId: string }) => {
        console.log('Nhận sự kiện watch:leave:', data);
        setViewers(prev => prev.filter(v => v.id !== data.viewerId));
      });
      
      socket.on('watch:syncViewers', (data: { viewers: Viewer[] }) => {
        console.log('Nhận sự kiện watch:syncViewers:', data);
        if (Array.isArray(data.viewers)) {
          setViewers(data.viewers);
        }
      });
      
      // Kiểm tra kết nối
      socket.on('ping_test', () => {
        lastPingTimeRef.current = Date.now();
      });
      
      // Thiết lập trạng thái kết nối
      if (socket.connected) {
        onConnect();
      } else {
        socket.connect();
      }
    };

    setupSocketListeners();
    
    // Khôi phục trạng thái từ localStorage nếu có
    if (playlist.length === 0) {
      const restored = restoreStateFromStorage();
      
      // Nếu khôi phục thành công, yêu cầu đồng bộ
      if (restored && socket.connected) {
        socket.emit('watch:requestSync', {
          chatId,
          event: 'watch:requestSync'
        });
      }
    }

    // Cleanup khi unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('watch:play');
      socket.off('watch:pause');
      socket.off('watch:seek');
      socket.off('watch:addVideo');
      socket.off('watch:next');
      socket.off('watch:sync');
      socket.off('watch:join');
      socket.off('watch:leave');
      socket.off('watch:syncViewers');
      socket.off('ping_test');
      
      // Clear intervals
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [socket, chatId, retryCount, reconnect, userId, restoreStateFromStorage, saveStateToStorage, playlist.length]);

  // Thiết lập throttle request
  useEffect(() => {
    throttledRequestRef.current = throttle((url: string, data: any) => {
      const requestKey = `${url}:${data.event}`;
      const now = Date.now();
      
      // Tránh gửi quá nhiều request trong khoảng thời gian ngắn
      if (lastRequestTimeRef.current[requestKey] && 
          now - lastRequestTimeRef.current[requestKey] < MIN_REQUEST_INTERVAL) {
        console.log(`Throttling ${data.event} request`);
        return;
      }
      
      lastRequestTimeRef.current[requestKey] = now;
      
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).catch(err => {
        console.error(`Error in ${data.event} request:`, err);
      });
    }, 100);
  }, [throttle]);

  // Hàm gửi request an toàn
  const throttledRequest = useCallback((event: string, data?: any) => {
    if (!throttledRequestRef.current) return;
    throttledRequestRef.current('/api/socket/watch', {
      chatId,
      event,
      data: {
        ...data,
        userId: userId // Thêm userId vào mọi request
      }
    });
  }, [chatId, userId]);

  // Các hàm action
  const play = useCallback((time?: number) => {
    if (socket && isConnected) {
      socket.emit('watch:play', {
        chatId,
        event: 'watch:play',
        data: { time },
      });
    } else {
      throttledRequest('watch:play', { time });
    }
  }, [chatId, socket, isConnected, throttledRequest]);

  const pause = useCallback((time?: number) => {
    if (socket && isConnected) {
      socket.emit('watch:pause', {
        chatId,
        event: 'watch:pause',
        data: { time },
      });
    } else {
      throttledRequest('watch:pause', { time });
    }
  }, [chatId, socket, isConnected, throttledRequest]);

  const seek = useCallback((time: number) => {
    if (socket && isConnected) {
      socket.emit('watch:seek', {
        chatId,
        event: 'watch:seek',
        data: { time },
      });
    } else {
      throttledRequest('watch:seek', { time });
    }
  }, [chatId, socket, isConnected, throttledRequest]);

  const addVideo = useCallback((video: VideoItem) => {
    if (!socket) {
      console.warn('[CLIENT] Không thể thêm video khi chưa có socket');
      return;
    }
    
    console.log('[CLIENT] Thêm video vào phòng:', chatId, video);
    
    // Tham gia phòng để đảm bảo nhận phản hồi
    socket.emit('join-room', chatId);
    
    // Thêm ID cho video nếu chưa có
    const videoWithId = {
      ...video,
      id: video.id || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    // Gửi yêu cầu thêm video với headers
    socket.emit('watch:addVideo', {
      chatId,
      event: 'watch:addVideo',
      data: {
        video: videoWithId,
        userId
      },
      headers: {
        'x-socket-id': socket.id
      }
    });
  }, [socket, chatId, userId]);

  const next = useCallback((index: number, time?: number) => {
    if (socket && isConnected) {
      socket.emit('watch:next', {
        chatId,
        event: 'watch:next',
        data: { index, time },
      });
    } else {
      throttledRequest('watch:next', { index, time });
    }
  }, [chatId, socket, isConnected, throttledRequest]);

  const requestSync = useCallback(() => {
    if (!socket || !isConnected) {
      console.warn('[CLIENT] Không thể yêu cầu đồng bộ khi chưa kết nối');
      return;
    }
    
    const now = Date.now();
    const lastRequest = lastRequestTimeRef.current['requestSync'] || 0;
    
    // Tránh yêu cầu quá thường xuyên
    if (now - lastRequest < MIN_REQUEST_INTERVAL) {
      console.log('[CLIENT] Yêu cầu đồng bộ quá thường xuyên, bỏ qua');
      return;
    }
    
    console.log('[CLIENT] Yêu cầu đồng bộ cho phòng:', chatId);
    
    // Cập nhật thời gian yêu cầu cuối
    lastRequestTimeRef.current['requestSync'] = now;
    
    // Tham gia room trước khi yêu cầu dữ liệu
    socket.emit('join-room', chatId);
    
    // Gửi yêu cầu đồng bộ với x-socket-id để server biết socket nào yêu cầu
    socket.emit('watch:requestSync', {
      chatId,
      event: 'watch:requestSync',
      timestamp: now
    });
  }, [socket, isConnected, chatId]);

  const updateProgress = useCallback((progressTime: number) => {
    // Gửi ít hơn, chỉ khi cần thiết
    if (socket && isConnected && Math.abs(progress - progressTime) > 1) {
      socket.emit('watch:updateProgress', {
        chatId,
        event: 'watch:updateProgress',
        data: { progress: progressTime },
      });
    }
  }, [chatId, socket, isConnected, progress]);

  // Hàm fallback để lấy dữ liệu đồng bộ qua HTTP
  const fallbackSyncRequest = useCallback(() => {
    console.log('[CLIENT] Thực hiện fallback sync qua HTTP');
    throttledRequest('watch:requestSync');
    
    fetch(`/api/socket/watch?chatId=${chatId}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('[CLIENT] Nhận dữ liệu đồng bộ qua HTTP:', {
          playlistCount: data.playlist?.length || 0,
          currentIndex: data.currentIndex,
          isPlaying: data.isPlaying
        });
        
        if (data.playlist && Array.isArray(data.playlist)) {
          setPlaylist(data.playlist);
        }
        
        if (data.currentIndex !== undefined) setCurrentIndex(data.currentIndex);
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.viewers) setViewers(data.viewers);
      })
      .catch(error => {
        console.error('[CLIENT] Lỗi lấy dữ liệu đồng bộ qua HTTP:', error);
      });
  }, [chatId, throttledRequest]);

  // Hàm để gửi video qua HTTP
  const sendVideoViaHttp = useCallback((video: VideoItem) => {
    console.log('[CLIENT] Gửi video qua HTTP:', video);
    
    fetch('/api/socket/watch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId,
        event: 'watch:addVideo',
        data: { video, userId }
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('[CLIENT] Kết quả thêm video qua HTTP:', data);
        if (data.success) {
          // Yêu cầu đồng bộ sau khi thêm thành công
          setTimeout(() => requestSync(), 500);
        }
      })
      .catch(error => {
        console.error('[CLIENT] Lỗi khi gửi video qua HTTP:', error);
      });
  }, [chatId, userId, requestSync]);

  // Interface cho hook
  return {
    isConnected,
    isPolling,
    socket,
    play,
    pause,
    seek,
    addVideo,
    next,
    requestSync,
    updateProgress,
    playlist,
    currentIndex,
    isPlaying,
    progress,
    viewers,
    saveStateToStorage,
    fallbackSyncRequest
  };
};
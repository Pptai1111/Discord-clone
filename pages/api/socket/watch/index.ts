import { NextApiRequest } from "next";
import { NextApiResponseServerIo } from "@/types";

interface Viewer {
  id: string;
  name: string;
  role: string;
  imageUrl?: string;
  lastActive?: number;
}

interface VideoItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  addedAt?: number;
  addedBy?: string;
}

interface WatchRoom {
  chatId: string;
  viewers: Viewer[];
  playlist: VideoItem[];
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  lastUpdated: number;
  createdAt: number;
}

// Lưu trạng thái các phòng xem
const watchRooms: Record<string, WatchRoom> = {};

// Cache cho các request HTTP
const requestCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 5000; // 5 giây

// Hàm dọn dẹp phòng không hoạt động sau 24 giờ
const cleanupRooms = () => {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  
  Object.keys(watchRooms).forEach(chatId => {
    // Kiểm tra phòng tạo hơn 24h
    if (now - watchRooms[chatId].createdAt > dayInMs) {
      // Kiểm tra phòng không có người xem
      if (watchRooms[chatId].viewers.length === 0) {
        console.log(`Cleaning up inactive room: ${chatId}`);
        delete watchRooms[chatId];
      }
    }
    
    // Dọn người xem không hoạt động sau 30 phút
    const thirtyMinutesInMs = 30 * 60 * 1000;
    watchRooms[chatId].viewers = watchRooms[chatId].viewers.filter(viewer => {
      return !viewer.lastActive || (now - viewer.lastActive < thirtyMinutesInMs);
    });
  });
};

// Chạy dọn dẹp định kỳ mỗi giờ
setInterval(cleanupRooms, 60 * 60 * 1000);

// Cải thiện function broadcast
const broadcastToRoom = (res: NextApiResponseServerIo, roomId: string, event: string, data: any) => {
  console.log(`[SERVER] Broadcasting ${event} to room ${roomId}`);
  
  if (!res?.socket?.server?.io) {
    console.error('[SERVER] Socket server không tồn tại');
    return false;
  }
  
  try {
    // Đảm bảo gói dữ liệu có chứa chatId
    const payloadWithChatId = {
      ...data,
      chatId: roomId
    };
    
    // Broadcast đến room cụ thể trước
    res.socket.server.io.to(roomId).emit(event, payloadWithChatId);
    console.log(`[SERVER] Broadcast ${event} đến phòng ${roomId} thành công`);
    
    // Đối với các event quan trọng thì gửi broadcast tổng để đảm bảo
    if (event === 'watch:addVideo' || event === 'watch:sync') {
      console.log(`[SERVER] Thực hiện broadcast ${event} toàn cục để đảm bảo`);
      res.socket.server.io.emit(event, payloadWithChatId);
    }
    
    return true;
  } catch (error) {
    console.error(`[SERVER] Lỗi khi broadcast ${event} đến ${roomId}:`, error);
    
    try {
      // Fallback: gửi broadcast toàn cục
      res.socket.server.io.emit(event, {
        ...data,
        chatId: roomId
      });
      console.log(`[SERVER] Fallback broadcast ${event} toàn cục thành công`);
      return true;
    } catch (fallbackError) {
      console.error(`[SERVER] Lỗi khi fallback broadcast:`, fallbackError);
      return false;
    }
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIo
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Xử lý các HTTP request để lấy dữ liệu (cho polling fallback)
    if (req.method === "GET") {
      const { chatId } = req.query;
      
      if (!chatId || typeof chatId !== "string") {
        return res.status(400).json({ error: "ChatId is required" });
      }
      
      console.log(`[SERVER] GET request for chatId ${chatId}`);
      
      // Kiểm tra cache
      const cacheKey = `GET:${chatId}`;
      const cachedData = requestCache.get(cacheKey);
      
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
        console.log(`[SERVER] Returning cached data for ${chatId}`);
        return res.status(200).json(cachedData.data);
      }
      
      // Không có trong cache, trả về dữ liệu mới
      const roomData = watchRooms[chatId] || {
        chatId,
        viewers: [],
        playlist: [],
        currentIndex: 0,
        isPlaying: false,
        progress: 0,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
      
      // Log thông tin phòng
      console.log(`[SERVER] Room data for ${chatId}:`, {
        playlistCount: roomData.playlist.length,
        viewersCount: roomData.viewers.length,
        currentIndex: roomData.currentIndex,
        isPlaying: roomData.isPlaying
      });
      
      // Lưu vào cache
      requestCache.set(cacheKey, {
        data: roomData,
        timestamp: Date.now()
      });
      
      return res.status(200).json(roomData);
    }

    // Xử lý POST request để thực hiện các action
    const { chatId, event, data } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: "ChatId is missing" });
    }

    // Đảm bảo phòng tồn tại
    if (!watchRooms[chatId]) {
      watchRooms[chatId] = {
        chatId,
        viewers: [],
        playlist: [],
        currentIndex: 0,
        isPlaying: false,
        progress: 0,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
    }
    
    // Cập nhật thời gian hoạt động mới nhất
    watchRooms[chatId].lastUpdated = Date.now();

    // Các events khác nhau cho WatchRoom
    switch(event) {
      case "watch:play":
        watchRooms[chatId].isPlaying = true;
        broadcastToRoom(res, chatId, "watch:play", {
          chatId
        });
        break;
        
      case "watch:pause":
        watchRooms[chatId].isPlaying = false;
        broadcastToRoom(res, chatId, "watch:pause", {
          chatId
        });
        break;
        
      case "watch:seek":
        if (!data || !data.time) {
          return res.status(400).json({ error: "Time is missing" });
        }
        watchRooms[chatId].progress = data.time;
        broadcastToRoom(res, chatId, "watch:seek", {
          chatId,
          time: data.time
        });
        break;
        
      case "watch:addVideo":
        if (!data || !data.video) {
          return res.status(400).json({ error: "Video data is missing" });
        }
        
        console.log(`[SERVER] Adding video to room ${chatId}:`, data.video);
        
        // Đảm bảo room tồn tại
        if (!watchRooms[chatId]) {
          console.log(`[SERVER] Creating new room for ${chatId}`);
          watchRooms[chatId] = {
            chatId,
            viewers: [],
            playlist: [],
            currentIndex: 0,
            isPlaying: false,
            progress: 0,
            lastUpdated: Date.now(),
            createdAt: Date.now()
          };
        }
        
        // Đảm bảo video có ID
        const videoWithMeta = {
          ...data.video,
          id: data.video.id || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          addedAt: Date.now(),
          addedBy: data.userId || 'unknown'
        };
        
        // Kiểm tra kỹ hơn về trùng lặp video
        let duplicateIndex = -1;
        
        // Kiểm tra URL trùng lặp
        duplicateIndex = watchRooms[chatId].playlist.findIndex(
          v => v.url === data.video.url
        );
        
        // Kiểm tra ID trùng lặp nếu chưa tìm thấy URL trùng
        if (duplicateIndex === -1 && data.video.id) {
          duplicateIndex = watchRooms[chatId].playlist.findIndex(
            v => v.id === data.video.id
          );
        }
        
        let videoAdded = false;
        
        if (duplicateIndex === -1) {
          // Thêm video mới vào playlist
          watchRooms[chatId].playlist.push(videoWithMeta);
          videoAdded = true;
          console.log(`[SERVER] Video added to room ${chatId}, new count:`, watchRooms[chatId].playlist.length);
        } else {
          console.log(`[SERVER] Duplicate video detected in room ${chatId}, not adding`);
        }
        
        // Broadcast tới tất cả client TRONG PHÒNG
        try {
          if (res.socket.server.io) {
            // Đảm bảo gói dữ liệu có chứa chatId
            const payload = {
              chatId: chatId,
              video: videoWithMeta
            };
            
            console.log(`[SERVER] Broadcasting video to room ${chatId}`);
            
            // Phát sóng tới phòng cụ thể
            res.socket.server.io.to(chatId).emit('watch:addVideo', payload);
            
            // Phát sóng toàn cục để đảm bảo tất cả client nhận được
            res.socket.server.io.emit('watch:addVideo', payload);
            
            // Nếu đây là video đầu tiên, phát sóng đồng bộ đầy đủ
            if (watchRooms[chatId].playlist.length === 1) {
              console.log(`[SERVER] This is the first video, broadcasting full sync to all clients`);
              setTimeout(() => {
                const syncData = {
                  chatId: chatId,
                  playlist: watchRooms[chatId].playlist,
                  currentIndex: watchRooms[chatId].currentIndex,
                  isPlaying: watchRooms[chatId].isPlaying,
                  progress: watchRooms[chatId].progress
                };
                
                // Phát sóng trực tiếp tới phòng
                res.socket.server.io.to(chatId).emit('watch:sync', syncData);
                
                // Phát sóng toàn cục
                res.socket.server.io.emit('watch:sync', syncData);
              }, 300);
            }
          } else {
            console.log(`[SERVER] Socket server not available`);
          }
        } catch (error) {
          console.error(`[SERVER] Error broadcasting video:`, error);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Video added',
          videoAdded: videoAdded,
          playlistCount: watchRooms[chatId].playlist.length,
          roomData: watchRooms[chatId]
        });
        
      case "watch:next":
        if (!data || data.index === undefined) {
          return res.status(400).json({ error: "Index is missing" });
        }
        
        // Kiểm tra index hợp lệ
        if (data.index >= 0 && data.index < watchRooms[chatId].playlist.length) {
          watchRooms[chatId].currentIndex = data.index;
          broadcastToRoom(res, chatId, "watch:next", {
            chatId,
            index: data.index
          });
        } else {
          return res.status(400).json({ error: "Invalid playlist index" });
        }
        break;
        
      case "watch:requestSync":
        console.log(`Watch sync requested for room ${chatId}`);
        
        // Đảm bảo room tồn tại
        if (!watchRooms[chatId]) {
          watchRooms[chatId] = {
            chatId,
            viewers: [],
            playlist: [],
            currentIndex: 0,
            isPlaying: false,
            progress: 0,
            lastUpdated: Date.now(),
            createdAt: Date.now()
          };
        }

        // Log dữ liệu hiện tại của room
        console.log(`Current room data for ${chatId}:`, {
          playlistCount: watchRooms[chatId].playlist.length,
          currentIndex: watchRooms[chatId].currentIndex,
          isPlaying: watchRooms[chatId].isPlaying,
          viewersCount: watchRooms[chatId].viewers.length
        });
        
        // Emit trực tiếp đến client yêu cầu đồng bộ
        broadcastToRoom(res, chatId, 'watch:sync', {
          playlist: watchRooms[chatId].playlist,
          currentIndex: watchRooms[chatId].currentIndex,
          isPlaying: watchRooms[chatId].isPlaying,
          progress: watchRooms[chatId].progress
        });
        
        // Đồng bộ người xem
        broadcastToRoom(res, chatId, 'watch:syncViewers', {
          viewers: watchRooms[chatId].viewers
        });
        
        return res.status(200).json({
          success: true,
          message: 'Sync requested'
        });
        
      case "watch:join":
        if (!data || !data.viewer) {
          return res.status(400).json({ error: "Viewer data is missing" });
        }
        
        console.log(`[SERVER] User ${data.viewer.id} joining room ${chatId}`);
        
        // Lấy socket ID từ headers nếu có
        const socketId = req.headers['x-socket-id'] as string;
        
        // Yêu cầu socket tham gia vào room
        if (socketId && res.socket.server.io) {
          try {
            // Lấy socket từ ID
            const socket = res.socket.server.io.sockets.sockets.get(socketId);
            if (socket) {
              // Tham gia vào room Socket.IO
              socket.join(chatId);
              
              // Gửi sự kiện join-room cũng để theo dõi
              socket.emit('join-room', chatId);
              
              console.log(`[SERVER] Socket ${socketId} đã tham gia vào room ${chatId}`);
            } else {
              console.warn(`[SERVER] Không tìm thấy socket ${socketId}`);
            }
          } catch (error) {
            console.error(`[SERVER] Lỗi khi thêm socket vào room:`, error);
          }
        }
        
        // Thêm thông tin thời gian
        const viewerWithMeta = {
          ...data.viewer,
          lastActive: Date.now()
        };
        
        // Kiểm tra nếu viewer đã tồn tại
        const existingViewerIndex = watchRooms[chatId].viewers.findIndex(
          v => v.id === data.viewer.id
        );
        
        if (existingViewerIndex === -1) {
          // Thêm mới vào danh sách
          watchRooms[chatId].viewers.push(viewerWithMeta);
          console.log(`[SERVER] Thêm người xem ${data.viewer.id} vào room ${chatId}`);
        } else {
          // Cập nhật thông tin
          watchRooms[chatId].viewers[existingViewerIndex] = viewerWithMeta;
          console.log(`[SERVER] Cập nhật người xem ${data.viewer.id} trong room ${chatId}`);
        }
        
        // Thông báo có người tham gia
        broadcastToRoom(res, chatId, "watch:join", {
          viewer: viewerWithMeta
        });
        
        // Đồng bộ danh sách người xem
        broadcastToRoom(res, chatId, "watch:syncViewers", {
          viewers: watchRooms[chatId].viewers
        });
        
        // Gửi dữ liệu hiện tại của phòng để đồng bộ ngay
        if (watchRooms[chatId].playlist.length > 0) {
          console.log(`[SERVER] Đồng bộ dữ liệu phòng ${chatId} cho người xem mới`);
          
          setTimeout(() => {
            broadcastToRoom(res, chatId, "watch:sync", {
              playlist: watchRooms[chatId].playlist,
              currentIndex: watchRooms[chatId].currentIndex,
              isPlaying: watchRooms[chatId].isPlaying,
              progress: watchRooms[chatId].progress
            });
          }, 100);
        }
        
        return res.status(200).json({
          success: true,
          viewerCount: watchRooms[chatId].viewers.length,
          roomData: watchRooms[chatId]
        });
        break;
        
      case "watch:leave":
        if (!data || !data.viewerId) {
          return res.status(400).json({ error: "ViewerId is missing" });
        }
        
        // Xóa người xem khỏi phòng
        watchRooms[chatId].viewers = watchRooms[chatId].viewers.filter(
          v => v.id !== data.viewerId
        );
        
        // Thông báo người vừa rời đi
        broadcastToRoom(res, chatId, "watch:leave", {
          chatId,
          viewerId: data.viewerId
        });
        
        // Đồng bộ danh sách người xem
        broadcastToRoom(res, chatId, "watch:syncViewers", {
          viewers: watchRooms[chatId].viewers
        });
        break;

      case "watch:updateProgress":
        if (!data || data.progress === undefined) {
          return res.status(400).json({ error: "Progress data is missing" });
        }
        
        // Cập nhật tiến độ mới
        watchRooms[chatId].progress = data.progress;
        break;
        
      case "watch:heartbeat":
        if (!data || !data.viewerId) {
          return res.status(400).json({ error: "ViewerId is missing" });
        }
        
        // Cập nhật thời gian hoạt động của người xem
        const viewerIdx = watchRooms[chatId].viewers.findIndex(
          v => v.id === data.viewerId
        );
        
        if (viewerIdx !== -1) {
          watchRooms[chatId].viewers[viewerIdx].lastActive = Date.now();
        }
        break;
        
      default:
        return res.status(400).json({ error: "Unknown event" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Watch room error:", error);
    return res.status(500).json({ error: "Internal error" });
  }
} 
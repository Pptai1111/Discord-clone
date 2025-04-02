import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { SocketData } from "@/types";

// In-memory state cho tính năng Watch Together
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

interface RoomState {
  playlist: VideoItem[];
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  viewers: Viewer[];
  lastUpdate: number;
}

// Cache trạng thái phòng để các request HTTP cũng có thể truy cập
// Lưu ý: Cách này chỉ hoạt động trên một server instance duy nhất
// Trong môi trường production có nhiều instances, cần dùng Redis hoặc DB
const roomStates = new Map<string, RoomState>();

// Thời gian hết hạn cho data, vd 1 giờ
const EXPIRY_TIME = 60 * 60 * 1000;

// Cleanup expired rooms định kỳ
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, state] of roomStates.entries()) {
      if (now - state.lastUpdate > EXPIRY_TIME) {
        roomStates.delete(roomId);
        console.log(`[SERVER] Đã xóa phòng không hoạt động: ${roomId}`);
      }
    }
  }, 30 * 60 * 1000); // Kiểm tra mỗi 30 phút
}

// Helper function để lấy hoặc khởi tạo trạng thái phòng
function getOrCreateRoomState(roomId: string): RoomState {
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, {
      playlist: [],
      currentIndex: 0,
      isPlaying: false,
      progress: 0,
      viewers: [],
      lastUpdate: Date.now()
    });
  }
  
  return roomStates.get(roomId)!;
}

// Cập nhật trạng thái phòng từ hành động Socket.IO
export function updateRoomState(roomId: string, update: Partial<RoomState>) {
  const state = getOrCreateRoomState(roomId);
  
  // Cập nhật các trường có trong object update
  Object.assign(state, {
    ...update,
    lastUpdate: Date.now()
  });
  
  return state;
}

// API endpoint cho HTTP fallback
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    
    if (!chatId) {
      return NextResponse.json(
        { error: 'Missing chatId parameter' },
        { status: 400 }
      );
    }
    
    // Kiểm tra xem user có quyền truy cập room này không 
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Tìm server từ chatId
    const server = await db.server.findFirst({
      where: {
        channels: {
          some: {
            id: chatId,
          }
        },
        members: {
          some: {
            profileId: profile.id,
          }
        }
      }
    });
    
    if (!server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }
    
    // Lấy trạng thái phòng để trả về
    const state = getOrCreateRoomState(chatId);
    
    // Cập nhật lastActive cho viewer hiện tại
    const viewers = state.viewers.map(viewer => {
      if (viewer.id === profile.id) {
        return { ...viewer, lastActive: Date.now() };
      }
      return viewer;
    });
    
    // Nếu viewer chưa có trong danh sách, thêm mới
    const viewerExists = viewers.some(v => v.id === profile.id);
    if (!viewerExists) {
      viewers.push({
        id: profile.id,
        name: profile.name,
        imageUrl: profile.imageUrl,
        role: 'GUEST', // Mặc định là guest
        lastActive: Date.now()
      });
    }
    
    // Cập nhật danh sách viewers
    updateRoomState(chatId, { viewers });
    
    return NextResponse.json({
      ...state,
      chatId // Thêm chatId để client có thể xác nhận
    });
  } catch (error) {
    console.error('[SERVER] Error in GET /api/socket/watch:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Xử lý POST request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId, event, data } = body as SocketData;
    
    if (!chatId || !event) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Xác thực người dùng
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Kiểm tra xem người dùng có quyền truy cập server chứa channel này không
    const server = await db.server.findFirst({
      where: {
        channels: {
          some: {
            id: chatId,
          }
        },
        members: {
          some: {
            profileId: profile.id,
          }
        }
      },
      include: {
        members: {
          where: {
            profileId: profile.id
          }
        }
      }
    });
    
    if (!server || !server.members[0]) {
      return NextResponse.json(
        { error: 'Server not found or access denied' },
        { status: 404 }
      );
    }
    
    // Thêm thông tin role người dùng
    const userRole = server.members[0].role;
    
    // Lấy state hiện tại
    const state = getOrCreateRoomState(chatId);
    
    // Xử lý các event khác nhau
    switch (event) {
      case 'watch:play':
        updateRoomState(chatId, { isPlaying: true });
        break;
        
      case 'watch:pause':
        updateRoomState(chatId, { isPlaying: false });
        break;
        
      case 'watch:seek':
        if (data && typeof data.time === 'number') {
          updateRoomState(chatId, { progress: data.time });
        }
        break;
        
      case 'watch:next':
        if (data && typeof data.index === 'number') {
          updateRoomState(chatId, { 
            currentIndex: data.index,
            progress: 0 // Reset progress khi chuyển bài
          });
        }
        break;
        
      case 'watch:addVideo':
        if (data && data.video) {
          // Đảm bảo video có ID
          const video = {
            ...data.video,
            id: data.video.id || `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            addedAt: Date.now(),
            addedBy: profile.name
          };
          
          const newPlaylist = [...state.playlist];
          
          // Kiểm tra xem video đã tồn tại chưa
          const exists = newPlaylist.some(item => 
            item.id === video.id || item.url === video.url
          );
          
          if (!exists) {
            newPlaylist.push(video);
            updateRoomState(chatId, { playlist: newPlaylist });
          }
        }
        break;
        
      case 'watch:requestSync':
        // Không cần làm gì, sẽ trả về state hiện tại
        break;
        
      case 'watch:updateProgress':
        if (data && typeof data.progress === 'number') {
          updateRoomState(chatId, { progress: data.progress });
        }
        break;
        
      default:
        return NextResponse.json(
          { error: 'Unknown event' },
          { status: 400 }
        );
    }
    
    // Cập nhật lastActive cho viewer hiện tại
    const viewers = state.viewers.map(viewer => {
      if (viewer.id === profile.id) {
        return { ...viewer, lastActive: Date.now() };
      }
      return viewer;
    });
    
    // Nếu viewer chưa có trong danh sách, thêm mới
    const viewerExists = viewers.some(v => v.id === profile.id);
    if (!viewerExists) {
      viewers.push({
        id: profile.id,
        name: profile.name,
        imageUrl: profile.imageUrl,
        role: userRole, // Sử dụng role từ database
        lastActive: Date.now()
      });
    }
    
    // Cập nhật danh sách viewers và xóa các viewers không hoạt động
    const now = Date.now();
    const activeViewers = viewers.filter(v => 
      !v.lastActive || now - v.lastActive < 5 * 60 * 1000 // 5 phút
    );
    
    updateRoomState(chatId, { viewers: activeViewers });
    
    // Trả về trạng thái hiện tại của phòng
    const updatedState = getOrCreateRoomState(chatId);
    
    return NextResponse.json({
      success: true,
      state: updatedState,
      chatId
    });
  } catch (error) {
    console.error('[SERVER] Error in POST /api/socket/watch:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 
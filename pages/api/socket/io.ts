import { Server as NetServer } from "http";
import { NextApiRequest } from "next";
import { Server as ServerIO } from "socket.io"
import { NextApiResponseServerIo } from "@/types";

export const config = {
    api: {
        bodyParser: false,
    },
}

// Biến toàn cục để theo dõi những interval đã tạo
let createdIntervals: NodeJS.Timeout[] = [];

// Quản lý các phòng đang kết nối
let activeRooms: Record<string, Set<string>> = {};

// Quản lý playlist cho từng phòng
let roomPlaylists: Record<string, any[]> = {};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIo) => {
    console.log("Socket.IO handler called", new Date().toISOString());
    
    // Có instance đã tồn tại
    if (res.socket.server.io) {
        console.log("Sử dụng Socket.IO server đã tồn tại");
        res.end();
        return;
    }
    
    try {
        const path = "/api/socket/io";
        const httpServer: NetServer = res.socket.server as any;
        
        console.log("Khởi tạo Socket.IO server mới...");
        
        // Cấu hình Socket.IO server - đồng bộ với cấu hình client
        const io = new ServerIO(httpServer, {
            path: path,
            addTrailingSlash: false,
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true,
            },
            // Sử dụng polling trước, phù hợp với cấu hình client
            transports: ["polling", "websocket"],
            pingTimeout: 60000,
            connectTimeout: 60000,
            pingInterval: 25000,
            allowUpgrades: true
        });

        // Theo dõi lỗi kết nối
        io.engine.on("connection_error", (err) => {
            console.log(`Connection error: ${err.message}`);
        });

        // Theo dõi kết nối trực tiếp
        io.on("connection", (socket) => {
            console.log(`Socket connected: ${socket.id}`);
            
            // Broadcast trực tiếp khi có người kết nối
            socket.broadcast.emit("user:online", {
                socketId: socket.id,
                timestamp: new Date().toISOString()
            });
            
            // Thông báo kết nối thành công cho client
            socket.emit("connection_established", {
                socketId: socket.id,
                timestamp: new Date().toISOString(),
                transportType: socket.conn.transport.name
            });
            
            // Xử lý tham gia và rời phòng
            socket.on("join-room", (payload) => {
                let roomId, role;
                if (typeof payload === "object" && payload !== null) {
                    roomId = payload.roomId;
                    role = payload.role;
                } else {
                    roomId = payload;
                }
                socket.join(roomId);

                // Tối ưu: chỉ xóa playlist nếu là ADMIN hoặc MODERATOR
                if (role === "ADMIN" || role === "MODERATOR") {
                    if (roomPlaylists[roomId] && roomPlaylists[roomId].length > 0) {
                        roomPlaylists[roomId] = [];
                        console.log(`Playlist phòng ${roomId} đã bị xóa bởi thành viên có role: ${role}`);
                    } else {
                        console.log(`ADMIN/MODERATOR vào phòng ${roomId} nhưng playlist đã rỗng.`);
                    }
                } else {
                    console.log(`Thành viên role ${role || 'UNKNOWN'} vào phòng ${roomId}, playlist giữ nguyên.`);
                }

                // Theo dõi socket trong phòng
                if (!activeRooms[roomId]) {
                    activeRooms[roomId] = new Set();
                }
                activeRooms[roomId].add(socket.id);
                
                // Thông báo số người trong phòng
                const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                console.log(`Room ${roomId} now has ${roomSize} members`);
                
                // Gửi số lượng thành viên hiện tại trong phòng
                io.to(roomId).emit("room-info", {
                    roomId,
                    memberCount: roomSize
                });
                
                // Gửi playlist hiện tại cho client vừa join
                if (roomPlaylists[roomId] && roomPlaylists[roomId].length > 0) {
                    socket.emit("watch:sync", {
                        playlist: roomPlaylists[roomId],
                        currentIndex: 0,
                        isPlaying: false,
                        progress: 0,
                        chatId: roomId
                    });
                }
            });
            
            socket.on("leave-room", (roomId: string) => {
                console.log(`Socket ${socket.id} leaving room ${roomId}`);
                socket.leave(roomId);
                
                // Cập nhật theo dõi
                if (activeRooms[roomId]) {
                    activeRooms[roomId].delete(socket.id);
                    if (activeRooms[roomId].size === 0) {
                        delete activeRooms[roomId];
                    }
                }
                
                // Thông báo số người trong phòng
                const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                console.log(`Room ${roomId} now has ${roomSize} members`);
                
                io.to(roomId).emit("room-info", {
                    roomId,
                    memberCount: roomSize
                });
            });
            
            // Thiết lập ping test cho kết nối
            const pingInterval = setInterval(() => {
                socket.emit("ping_test");
            }, 25000);
            
            // Lưu interval để dọn dẹp sau này
            createdIntervals.push(pingInterval);
            
            // Xử lý transport upgrade
            socket.conn.on("upgrade", (transport) => {
                console.log(`Socket ${socket.id} upgraded transport from ${socket.conn.transport.name} to ${transport.name}`);
                socket.emit("connection_upgraded", {
                    transport: transport.name,
                    timestamp: new Date().toISOString()
                });
            });
            
            // Dọn dẹp khi ngắt kết nối
            socket.on("disconnect", (reason) => {
                console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
                
                clearInterval(pingInterval);
                
                // Rời tất cả các phòng
                for (const roomId in activeRooms) {
                    if (activeRooms[roomId].has(socket.id)) {
                        activeRooms[roomId].delete(socket.id);
                        if (activeRooms[roomId].size === 0) {
                            delete activeRooms[roomId];
                        }
                        
                        // Thông báo cho phòng
                        const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                        io.to(roomId).emit("room-info", {
                            roomId,
                            memberCount: roomSize
                        });
                    }
                }
                
                socket.broadcast.emit("user:offline", {
                    socketId: socket.id,
                    timestamp: new Date().toISOString()
                });
            });
            
            // Xử lý thêm video vào phòng
            socket.on("watch:addVideo", (payload) => {
                const { chatId, data } = payload || {};
                if (!chatId || !data?.video) return;
                if (!roomPlaylists[chatId]) roomPlaylists[chatId] = [];
                // Thêm video vào playlist phòng
                roomPlaylists[chatId].push(data.video);
                // Broadcast lại toàn bộ playlist mới cho phòng
                io.to(chatId).emit("watch:sync", {
                    playlist: roomPlaylists[chatId],
                    currentIndex: roomPlaylists[chatId].length - 1,
                    isPlaying: false,
                    progress: 0,
                    chatId
                });
            });

            // Xử lý đồng bộ playlist khi client yêu cầu
            socket.on("watch:requestSync", (payload) => {
                const { chatId } = payload || {};
                if (!chatId) return;
                if (!roomPlaylists[chatId]) roomPlaylists[chatId] = [];
                // Gửi lại playlist hiện tại cho client
                socket.emit("watch:sync", {
                    playlist: roomPlaylists[chatId],
                    currentIndex: 0,
                    isPlaying: false,
                    progress: 0,
                    chatId
                });
            });

            // Đồng bộ play
            socket.on("watch:play", (payload) => {
                const { chatId, data } = payload || {};
                if (!chatId) return;
                io.to(chatId).emit("watch:play", { chatId, ...data });
            });

            // Đồng bộ pause
            socket.on("watch:pause", (payload) => {
                const { chatId, data } = payload || {};
                if (!chatId) return;
                io.to(chatId).emit("watch:pause", { chatId, ...data });
            });

            // Đồng bộ seek
            socket.on("watch:seek", (payload) => {
                const { chatId, data } = payload || {};
                if (!chatId) return;
                io.to(chatId).emit("watch:seek", { chatId, ...data });
            });

            // Đồng bộ next
            socket.on("watch:next", (payload) => {
                const { chatId, data } = payload || {};
                if (!chatId) return;
                io.to(chatId).emit("watch:next", { chatId, ...data });
            });
            
            // Xử lý gửi và nhận tin nhắn chat realtime
            socket.on("chat:sendMessage", (payload) => {
                const { roomId, message } = payload || {};
                if (!roomId || !message) return;
                // Broadcast tin nhắn mới cho tất cả client trong phòng
                io.to(roomId).emit("chat:newMessage", {
                    message,
                    senderId: socket.id,
                    roomId,
                    timestamp: new Date().toISOString()
                });
            });
        });

        // Lưu vào server
        res.socket.server.io = io;
        console.log("Socket.IO server khởi tạo thành công");
    } catch (error) {
        console.error("Lỗi khởi tạo Socket.IO server:", error);
    }

    // Gửi phản hồi cho client
    res.end();
}

export default ioHandler;

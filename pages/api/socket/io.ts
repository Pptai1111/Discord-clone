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
            socket.on("join-room", (roomId: string) => {
                console.log(`Socket ${socket.id} joining room ${roomId}`);
                socket.join(roomId);
                
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

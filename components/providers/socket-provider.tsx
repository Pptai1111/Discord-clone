'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { io as ClientIO } from 'socket.io-client'

type SocketContextType = {
  socket: any | null
  isConnected: boolean
  isPolling: boolean
  reconnect: () => void
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isPolling: false,
  reconnect: () => {}
})

export const useSocket = () => {
  return useContext(SocketContext)
}

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const reconnectCountRef = useRef(0)
  const socketRef = useRef<any>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const connectionErrorsRef = useRef(0)
  const lastReconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const socketIdRef = useRef<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Thêm hàm để xóa tài nguyên socket
  const cleanupSocket = (socketInstance: any) => {
    if (!socketInstance) return;
    
    console.log('Cleaning up socket resources...');
    
    try {
      // Xóa tất cả listeners
      socketInstance.off('connect');
      socketInstance.off('disconnect');
      socketInstance.off('error');
      socketInstance.off('connect_error');
      socketInstance.off('reconnect');
      socketInstance.off('reconnect_attempt');
      socketInstance.off('reconnect_error');
      socketInstance.off('reconnect_failed');
      socketInstance.off('ping_test');
      socketInstance.off('connection_upgraded');
      
      // Xóa tất cả listeners của engine
      try {
        if (socketInstance.io && socketInstance.io.engine) {
          socketInstance.io.engine.removeAllListeners('upgrade');
          socketInstance.io.engine.removeAllListeners('close');
        }
      } catch (e) {
        console.error('Error cleaning up engine listeners:', e);
      }
      
      // Hủy bỏ bất kỳ timeout nào đang chờ
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    } catch (e) {
      console.error('Error during socket cleanup:', e);
    }
  };

  // Cấu hình socket.io với origin
  const initializeSocket = useCallback(() => {
    // Xác định origin một cách an toàn
    const origin = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    console.log('Initializing socket connection to:', origin);
    
    const socketInstance = ClientIO(origin, {
      path: '/api/socket/io',
      // Sử dụng polling trước để đảm bảo kết nối ban đầu
      transports: ['polling', 'websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      autoConnect: true,
      forceNew: true,
      extraHeaders: socketIdRef.current ? {
        "x-client-id": socketIdRef.current
      } : undefined
    });
    
    console.log("Socket initialized with settings:", {
      path: '/api/socket/io',
      origin,
      existingId: socketIdRef.current
    });
    
    return socketInstance;
  }, []);

  // Thiết lập lắng nghe sự kiện cho socket
  const setupSocketListeners = (socket: any) => {
    socket.on('connect', () => {
      console.log('Socket connected with ID:', socket.id);
      setIsConnected(true);
      setIsPolling(false);
      setConnectionError(null);
      
      // Lưu socket ID để tái sử dụng khi reconnect
      socketIdRef.current = socket.id;
      
      // Kiểm tra transport hiện tại
      if (socket.io.engine.transport.name) {
        console.log(`Transport: ${socket.io.engine.transport.name}`);
        setIsPolling(socket.io.engine.transport.name === 'polling');
      }
    });
    
    socket.on('connect_error', (err: Error) => {
      console.log('Socket connection error:', err.message);
      setConnectionError(`Lỗi kết nối: ${err.message}`);
      setIsConnected(false);
    });
    
    socket.on('reconnect_attempt', (attempt: number) => {
      console.log(`Socket reconnection attempt ${attempt}`);
      setIsConnected(false);
      setIsPolling(true);
      setConnectionError(`Đang thử kết nối lại lần ${attempt}...`);
    });
    
    socket.on('reconnect', (attempt: number) => {
      console.log(`Socket reconnected after ${attempt} attempts`);
      setIsConnected(true);
      setIsPolling(false);
      setConnectionError(null);
    });
    
    socket.on('reconnect_error', (err: Error) => {
      console.log('Socket reconnection error:', err.message);
      setConnectionError(`Lỗi kết nối lại: ${err.message}`);
    });
    
    socket.on('reconnect_failed', () => {
      console.log('Socket reconnection failed');
      setConnectionError('Không thể kết nối lại. Vui lòng tải lại trang.');
    });
    
    socket.on('disconnect', (reason: string) => {
      console.log(`Socket disconnected: ${reason}`);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        console.log('Socket server disconnected, attempting to reconnect');
        socket.connect();
      }
      
      if (reason === 'transport close' || reason === 'ping timeout') {
        setConnectionError('Kết nối bị gián đoạn. Đang thử kết nối lại...');
        setIsPolling(true);
      }
    });
    
    // Lắng nghe sự kiện khi transport thay đổi
    if (socket.io && socket.io.engine) {
      socket.io.engine.on("upgrade", (transport: { name: string }) => {
        console.log(`Transport upgraded to ${transport.name}`);
        setIsPolling(transport.name === 'polling');
      });
    }
  };

  // Sửa phương thức reconnect
  const reconnect = useCallback(() => {
    console.log('Manually reconnecting socket...');
    
    if (socketRef.current) {
      // Ngắt kết nối cũ nếu còn
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
      }
      
      // Dọn dẹp tài nguyên
      cleanupSocket(socketRef.current);
    }
    
    // Tạo kết nối mới
    console.log('Creating new socket connection');
    const newSocket = initializeSocket();
    setupSocketListeners(newSocket);
    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [initializeSocket]);

  useEffect(() => {
    // Tạo kết nối socket
    try {
      const socketInstance = initializeSocket();
      socketRef.current = socketInstance;
      
      // Thiết lập listeners
      setupSocketListeners(socketInstance);
      
      // Lưu socket instance
      setSocket(socketInstance);
      
      console.log('Socket initialized successfully in useEffect');
    } catch (e) {
      console.error('Error creating socket in useEffect:', e);
      setConnectionError('Không thể kết nối đến máy chủ. Vui lòng tải lại trang.');
    }

    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection...');
        try {
          // Dọn dẹp listeners trước khi ngắt kết nối
          cleanupSocket(socketRef.current);
          socketRef.current.disconnect();
        } catch (e) {
          console.error('Error during socket cleanup:', e);
        }
      }
    };
  }, [initializeSocket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isPolling, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
};
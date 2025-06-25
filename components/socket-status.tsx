"use client";

import { useSocket } from "@/components/providers/socket-provider";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export const SocketStatus = () => {
  const { isConnected, isPolling, reconnect } = useSocket();
  const [visible, setVisible] = useState(false);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

  // Hiển thị khi không kết nối được hoặc đang ở chế độ polling
  useEffect(() => {
    if (!isConnected || isPolling) {
      setVisible(true);
      
      // Xóa timeout ẩn hiện tại nếu có
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        setHideTimeout(null);
      }
    } else {
      // Ẩn sau 3 giây nếu đã kết nối
      const timeout = setTimeout(() => {
        setVisible(false);
      }, 3000);
      
      setHideTimeout(timeout);
    }
    
    return () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [isConnected, isPolling]);

  if (!visible) return null;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 flex items-center gap-x-2 rounded-md px-3 py-2 shadow-sm z-50 transition-all",
      isConnected 
        ? "bg-emerald-500 text-white" 
        : "bg-rose-500 text-white"
    )}>
      {!isConnected && (
        <WifiOff className="h-4 w-4 animate-pulse" />
      )}
      {isConnected && isPolling && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      <span className="text-xs font-semibold">
        {!isConnected && "Mất kết nối máy chủ"}
        {isConnected && isPolling && "Đang kết nối..."}
        {isConnected && !isPolling && "Đã kết nối"}
      </span>
      {!isConnected && (
        <button 
          onClick={() => reconnect()}
          className="ml-2 rounded-sm bg-white/20 p-1 hover:bg-white/30"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}; 
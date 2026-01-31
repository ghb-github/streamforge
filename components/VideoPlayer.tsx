
import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  onClose: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Handle Esc key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Auto-play attempt
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked - expected in some browser contexts
      });
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-300"
        onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}
    >
      <div className="relative w-full max-w-6xl aspect-video bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col group">
        
        {/* Floating Header */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20 pointer-events-none bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
           <div className="pointer-events-auto">
             <span className="inline-flex items-center px-3 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md text-xs font-medium text-zinc-300">
                Preview Mode
             </span>
           </div>
           
           <button 
            onClick={onClose}
            className="pointer-events-auto p-2 bg-black/40 hover:bg-zinc-800 text-white/70 hover:text-white rounded-full backdrop-blur-md transition-all ring-1 ring-white/10 hover:ring-white/30 transform hover:scale-105"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Video Container */}
        <div className="flex-1 relative flex items-center justify-center bg-black">
            <video 
                ref={videoRef}
                src={src} 
                controls 
                autoPlay
                className="w-full h-full object-contain"
                // Production optimizations:
                controlsList="nodownload" // Suggests browser to hide download button
                disablePictureInPicture   // Keeps UI simple
                playsInline
            />
        </div>
      </div>
    </div>
  );
};

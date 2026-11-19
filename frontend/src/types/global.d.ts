/**
 * Global type declarations for modules without official TypeScript types.
 */

declare module 'sonner' {
  interface ToastOptions {
    description?: string;
    className?: string;
    [key: string]: any;
  }
  interface ToastReturn {
    id: string;
    dismiss: () => void;
    update: (opts: any) => void;
  }
  const toast: {
    (message: string, options?: ToastOptions): ToastReturn;
    success: (message: string, options?: ToastOptions) => ToastReturn;
    error: (message: string, options?: ToastOptions) => ToastReturn;
    info: (message: string, options?: ToastOptions) => ToastReturn;
    warning: (message: string, options?: ToastOptions) => ToastReturn;
  };
  export default toast;
  export { toast, ToastOptions, ToastReturn };
  export function Toaster(props: any): JSX.Element;
  export function Sonner(props: any): JSX.Element;
}

declare module 'lucide-react' {
  export const Play: any;
  export const Pause: any;
  export const Volume2: any;
  export const VolumeX: any;
  export const Maximize: any;
  export const Send: any;
  export const Search: any;
  export const X: any;
  export const ShieldCheck: any;
  export const UserMinus: any;
  export const UserPlus: any;
  export const Crown: any;
  export const Shuffle: any;
  export const MoreHorizontal: any;
  export const MessageCircle: any;
  export const MessageSquare: any;
  export const Link: any;
  export const User: any;
  export const Users: any;
  export const ChevronRight: any;
  export const ChevronLeft: any;
  export const Copy: any;
  export const Video: any;
  export const Wifi: any;
  export const WifiOff: any;
  export const SkipForward: any;
  export const SkipBack: any;
  export const Loader2: any;
  export const Circle: any;
  export const CircleDot: any;
}

// YouTube IFrame Player API types
declare namespace YT {
  export enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  export class Player {
    constructor(element: string | HTMLElement, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string): void;
    getPlayerState(): PlayerState;
    getCurrentTime(): number;
    getDuration(): number;
    destroy(): void;
    addEventListener(event: string, listener: (event: any) => void): void;
  }

  export interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: Record<string, any>;
    events?: {
      onReady?: (event: OnReadyEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onPlaybackRateChange?: (event: OnPlaybackRateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  export interface OnReadyEvent {
    target: Player;
  }

  export interface OnStateChangeEvent {
    target: Player;
    data: PlayerState;
  }

  export interface OnPlaybackRateChangeEvent {
    target: Player;
    data: number;
  }

  export interface OnErrorEvent {
    target: Player;
    data: number;
  }
}

interface Window {
  YT: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
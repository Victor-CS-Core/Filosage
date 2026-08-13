"use client";

import { useState, type ReactNode } from "react";
import { safeGoogleProfileImageUrl } from "@/lib/profile-image";

interface UserAvatarProps {
  photoURL?: string | null;
  size: number;
  fallback: ReactNode;
}

export default function UserAvatar({ photoURL, size, fallback }: UserAvatarProps) {
  const source = safeGoogleProfileImageUrl(photoURL);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (!source || failedSource === source) return fallback;
  return (
    // Google profile images are decorative; the surrounding account control
    // carries the user's accessible name.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt=""
      width={size}
      height={size}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSource(source)}
    />
  );
}

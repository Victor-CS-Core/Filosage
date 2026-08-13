const GOOGLE_PROFILE_IMAGE_HOST = "lh3.googleusercontent.com";

export function safeGoogleProfileImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname.toLowerCase() !== GOOGLE_PROFILE_IMAGE_HOST
      || url.username
      || url.password
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

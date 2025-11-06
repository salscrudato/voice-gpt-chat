/**
 * User Manager - Handles user identification and validation
 * Generates and manages persistent user IDs with validation
 */

const USER_ID_KEY = "voicegpt_user_id";
const USER_NAME_KEY = "voicegpt_user_name";
const USER_CREATED_KEY = "voicegpt_user_created";

interface UserProfile {
  userId: string;
  userName: string;
  createdAt: number;
  version: string;
}

/**
 * Generate a secure user ID
 */
function generateUserId(): string {
  return `user_${crypto.randomUUID()}`;
}

/**
 * Get or create user ID
 */
export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  
  if (!userId) {
    userId = generateUserId();
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(USER_CREATED_KEY, Date.now().toString());
  }
  
  return userId;
}

/**
 * Get user name
 */
export function getUserName(): string | null {
  return localStorage.getItem(USER_NAME_KEY);
}

/**
 * Set user name with validation
 */
export function setUserName(name: string): boolean {
  const trimmed = name.trim();
  
  if (trimmed.length < 2 || trimmed.length > 50) {
    return false;
  }
  
  localStorage.setItem(USER_NAME_KEY, trimmed);
  return true;
}

/**
 * Get complete user profile
 */
export function getUserProfile(): UserProfile {
  return {
    userId: getUserId(),
    userName: getUserName() || "Anonymous",
    createdAt: parseInt(localStorage.getItem(USER_CREATED_KEY) || "0"),
    version: "1.0",
  };
}

/**
 * Clear user data (logout)
 */
export function clearUserData(): void {
  localStorage.removeItem(USER_NAME_KEY);
}

/**
 * Validate user ID format
 */
export function isValidUserId(userId: string): boolean {
  return /^user_[0-9a-f-]{36}$/.test(userId);
}


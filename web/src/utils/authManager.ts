/**
 * Auth Manager - Handles Firebase Authentication
 * Provides sign-in, token management, and user identity
 */

import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from "firebase/auth";
import { auth } from "../firebase";

/**
 * Ensure user is signed in (anonymous or otherwise)
 * Returns the current user or signs in anonymously
 */
export async function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      
      if (user) {
        resolve(user);
      } else {
        try {
          const result = await signInAnonymously(auth);
          resolve(result.user);
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

/**
 * Get the current user's ID token
 * @param forceRefresh - Force refresh the token
 */
export async function getIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No authenticated user");
  }
  
  try {
    const token = await user.getIdToken(forceRefresh);
    return token;
  } catch (error) {
    console.error("Failed to get ID token:", error);
    throw error;
  }
}

/**
 * Get the current user
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Get the current user's UID
 */
export function getUserUid(): string | null {
  return auth.currentUser?.uid || null;
}

/**
 * Sign out the current user
 */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Failed to sign out:", error);
    throw error;
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}


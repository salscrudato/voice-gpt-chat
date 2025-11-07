/**
 * Chat Session Service - Manages chat history and sessions
 * Provides persistence, retrieval, and management of chat conversations
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {db} from "../firebase";
import {ChatSession, ChatMessage} from "../types";

/**
 * Create a new chat session
 */
export async function createChatSession(
  userId: string,
  title: string
): Promise<ChatSession> {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionRef = doc(db, "users", userId, "chatSessions", sessionId);

    const session: ChatSession = {
      id: sessionId,
      userId,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      totalTokens: 0,
    };

    await setDoc(sessionRef, {
      ...session,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return session;
  } catch (error) {
    console.error("Error creating chat session:", error);
    throw error;
  }
}

/**
 * Get all chat sessions for a user
 */
export async function getChatSessions(userId: string): Promise<ChatSession[]> {
  try {
    const sessionsRef = collection(db, "users", userId, "chatSessions");
    const q = query(sessionsRef, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
    } as ChatSession));
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    throw error;
  }
}

/**
 * Add message to chat session
 */
export async function addMessageToSession(
  userId: string,
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  try {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageRef = doc(
      db,
      "users",
      userId,
      "chatSessions",
      sessionId,
      "messages",
      messageId
    );

    await setDoc(messageRef, {
      ...message,
      createdAt: serverTimestamp(),
    });

    // Update session's updatedAt
    const sessionRef = doc(db, "users", userId, "chatSessions", sessionId);
    await updateDoc(sessionRef, {
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error adding message to session:", error);
    throw error;
  }
}

/**
 * Save a user message to a chat session
 * Convenience function for persisting user messages immediately
 */
export async function saveUserMessage(
  userId: string,
  sessionId: string,
  content: string
): Promise<void> {
  const message: ChatMessage = {
    role: "user",
    content,
    timestamp: new Date(),
  };
  return addMessageToSession(userId, sessionId, message);
}

/**
 * Get messages from a chat session
 */
export async function getSessionMessages(
  userId: string,
  sessionId: string
): Promise<ChatMessage[]> {
  try {
    const messagesRef = collection(
      db,
      "users",
      userId,
      "chatSessions",
      sessionId,
      "messages"
    );
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().createdAt?.toDate?.() || new Date(),
    } as ChatMessage));
  } catch (error) {
    console.error("Error fetching session messages:", error);
    throw error;
  }
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(userId: string, sessionId: string): Promise<void> {
  try {
    const sessionRef = doc(db, "users", userId, "chatSessions", sessionId);
    await deleteDoc(sessionRef);
  } catch (error) {
    console.error("Error deleting chat session:", error);
    throw error;
  }
}

/**
 * Update session title
 */
export async function updateSessionTitle(
  userId: string,
  sessionId: string,
  title: string
): Promise<void> {
  try {
    const sessionRef = doc(db, "users", userId, "chatSessions", sessionId);
    await updateDoc(sessionRef, {title, updatedAt: serverTimestamp()});
  } catch (error) {
    console.error("Error updating session title:", error);
    throw error;
  }
}


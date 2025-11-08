import {describe, it, expect} from "vitest";
import {
  validateAudioFile,
  validateUserName,
  validateChatMessage,
  sanitizeInput,
} from "../validation";

describe("validation utilities", () => {
  describe("validateAudioFile", () => {
    it("should accept valid audio files", () => {
      const file = new Blob(["audio data"], {type: "audio/webm"});
      Object.defineProperty(file, "size", {value: 100000});
      const result = validateAudioFile(file);
      expect(result.valid).toBe(true);
    });

    it("should reject files that are too small", () => {
      const file = new Blob(["x"], {type: "audio/webm"});
      Object.defineProperty(file, "size", {value: 500});
      const result = validateAudioFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("should reject files that are too large", () => {
      const file = new Blob(["x"], {type: "audio/webm"});
      Object.defineProperty(file, "size", {value: 60 * 1024 * 1024});
      const result = validateAudioFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds");
    });

    it("should reject unsupported file types", () => {
      const file = new Blob(["audio data"], {type: "audio/flac"});
      Object.defineProperty(file, "size", {value: 100000});
      const result = validateAudioFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not supported");
    });

    it("should accept mp4 audio files", () => {
      const file = new Blob(["audio data"], {type: "audio/mp4"});
      Object.defineProperty(file, "size", {value: 100000});
      const result = validateAudioFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateUserName", () => {
    it("should accept valid names", () => {
      expect(validateUserName("John Doe").valid).toBe(true);
      expect(validateUserName("Jane-Smith").valid).toBe(true);
      expect(validateUserName("O'Brien").valid).toBe(true);
    });

    it("should reject names that are too short", () => {
      const result = validateUserName("J");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 2 characters");
    });

    it("should reject names that are too long", () => {
      const result = validateUserName("a".repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("less than 50 characters");
    });

    it("should reject names with invalid characters", () => {
      const result = validateUserName("John@Doe");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    it("should trim whitespace", () => {
      expect(validateUserName("  John Doe  ").valid).toBe(true);
    });
  });

  describe("validateChatMessage", () => {
    it("should accept valid messages", () => {
      const result = validateChatMessage("Hello, how are you?");
      expect(result.valid).toBe(true);
    });

    it("should reject empty messages", () => {
      const result = validateChatMessage("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("should reject messages that are too long", () => {
      const result = validateChatMessage("a".repeat(5001));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds 5000");
    });

    it("should accept messages at the limit", () => {
      const result = validateChatMessage("a".repeat(5000));
      expect(result.valid).toBe(true);
    });
  });

  describe("sanitizeInput", () => {
    it("should escape HTML entities", () => {
      const input = "<script>alert('xss')</script>";
      const result = sanitizeInput(input);
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;");
    });

    it("should preserve normal text", () => {
      const input = "Hello, World!";
      const result = sanitizeInput(input);
      expect(result).toBe("Hello, World!");
    });
  });
});


"use strict";
/**
 * Chat API Integration Tests
 *
 * These tests verify the Chat API endpoints work correctly against deployed infrastructure.
 * Run with: npm run test:api
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const API_URL = process.env.VITE_CHAT_API_URL || "http://localhost:8080";
const TEST_USER_ID = "test-user-" + Date.now();
describe("Chat API", () => {
    describe("Health Check", () => {
        it("should return 200 OK", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe("ok");
        });
    });
    describe("Metrics", () => {
        it("should return metrics", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/metrics`);
            expect(res.status).toBe(200);
            const text = await res.text();
            expect(text).toContain("chat_requests_total");
        });
    });
    describe("Chat Endpoint", () => {
        it("should stream chat response with SSE", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": TEST_USER_ID,
                },
                body: JSON.stringify({
                    messages: [
                        { role: "user", content: "Hello, what can you do?" },
                    ],
                }),
            });
            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toContain("text/event-stream");
            // Read SSE stream
            const text = await res.text();
            expect(text).toContain("data:");
            expect(text).toContain("type");
        });
        it("should reject requests without user ID", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "Hello" }],
                }),
            });
            expect(res.status).toBe(400);
        });
        it("should handle empty message gracefully", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": TEST_USER_ID,
                },
                body: JSON.stringify({
                    messages: [],
                }),
            });
            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });
    describe("Rate Limiting", () => {
        it("should enforce rate limits", async () => {
            const userId = "rate-limit-test-" + Date.now();
            let successCount = 0;
            let rateLimitedCount = 0;
            // Make 35 requests (limit is 30/min)
            for (let i = 0; i < 35; i++) {
                const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-user-id": userId,
                    },
                    body: JSON.stringify({
                        messages: [{ role: "user", content: "test" }],
                    }),
                });
                if (res.status === 200) {
                    successCount++;
                }
                else if (res.status === 429) {
                    rateLimitedCount++;
                }
            }
            expect(rateLimitedCount).toBeGreaterThan(0);
            console.log(`Rate limit test: ${successCount} success, ${rateLimitedCount} rate limited`);
        });
    });
    describe("Error Handling", () => {
        it("should handle malformed JSON", async () => {
            const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": TEST_USER_ID,
                },
                body: "invalid json",
            });
            expect(res.status).toBe(400);
        });
        it("should include correlation ID in logs", async () => {
            const requestId = "test-request-" + Date.now();
            const res = await (0, node_fetch_1.default)(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": TEST_USER_ID,
                    "x-request-id": requestId,
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "test" }],
                }),
            });
            expect(res.status).toBe(200);
            // Correlation ID should be in logs (verified manually)
        });
    });
});
//# sourceMappingURL=index.test.js.map
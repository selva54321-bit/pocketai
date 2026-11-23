import { AgentResponse, NotificationPayload, NotificationAnalysis } from '../types';

export class PocketAIClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;

  constructor(host: string = 'localhost', port: number = 8000) {
    this.baseUrl = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}/ws`;
  }

  setEndpoint(host: string, port: number = 8000) {
    this.baseUrl = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}/ws`;
    this.disconnectWebSocket();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async sendQuery(query: string, retriesLeft: number = 1): Promise<AgentResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`Edge Agent Error: ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } catch (err: any) {
      if (retriesLeft > 0) {
        // Wait 350ms and retry once in case of transient socket drop
        await new Promise((resolve) => setTimeout(resolve, 350));
        return this.sendQuery(query, retriesLeft - 1);
      }
      if (err.message && err.message.includes('Network request failed')) {
        throw new Error(
          'Cannot reach Needle 3 backend (port 8000). Ensure backend is running and USB port forwarding is active (adb reverse tcp:8000 tcp:8000).'
        );
      }
      throw err;
    }
  }

  async analyzeNotification(notification: NotificationPayload): Promise<NotificationAnalysis> {
    const res = await fetch(`${this.baseUrl}/api/v1/notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification)
    });

    if (!res.ok) {
      throw new Error(`Notification Analysis Error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      ...data,
      raw: notification
    };
  }

  async prioritizeNotifications(notifications: NotificationPayload[]): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/notifications/prioritize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Backend prioritize request failed:', e);
    }
    return [];
  }

  connectWebSocket(onMessage: (data: any) => void, onError?: (err: any) => void) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onMessage(parsed);
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      this.ws.onerror = (e) => {
        console.warn('WebSocket error:', e);
        if (onError) onError(e);
      };
    } catch (e) {
      console.error('Failed to connect WebSocket', e);
    }
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const apiClient = new PocketAIClient();

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

  async sendQuery(query: string): Promise<AgentResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error(`Edge Agent Error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
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

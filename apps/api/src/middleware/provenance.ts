import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '@openlinear/db';

// In-memory store for nonces to prevent replay attacks (in production, use Redis)
const usedNonces = new Set<string>();

export async function verifyDeviceSignature(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.headers['x-device-id'] as string;
  const nonce = req.headers['x-nonce'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const signature = req.headers['x-signature'] as string;
  const authHeader = req.headers.authorization;

  if (!deviceId || !nonce || !timestamp || !signature || !authHeader) {
    return res.status(400).json({ error: 'Missing provenance headers' });
  }

  // Check timestamp to prevent old replays (e.g., older than 5 minutes)
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Request expired' });
  }

  // Check nonce to prevent exact replays
  if (usedNonces.has(nonce)) {
    return res.status(409).json({ error: 'Replay detected' });
  }

  // Extract token to use as the signing key
  const token = authHeader.substring(7);

  // Reconstruct the payload to sign
  const payloadToSign = `${req.method}:${req.originalUrl}:${timestamp}:${nonce}:${JSON.stringify(req.body)}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', token)
    .update(payloadToSign)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Mark nonce as used
  usedNonces.add(nonce);
  
  // Clean up old nonces periodically (simplified for this implementation)
  if (usedNonces.size > 10000) {
    usedNonces.clear();
  }

  // Attach provenance data to request
  (req as any).provenance = {
    deviceId,
    timestamp: reqTime,
    signature,
  };

  next();
}

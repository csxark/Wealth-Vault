/**
 * Security Service
 * Handles security event logging and monitoring
 */

import { eq, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { securityEvents } from '../db/schema.js';
import emailService from './emailService.js';

/**
 * Log a security event
 * @param {object} eventData - Security event data
 */
export async function logSecurityEvent(eventData) {
  try {
    const {
      userId,
      eventType,
      ipAddress,
      userAgent,
      location,
      deviceInfo,
      status = 'info',
      details = {},
    } = eventData;

    const [event] = await db.insert(securityEvents).values({
      userId,
      eventType,
      ipAddress,
      userAgent,
      location,
      deviceInfo,
      status,
      details,
      notified: false,
    }).returning();

    return event;
  } catch (error) {
    console.error('Error logging security event:', error);
    throw error;
  }
}

/**
 * Check if login is from a new device/location
 * @param {string} userId - User ID
 * @param {string} ipAddress - Current IP address
 * @returns {Promise<boolean>} True if it's a new/suspicious login
 */
export async function isNewOrSuspiciousLogin(userId, ipAddress) {
  try {
    // Get recent successful logins
    const recentLogins = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, userId))
      .where(eq(securityEvents.eventType, 'login_success'))
      .orderBy(desc(securityEvents.createdAt))
      .limit(10);

    // If no previous logins, it's a new device
    if (recentLogins.length === 0) {
      return true;
    }

    // Check if this IP has been used before
    const knownIp = recentLogins.some(login => login.ipAddress === ipAddress);

    return !knownIp;
  } catch (error) {
    console.error('Error checking login history:', error);
    return false;
  }
}

/**
 * Send security notification based on event type
 * @param {object} user - User object
 * @param {object} event - Security event
 */
export async function sendSecurityNotification(user, event) {
  try {
    const userName = `${user.firstName} ${user.lastName}`;
    const timestamp = event.createdAt || new Date();

    switch (event.eventType) {
      case 'login_success':
        if (event.status === 'warning') {
          // New or suspicious login
          await emailService.sendLoginNotification({
            email: user.email,
            userName,
            ipAddress: event.ipAddress,
            location: event.location,
            deviceInfo: event.deviceInfo,
            timestamp,
          });
        }
        break;

      case 'mfa_enabled':
        await emailService.sendMFAEnabledNotification({
          email: user.email,
          userName,
          timestamp,
        });
        break;

      case 'mfa_disabled':
        await emailService.sendMFADisabledNotification({
          email: user.email,
          userName,
          timestamp,
        });
        break;

      case 'password_changed':
        await emailService.sendPasswordChangedNotification({
          email: user.email,
          userName,
          timestamp,
          ipAddress: event.ipAddress,
        });
        break;

      case 'suspicious_activity':
        await emailService.sendSuspiciousActivityAlert({
          email: user.email,
          userName,
          details: event.details?.description || 'Unusual activity detected',
          timestamp,
        });
        break;

      default:
        // No notification for other event types
        break;
    }

    // Mark event as notified
    await db
      .update(securityEvents)
      .set({ notified: true })
      .where(eq(securityEvents.id, event.id));

  } catch (error) {
    console.error('Error sending security notification:', error);
  }
}

/**
 * Get security events for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of events to retrieve
 */
export async function getUserSecurityEvents(userId, limit = 50) {
  try {
    const events = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, userId))
      .orderBy(desc(securityEvents.createdAt))
      .limit(limit);

    return events;
  } catch (error) {
    console.error('Error fetching security events:', error);
    throw error;
  }
}

/**
 * Detect suspicious login patterns
 * @param {string} userId - User ID
 * @param {string} ipAddress - Current IP address
 * @param {object} location - Current location
 * @returns {Promise<object>} Suspicion analysis
 */
export async function detectSuspiciousActivity(userId, ipAddress, location) {
  try {
    const recentEvents = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, userId))
      .orderBy(desc(securityEvents.createdAt))
      .limit(20);

    const suspicious = {
      isSuspicious: false,
      reasons: [],
      riskLevel: 'low', // low, medium, high
    };

    // Check for multiple failed login attempts
    const recentFailures = recentEvents.filter(
      e => e.eventType === 'login_failed' &&
      Date.now() - new Date(e.createdAt).getTime() < 3600000 // Last hour
    );

    if (recentFailures.length >= 5) {
      suspicious.isSuspicious = true;
      suspicious.riskLevel = 'high';
      suspicious.reasons.push('Multiple failed login attempts detected');
    }

    // Check for unusual location
    if (location && recentEvents.length > 0) {
      const lastLocation = recentEvents.find(e => e.location)?.location;
      if (lastLocation && lastLocation.country !== location.country) {
        suspicious.isSuspicious = true;
        suspicious.riskLevel = suspicious.riskLevel === 'high' ? 'high' : 'medium';
        suspicious.reasons.push('Login from unusual location');
      }
    }

    // Check for rapid location changes (impossible travel)
    const recentLogins = recentEvents.filter(
      e => e.eventType === 'login_success' && e.location
    ).slice(0, 2);

    if (recentLogins.length === 2) {
      const lastLogin = recentLogins[0];
      const prevLogin = recentLogins[1];
      const timeDiff = new Date(lastLogin.createdAt) - new Date(prevLogin.createdAt);

      // If logins are less than 1 hour apart from different countries
      if (timeDiff < 3600000 && 
          lastLogin.location?.country !== prevLogin.location?.country) {
        suspicious.isSuspicious = true;
        suspicious.riskLevel = 'high';
        suspicious.reasons.push('Impossible travel detected');
      }
    }

    return suspicious;
  } catch (error) {
    console.error('Error detecting suspicious activity:', error);
    return { isSuspicious: false, reasons: [], riskLevel: 'low' };
  }
}

/**
 * Get IP geolocation information
 * @param {string} ipAddress - IP address
 * @returns {Promise<object>} Location information
 */
export async function getIPLocation(ipAddress) {
  try {
    // Skip for localhost/private IPs
    if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress.startsWith('192.168.')) {
      return { city: 'Local', country: 'Local', latitude: 0, longitude: 0 };
    }

    // Use ip-api.com (free, no API key needed)
    const response = await fetch(`http://ip-api.com/json/${ipAddress}`);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        city: data.city,
        country: data.country,
        countryCode: data.countryCode,
        latitude: data.lat,
        longitude: data.lon,
        isp: data.isp,
        timezone: data.timezone,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting IP location:', error);
    return null;
  }
}

export default {
  logSecurityEvent,
  isNewOrSuspiciousLogin,
  sendSecurityNotification,
  getUserSecurityEvents,
  detectSuspiciousActivity,
  getIPLocation,
};

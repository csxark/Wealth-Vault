  async sendBudgetAlert(alertData) {
    const { userId, categoryId, alertType, threshold, currentAmount, budgetAmount, message, notificationType, categoryName } = alertData;

    try {
      // Get user preferences
      const [user] = await db.query.users.findMany({
        where: eq(users.id, userId),
        columns: { email: true, preferences: true, firstName: true }
      });

      if (!user) {
        console.error('User not found for budget alert');
        return false;
      }

      const notifications = user.preferences?.notifications || { email: true, push: true, sms: false };

      // Send notifications based on user preferences and alert type
      const results = [];

      if (notificationType === 'email' && notifications.email) {
        const emailResult = await this.sendEmailAlert(user, { ...alertData, categoryName });
        results.push({ type: 'email', success: emailResult });
      }

      if (notificationType === 'push' && notifications.push) {
        // For now, we'll store push notifications in the database
        // In a real app, you'd integrate with push notification services
        const pushResult = await this.storePushNotification(alertData);
        results.push({ type: 'push', success: pushResult });
      }

      if (notificationType === 'in_app') {
        const inAppResult = await this.storeInAppNotification(alertData);
        results.push({ type: 'in_app', success: inAppResult });
      }

      // Update alert metadata only if it's a regular budget alert (not a rule-triggered one)
      if (alertData.id && !alertData.metadata?.ruleId) {
        await db.update(budgetAlerts)
          .set({
            metadata: {
              ...alertData.metadata,
              sentAt: new Date().toISOString()
            },
            updatedAt: new Date()
          })
          .where(eq(budgetAlerts.id, alertData.id));
      }

      return results.every(result => result.success);

    } catch (error) {
      console.error('Error sending budget alert:', error);
      return false;
    }
  }
=======
  async sendBudgetAlert(alertData) {
    const { userId, categoryId, alertType, threshold, currentAmount, budgetAmount, message, notificationType, categoryName } = alertData;

    try {
      // Get user preferences
      const [user] = await db.query.users.findMany({
        where: eq(users.id, userId),
        columns: { email: true, preferences: true, firstName: true }
      });

      if (!user) {
        console.error('User not found for budget alert');
        return false;
      }

      const notifications = user.preferences?.notifications || { email: true, push: true, sms: false };

      // Send notifications based on user preferences and alert type
      const results = [];

      if (notificationType === 'email' && notifications.email) {
        const emailResult = await this.sendEmailAlert(user, { ...alertData, categoryName });
        results.push({ type: 'email', success: emailResult });
      }

      if (notificationType === 'push' && notifications.push) {
        // For now, we'll store push notifications in the database
        // In a real app, you'd integrate with push notification services
        const pushResult = await this.storePushNotification(alertData);
        results.push({ type: 'push', success: pushResult });
      }

      if (notificationType === 'in_app') {
        const inAppResult = await this.storeInAppNotification(alertData);
        results.push({ type: 'in_app', success: inAppResult });
      }

      // Update alert metadata only if it's a regular budget alert (not a rule-triggered one)
      if (alertData.id && !alertData.metadata?.ruleId) {
        await db.update(budgetAlerts)
          .set({
            metadata: {
              ...alertData.metadata,
              sentAt: new Date().toISOString()
            },
            updatedAt: new Date()
          })
          .where(eq(budgetAlerts.id, alertData.id));
      }

      return results.every(result => result.success);

    } catch (error) {
      console.error('Error sending budget alert:', error);
      return false;
    }
  }

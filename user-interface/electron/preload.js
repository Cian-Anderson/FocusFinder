const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  onNavigate: (callback) => {
    ipcRenderer.on("navigate-to", (event, route) => callback(route));
  },
  showReminderNotification: (reminder) => {
    ipcRenderer.send("show-reminder-notification", reminder);
  },
  closeNotification: () => {
    ipcRenderer.send("close-notification");
  },
  sendNotificationAction: (action) => {
    ipcRenderer.send("notification-action", action);
  },
  resizeNotificationWindow: (dimensions) => {
    ipcRenderer.send("resize-notification-window", dimensions);
  },
  debugReminder: (payload) => {
    ipcRenderer.send("reminder-debug", payload);
  },
  onSetReminderData: (callback) => {
    ipcRenderer.on("set-reminder-data", (event, reminder) =>
      callback(reminder),
    );
  },
  onReminderAction: (callback) => {
    ipcRenderer.on("reminder-action", (event, action) => {
      try {
        callback(action);
      } catch (error) {
        console.error("onReminderAction callback error:", error);
        try {
          ipcRenderer.send("reminder-debug", {
            ts: new Date().toISOString(),
            source: "preload",
            message: "onReminderAction callback error",
            payload: {
              action,
              error: String(error),
            },
          });
        } catch { }
      }
    });
  },
  generatePast7DayReport: (payload) => {
    return ipcRenderer.invoke("reports:generate-past-7-days", payload);
  },
  generateWeeklyReport: (payload) => {
    return ipcRenderer.invoke("reports:generate-past-7-days", payload);
  },
  listReports: () => {
    return ipcRenderer.invoke("reports:list");
  },
  openReport: (filePath) => {
    return ipcRenderer.invoke("reports:open", filePath);
  },
  showReportLocation: (filePath) => {
    return ipcRenderer.invoke("reports:show-location", filePath);
  },
  deleteReport: (filePath) => {
    return ipcRenderer.invoke("reports:delete", filePath);
  },
});

console.log("Preload script loaded");

import { createApp } from "vue";
import "./style.scss";
import { VueFire, VueFireAuth } from "vuefire";
import { firebaseApp } from "./firebase";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);

// Global error handler for quota exceeded errors
app.config.errorHandler = (err, instance, info) => {
  console.error('Global error handler:', err, info);
  
  if (err.name === 'QuotaExceededError' || 
      err.message?.includes('quota') || 
      err.message?.includes('QuotaExceededError')) {
    
    // Show a user-friendly message about storage being full
    const message = 'Browser storage is full. Please go to Account > Cache Management to clear some cache data.';
    
    // Try to show a toast notification if available, otherwise alert
    if (window.showToast) {
      window.showToast(message, 'error');
    } else {
      console.warn('Storage quota exceeded:', message);
      // Only show alert in development to avoid annoying users
      if (import.meta.env.DEV) {
        alert(`Storage Issue: ${message}`);
      }
    }
  }
};

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error?.name === 'QuotaExceededError' || 
      error?.message?.includes('quota') || 
      error?.message?.includes('QuotaExceededError')) {
    
    console.warn('Unhandled localStorage quota exceeded error:', error);
    event.preventDefault(); // Prevent the error from being logged to console as unhandled
  }
});

app.use(VueFire, {
  firebaseApp,
  modules: [VueFireAuth()],
});

app.use(router);
app.mount("#app");

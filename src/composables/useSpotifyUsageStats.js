import { ref, computed } from 'vue';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUserData } from './useUserData';

export function useSpotifyUsageStats() {
  const { user } = useUserData();
  const loading = ref(false);
  const error = ref(null);
  const stats = ref({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    hourly: [],
    methods: {},
    daily: []
  });

  const identifier = computed(() => {
    return user.value ? `user:${user.value.uid}` : null;
  });

  const fetchStats = async () => {
    if (!identifier.value) return;

    loading.value = true;
    error.value = null;

    try {
      const now = Date.now();
      const today = Math.floor(now / (1000 * 60 * 60 * 24));
      const weekAgo = today - 7;
      const monthAgo = today - 30;
      const hour = Math.floor(now / (1000 * 60 * 60));

      // Get today's usage from hourly collection
      const todayDocRef = collection(db, 'spotifyUsageHourly');
      const todayQuery = query(
        todayDocRef,
        where('identifier', '==', identifier.value),
        where('hour', '>=', hour - 24)
      );
      const todaySnapshot = await getDocs(todayQuery);
      
      let todayCount = 0;
      const hourlyData = {};
      const methodsData = {};
      
      todaySnapshot.forEach(doc => {
        const data = doc.data();
        todayCount += data.count || 0;
        hourlyData[data.hour] = data.count || 0;
      });

      // Get method breakdown from individual usage records for today
      const usageRef = collection(db, 'spotifyUsage');
      const usageQuery = query(
        usageRef,
        where('identifier', '==', identifier.value),
        where('timestamp', '>=', Timestamp.fromMillis((hour - 24) * 1000 * 60 * 60))
      );
      const usageSnapshot = await getDocs(usageQuery);
      
      usageSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.method) {
          methodsData[data.method] = (methodsData[data.method] || 0) + 1;
        }
      });

      // Get this week's usage from daily collection
      const weekDocRef = collection(db, 'spotifyUsageDaily');
      const weekQuery = query(
        weekDocRef,
        where('identifier', '==', identifier.value),
        where('day', '>=', weekAgo)
      );
      const weekSnapshot = await getDocs(weekQuery);
      
      let weekCount = 0;
      const dailyData = [];
      
      weekSnapshot.forEach(doc => {
        const data = doc.data();
        weekCount += data.count || 0;
        dailyData.push({
          day: data.day,
          count: data.count || 0
        });
      });

      // Get this month's usage
      const monthQuery = query(
        weekDocRef,
        where('identifier', '==', identifier.value),
        where('day', '>=', monthAgo)
      );
      const monthSnapshot = await getDocs(monthQuery);
      
      let monthCount = 0;
      monthSnapshot.forEach(doc => {
        monthCount += doc.data().count || 0;
      });

      // Build hourly array for last 24 hours
      const hourly = [];
      for (let i = 23; i >= 0; i--) {
        const h = hour - i;
        const count = hourlyData[h] || 0;
        hourly.push({
          hour: h,
          count: count,
          label: new Date(h * 1000 * 60 * 60).toLocaleTimeString('en-US', { 
            hour: 'numeric',
            hour12: true 
          })
        });
      }

      // Sort methods by count
      const sortedMethods = Object.entries(methodsData)
        .map(([method, count]) => ({ method, count }))
        .sort((a, b) => b.count - a.count);

      stats.value = {
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount,
        hourly,
        methods: sortedMethods,
        daily: dailyData.sort((a, b) => a.day - b.day)
      };
    } catch (err) {
      error.value = err.message;
      console.error('Error fetching Spotify usage stats:', err);
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    stats,
    fetchStats
  };
}

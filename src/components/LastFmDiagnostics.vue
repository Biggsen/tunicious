<template>
  <div class="lastfm-diagnostics bg-white rounded-xl border-2 border-delft-blue p-6">
    <h3 class="text-xl font-bold text-delft-blue mb-4 flex items-center">
      <svg class="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      Last.fm Connection Diagnostics
    </h3>

    <!-- Connection Status -->
    <div class="mb-6">
      <h4 class="text-lg font-semibold text-delft-blue mb-3">Connection Status</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-sm font-medium">Authentication Status</span>
          <div class="flex items-center">
            <div 
              :class="[
                'w-3 h-3 rounded-full mr-2',
                userData?.lastFmAuthenticated ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <span class="text-sm">
              {{ userData?.lastFmAuthenticated ? 'Connected' : 'Not Connected' }}
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-sm font-medium">Username</span>
          <span class="text-sm font-mono">
            {{ userData?.lastFmUserName || 'Not Set' }}
          </span>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-sm font-medium">Session Key</span>
          <span class="text-sm font-mono">
            {{ userData?.lastFmSessionKey ? `${userData.lastFmSessionKey.substring(0, 8)}...` : 'Not Available' }}
          </span>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-sm font-medium">Track Loving</span>
          <div class="flex items-center">
            <div 
              :class="[
                'w-3 h-3 rounded-full mr-2',
                userData?.lastFmAuthenticated ? 'bg-green-500' : 'bg-gray-400'
              ]"
            ></div>
            <span class="text-sm">
              {{ userData?.lastFmAuthenticated ? 'Enabled' : 'Disabled' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- API Tests -->
    <div class="mb-6">
      <h4 class="text-lg font-semibold text-delft-blue mb-3">API Tests</h4>
      <div class="space-y-3">
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span class="text-sm font-medium">User Profile Test</span>
            <p class="text-xs text-gray-600">Test fetching user profile from Last.fm</p>
          </div>
          <div class="flex items-center space-x-2">
            <div v-if="tests.userProfile.loading" class="animate-spin w-4 h-4 border-2 border-delft-blue border-t-transparent rounded-full"></div>
            <div 
              v-else-if="tests.userProfile.result"
              :class="[
                'w-3 h-3 rounded-full',
                tests.userProfile.result.success ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <BaseButton 
              @click="testUserProfile"
              :disabled="tests.userProfile.loading || !userData?.lastFmUserName"
              size="sm"
            >
              Test
            </BaseButton>
          </div>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span class="text-sm font-medium">Track Loving Test</span>
            <p class="text-xs text-gray-600">Test track.love API functionality</p>
          </div>
          <div class="flex items-center space-x-2">
            <div v-if="tests.trackLoving.loading" class="animate-spin w-4 h-4 border-2 border-delft-blue border-t-transparent rounded-full"></div>
            <div 
              v-else-if="tests.trackLoving.result"
              :class="[
                'w-3 h-3 rounded-full',
                tests.trackLoving.result.success ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <BaseButton 
              @click="testTrackLoving"
              :disabled="tests.trackLoving.loading || !userData?.lastFmAuthenticated"
              size="sm"
            >
              Test
            </BaseButton>
          </div>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span class="text-sm font-medium">Loved Tracks Test</span>
            <p class="text-xs text-gray-600">Test fetching loved tracks</p>
          </div>
          <div class="flex items-center space-x-2">
            <div v-if="tests.lovedTracks.loading" class="animate-spin w-4 h-4 border-2 border-delft-blue border-t-transparent rounded-full"></div>
            <div 
              v-else-if="tests.lovedTracks.result"
              :class="[
                'w-3 h-3 rounded-full',
                tests.lovedTracks.result.success ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <BaseButton 
              @click="testLovedTracks"
              :disabled="tests.lovedTracks.loading || !userData?.lastFmUserName"
              size="sm"
            >
              Test
            </BaseButton>
          </div>
        </div>

        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span class="text-sm font-medium">Session Validation Test</span>
            <p class="text-xs text-gray-600">Test if session key is still valid</p>
          </div>
          <div class="flex items-center space-x-2">
            <div v-if="tests.sessionValidation.loading" class="animate-spin w-4 h-4 border-2 border-delft-blue border-t-transparent rounded-full"></div>
            <div 
              v-else-if="tests.sessionValidation.result"
              :class="[
                'w-3 h-3 rounded-full',
                tests.sessionValidation.result.success ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <BaseButton 
              @click="testSessionValidation"
              :disabled="tests.sessionValidation.loading || !userData?.lastFmSessionKey"
              size="sm"
            >
              Test
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Test Results -->
    <div v-if="hasTestResults" class="mb-6">
      <h4 class="text-lg font-semibold text-delft-blue mb-3">Test Results</h4>
      <div class="space-y-2">
        <div 
          v-for="(test, key) in tests" 
          :key="key"
          v-show="test.result"
          class="p-3 rounded-lg"
          :class="test.result ? (test.result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200') : ''"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium capitalize">{{ key.replace(/([A-Z])/g, ' $1').trim() }}</span>
            <span class="text-sm" :class="test.result?.success ? 'text-green-700' : 'text-red-700'">
              {{ test.result?.success ? 'PASS' : 'FAIL' }}
            </span>
          </div>
          <p class="text-sm mt-1" :class="test.result?.success ? 'text-green-600' : 'text-red-600'">
            {{ test.result?.message }}
          </p>
          <div v-if="test.result?.details" class="text-xs mt-2 p-2 bg-gray-100 rounded font-mono">
            {{ test.result.details }}
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap gap-3">
      <BaseButton 
        @click="runAllTests"
        :disabled="isRunningTests"
        :class="{ 'opacity-50 cursor-not-allowed': isRunningTests }"
      >
        <div v-if="isRunningTests" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
        Run All Tests
      </BaseButton>
      
      <BaseButton 
        @click="clearResults"
        variant="secondary"
        :disabled="isRunningTests"
      >
        Clear Results
      </BaseButton>

      <BaseButton 
        @click="refreshUserData"
        variant="secondary"
        :disabled="isRefreshing"
      >
        <div v-if="isRefreshing" class="animate-spin w-4 h-4 border-2 border-delft-blue border-t-transparent rounded-full mr-2"></div>
        Refresh Data
      </BaseButton>

      <BaseButton 
        v-if="userData?.lastFmAuthenticated"
        @click="disconnectLastFm"
        variant="secondary"
        :disabled="isDisconnecting"
        class="text-red-600 border-red-600 hover:bg-red-50"
      >
        <div v-if="isDisconnecting" class="animate-spin w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full mr-2"></div>
        Disconnect Last.fm
      </BaseButton>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserData } from '@/composables/useUserData'
import { useLastFmApi } from '@/composables/useLastFmApi'
import BaseButton from '@/components/common/BaseButton.vue'

const { userData, refreshUserData: refreshUserDataComposable, clearLastFmAuth } = useUserData()
const { getUserInfo, getUserLovedTracks, loveTrack, validateSession } = useLastFmApi()

// Test state
const tests = ref({
  userProfile: { loading: false, result: null },
  trackLoving: { loading: false, result: null },
  lovedTracks: { loading: false, result: null },
  sessionValidation: { loading: false, result: null }
})

const isRefreshing = ref(false)
const isDisconnecting = ref(false)

const hasTestResults = computed(() => {
  return Object.values(tests.value).some(test => test.result !== null)
})

const isRunningTests = computed(() => {
  return Object.values(tests.value).some(test => test.loading)
})

// Test functions
const testUserProfile = async () => {
  if (!userData.value?.lastFmUserName) return
  
  tests.value.userProfile.loading = true
  tests.value.userProfile.result = null
  
  try {
    const result = await getUserInfo(userData.value.lastFmUserName)
    tests.value.userProfile.result = {
      success: true,
      message: `Successfully fetched profile for ${result.user?.name}`,
      details: `Real name: ${result.user?.realname || 'N/A'}, Playcount: ${result.user?.playcount || 'N/A'}`
    }
  } catch (error) {
    tests.value.userProfile.result = {
      success: false,
      message: `Failed to fetch user profile: ${error.message}`,
      details: error.toString()
    }
  } finally {
    tests.value.userProfile.loading = false
  }
}

const testTrackLoving = async () => {
  if (!userData.value?.lastFmAuthenticated) return
  
  tests.value.trackLoving.loading = true
  tests.value.trackLoving.result = null
  
  try {
    // Test with a well-known track that exists on Last.fm
    const result = await loveTrack('Bohemian Rhapsody', 'Queen', userData.value.lastFmSessionKey)
    tests.value.trackLoving.result = {
      success: true,
      message: 'Track loving API is working correctly',
      details: 'Successfully called track.love API with Queen - Bohemian Rhapsody'
    }
  } catch (error) {
    tests.value.trackLoving.result = {
      success: false,
      message: `Track loving failed: ${error.message}`,
      details: error.toString()
    }
  } finally {
    tests.value.trackLoving.loading = false
  }
}

const testLovedTracks = async () => {
  if (!userData.value?.lastFmUserName) return
  
  tests.value.lovedTracks.loading = true
  tests.value.lovedTracks.result = null
  
  try {
    const result = await getUserLovedTracks(userData.value.lastFmUserName, 1, 5)
    tests.value.lovedTracks.result = {
      success: true,
      message: `Successfully fetched ${result.lovedtracks?.['@attr']?.total || 0} loved tracks`,
      details: `Total loved tracks: ${result.lovedtracks?.['@attr']?.total || 0}`
    }
  } catch (error) {
    tests.value.lovedTracks.result = {
      success: false,
      message: `Failed to fetch loved tracks: ${error.message}`,
      details: error.toString()
    }
  } finally {
    tests.value.lovedTracks.loading = false
  }
}

const testSessionValidation = async () => {
  if (!userData.value?.lastFmSessionKey) return
  
  tests.value.sessionValidation.loading = true
  tests.value.sessionValidation.result = null
  
  try {
    const result = await validateSession(userData.value.lastFmSessionKey)
    tests.value.sessionValidation.result = {
      success: result.valid,
      message: result.message,
      details: result.valid ? `Username: ${result.username}` : 'Session key is no longer valid'
    }
  } catch (error) {
    tests.value.sessionValidation.result = {
      success: false,
      message: `Session validation failed: ${error.message}`,
      details: error.toString()
    }
  } finally {
    tests.value.sessionValidation.loading = false
  }
}

const runAllTests = async () => {
  const testFunctions = [
    { key: 'userProfile', fn: testUserProfile },
    { key: 'lovedTracks', fn: testLovedTracks }
  ]
  
  // Only test track loving if authenticated
  if (userData.value?.lastFmAuthenticated) {
    testFunctions.push({ key: 'trackLoving', fn: testTrackLoving })
    testFunctions.push({ key: 'sessionValidation', fn: testSessionValidation })
  }
  
  for (const test of testFunctions) {
    if (test.key === 'userProfile' && !userData.value?.lastFmUserName) continue
    if (test.key === 'lovedTracks' && !userData.value?.lastFmUserName) continue
    if (test.key === 'trackLoving' && !userData.value?.lastFmAuthenticated) continue
    if (test.key === 'sessionValidation' && !userData.value?.lastFmSessionKey) continue
    
    await test.fn()
  }
}

const clearResults = () => {
  Object.keys(tests.value).forEach(key => {
    tests.value[key].result = null
  })
}

const refreshUserData = async () => {
  isRefreshing.value = true
  try {
    await refreshUserDataComposable()
  } finally {
    isRefreshing.value = false
  }
}

const disconnectLastFm = async () => {
  if (!confirm('Are you sure you want to disconnect from Last.fm? This will clear your session and you\'ll need to reconnect.')) {
    return
  }

  isDisconnecting.value = true
  try {
    await clearLastFmAuth()
    // Clear test results after disconnecting
    clearResults()
  } catch (error) {
    console.error('Error disconnecting from Last.fm:', error)
    alert('Failed to disconnect from Last.fm. Please try again.')
  } finally {
    isDisconnecting.value = false
  }
}
</script>

<style scoped>
.lastfm-diagnostics {
  @apply shadow-lg;
}
</style>

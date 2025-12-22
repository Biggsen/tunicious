<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUserData } from "@composables/useUserData";
import { useUserSpotifyApi } from "@composables/useUserSpotifyApi";
import { useLastFmApi } from "@composables/useLastFmApi";
import LoadingMessage from '@components/common/LoadingMessage.vue';
import ErrorMessage from '@components/common/ErrorMessage.vue';
import Card from '@components/common/Card.vue';
import BaseButton from '@components/common/BaseButton.vue';
import { useToast } from '@composables/useToast';

const { user, userData, loading: userLoading, error: userError, updateProfilePicture } = useUserData();
const { getUserProfile, loading: spotifyLoading } = useUserSpotifyApi();
const { getUserInfo, loading: lastfmLoading } = useLastFmApi();
const { showToast } = useToast();

const profileImages = ref({
  spotify: null,
  lastfm: null
});
const loadingImages = ref(false);
const showImageSelector = ref(false);
const selectedSource = ref(null);

const currentProfileImage = computed(() => {
  return userData.value?.profileImageUrl || null;
});

const hasSpotify = computed(() => {
  return userData.value?.spotifyConnected === true;
});

const hasLastFm = computed(() => {
  return userData.value?.lastFmUserName && userData.value?.lastFmAuthenticated;
});

const isLoading = computed(() => {
  return userLoading.value || loadingImages.value || spotifyLoading.value || lastfmLoading.value;
});

const fetchSpotifyImage = async () => {
  if (!hasSpotify.value) return null;
  
  try {
    const profile = await getUserProfile();
    const images = profile.images || [];
    
    if (images.length > 0) {
      // Get the largest image (usually the last one)
      const largestImage = images[images.length - 1];
      const imageUrl = largestImage?.url;
      if (imageUrl && imageUrl.trim() !== '') {
        return imageUrl;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching Spotify profile image:', error);
    return null;
  }
};

const fetchLastFmImage = async () => {
  if (!hasLastFm.value || !userData.value?.lastFmUserName) return null;
  
  try {
    const result = await getUserInfo(userData.value.lastFmUserName);
    const images = result.user?.image || [];
    
    if (Array.isArray(images) && images.length > 0) {
      // Find the largest image (usually 'extralarge' or 'large')
      const largeImage = images.find(img => img.size === 'extralarge') || 
                        images.find(img => img.size === 'large') ||
                        images.find(img => img.size === 'medium') ||
                        images[images.length - 1];
      
      const imageUrl = largeImage?.['#text'] || largeImage?.url;
      // Filter out empty strings
      if (imageUrl && imageUrl.trim() !== '') {
        return imageUrl;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching Last.fm profile image:', error);
    return null;
  }
};

const loadProfileImages = async () => {
  loadingImages.value = true;
  try {
    const [spotifyImg, lastfmImg] = await Promise.all([
      fetchSpotifyImage(),
      fetchLastFmImage()
    ]);
    
    profileImages.value = {
      spotify: spotifyImg,
      lastfm: lastfmImg
    };
  } catch (error) {
    console.error('Error loading profile images:', error);
  } finally {
    loadingImages.value = false;
  }
};

const openImageSelector = async () => {
  showImageSelector.value = true;
  if (!profileImages.value.spotify && !profileImages.value.lastfm) {
    await loadProfileImages();
  }
};

const selectImage = async (source) => {
  const imageUrl = source === 'spotify' ? profileImages.value.spotify : profileImages.value.lastfm;
  
  if (!imageUrl) {
    showToast('No image available from this source', 'error');
    return;
  }
  
  try {
    await updateProfilePicture(imageUrl, source);
    selectedSource.value = source;
    showImageSelector.value = false;
    
    // Wait a moment for the reactive update to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    
    showToast('Profile picture updated successfully', 'success');
  } catch (error) {
    showToast('Failed to update profile picture', 'error');
    console.error('Error updating profile picture:', error);
  }
};

const removeProfilePicture = async () => {
  try {
    await updateProfilePicture(null, null);
    showToast('Profile picture removed', 'success');
  } catch (error) {
    showToast('Failed to remove profile picture', 'error');
    console.error('Error removing profile picture:', error);
  }
};

onMounted(() => {
  if (userData.value) {
    loadProfileImages();
  }
});
</script>

<template>
  <div class="profile-section">
    <h2 class="text-2xl font-semibold text-delft-blue mb-6">Profile</h2>
    
    <LoadingMessage v-if="userLoading" message="Loading profile..." />
    
    <ErrorMessage v-else-if="userError" :message="userError" />
    
    <Card v-else-if="userData">
      <div class="space-y-6">
        <!-- Profile Picture Section -->
        <div class="flex items-start gap-4 pb-4 border-b border-gray-200">
          <div class="flex-shrink-0">
            <div class="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
              <img 
                v-if="currentProfileImage" 
                :src="currentProfileImage" 
                alt="Profile picture"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full bg-delft-blue flex items-center justify-center text-mindero text-2xl font-semibold">
                {{ userData.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?' }}
              </div>
            </div>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-2">Profile Picture</h3>
            <div class="flex gap-2 flex-wrap">
              <BaseButton 
                variant="secondary" 
                @click="openImageSelector"
                :disabled="!hasSpotify && !hasLastFm"
              >
                {{ currentProfileImage ? 'Change Picture' : 'Set Picture' }}
              </BaseButton>
              <BaseButton 
                v-if="currentProfileImage"
                variant="tertiary" 
                @click="removeProfilePicture"
              >
                Remove
              </BaseButton>
            </div>
            <p v-if="!hasSpotify && !hasLastFm" class="text-sm text-gray-500 mt-2">
              Connect Spotify or Last.fm to set a profile picture
            </p>
          </div>
        </div>

        <!-- Image Selector Modal -->
        <Teleport to="body">
          <div 
            v-if="showImageSelector" 
            class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-50 font-chivo"
            @click.self="showImageSelector = false"
          >
          <Card class="max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto font-chivo">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xl font-semibold text-delft-blue">Select Profile Picture</h3>
                <button 
                  @click="showImageSelector = false"
                  class="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div v-if="loadingImages" class="text-center py-8">
                <LoadingMessage message="Loading images..." />
              </div>

              <div v-else class="space-y-4">
                <!-- Spotify Option -->
                <div v-if="hasSpotify" class="border rounded-lg p-4">
                  <h4 class="font-semibold mb-3">Spotify</h4>
                  <div v-if="profileImages.spotify" class="space-y-3">
                    <div class="flex items-center gap-4">
                      <img 
                        :src="profileImages.spotify" 
                        alt="Spotify profile"
                        class="w-16 h-16 rounded-full object-cover"
                      />
                      <BaseButton 
                        variant="secondary"
                        @click="selectImage('spotify')"
                      >
                        Use This Picture
                      </BaseButton>
                    </div>
                  </div>
                  <p v-else class="text-sm text-gray-500">No profile picture available on Spotify</p>
                </div>

                <!-- Last.fm Option -->
                <div v-if="hasLastFm" class="border rounded-lg p-4">
                  <h4 class="font-semibold mb-3">Last.fm</h4>
                  <div v-if="profileImages.lastfm" class="space-y-3">
                    <div class="flex items-center gap-4">
                      <img 
                        :src="profileImages.lastfm" 
                        alt="Last.fm profile"
                        class="w-16 h-16 rounded-full object-cover"
                      />
                      <BaseButton 
                        variant="secondary"
                        @click="selectImage('lastfm')"
                      >
                        Use This Picture
                      </BaseButton>
                    </div>
                  </div>
                  <p v-else class="text-sm text-gray-500">No profile picture available on Last.fm</p>
                </div>

                <p v-if="!hasSpotify && !hasLastFm" class="text-sm text-gray-500 text-center py-4">
                  No connected services available
                </p>
              </div>
            </div>
          </Card>
          </div>
        </Teleport>

        <!-- Profile Information -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Name</h3>
            <span class="text-gray-600">{{ userData.displayName || 'Not set' }}</span>
          </div>
          
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Email</h3>
            <span class="text-gray-600">{{ userData.email || user?.email || 'Not set' }}</span>
          </div>
          
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Last.fm Username</h3>
            <span class="text-gray-600">{{ userData.lastFmUserName || 'Not set' }}</span>
          </div>
        </div>
      </div>
    </Card>
    
    <Card v-else>
      <p class="text-gray-600">No profile data available.</p>
      <p v-if="user" class="text-sm text-gray-500 mt-2">User ID: {{ user.uid }}</p>
    </Card>
  </div>
</template>



<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseButton from '@components/common/BaseButton.vue';
import ToggleSwitch from '@components/common/ToggleSwitch.vue';
import AlbumItem from '@components/AlbumItem.vue';

const togglePrimary = ref(false);
const toggleOnCeladon = ref(false);

const createPlaceholderImage = (bgColor, textColor, text) => {
  const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${textColor}" stroke-width="0.5" opacity="0.3"/>
      </pattern>
    </defs>
    <rect width="300" height="300" fill="${bgColor}"/>
    <rect width="300" height="300" fill="url(#grid)"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="20" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${text}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const dummyAlbum1 = {
  id: 'dummy-album-1',
  name: 'The Dark Side of the Moon',
  albumTitle: 'The Dark Side of the Moon',
  artists: [{ id: 'artist-1', name: 'Pink Floyd' }],
  artistName: 'Pink Floyd',
  release_date: '1973-03-01',
  releaseYear: '1973',
  images: [
    { url: createPlaceholderImage('#23395B', '#FFFD98', 'Album Cover') }
  ],
  albumCover: createPlaceholderImage('#23395B', '#FFFD98', 'Album Cover')
};

const dummyAlbum2 = {
  id: 'dummy-album-2',
  name: 'Abbey Road',
  albumTitle: 'Abbey Road',
  artists: [{ id: 'artist-2', name: 'The Beatles' }],
  artistName: 'The Beatles',
  release_date: '1969-09-26',
  releaseYear: '1969',
  images: [
    { url: createPlaceholderImage('#59C9A5', '#23395B', 'Abbey Road') }
  ],
  albumCover: createPlaceholderImage('#59C9A5', '#23395B', 'Abbey Road')
};

const dummyAlbum3 = {
  id: 'dummy-album-3',
  name: 'Kind of Blue',
  albumTitle: 'Kind of Blue',
  artists: [{ id: 'artist-3', name: 'Miles Davis' }],
  artistName: 'Miles Davis',
  release_date: '1959-08-17',
  releaseYear: '1959',
  images: [
    { url: createPlaceholderImage('#D81E5B', '#FFFFFF', 'Kind of Blue') }
  ],
  albumCover: createPlaceholderImage('#D81E5B', '#FFFFFF', 'Kind of Blue')
};

const dummyTracks = [
  {
    id: 'track-1',
    name: 'So What',
    artists: [{ id: 'artist-3', name: 'Miles Davis' }],
    album: { id: 'dummy-album-3', name: 'Kind of Blue' },
    duration_ms: 562000,
    track_number: 1,
    uri: 'spotify:track:track-1',
    external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
    playcount: 45,
    loved: false
  },
  {
    id: 'track-2',
    name: 'Blue in Green',
    artists: [{ id: 'artist-3', name: 'Miles Davis' }],
    album: { id: 'dummy-album-3', name: 'Kind of Blue' },
    duration_ms: 338000,
    track_number: 2,
    uri: 'spotify:track:track-2',
    external_urls: { spotify: 'https://open.spotify.com/track/track-2' },
    playcount: 32,
    loved: true
  },
  {
    id: 'track-3',
    name: 'All Blues',
    artists: [{ id: 'artist-3', name: 'Miles Davis' }],
    album: { id: 'dummy-album-3', name: 'Kind of Blue' },
    duration_ms: 692000,
    track_number: 3,
    uri: 'spotify:track:track-3',
    external_urls: { spotify: 'https://open.spotify.com/track/track-3' },
    playcount: 28,
    loved: false
  },
  {
    id: 'track-4',
    name: 'Flamenco Sketches',
    artists: [{ id: 'artist-3', name: 'Miles Davis' }],
    album: { id: 'dummy-album-3', name: 'Kind of Blue' },
    duration_ms: 566000,
    track_number: 4,
    uri: 'spotify:track:track-4',
    external_urls: { spotify: 'https://open.spotify.com/track/track-4' },
    playcount: 19,
    loved: true
  },
  {
    id: 'track-5',
    name: 'Freddie Freeloader',
    artists: [{ id: 'artist-3', name: 'Miles Davis' }],
    album: { id: 'dummy-album-3', name: 'Kind of Blue' },
    duration_ms: 589000,
    track_number: 5,
    uri: 'spotify:track:track-5',
    external_urls: { spotify: 'https://open.spotify.com/track/track-5' },
    playcount: 15,
    loved: false
  }
];
</script>

<template>
  <main class="max-w-6xl mx-auto px-4 py-8">
    <div class="mb-8">
      <h1 class="text-4xl font-bold text-delft-blue mb-2">Style Guide</h1>
      <p class="text-delft-blue/70">
        Design system and component documentation
      </p>
    </div>

    <!-- Colors Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Colors</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="bg-mindero border-2 border-delft-blue rounded-lg p-6">
          <div class="mb-2">
            <div class="w-full h-24 bg-mindero border-2 border-delft-blue rounded mb-2"></div>
            <h3 class="font-semibold text-delft-blue">Mindero</h3>
            <p class="text-sm text-delft-blue/70">#FFFD98</p>
          </div>
        </div>
        <div class="bg-delft-blue border-2 border-delft-blue rounded-lg p-6">
          <div class="mb-2">
            <div class="w-full h-24 bg-delft-blue border-2 border-delft-blue rounded mb-2"></div>
            <h3 class="font-semibold text-white">Delft Blue</h3>
            <p class="text-sm text-white/70">#23395B</p>
          </div>
        </div>
        <div class="bg-celadon border-2 border-delft-blue rounded-lg p-6">
          <div class="mb-2">
            <div class="w-full h-24 bg-celadon border-2 border-delft-blue rounded mb-2"></div>
            <h3 class="font-semibold text-delft-blue">Celadon</h3>
            <p class="text-sm text-delft-blue/70">#B9E3C6</p>
          </div>
        </div>
        <div class="bg-mint border-2 border-delft-blue rounded-lg p-6">
          <div class="mb-2">
            <div class="w-full h-24 bg-mint border-2 border-delft-blue rounded mb-2"></div>
            <h3 class="font-semibold text-delft-blue">Mint</h3>
            <p class="text-sm text-delft-blue/70">#59C9A5</p>
          </div>
        </div>
        <div class="bg-raspberry border-2 border-delft-blue rounded-lg p-6">
          <div class="mb-2">
            <div class="w-full h-24 bg-raspberry border-2 border-delft-blue rounded mb-2"></div>
            <h3 class="font-semibold text-white">Raspberry</h3>
            <p class="text-sm text-white/70">#D81E5B</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Typography Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Typography</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 space-y-4">
        <div>
          <h1 class="text-4xl font-bold text-delft-blue mb-2">Heading 1</h1>
          <p class="text-sm text-delft-blue/70">text-4xl font-bold</p>
        </div>
        <div>
          <h2 class="text-3xl font-bold text-delft-blue mb-2">Heading 2</h2>
          <p class="text-sm text-delft-blue/70">text-3xl font-bold</p>
        </div>
        <div>
          <h3 class="text-2xl font-bold text-delft-blue mb-2">Heading 3</h3>
          <p class="text-sm text-delft-blue/70">text-2xl font-bold</p>
        </div>
        <div>
          <h4 class="text-xl font-semibold text-delft-blue mb-2">Heading 4</h4>
          <p class="text-sm text-delft-blue/70">text-xl font-semibold</p>
        </div>
        <div>
          <p class="text-base text-delft-blue mb-2">Body text - Regular paragraph text that is easy to read and provides good contrast.</p>
          <p class="text-sm text-delft-blue/70">text-base</p>
        </div>
        <div>
          <p class="text-sm text-delft-blue/70 mb-2">Small text - Used for secondary information, captions, and helper text.</p>
          <p class="text-sm text-delft-blue/70">text-sm text-delft-blue/70</p>
          </div>
        </div>
        <div class="bg-celadon border-2 border-delft-blue rounded-lg p-6 space-y-4">
          <div>
            <h1 class="text-4xl font-bold text-delft-blue mb-2">Heading 1</h1>
            <p class="text-sm text-delft-blue/70">text-4xl font-bold</p>
          </div>
          <div>
            <h2 class="text-3xl font-bold text-delft-blue mb-2">Heading 2</h2>
            <p class="text-sm text-delft-blue/70">text-3xl font-bold</p>
          </div>
          <div>
            <h3 class="text-2xl font-bold text-delft-blue mb-2">Heading 3</h3>
            <p class="text-sm text-delft-blue/70">text-2xl font-bold</p>
          </div>
          <div>
            <h4 class="text-xl font-semibold text-delft-blue mb-2">Heading 4</h4>
            <p class="text-sm text-delft-blue/70">text-xl font-semibold</p>
          </div>
          <div>
            <p class="text-base text-delft-blue mb-2">Body text - Regular paragraph text that is easy to read and provides good contrast.</p>
            <p class="text-sm text-delft-blue/70">text-base</p>
          </div>
          <div>
            <p class="text-sm text-delft-blue/70 mb-2">Small text - Used for secondary information, captions, and helper text.</p>
            <p class="text-sm text-delft-blue/70">text-sm text-delft-blue/70</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Buttons Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Buttons</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 space-y-6">
        <div>
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Base Button Variants</h3>
          
          <div class="mb-6">
            <h4 class="text-md font-medium text-delft-blue mb-3">Default Variant</h4>
            <div class="flex flex-wrap gap-4">
              <BaseButton>Default</BaseButton>
              <BaseButton :disabled="true">Disabled</BaseButton>
              <BaseButton :loading="true">Loading</BaseButton>
            </div>
          </div>
          
          <div class="mb-6">
            <h4 class="text-md font-medium text-delft-blue mb-3">Primary Variant</h4>
            <div class="flex flex-wrap gap-4">
              <BaseButton variant="primary">Primary</BaseButton>
              <BaseButton variant="primary" :disabled="true">Disabled</BaseButton>
              <BaseButton variant="primary" :loading="true">Loading</BaseButton>
            </div>
          </div>
          
          <div>
            <h4 class="text-md font-medium text-delft-blue mb-3">Secondary Variant</h4>
            <div class="flex flex-wrap gap-4">
              <BaseButton variant="secondary">Secondary</BaseButton>
              <BaseButton variant="secondary" :disabled="true">Disabled</BaseButton>
              <BaseButton variant="secondary" :loading="true">Loading</BaseButton>
            </div>
          </div>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Custom Styled Buttons</h3>
          <div class="flex flex-wrap gap-4">
            <button class="px-4 py-2 bg-mindero text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium">
              Mindero Button
            </button>
            <button class="px-4 py-2 bg-raspberry text-white rounded-lg hover:bg-raspberry/80 transition-colors font-medium">
              Raspberry Button
            </button>
            <button class="px-4 py-2 bg-white text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium border-2 border-delft-blue">
              Outlined Button
            </button>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-delft-blue mb-4">Toggle Switches</h3>
            <div class="flex flex-wrap items-center gap-6">
            <div class="flex items-center gap-3">
              <ToggleSwitch v-model="togglePrimary" variant="primary" />
              <span class="text-delft-blue">Primary</span>
            </div>
            <div class="flex items-center gap-3">
              <ToggleSwitch :model-value="true" :disabled="true" variant="primary" />
              <span class="text-delft-blue">Disabled</span>
            </div>
            </div>
          </div>
        </div>
        <div class="bg-celadon border-2 border-delft-blue rounded-lg p-6 space-y-6">
          <div>
            <h3 class="text-lg font-semibold text-delft-blue mb-4">Base Button Variants</h3>
            
            <div class="mb-6">
              <h4 class="text-md font-medium text-delft-blue mb-3">Default Variant</h4>
              <div class="flex flex-wrap gap-4">
                <BaseButton>Default</BaseButton>
                <BaseButton :disabled="true">Disabled</BaseButton>
                <BaseButton :loading="true">Loading</BaseButton>
              </div>
            </div>
            
            <div class="mb-6">
              <h4 class="text-md font-medium text-delft-blue mb-3">Primary Variant</h4>
              <div class="flex flex-wrap gap-4">
                <BaseButton variant="primary">Primary</BaseButton>
                <BaseButton variant="primary" :disabled="true">Disabled</BaseButton>
                <BaseButton variant="primary" :loading="true">Loading</BaseButton>
              </div>
            </div>
            
            <div>
              <h4 class="text-md font-medium text-delft-blue mb-3">Secondary Variant</h4>
              <div class="flex flex-wrap gap-4">
                <BaseButton variant="secondary">Secondary</BaseButton>
                <BaseButton variant="secondary" :disabled="true">Disabled</BaseButton>
                <BaseButton variant="secondary" :loading="true">Loading</BaseButton>
              </div>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-delft-blue mb-4">Custom Styled Buttons</h3>
            <div class="flex flex-wrap gap-4">
              <button class="px-4 py-2 bg-mindero text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium">
                Mindero Button
              </button>
              <button class="px-4 py-2 bg-raspberry text-white rounded-lg hover:bg-raspberry/80 transition-colors font-medium">
                Raspberry Button
              </button>
              <button class="px-4 py-2 bg-white text-delft-blue rounded-lg hover:bg-delft-blue hover:text-white transition-colors font-medium border-2 border-delft-blue">
                Outlined Button
              </button>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-delft-blue mb-4">Toggle Switches</h3>
            <div class="flex flex-wrap items-center gap-6">
              <div class="flex items-center gap-3">
                <ToggleSwitch v-model="toggleOnCeladon" variant="primary-on-celadon" />
                <span class="text-delft-blue">Primary on Celadon</span>
              </div>
              <div class="flex items-center gap-3">
                <ToggleSwitch :model-value="true" :disabled="true" variant="primary-on-celadon" />
                <span class="text-delft-blue">Disabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Cards Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Cards</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-celadon border-2 border-delft-blue rounded-xl p-6">
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Celadon Card</h3>
          <p class="text-delft-blue/70">
            This is an example of a card with celadon background. Used for informational content.
          </p>
        </div>
        <div class="bg-white border-2 border-delft-blue rounded-xl p-6">
          <h3 class="text-lg font-semibold text-delft-blue mb-4">White Card</h3>
          <p class="text-delft-blue/70">
            This is an example of a card with white background. Used for primary content.
          </p>
        </div>
        <div class="bg-mint border-2 border-delft-blue rounded-xl p-6">
          <h3 class="text-lg font-semibold text-delft-blue mb-4">Mint Card</h3>
          <p class="text-delft-blue/70">
            This is an example of a card with mint background. Used for highlighted content.
          </p>
        </div>
        <div class="bg-raspberry/10 border-2 border-raspberry rounded-xl p-6">
          <h3 class="text-lg font-semibold text-raspberry mb-4">Raspberry Card</h3>
          <p class="text-raspberry/80">
            This is an example of a card with raspberry accent. Used for warnings or important notices.
          </p>
        </div>
      </div>
    </section>

    <!-- Links Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Links</h2>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 space-y-4">
        <div>
          <a href="#" class="font-bold text-delft-blue hover:text-raspberry hover:underline">
            Standard Link
          </a>
          <p class="text-sm text-delft-blue/70 mt-2">font-bold text-delft-blue hover:text-raspberry hover:underline</p>
        </div>
        <div>
          <RouterLink to="/" class="font-bold text-delft-blue hover:text-raspberry hover:underline">
            Router Link
          </RouterLink>
          <p class="text-sm text-delft-blue/70 mt-2">Same styling as standard link</p>
        </div>
      </div>
    </section>

    <!-- Spacing Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Spacing</h2>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6">
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <div class="w-4 h-4 bg-delft-blue rounded"></div>
            <span class="text-delft-blue">gap-4 (1rem / 16px)</span>
          </div>
          <div class="flex items-center gap-6">
            <div class="w-6 h-6 bg-delft-blue rounded"></div>
            <span class="text-delft-blue">gap-6 (1.5rem / 24px)</span>
          </div>
          <div class="flex items-center gap-8">
            <div class="w-8 h-8 bg-delft-blue rounded"></div>
            <span class="text-delft-blue">gap-8 (2rem / 32px)</span>
          </div>
        </div>
        <div class="mt-6 space-y-2">
          <div class="bg-mindero p-2 rounded">
            <p class="text-sm text-delft-blue">p-2 (0.5rem / 8px)</p>
          </div>
          <div class="bg-mindero p-4 rounded">
            <p class="text-sm text-delft-blue">p-4 (1rem / 16px)</p>
          </div>
          <div class="bg-mindero p-6 rounded">
            <p class="text-sm text-delft-blue">p-6 (1.5rem / 24px)</p>
          </div>
          <div class="bg-mindero p-8 rounded">
            <p class="text-sm text-delft-blue">p-8 (2rem / 32px)</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Borders Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">Borders</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white border-2 border-delft-blue rounded-lg p-6">
          <p class="text-delft-blue font-semibold mb-2">border-2 border-delft-blue</p>
          <p class="text-sm text-delft-blue/70">Standard border (2px)</p>
        </div>
        <div class="bg-white border-4 border-delft-blue rounded-lg p-6">
          <p class="text-delft-blue font-semibold mb-2">border-4 border-delft-blue</p>
          <p class="text-sm text-delft-blue/70">Thick border (4px)</p>
        </div>
        <div class="bg-white border-2 border-raspberry rounded-lg p-6">
          <p class="text-delft-blue font-semibold mb-2">border-2 border-raspberry</p>
          <p class="text-sm text-delft-blue/70">Accent border</p>
        </div>
        <div class="bg-white border-2 border-delft-blue rounded-xl p-6">
          <p class="text-delft-blue font-semibold mb-2">rounded-xl</p>
          <p class="text-sm text-delft-blue/70">Extra rounded corners</p>
        </div>
      </div>
    </section>

    <!-- AlbumItem Component Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-delft-blue mb-6">AlbumItem Component</h2>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Standard Album Items</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem :album="dummyAlbum1" :in-collection="true" />
          <AlbumItem :album="dummyAlbum2" :in-collection="true" />
          <AlbumItem :album="dummyAlbum3" :in-collection="true" />
        </div>
      </div>
      <div class="bg-celadon border-2 border-delft-blue rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Album Items on Celadon Background</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem :album="dummyAlbum1" :in-collection="true" />
          <AlbumItem :album="dummyAlbum2" :in-collection="true" />
          <AlbumItem :album="dummyAlbum3" :in-collection="true" />
        </div>
      </div>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Album Item - Not in Collection</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem 
            :album="dummyAlbum1" 
            :in-collection="false"
            :current-playlist="{ playlistId: 'dummy-playlist' }"
          />
        </div>
      </div>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Album Item - With Processing Buttons (Hover to see)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem 
            :album="dummyAlbum1" 
            :in-collection="true"
            :show-processing-buttons="true"
            :current-playlist="{ 
              playlistId: 'dummy-playlist',
              nextStagePlaylistId: 'next-playlist',
              pipelineRole: 'source'
            }"
            :has-termination-playlist="true"
          />
          <AlbumItem 
            :album="dummyAlbum2" 
            :in-collection="true"
            :show-processing-buttons="true"
            :current-playlist="{ 
              playlistId: 'dummy-playlist',
              nextStagePlaylistId: 'next-playlist',
              pipelineRole: 'transient'
            }"
            :has-termination-playlist="true"
          />
          <AlbumItem 
            :album="dummyAlbum3" 
            :in-collection="true"
            :show-remove-button="true"
            :current-playlist="{ playlistId: 'dummy-playlist' }"
          />
        </div>
      </div>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Album Item - With Tracklist</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem 
            :album="dummyAlbum3" 
            :in-collection="true"
            :show-tracklist="true"
            :tracks="dummyTracks"
            :loved-tracks="dummyTracks.filter(t => t.loved)"
            :tracks-loading="false"
            last-fm-user-name="dummyuser"
            :allow-track-loving="true"
            last-fm-session-key="dummysession"
          />
          <AlbumItem 
            :album="dummyAlbum3" 
            :in-collection="true"
            :show-tracklist="true"
            :tracks="dummyTracks"
            :loved-tracks="dummyTracks.filter(t => t.loved)"
            :tracks-loading="false"
            last-fm-user-name="dummyuser"
            :allow-track-loving="true"
            last-fm-session-key="dummysession"
          />
          <AlbumItem 
            :album="dummyAlbum3" 
            :in-collection="true"
            :show-tracklist="true"
            :tracks="dummyTracks"
            :loved-tracks="dummyTracks.filter(t => t.loved)"
            :tracks-loading="false"
            last-fm-user-name="dummyuser"
            :allow-track-loving="true"
            last-fm-session-key="dummysession"
          />
        </div>
      </div>
      <div class="bg-white border-2 border-delft-blue rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-delft-blue mb-4">Album Item - Processing</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlbumItem 
            :album="dummyAlbum1" 
            :in-collection="true"
            :is-processing="true"
          />
          <AlbumItem 
            :album="dummyAlbum2" 
            :in-collection="true"
            :is-processing="true"
          />
          <AlbumItem 
            :album="dummyAlbum3" 
            :in-collection="true"
            :is-processing="true"
          />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
</style>


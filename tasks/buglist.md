# Bug List

## Status Legend
- 🔴 **Critical** - Blocks core functionality, needs immediate attention
- 🟠 **High** - Significant impact, should be fixed soon
- 🟡 **Medium** - Noticeable issue, fix when convenient
- 🟢 **Low** - Minor issue, cosmetic or edge case

## Active Bugs

### Critical Priority
- [ ] _No critical bugs at this time_

### High Priority
- [ ] _No high priority bugs at this time_

### Medium Priority
- [ ] App should detect currently playing track from Last.fm when playing Spotify locally (not via web player)
- [ ] Tracklist toggle only loads tracks for newly added album after processing, ignores other albums

### Low Priority
- [ ] _No low priority bugs at this time_

---

## Bug Details Template

When adding a bug, use the following format:

```markdown
### Bug Title
**Status**: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  
**Reported**: YYYY-MM-DD  
**Component/Area**: [e.g., Authentication, Playlist Management, Spotify Integration]  
**Browser/Environment**: [if applicable]

**Description**:  
[Clear description of what's wrong]

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:  
[What should happen]

**Actual Behavior**:  
[What actually happens]

**Workaround**:  
[If available]

**Notes**:  
[Additional context, screenshots, error messages, etc.]
```

---

## Bug Details



### App should detect currently playing track from Last.fm when playing Spotify locally (not via web player)
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: Spotify Integration, Last.fm Integration, Current Playing Track Detection

**Description**:  
When playing music locally through the Spotify desktop/mobile app (not via the web player), the app should still be able to detect and display the currently playing track by polling Last.fm's "now playing" API. Currently, the app only tracks playback when using the Spotify Web Player.

**Steps to Reproduce**:
1. Play music using Spotify desktop app or mobile app (not web player)
2. Observe that the app doesn't show the currently playing track
3. Check if Last.fm is scrobbling the track (if connected)

**Expected Behavior**:  
The app should periodically poll Last.fm's API to detect the currently playing track, even when music is played through the local Spotify app rather than the web player.

**Actual Behavior**:  
The app only tracks currently playing tracks when using the Spotify Web Player. Local playback is not detected.

**Workaround**:  
Use the Spotify Web Player instead of the desktop/mobile app.

**Notes**:  
Need to investigate:
- Last.fm API endpoints for "now playing" or recent tracks
- How to poll Last.fm API periodically to detect current playback
- Integration with `useCurrentPlayingTrack` composable
- Whether Last.fm provides real-time "now playing" data or if we need to poll recent scrobbles
- Rate limiting considerations for polling Last.fm API
- User experience: how often to poll, how to handle when Last.fm isn't connected

---

### Tracklist toggle only loads tracks for newly added album after processing, ignores other albums
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: Tracklist Display, Album Processing, UI State Management

**Description**:  
After processing an album to a new transient playlist, when the tracklist toggle is pressed, it only loads the tracklist for the newly added album. It doesn't attempt to load tracklists for any of the other albums that were already displayed.

**Steps to Reproduce**:
1. View a playlist page with multiple albums displayed
2. Process/add a new album to the playlist
3. Press the tracklist toggle
4. Observe that only the newly added album's tracklist loads

**Expected Behavior**:  
When the tracklist toggle is pressed, it should load tracklists for all albums currently displayed on the page, not just the newly added one.

**Actual Behavior**:  
Only the newly added album's tracklist is loaded. Other albums' tracklists are not loaded.

**Workaround**:  
None identified.

**Notes**:  
This suggests the tracklist loading logic may be tied to the album processing/update flow rather than being triggered independently for all visible albums when the toggle is activated.

---

## Resolved Bugs

### Recently Fixed

#### Cancel button on Edit Playlist page redirects to wrong PlaylistSingle page instead of Playlists page
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Resolved**: 2025-01-27  
**Component/Area**: Navigation, Edit Playlist View

**Resolution**: Fixed the cancel button handler in `EditPlaylistView.vue` to correctly navigate to `/playlists` instead of redirecting to a PlaylistSingle page.

---

#### PlaylistSingle shows flickering 'Spotify connection issue' banner before loading albums
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Resolved**: 2025-01-27  
**Component/Area**: PlaylistSingle View, Spotify Connection Status, UI/UX

**Resolution**: Fixed by adding a loading state check (`!userDataLoading`) before showing the connection status banner, preventing it from flickering during initial page load.

---

#### Playlist name mismatch between database and UI
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Resolved**: 2025-01-27  
**Component/Area**: Playlist Management, Database

**Resolution**: Resolved through migration that removed the `name` field from Firebase playlists. Playlist names are now resolved dynamically using `playlistNameResolver.js`, which checks unified track cache, playlist summaries cache, and falls back to Spotify API. This ensures names always match what's in Spotify and eliminates stale data issues.

---

#### RYM link is failing a lot, showing 404 - need to look into dashes vs underscores in the URL
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Resolved**: 2025-01-27  
**Component/Area**: Music Service Links, RYM Integration

**Resolution**: Fixed by:
1. Changed RYM link generation from underscores to dashes in `musicServiceLinks.js` (RYM moved to dashes but has inadequate redirect policies for older underscore URLs)
2. Added optional `rymLink` field to Albums collection, allowing users to manually set custom RYM links that take priority over auto-generated ones
3. Added UI in `AlbumView.vue` to edit and save custom RYM links
4. Updated `getRateYourMusicLink` to prioritize stored `rymLink` over auto-generated links
5. Fixed `paginatedAlbums` to use `sortedAlbumsList` so `rymLink` is properly merged and displayed in `AlbumItem` components

Users can now set custom RYM links on album pages, and the system defaults to dashes for auto-generated links to match RYM's current URL format.

---

## Notes

- Update this document as bugs are discovered or resolved
- Move resolved bugs to the "Resolved Bugs" section
- Include relevant details to help with debugging and prioritization


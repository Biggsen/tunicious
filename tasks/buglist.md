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
- [ ] Playlist name mismatch between database and UI
- [ ] RYM link is failing a lot, showing 404 - need to look into dashes vs underscores in the URL
- [ ] Cancel button on Edit Playlist page redirects to wrong PlaylistSingle page instead of Playlists page
- [ ] App should detect currently playing track from Last.fm when playing Spotify locally (not via web player)
- [ ] PlaylistSingle shows flickering 'Spotify connection issue' banner before loading albums

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

### Playlist name mismatch between database and UI
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: Playlist Management, Database

**Description**:  
The playlist name stored in the database doesn't match what's displayed in the UI. The database appears to be storing an older name while the UI shows a different (presumably updated) name.

**Steps to Reproduce**:
1. View a playlist in the UI
2. Check the playlist name displayed
3. Compare with the name stored in the database (Firestore)
4. Observe the mismatch

**Expected Behavior**:  
The playlist name in the database should match what's displayed in the UI.

**Actual Behavior**:  
The database contains an older playlist name that doesn't match the current UI display.

**Workaround**:  
None identified at this time.

**Notes**:  
Need to investigate:
- Usage of the `name` field throughout the application
- Whether the `name` field is actually needed or if it's redundant
- Where playlist names are being updated and why the database isn't being updated accordingly
- Potential race conditions or caching issues that might cause this discrepancy

---

### RYM link is failing a lot, showing 404 - need to look into dashes vs underscores in the URL
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: Music Service Links, RYM Integration

**Description**:  
The Rate Your Music (RYM) links are frequently failing with 404 errors. This appears to be related to URL formatting issues, specifically the use of dashes vs underscores in the URL construction.

**Steps to Reproduce**:
1. Navigate to an album or artist page
2. Click on the RYM link
3. Observe 404 error on RYM website

**Expected Behavior**:  
RYM links should correctly navigate to the album/artist page on Rate Your Music.

**Actual Behavior**:  
RYM links frequently return 404 errors, likely due to incorrect URL formatting (dashes vs underscores).

**Workaround**:  
None identified at this time.

**Notes**:  
Need to investigate:
- How RYM URLs are being constructed
- Whether RYM uses dashes or underscores in their URL format
- The `musicServiceLinks.js` utility function that generates RYM links
- Compare working RYM URLs vs failing ones to identify the pattern

---

### Cancel button on Edit Playlist page redirects to wrong PlaylistSingle page instead of Playlists page
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: Navigation, Edit Playlist View

**Description**:  
When clicking the cancel button on the Edit Playlist page (which can only be accessed from the Playlists page), the user is incorrectly redirected to a PlaylistSingle page with what appears to be the wrong playlist ID. This causes a "Spotify connection lost - please reconnect your account" error. The user should be taken back to the Playlists page instead.

**Steps to Reproduce**:
1. Navigate to the Playlists page
2. Access the Edit Playlist page for a playlist
3. Click the Cancel button
4. Observe being redirected to PlaylistSingle page with wrong playlist ID
5. See error message: "Spotify connection lost - please reconnect your account"

**Expected Behavior**:  
Clicking Cancel on the Edit Playlist page should redirect the user back to the Playlists page.

**Actual Behavior**:  
User is redirected to a PlaylistSingle page with an incorrect playlist ID, causing an error.

**Workaround**:  
Manually navigate back to the Playlists page using browser back button or navigation.

**Notes**:  
Need to investigate:
- The cancel button handler in EditPlaylistView
- The navigation logic/routing configuration
- Why it's using a playlist ID instead of going back to /playlists
- Check if there's a route parameter being incorrectly used

---

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

### PlaylistSingle shows flickering 'Spotify connection issue' banner before loading albums
**Status**: 🟡 Medium  
**Reported**: 2025-01-27  
**Component/Area**: PlaylistSingle View, Spotify Connection Status, UI/UX

**Description**:  
The PlaylistSingle view displays a flickering "Spotify connection issue" banner briefly before albums finish loading. This creates a poor user experience as the banner appears and disappears quickly, suggesting a connection problem when one may not exist.

**Steps to Reproduce**:
1. Navigate to a PlaylistSingle page
2. Observe the page loading
3. Notice the "Spotify connection issue" banner briefly appearing before albums load

**Expected Behavior**:  
The connection status banner should only appear if there's an actual connection issue, not during normal loading states.

**Actual Behavior**:  
The "Spotify connection issue" banner flickers/appears briefly during the initial load before albums are displayed.

**Workaround**:  
None identified at this time.

**Notes**:  
Need to investigate:
- The loading state logic in PlaylistSingle view
- How the Spotify connection status is determined
- Whether the banner is shown based on a loading state rather than actual connection status
- Timing of when albums data is fetched vs when connection status is checked
- Consider adding a loading state check before showing connection error banners

---

## Resolved Bugs

### Recently Fixed
- [x] _No recently fixed bugs_

---

## Notes

- Update this document as bugs are discovered or resolved
- Move resolved bugs to the "Resolved Bugs" section
- Include relevant details to help with debugging and prioritization


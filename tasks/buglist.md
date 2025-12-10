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

## Resolved Bugs

### Recently Fixed
- [x] _No recently fixed bugs_

---

## Notes

- Update this document as bugs are discovered or resolved
- Move resolved bugs to the "Resolved Bugs" section
- Include relevant details to help with debugging and prioritization


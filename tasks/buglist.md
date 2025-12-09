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

## Resolved Bugs

### Recently Fixed
- [x] _No recently fixed bugs_

---

## Notes

- Update this document as bugs are discovered or resolved
- Move resolved bugs to the "Resolved Bugs" section
- Include relevant details to help with debugging and prioritization

